import { useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AccountForm } from "./AccountForm";
import { AuthBrandMark } from "./AuthBrandPanel";
import { IdentifierForm } from "./IdentifierForm";
import { OtpForm } from "./OtpForm";
import { SocialLoginActions } from "./SocialLoginActions";
import { TwoFactorForm } from "./TwoFactorForm";
import {
  AUTH_CARD_HEADING_ID,
  TWO_FACTOR_METHOD,
  authFlowReducer,
  initialAuthFlowState,
} from "./authFlow";
import type { AuthIdentifier } from "./authFlow";
import { generateUniqueUsername } from "./username";
import { productName } from "../routing/routeDescriptors";
import { useLogin, useRegister, useSendOtp, useVerifyMfaTotp } from "../services/auth/use-auth";
import { authStore } from "../store/auth.store";

function resolvePayload(identifier: AuthIdentifier) {
  return identifier.method === "email"
    ? { email: identifier.email }
    : { phoneNo: identifier.phoneNo };
}

export function LoginView() {
  const [flow, dispatch] = useReducer(authFlowReducer, initialAuthFlowState);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const savedOtpCodeRef = useRef<string>("");
  const navigate = useNavigate();

  const sendOtpMutation = useSendOtp();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const verifyMfaMutation = useVerifyMfaTotp();

  const handleSendCode = async (identifier: AuthIdentifier) => {
    if (sendOtpMutation.isPending) return;
    setIdentifierError(null);
    dispatch({ type: "SUBMIT_IDENTIFIER", identifier });

    try {
      await sendOtpMutation.mutateAsync(resolvePayload(identifier));
      dispatch({ type: "OTP_SENT" });
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const message = errorObj?.message || "Something went wrong. Please try again.";
      setIdentifierError(message);
      dispatch({ type: "OTP_SEND_FAILED" });
    }
  };

  const handleResendCode = async () => {
    if (!("identifier" in flow) || sendOtpMutation.isPending) return;
    const { identifier } = flow;
    setOtpError(null);
    dispatch({ type: "RESEND_OTP" });

    try {
      await sendOtpMutation.mutateAsync(resolvePayload(identifier));
      dispatch({ type: "OTP_SENT" });
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const message = errorObj?.message || "Something went wrong. Please try again.";
      setOtpError(message);
      dispatch({ type: "OTP_SEND_FAILED" });
    }
  };

  const handleVerifyCode = async (identifier: AuthIdentifier, directCode?: string) => {
    if (loginMutation.isPending) return;
    const rawCode = directCode ?? ("code" in flow ? flow.code : "");
    const code = rawCode.trim();
    if (!code || code.length !== 6) return;

    savedOtpCodeRef.current = code;
    setOtpError(null);
    dispatch({ type: "SUBMIT_OTP" });

    try {
      const payload = {
        ...resolvePayload(identifier),
        code,
      };

      const response = await loginMutation.mutateAsync(payload);

      if (response.mfaRequired) {
        if (response.passkeyEnabled) {
          dispatch({ type: "OTP_VERIFIED", next: "twoFactorPasskey" });
          return;
        }
        if (response.totpEnabled) {
          dispatch({ type: "OTP_VERIFIED", next: "twoFactorAuthenticator" });
          return;
        }
      }

      authStore.setUser(response.user);
      dispatch({ type: "OTP_VERIFIED", next: "authenticated" });
      navigate("/");
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      
      if (
        errorObj.code === "REGISTRATION_REQUIRED" ||
        errorObj.code === "USER_NOT_FOUND" ||
        errorObj.code === "NO_USER" ||
        (errorObj.message && errorObj.message.toLowerCase().includes("register"))
      ) {
        dispatch({ type: "OTP_VERIFIED", next: "newUserName" });
        return;
      }

      const message = errorObj?.message || "Something went wrong. Please try again.";
      setOtpError(message);
      dispatch({ type: "OTP_REJECTED", reason: "verifyFailed" });
    }
  };

  const handleCreateAccount = async (name: string) => {
    if (!("identifier" in flow) || registerMutation.isPending) return;
    const { identifier } = flow;
    setAccountError(null);
    dispatch({ type: "SUBMIT_ACCOUNT_NAME", name });

    try {
      const username = generateUniqueUsername(name);
      const payload = {
        ...resolvePayload(identifier),
        code: savedOtpCodeRef.current,
        displayName: name,
        username,
      };

      const response = await registerMutation.mutateAsync(payload);
      authStore.setUser(response.user);
      dispatch({ type: "ACCOUNT_CREATED" });
      navigate("/");
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const message = errorObj?.message || "Something went wrong. Please try again.";
      setAccountError(message);
      dispatch({ type: "ACCOUNT_CREATION_FAILED", message });
    }
  };

  const handleVerifyTwoFactor = async (directCode?: string) => {
    if (verifyMfaMutation.isPending) return;
    const rawCode = directCode ?? ("code" in flow ? flow.code : "");
    const code = rawCode.trim();
    if (!code) return;

    setTwoFactorError(null);
    dispatch({ type: "SUBMIT_TWO_FACTOR" });

    try {
      await verifyMfaMutation.mutateAsync({ code });
      dispatch({ type: "TWO_FACTOR_VERIFIED" });
      navigate("/");
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const message = errorObj?.message || "Something went wrong. Please try again.";
      setTwoFactorError(message);
      dispatch({ type: "TWO_FACTOR_REJECTED", message });
    }
  };

  function renderStep() {
    if (flow.status === "newUserName" || flow.status === "creatingAccount") {
      return (
        <AccountForm
          errorMessage={accountError ?? undefined}
          identifier={flow.identifier}
          name={"name" in flow ? flow.name : ""}
          onBackToOtp={() => {
            setAccountError(null);
            dispatch({ type: "OTP_SENT" });
          }}
          onIdentifierChange={() => {
            setAccountError(null);
            dispatch({ type: "CHANGE_IDENTIFIER" });
          }}
          onNameChange={(name) => {
            setAccountError(null);
            dispatch({ type: "CHANGE_ACCOUNT_NAME", name });
          }}
          onSubmit={handleCreateAccount}
          status={
            flow.status === "creatingAccount" || registerMutation.isPending
              ? "creating"
              : "idle"
          }
        />
      );
    }

    if (flow.status === "otp" || flow.status === "verifyingOtp") {
      return (
        <OtpForm
          code={flow.code}
          errorMessage={otpError}
          failure={flow.status === "otp" ? flow.failure : null}
          identifier={flow.identifier}
          onCodeChange={(code) => {
            setOtpError(null);
            dispatch({ type: "CHANGE_OTP_CODE", code });
          }}
          onIdentifierChange={() => {
            setOtpError(null);
            dispatch({ type: "CHANGE_IDENTIFIER" });
          }}
          onResend={handleResendCode}
          onSubmit={(code) => handleVerifyCode(flow.identifier, code)}
          sendCount={flow.sendCount}
          status={
            flow.status === "verifyingOtp" || loginMutation.isPending
              ? "verifying"
              : "idle"
          }
        />
      );
    }

    if (
      flow.status === "twoFactorPasskey" ||
      flow.status === "twoFactorAuthenticator" ||
      flow.status === "verifyingTwoFactor"
    ) {
      const verifying =
        flow.status === "verifyingTwoFactor" || verifyMfaMutation.isPending;

      return (
        <TwoFactorForm
          code={flow.code}
          errorMessage={
            verifying ? undefined : (twoFactorError ?? flow.message ?? undefined)
          }
          method={verifying ? flow.method : TWO_FACTOR_METHOD[flow.status]}
          onCodeChange={(code) => {
            setTwoFactorError(null);
            dispatch({ type: "CHANGE_TWO_FACTOR_CODE", code });
          }}
          onMethodChange={(method) => {
            setTwoFactorError(null);
            dispatch({ type: "CHANGE_TWO_FACTOR_METHOD", method });
          }}
          onSubmit={(code) => handleVerifyTwoFactor(code)}
          onUsePasskey={() => handleVerifyTwoFactor()}
          status={verifying ? "verifying" : "idle"}
        />
      );
    }

    return (
      <>
        <AuthBrandMark />
        <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
          Welcome to {productName}
        </h1>
        <p className="auth-card__subheading">
          Log in or create an account to continue.
        </p>

        <div className="auth-card__form-slot">
          <IdentifierForm
            errorMessage={identifierError ?? undefined}
            onSubmit={(identifier) => handleSendCode(identifier)}
            status={
              flow.status === "sendingOtp" || sendOtpMutation.isPending
                ? "sending"
                : "idle"
            }
          />
          <SocialLoginActions onError={setIdentifierError} />
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
      {renderStep()}
    </section>
  );
}
