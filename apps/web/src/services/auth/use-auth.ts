import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "./auth.service";
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
import type { ApiError } from "../../lib/api-client";
import { authStore } from "../../store/auth.store";

export const AUTH_QUERY_KEYS = {
  me: ["auth", "me"] as const,
};

export function useCurrentUser() {
  return useQuery<UserProfileResponse, ApiError>({
    queryKey: AUTH_QUERY_KEYS.me,
    queryFn: async () => {
      const profile = await authService.getMe();
      authStore.setUser(profile);
      return profile;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSendOtp() {
  return useMutation<AuthMessageResponse, ApiError, OtpSendRequest>({
    mutationFn: (payload) => authService.sendOtp(payload),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, LoginRequest>({
    mutationFn: (payload) => authService.login(payload),
    onSuccess: (data) => {
      if (!data.mfaRequired) {
        authStore.setUser(data.user);
        queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
      }
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, RegisterRequest>({
    mutationFn: (payload) => authService.register(payload),
    onSuccess: (data) => {
      if (!data.mfaRequired) {
        authStore.setUser(data.user);
        queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
      }
    },
  });
}

export function useOauthUrl() {
  return useMutation<OauthUrlResponse, ApiError, OauthUrlRequest>({
    mutationFn: (payload) => authService.getOauthUrl(payload),
  });
}

export function useOauthLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, OauthLoginRequest>({
    mutationFn: (payload) => authService.oauthLogin(payload),
    onSuccess: (data) => {
      if (!data.mfaRequired) {
        authStore.setUser(data.user);
        queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
      }
    },
  });
}

export function useVerifyMfaTotp() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, TotpVerifyRequest>({
    mutationFn: (payload) => authService.verifyMfaTotp(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<AuthMessageResponse, ApiError, void>({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      authStore.clearAuth();
      queryClient.setQueryData(AUTH_QUERY_KEYS.me, null);
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
    },
  });
}
