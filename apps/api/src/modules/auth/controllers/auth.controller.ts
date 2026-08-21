import { AppError } from "../../../lib/errors.ts";
import type { AuthContext } from "../auth.context.ts";
import { clearSessionCookie, setSessionCookie } from "../auth.cookies.ts";
import { presentLogin } from "../auth.presenters.ts";
import type { IdentifierType } from "../auth.types.ts";
import type {
  LoginRequest,
  OtpSendRequest,
  RegisterRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

function resolveIdentifier(body: {
  email?: string | undefined;
  phoneNo?: string | undefined;
}): { identifier: string; identifierType: IdentifierType } {
  if (body.email) {
    return { identifier: body.email, identifierType: "email" };
  }

  if (body.phoneNo) {
    return { identifier: body.phoneNo, identifierType: "phone" };
  }

  throw new AppError(
    400,
    "INVALID_REQUEST",
    "Email or phone number is required.",
  );
}

export function createAuthController(context: AuthContext) {
  const { authService, otpService, oauthService, sessionService } = context;

  async function sendOtp(
    request: FastifyRequest<{ Body: OtpSendRequest }>,
  ): Promise<{ message: string }> {
    const { identifier, identifierType } = resolveIdentifier(request.body);
    await otpService.sendOtp(identifier, identifierType);
    return { message: "Verification OTP sent successfully." };
  }

  async function login(
    request: FastifyRequest<{ Body: LoginRequest }>,
    reply: FastifyReply,
  ) {
    const { identifier, identifierType } = resolveIdentifier(request.body);
    const result = await authService.login({
      identifier,
      identifierType,
      code: request.body.code,
      request: {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
    });

    setSessionCookie(reply, result.session.token);
    return presentLogin(result.user, result.session.mfa);
  }

  async function register(
    request: FastifyRequest<{ Body: RegisterRequest }>,
    reply: FastifyReply,
  ) {
    const {
      email,
      phoneNo,
      code,
      emailCode,
      phoneCode,
      username,
      displayName,
    } = request.body;
    const { identifier, identifierType } = resolveIdentifier(request.body);
    const result = await authService.register({
      identifier,
      identifierType,
      email,
      phoneNo,
      code,
      emailCode,
      phoneCode,
      username,
      displayName,
      request: {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
    });

    setSessionCookie(reply, result.session.token);
    reply.code(201);
    return presentLogin(result.user, result.session.mfa);
  }

  async function getConfig() {
    return oauthService.getPublicConfig();
  }

  async function logout(request: FastifyRequest, reply: FastifyReply) {
    if (request.session) {
      await sessionService.logout(request.session.id);
    }

    clearSessionCookie(reply);
    return { message: "Logged out successfully" };
  }

  async function me(request: FastifyRequest) {
    const user = request.user!;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      phoneNo: user.phoneNo,
      roles: user.roles,
      permissions: user.permissions,
      mfaVerified: request.session!.mfa_verified,
      totpEnabled: user.totpEnabled,
      passkeyEnabled: user.passkeyEnabled,
    };
  }

  return { sendOtp, login, register, getConfig, logout, me };
}

export type AuthController = ReturnType<typeof createAuthController>;
