import crypto from "node:crypto";

import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { otpVerificationEmail } from "../../services/email/index.ts";
import { otpVerificationSms } from "../../services/sms/index.ts";
import {
  CREATOR_ROLE,
  OTP_DAILY_LIMIT,
  OTP_DAILY_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_WINDOW_MS,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
  SESSION_TTL_MS,
  STUDENT_ROLE,
  USERNAME_SUFFIX_ATTEMPTS,
} from "./auth.constants.ts";
import * as repository from "./auth.repository.ts";
import type { IdentifierType } from "./auth.repository.ts";
import { generateRandomToken, hashToken } from "./auth.utils.ts";

export type OtpPurpose =
  | "login"
  | "email_verification"
  | "phone_verification";

export interface AuthServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
  academyName: string;
}

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  phone_no: string | null;
  mfa_mandatory: boolean;
}

export interface MfaState {
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  mfaMandatory: boolean;
  /** True when any factor is enrolled or the account is required to have one. */
  mfaRequired: boolean;
}

export interface EstablishedSession {
  /** Raw token for the cookie; only its hash is persisted. */
  token: string;
  sessionId: string;
  mfa: MfaState;
}

export interface CreateUserInput {
  email: string | null;
  phoneNo: string | null;
  username: string;
  displayName: string;
  emailVerified: boolean;
  oauth?: { provider: string; providerUserId: string } | undefined;
}

export function createAuthService({
  database,
  services,
  academyName,
}: AuthServiceOptions) {
  /** Resolves which factors an account actually has enrolled. */
  async function resolveMfaState(
    userId: string,
    mfaMandatory: boolean,
  ): Promise<MfaState> {
    const [totpEnabled, passkeyCount] = await Promise.all([
      repository.isTotpEnabled(database, userId),
      repository.countUserPasskeys(database, userId),
    ]);

    const passkeyEnabled = passkeyCount > 0;

    return {
      totpEnabled,
      passkeyEnabled,
      mfaMandatory,
      mfaRequired: mfaMandatory || totpEnabled || passkeyEnabled,
    };
  }

  async function userHasAnyMfaFactor(userId: string): Promise<boolean> {
    const state = await resolveMfaState(userId, false);
    return state.totpEnabled || state.passkeyEnabled;
  }

  /**
   * Issues a session row and returns the raw token for the caller to set as a
   * cookie. A session for an account with MFA starts unverified, so the step-up
   * endpoints gate it until a factor is presented.
   */
  async function establishSession(
    user: SessionUser,
    request: { ip: string; userAgent: string | null },
  ): Promise<EstablishedSession> {
    const mfa = await resolveMfaState(user.id, Boolean(user.mfa_mandatory));

    const token = generateRandomToken();
    const sessionId = crypto.randomUUID();

    await repository.insertSession(database, {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(token),
      ipAddress: request.ip,
      userAgent: request.userAgent,
      mfaVerified: !mfa.mfaRequired,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    return { token, sessionId, mfa };
  }

  /**
   * Marks the current session MFA-verified and drops every other session for
   * the account.
   *
   * The revocation matters most on first enrolment: sessions created before a
   * factor existed were stamped `mfa_verified = true`, and without this they
   * would keep that standing for their full lifetime. Enrolling MFA is the
   * usual reaction to a suspected compromise, so it has to unseat any session
   * an attacker already holds.
   */
  async function completeMfaEnrolment(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await repository.markSessionMfaVerified(database, sessionId);
    await repository.deleteOtherUserSessions(database, userId, sessionId);
  }

  // --- One-time passcodes ---------------------------------------------------

  /** Existing accounts get a login code; unknown identifiers get a signup code. */
  async function resolveOtpPurpose(
    identifier: string,
    identifierType: IdentifierType,
  ): Promise<OtpPurpose> {
    const user = await repository.findUserByIdentifier(
      database,
      identifier,
      identifierType,
    );

    if (user) {
      return "login";
    }

    return identifierType === "email"
      ? "email_verification"
      : "phone_verification";
  }

  async function assertOtpSendAllowed(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
  ): Promise<void> {
    const now = Date.now();

    const recentlySent = await repository.hasOtpSince(database, {
      identifier,
      identifierType,
      purpose,
      since: new Date(now - OTP_RESEND_WINDOW_MS),
    });

    if (recentlySent) {
      throw new AppError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "Please wait 60 seconds before requesting another code.",
      );
    }

    const sentToday = await repository.countOtpsSince(database, {
      identifier,
      identifierType,
      purpose,
      since: new Date(now - OTP_DAILY_WINDOW_MS),
    });

    if (sentToday >= OTP_DAILY_LIMIT) {
      throw new AppError(
        429,
        "DAILY_LIMIT_EXCEEDED",
        "Too many verification code requests. Please try again tomorrow.",
      );
    }
  }

  /**
   * Generates, stores and dispatches a code.
   *
   * Dispatch is intentionally not awaited: a slow SMTP or SMS gateway must not
   * hold the request open, and both services swallow their own failures. The
   * upper bound is inclusive so the full six-digit space is reachable.
   */
  async function sendOtp(
    identifier: string,
    identifierType: IdentifierType,
  ): Promise<void> {
    const purpose = await resolveOtpPurpose(identifier, identifierType);
    await assertOtpSendAllowed(identifier, identifierType, purpose);

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const now = new Date();

    await repository.retireOutstandingOtps(database, {
      identifier,
      identifierType,
      purpose,
      now,
    });

    await repository.insertOtp(database, {
      id: crypto.randomUUID(),
      identifier,
      identifierType,
      purpose,
      codeHash: hashToken(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    });

    if (identifierType === "email") {
      void services.email.send(
        identifier,
        otpVerificationEmail({
          code,
          academyName,
          expiresInMinutes: OTP_TTL_MINUTES,
        }),
      );
      return;
    }

    void services.sms.send(
      identifier,
      otpVerificationSms({
        code,
        academyName,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    );
  }

  const invalidCode = () =>
    new AppError(
      401,
      "INVALID_CODE",
      "Verification code is invalid, expired, or revoked due to excessive attempts.",
    );

  /**
   * Validates a code and marks it used. Throws on any failure so callers cannot
   * proceed by forgetting to check a boolean.
   */
  async function verifyAndConsumeOtp(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const now = new Date();

    const match = await repository.findMatchingActiveOtp(database, {
      identifier,
      identifierType,
      purpose,
      codeHash: hashToken(code),
      now,
    });

    if (!match) {
      // Charge the wrong guess against whatever code is outstanding, so a
      // brute-force run burns its own target rather than probing for free.
      const outstanding = await repository.findOutstandingOtp(database, {
        identifier,
        identifierType,
        purpose,
        now,
      });

      if (outstanding) {
        await repository.recordOtpAttempt(database, outstanding.id, now);
      }

      throw invalidCode();
    }

    if (match.attempts >= OTP_MAX_ATTEMPTS) {
      throw invalidCode();
    }

    const consumed = await repository.consumeOtp(database, match.id, now);
    if (!consumed) {
      throw new AppError(
        401,
        "INVALID_CODE",
        "Verification code was already used or invalidated.",
      );
    }
  }

  // --- Account creation -----------------------------------------------------

  /** Appends a numeric suffix until the username is free. */
  async function generateUniqueUsername(base: string): Promise<string> {
    const normalised = base.toLowerCase().replace(/[^a-z0-9_]/g, "_") || "user";

    if (!(await repository.usernameExists(database, normalised))) {
      return normalised;
    }

    for (let attempt = 0; attempt < USERNAME_SUFFIX_ATTEMPTS; attempt++) {
      const candidate = `${normalised}_${crypto.randomInt(100, 1000)}`;
      if (!(await repository.usernameExists(database, candidate))) {
        return candidate;
      }
    }

    throw new AppError(
      409,
      "USERNAME_UNAVAILABLE",
      "Could not allocate a unique username. Please choose one explicitly.",
    );
  }

  /**
   * Creates an account, granting the creator role to the very first user.
   *
   * The whole thing runs in one transaction behind a transaction-scoped
   * advisory lock. Counting users outside the transaction (or even inside it
   * under READ COMMITTED) lets two concurrent first-registrations both observe
   * an empty table and both be granted ownership of the platform.
   */
  async function createUser(input: CreateUserInput): Promise<string> {
    const userId = crypto.randomUUID();

    await database.transaction().execute(async (trx) => {
      // Serialises only the bootstrap path; contention here is negligible.
      await sql`select pg_advisory_xact_lock(hashtext('veolms:user-bootstrap'))`.execute(
        trx,
      );

      const isCreator = (await repository.countUsers(trx)) === 0;

      await repository.insertUser(trx, {
        id: userId,
        email: input.email,
        phoneNo: input.phoneNo,
        username: input.username,
        displayName: input.displayName,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        mfaMandatory: isCreator,
      });

      if (input.oauth) {
        await repository.insertOauthAccount(trx, {
          id: crypto.randomUUID(),
          userId,
          provider: input.oauth.provider,
          providerUserId: input.oauth.providerUserId,
        });
      }

      const roleName = isCreator ? CREATOR_ROLE : STUDENT_ROLE;
      const roleId = await repository.findRoleIdByName(trx, roleName);

      if (!roleId) {
        // Previously fell back to a hardcoded UUID, which silently produced a
        // dangling user_roles row on any database whose seed differed.
        throw new AppError(
          500,
          "ROLE_NOT_PROVISIONED",
          `The ${roleName} role is missing. Run the database seed.`,
        );
      }

      await repository.assignRole(trx, userId, roleId);
    });

    return userId;
  }

  async function requireUser(userId: string): Promise<SessionUser> {
    const user = await repository.findUserById(database, userId);

    if (!user) {
      throw new AppError(
        500,
        "USER_LOOKUP_FAILED",
        "Failed to load the user record after writing it.",
      );
    }

    return user as SessionUser;
  }

  return {
    resolveMfaState,
    userHasAnyMfaFactor,
    establishSession,
    completeMfaEnrolment,
    resolveOtpPurpose,
    sendOtp,
    verifyAndConsumeOtp,
    generateUniqueUsername,
    createUser,
    requireUser,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
