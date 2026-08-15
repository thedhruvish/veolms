import { z } from "zod";

// 1. Passwordless OTP requests
export const otpSendRequestSchema = z
  .object({
    email: z.string().email("Invalid email address").toLowerCase().optional(),
    phoneNo: z.string().min(8, "Phone number is too short").optional(),
  })
  .refine((data) => data.email || data.phoneNo, {
    message: "Either email or phone number must be provided",
    path: ["email"],
  });

export const otpVerifyRequestSchema = z
  .object({
    email: z.string().email().toLowerCase().optional(),
    phoneNo: z.string().optional(),
    code: z
      .string()
      .length(6, "Code must be exactly 6 digits")
      .regex(/^\d+$/, "Code must contain only digits"),
  })
  .refine((data) => data.email || data.phoneNo, {
    message: "Either email or phone number must be provided",
    path: ["email"],
  });

// 2. Custom Login and Register requests
export const registerRequestSchema = z
  .object({
    email: z.string().email("Invalid email address").toLowerCase().optional(),
    phoneNo: z.string().min(8, "Phone number is too short").optional(),
    code: z
      .string()
      .length(6, "Code must be exactly 6 digits")
      .regex(/^\d+$/, "Code must contain only digits"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username is too long")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username must contain only letters, numbers, and underscores",
      )
      .toLowerCase(),
    displayName: z.string().min(1, "Display name is required").max(100),
  })
  .refine((data) => data.email || data.phoneNo, {
    message: "Either email or phone number must be provided",
    path: ["email"],
  });

export const loginRequestSchema = z
  .object({
    email: z.string().email("Invalid email address").toLowerCase().optional(),
    phoneNo: z.string().min(8, "Phone number is too short").optional(),
    code: z
      .string()
      .length(6, "Code must be exactly 6 digits")
      .regex(/^\d+$/, "Code must contain only digits"),
  })
  .refine((data) => data.email || data.phoneNo, {
    message: "Either email or phone number must be provided",
    path: ["email"],
  });

// OAuth requests
export const oauthLoginRequestSchema = z.object({
  provider: z.enum(["google", "github"]),
  token: z.string().min(1, "OAuth credential token/code is required"),
});

export const oauthRegisterRequestSchema = z.object({
  provider: z.enum(["google", "github"]),
  token: z.string().min(1, "OAuth credential token/code is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username is too long")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username must contain only letters, numbers, and underscores",
    )
    .toLowerCase()
    .optional(),
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(100)
    .optional(),
});

// WebAuthn Passkeys schemas
export const passkeyRegisterVerifyRequestSchema = z.object({
  response: z
    .any()
    .meta({ description: "WebAuthn PublicKeyCredential registration payload" }),
});

export const passkeyLoginVerifyRequestSchema = z.object({
  response: z
    .any()
    .meta({ description: "WebAuthn PublicKeyCredential assertion payload" }),
});
export const totpVerifyRequestSchema = z.object({
  code: z
    .string()
    .length(6, "TOTP code must be 6 digits")
    .regex(/^\d+$/, "TOTP code must contain only digits"),
});

export const totpEnableRequestSchema = z.object({
  code: z
    .string()
    .length(6, "TOTP code must be 6 digits")
    .regex(/^\d+$/, "TOTP code must contain only digits"),
  secret: z.string().min(1, "TOTP secret is required"),
});

// Response contracts representation
export const authMessageResponseSchema = z.object({
  message: z.string(),
});

export const loginResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    displayName: z.string(),
    email: z.string().email().nullable(),
    phoneNo: z.string().nullable(),
  }),
  mfaRequired: z.boolean(),
});

export const userProfileResponseSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().email().nullable(),
  phoneNo: z.string().nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  mfaVerified: z.boolean(),
  totpEnabled: z.boolean(),
  passkeyEnabled: z.boolean(),
});

export const sessionResponseSchema = z.object({
  id: z.string().uuid(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
});

export const totpSetupResponseSchema = z.object({
  secret: z.string(),
  uri: z.string(),
});

export const totpEnableResponseSchema = z.object({
  backupCodes: z.array(z.string()),
});

export const passkeyOptionsResponseSchema = z.any().meta({
  description:
    "Dynamic WebAuthn credential generation options (registration/assertion challenge)",
});

export type OtpSendRequest = z.input<typeof otpSendRequestSchema>;
export type OtpVerifyRequest = z.input<typeof otpVerifyRequestSchema>;
export type RegisterRequest = z.input<typeof registerRequestSchema>;
export type LoginRequest = z.input<typeof loginRequestSchema>;
export type OauthLoginRequest = z.input<typeof oauthLoginRequestSchema>;
export type OauthRegisterRequest = z.input<typeof oauthRegisterRequestSchema>;
export type PasskeyRegisterVerifyRequest = z.input<
  typeof passkeyRegisterVerifyRequestSchema
>;
export type PasskeyLoginVerifyRequest = z.input<
  typeof passkeyLoginVerifyRequestSchema
>;
export type UserProfileResponse = z.output<typeof userProfileResponseSchema>;
export type SessionResponse = z.output<typeof sessionResponseSchema>;
export type TotpVerifyRequest = z.input<typeof totpVerifyRequestSchema>;
export type TotpEnableRequest = z.input<typeof totpEnableRequestSchema>;
