import crypto from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import {
  authMessageResponseSchema,
  passkeyLoginVerifyRequestSchema,
  passkeyOptionsResponseSchema,
  passkeyRegisterVerifyRequestSchema,
  totpEnableRequestSchema,
  totpEnableResponseSchema,
  totpSetupResponseSchema,
  totpVerifyRequestSchema,
} from "@veolms/contracts";

import { config } from "../../config.ts";
import { AppError, errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import {
  BACKUP_CODE_COUNT,
  BACKUP_CODE_MAX,
  BACKUP_CODE_MIN,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from "./auth.constants.ts";
import { createAuthContext } from "./auth.context.ts";
import * as repository from "./auth.repository.ts";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashToken,
  verifyTotp,
} from "./auth.utils.ts";

const mfaRoutes: RoutePlugin = async (app, options) => {
  const { service, authenticated } = createAuthContext(options);
  const { database } = options;

  /**
   * Blocks adding a factor from a session that has not proven an existing one.
   * Without it, a hijacked pre-MFA session could enrol its own factor and lock
   * the real owner out.
   */
  async function assertStepUpForFactorChange(
    userId: string,
    mfaVerified: boolean,
  ): Promise<void> {
    if ((await service.userHasAnyMfaFactor(userId)) && !mfaVerified) {
      throw new AppError(
        403,
        "MFA_STEP_UP_REQUIRED",
        "Verify an existing MFA factor before adding or replacing another.",
      );
    }
  }

  app.post(
    "/auth/totp/setup",
    {
      schema: {
        operationId: "setupTotp",
        tags: ["Auth"],
        summary: "Generate TOTP Secret",
        description:
          "Generates a dynamic base32 MFA secret and provisioning URL challenge.",
        response: {
          200: jsonResponse("MFA secret metadata.", totpSetupResponseSchema),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const user = request.user!;
      const label = user.email || user.username || user.phoneNo || "user";

      return generateTotpSecret(label, config.RP_NAME);
    },
  );

  app.post(
    "/auth/totp/enable",
    {
      schema: {
        operationId: "enableTotp",
        tags: ["Auth"],
        summary: "Activate TOTP Authenticator",
        description:
          "Validates verification code and registers authenticator. Outputs 10 backup recovery codes.",
        body: totpEnableRequestSchema,
        response: {
          200: jsonResponse(
            "TOTP enabled successfully. Recovery backup codes returned.",
            totpEnableResponseSchema,
          ),
          400: errorResponse("Verification failed."),
          401: errorResponse("Unauthorized."),
          403: errorResponse("Step-up MFA required to replace existing factor."),
        },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const { code, secret } = request.body;
      const userId = request.user!.id;

      await assertStepUpForFactorChange(
        userId,
        request.session!.mfa_verified,
      );

      const result = verifyTotp(secret, code, {
        backwardSteps: config.TOTP_BACKWARD_STEPS,
        forwardSteps: config.TOTP_FORWARD_STEPS,
      });

      if (!result?.verified) {
        throw new AppError(400, "INVALID_CODE", "Invalid verification code.");
      }

      const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
        crypto.randomInt(BACKUP_CODE_MIN, BACKUP_CODE_MAX + 1).toString(),
      );

      await database.transaction().execute(async (trx) => {
        await repository.replaceTotpCredential(trx, {
          id: crypto.randomUUID(),
          userId,
          secretEncrypted: encryptSecret(secret, config.MFA_ENCRYPTION_KEY),
          lastUsedStep: String(result.step),
        });

        await repository.replaceBackupCodes(
          trx,
          userId,
          backupCodes.map((value) => ({
            id: crypto.randomUUID(),
            user_id: userId,
            code_hash: hashToken(value),
          })),
        );
      });

      await service.completeMfaEnrolment(userId, request.session!.id);

      return { backupCodes };
    },
  );

  app.post(
    "/auth/totp/verify",
    {
      schema: {
        operationId: "verifyTotpCode",
        tags: ["Auth"],
        summary: "Verify TOTP Authenticator Code",
        description:
          "Validates a 6-digit TOTP code or 8-digit backup code to complete step-up MFA login.",
        body: totpVerifyRequestSchema,
        response: {
          200: jsonResponse("MFA verified.", authMessageResponseSchema),
          400: errorResponse("TOTP is not enabled."),
          401: errorResponse("Incorrect code or unauthorized."),
          429: errorResponse("Too many failed attempts."),
        },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const { code } = request.body;
      const userId = request.user!.id;
      const sessionId = request.session!.id;

      const credential = await repository.findTotpCredential(database, userId);

      // Backup codes are checked before the TOTP-enabled gate: a passkey-only
      // account still holds recovery codes, and requiring an enabled TOTP row
      // to redeem them would make them permanently unusable.
      const backupCode = await repository.findUnusedBackupCode(
        database,
        userId,
        hashToken(code),
      );

      if (backupCode) {
        if (await repository.redeemBackupCode(database, backupCode.id)) {
          await repository.markSessionMfaVerified(database, sessionId);
          return { message: "MFA verified using backup code" };
        }
      }

      if (!credential?.enabled) {
        throw new AppError(
          400,
          "MFA_NOT_ENABLED",
          "TOTP MFA is not enabled for this user.",
        );
      }

      if (credential.locked_until && credential.locked_until > new Date()) {
        throw new AppError(
          429,
          "TOTP_LOCKED",
          "Too many failed attempts. Try again later.",
        );
      }

      const result = verifyTotp(
        decryptSecret(credential.secret_encrypted, config.MFA_ENCRYPTION_KEY),
        code,
        { backwardSteps: config.TOTP_BACKWARD_STEPS, forwardSteps: 0 },
      );

      if (!result?.verified) {
        await repository.recordTotpFailure(database, credential.id);
        throw new AppError(401, "INVALID_CODE", "Invalid verification code.");
      }

      // Advancing the watermark is the replay check: it only succeeds if this
      // step is strictly newer than the last accepted one.
      if (!(await repository.advanceTotpStep(database, userId, result.step))) {
        throw new AppError(
          401,
          "INVALID_CODE",
          "TOTP code has already been used.",
        );
      }

      await repository.markSessionMfaVerified(database, sessionId);
      return { message: "MFA verified successfully" };
    },
  );

  app.post(
    "/auth/passkey/register/options",
    {
      schema: {
        operationId: "getPasskeyRegisterOptions",
        tags: ["Auth"],
        summary: "Generate Passkey Registration Options",
        description:
          "Creates options challenge payload to register a new WebAuthn credential.",
        response: {
          200: jsonResponse(
            "Passkey options challenge.",
            passkeyOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
          403: errorResponse("Step-up MFA required to replace existing factor."),
        },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const user = request.user!;
      await assertStepUpForFactorChange(user.id, request.session!.mfa_verified);

      const existing = await repository.listUserPasskeys(database, user.id);

      const options = await generateRegistrationOptions({
        rpName: config.RP_NAME,
        rpID: config.RP_ID,
        userID: Uint8Array.from(Buffer.from(user.id)),
        userName: user.email || user.username || user.phoneNo || "user",
        userDisplayName: user.name,
        attestationType: "none",
        excludeCredentials: existing.map((passkey) => ({
          id: passkey.credential_id,
          type: "public-key",
        })),
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      });

      await repository.replaceChallenge(database, {
        id: crypto.randomUUID(),
        userId: user.id,
        challenge: options.challenge,
        type: "registration",
        expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS),
      });

      return options;
    },
  );

  app.post(
    "/auth/passkey/register/verify",
    {
      schema: {
        operationId: "verifyPasskeyRegister",
        tags: ["Auth"],
        summary: "Verify Passkey Registration Response",
        description:
          "Verifies the browser WebAuthn response signature and saves credential to user keys.",
        body: passkeyRegisterVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Passkey registered successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse(
            "Verification challenge expired or validation failed.",
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const userId = request.user!.id;

      const record = await repository.findActiveChallenge(
        database,
        userId,
        "registration",
      );

      if (!record) {
        throw new AppError(
          400,
          "CHALLENGE_MISSING",
          "Registration challenge missing, expired, or already used. Call register/options first.",
        );
      }

      if (!(await repository.consumeChallenge(database, record.id))) {
        throw new AppError(
          400,
          "VERIFICATION_FAILED",
          "Challenge has already been used.",
        );
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: request.body.response,
          expectedChallenge: record.challenge,
          expectedOrigin: config.WEB_URL,
          expectedRPID: config.RP_ID,
          requireUserVerification: true,
        });
      } catch (cause) {
        throw new AppError(
          400,
          "REGISTRATION_VERIFICATION_FAILED",
          `WebAuthn verification failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
      }

      if (!verification.verified || !verification.registrationInfo) {
        throw new AppError(
          400,
          "VERIFICATION_FAILED",
          "Passkey verification failed.",
        );
      }

      const { credential } = verification.registrationInfo;

      await repository.insertPasskey(database, {
        id: crypto.randomUUID(),
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        transports: request.body.response.transports?.join(",") ?? null,
      });

      await service.completeMfaEnrolment(userId, request.session!.id);

      return { message: "Passkey registered successfully." };
    },
  );

  app.post(
    "/auth/passkey/login/options",
    {
      schema: {
        operationId: "getPasskeyLoginOptions",
        tags: ["Auth"],
        summary: "Generate Passkey Login Options",
        description:
          "Creates options challenge payload to complete WebAuthn login assertion.",
        response: {
          200: jsonResponse(
            "Assertion options challenge.",
            passkeyOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const userId = request.user!.id;
      const passkeys = await repository.listUserPasskeys(database, userId);

      const options = await generateAuthenticationOptions({
        rpID: config.RP_ID,
        allowCredentials: passkeys.map((passkey) => ({
          id: passkey.credential_id,
          type: "public-key",
          transports: passkey.transports
            ? (passkey.transports.split(",") as never)
            : undefined,
        })),
        userVerification: "required",
      });

      await repository.replaceChallenge(database, {
        id: crypto.randomUUID(),
        userId,
        challenge: options.challenge,
        type: "authentication",
        expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS),
      });

      return options;
    },
  );

  app.post(
    "/auth/passkey/login/verify",
    {
      schema: {
        operationId: "verifyPasskeyLogin",
        tags: ["Auth"],
        summary: "Verify Passkey Login Response",
        description:
          "Verifies browser WebAuthn assertion signature, completing step-up MFA login.",
        body: passkeyLoginVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Passkey verified successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse(
            "Challenge expired or passkey credential missing.",
          ),
          401: errorResponse("Incorrect code or signature validation failed."),
        },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const userId = request.user!.id;

      const record = await repository.findActiveChallenge(
        database,
        userId,
        "authentication",
      );

      if (!record) {
        throw new AppError(
          400,
          "CHALLENGE_MISSING",
          "Authentication challenge missing, expired, or already used. Call login/options first.",
        );
      }

      if (!(await repository.consumeChallenge(database, record.id))) {
        throw new AppError(
          400,
          "VERIFICATION_FAILED",
          "Challenge has already been used.",
        );
      }

      const passkey = await repository.findUserPasskey(
        database,
        userId,
        request.body.response.id,
      );

      if (!passkey) {
        throw new AppError(
          400,
          "CREDENTIAL_NOT_FOUND",
          "Passkey credential matching this session is not registered.",
        );
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: request.body.response,
          expectedChallenge: record.challenge,
          expectedOrigin: config.WEB_URL,
          expectedRPID: config.RP_ID,
          credential: {
            id: passkey.credential_id,
            publicKey: Buffer.from(passkey.public_key, "base64"),
            counter: Number(passkey.counter),
          },
          requireUserVerification: true,
        });
      } catch (cause) {
        throw new AppError(
          401,
          "ASSERTION_FAILED",
          `WebAuthn assertion failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
      }

      if (!verification.verified || !verification.authenticationInfo) {
        throw new AppError(
          401,
          "VERIFICATION_FAILED",
          "Assertion verification failed.",
        );
      }

      await database.transaction().execute(async (trx) => {
        await repository.updatePasskeyCounter(
          trx,
          passkey.id,
          verification.authenticationInfo.newCounter,
        );
        await repository.markSessionMfaVerified(trx, request.session!.id);
      });

      return { message: "MFA verified successfully." };
    },
  );
};

export default mfaRoutes;
