import { useReducer } from "react";
import { AuthBrandMark } from "../auth/AuthBrandPanel.tsx";
import { IdentifierForm } from "../auth/IdentifierForm.tsx";
import { OtpForm } from "../auth/OtpForm.tsx";
import { SocialLoginActions } from "../auth/SocialLoginActions.tsx";
import {
  AUTH_CARD_HEADING_ID,
  authFlowReducer,
  initialAuthFlowState,
} from "../auth/authFlow.ts";
import type { AuthFlowAction } from "../auth/authFlow.ts";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors.ts";

// Verifying needs an answer from the auth API, which nothing here calls yet.
// Dispatching SUBMIT_OTP would strand the learner on a spinner nothing resolves.
const verifyCode = () => {};

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

  return (
    <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
      {flow.status === "otp" || flow.status === "verifyingOtp" ? (
        <OtpForm
          code={flow.code}
          failure={flow.status === "otp" ? flow.failure : null}
          identifier={flow.identifier}
          onCodeChange={(code) => dispatch({ type: "CHANGE_OTP_CODE", code })}
          onIdentifierChange={() => dispatch({ type: "CHANGE_IDENTIFIER" })}
          onResend={() => sendCode({ type: "RESEND_OTP" })}
          onSubmit={verifyCode}
          sendCount={flow.sendCount}
          status={flow.status === "verifyingOtp" ? "verifying" : "idle"}
        />
      ) : (
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
      )}
    </section>
  );
}
