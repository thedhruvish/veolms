import { api } from "../../lib/api-client";
import type {
  AuthMessageResponse,
  LoginRequest,
  LoginResponse,
  OauthLoginRequest,
  OauthUrlRequest,
  OauthUrlResponse,
  OtpSendRequest,
  RegisterRequest,
  TotpVerifyRequest,
  UserProfileResponse,
} from "@veolms/contracts";

export const authService = {
  sendOtp: (payload: OtpSendRequest): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/otp/send", payload);
  },

  login: (payload: LoginRequest): Promise<LoginResponse> => {
    return api.post<LoginResponse>("/auth/login", payload);
  },

  register: (payload: RegisterRequest): Promise<LoginResponse> => {
    return api.post<LoginResponse>("/auth/register", payload);
  },

  getOauthUrl: (payload: OauthUrlRequest): Promise<OauthUrlResponse> => {
    return api.post<OauthUrlResponse>("/auth/oauth/url", payload);
  },

  oauthLogin: (payload: OauthLoginRequest): Promise<LoginResponse> => {
    return api.post<LoginResponse>("/auth/oauth/login", payload);
  },

  verifyMfaTotp: (payload: TotpVerifyRequest): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/mfa/totp/verify", payload);
  },

  getMe: (): Promise<UserProfileResponse> => {
    return api.get<UserProfileResponse>("/auth/me");
  },

  logout: (): Promise<AuthMessageResponse> => {
    return api.post<AuthMessageResponse>("/auth/logout");
  },
};
