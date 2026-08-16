import { useReducer } from "react";
import { AccountForm } from "../auth/AccountForm.tsx";
import { AuthBrandMark } from "../auth/AuthBrandPanel.tsx";
import { IdentifierForm } from "../auth/IdentifierForm.tsx";
import { OtpForm } from "../auth/OtpForm.tsx";
import { SocialLoginActions } from "../auth/SocialLoginActions.tsx";
import { TwoFactorForm } from "../auth/TwoFactorForm.tsx";
import {
  AUTH_CARD_HEADING_ID,
  TWO_FACTOR_METHOD,
  authFlowReducer,
  initialAuthFlowState,
} from "../auth/authFlow.ts";
import type { AuthFlowAction, AuthIdentifier } from "../auth/authFlow.ts";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors.ts";

export function meta() {
  return Object.entries(
    getAuthRouteMeta(
      "Log in",
      `Log in to ${productName} or create an account with a one-time code.`,
    ),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function LoginRoute() {
  const [flow, dispatch] = useReducer(authFlowReducer, initialAuthFlowState);

  const sendCode = (request: AuthFlowAction) => {
    dispatch(request);
    dispatch({ type: "OTP_SENT" });
  };

  const verifyCode = (identifier: AuthIdentifier) => {
    dispatch({ type: "SUBMIT_OTP" });
    dispatch({
      type: "OTP_VERIFIED",
      next: identifier.method === "email" ? "newUserName" : "twoFactorPasskey",
    });
  };

  const createAccount = (name: string) => {
    dispatch({ type: "SUBMIT_ACCOUNT_NAME", name });
    dispatch({ type: "ACCOUNT_CREATED" });
  };

  const verifyTwoFactor = () => {
    dispatch({ type: "SUBMIT_TWO_FACTOR" });
    dispatch({ type: "TWO_FACTOR_VERIFIED" });
  };

  function renderStep() {
    if (flow.status === "otp" || flow.status === "verifyingOtp") {
      const { identifier } = flow;

      return (
        <OtpForm
          code={flow.code}
          failure={flow.status === "otp" ? flow.failure : null}
          identifier={identifier}
          onCodeChange={(code) => dispatch({ type: "CHANGE_OTP_CODE", code })}
          onIdentifierChange={() => dispatch({ type: "CHANGE_IDENTIFIER" })}
          onResend={() => sendCode({ type: "RESEND_OTP" })}
          onSubmit={() => verifyCode(identifier)}
          sendCount={flow.sendCount}
          status={flow.status === "verifyingOtp" ? "verifying" : "idle"}
        />
      );
    }

    if (flow.status === "newUserName" || flow.status === "creatingAccount") {
      return (
        <AccountForm
          errorMessage={
            flow.status === "newUserName"
              ? (flow.message ?? undefined)
              : undefined
          }
          identifier={flow.identifier}
          name={flow.name}
          onNameChange={(name) =>
            dispatch({ type: "CHANGE_ACCOUNT_NAME", name })
          }
          onSubmit={createAccount}
          status={flow.status === "creatingAccount" ? "creating" : "idle"}
        />
      );
    }

    if (
      flow.status === "twoFactorPasskey" ||
      flow.status === "twoFactorAuthenticator" ||
      flow.status === "verifyingTwoFactor"
    ) {
      const verifying = flow.status === "verifyingTwoFactor";

      return (
        <TwoFactorForm
          code={flow.code}
          errorMessage={verifying ? undefined : (flow.message ?? undefined)}
          method={verifying ? flow.method : TWO_FACTOR_METHOD[flow.status]}
          onCodeChange={(code) =>
            dispatch({ type: "CHANGE_TWO_FACTOR_CODE", code })
          }
          onMethodChange={(method) =>
            dispatch({ type: "CHANGE_TWO_FACTOR_METHOD", method })
          }
          onSubmit={verifyTwoFactor}
          onUsePasskey={verifyTwoFactor}
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
            onSubmit={(identifier) =>
              sendCode({ type: "SUBMIT_IDENTIFIER", identifier })
            }
            status={flow.status === "sendingOtp" ? "sending" : "idle"}
          />
          <SocialLoginActions />
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
