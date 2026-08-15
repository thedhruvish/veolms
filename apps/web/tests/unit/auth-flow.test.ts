import { describe, expect, it } from "vitest";
import {
  OTP_ACTION_LABELS,
  OTP_MESSAGES,
  RESEND_COOLDOWN_SECONDS,
  authFlowReducer,
  formatResendCountdown,
  initialAuthFlowState,
  maskIdentifier,
  validateOtpCode,
} from "../../src/auth/authFlow.ts";
import type { AuthIdentifier } from "../../src/auth/authFlow.ts";

const email: AuthIdentifier = { method: "email", email: "user@example.com" };
const mobile: AuthIdentifier = { method: "mobile", phoneNo: "+919812345678" };

describe("resend cooldown", () => {
  it("matches the sixty second window the backend enforces", () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
  });
});

describe("resend countdown formatting", () => {
  it("renders the remaining seconds in the compact second form", () => {
    expect(formatResendCountdown(60)).toBe("60s");
    expect(formatResendCountdown(25)).toBe("25s");
    expect(formatResendCountdown(5)).toBe("5s");
    expect(formatResendCountdown(1)).toBe("1s");
    expect(formatResendCountdown(0)).toBe("0s");
  });
});

describe("resend countdown floor", () => {
  it("shows zero once a timer ticks past the end of the window", () => {
    expect(formatResendCountdown(-1)).toBe("0s");
  });
});

describe("identifier echo", () => {
  it("dot-masks an email address down to its first two characters", () => {
    expect(maskIdentifier({ method: "email", email: "user@example.com" })).toBe(
      "us●●@example.com",
    );
  });

  it("leaves one character visible when the local part is too short to keep two", () => {
    expect(maskIdentifier({ method: "email", email: "ab@example.com" })).toBe(
      "a●@example.com",
    );
  });

  it("dot-masks a mobile number down to its last three digits", () => {
    expect(maskIdentifier({ method: "mobile", phoneNo: "+919812345678" })).toBe(
      "+91 ●●●●● ●●678",
    );
  });
});

describe("otp messages", () => {
  it("titles and explains an incorrect code", () => {
    expect(OTP_MESSAGES.incorrect).toEqual({
      title: "Incorrect OTP",
      body: "The code you entered is incorrect.",
    });
  });

  it("titles and explains an expired code", () => {
    expect(OTP_MESSAGES.expired).toEqual({
      title: "OTP Expired",
      body: "This OTP has expired. Please request a new one.",
    });
  });

  it("asks for a new code once the attempt budget is spent", () => {
    expect(OTP_MESSAGES.attemptsExceeded).toEqual({
      title: "Too Many Attempts",
      body: "Too many attempts. Please request a new code.",
    });
  });

  it("carries untitled bodies for the three request failures", () => {
    expect(OTP_MESSAGES.sendFailed).toEqual({
      title: null,
      body: "We couldn't send the verification code. Please try again.",
    });
    expect(OTP_MESSAGES.verifyFailed).toEqual({
      title: null,
      body: "We couldn't verify your code. Please try again.",
    });
    expect(OTP_MESSAGES.unexpected).toEqual({
      title: null,
      body: "Something went wrong. Please try again.",
    });
  });
});

describe("otp action labels", () => {
  it("names every control on the otp screen", () => {
    expect(OTP_ACTION_LABELS).toEqual({
      verify: "Verify & Continue",
      verifying: "Verifying...",
      resend: "Resend OTP",
      changeEmail: "Change email",
      changeMobile: "Change mobile number",
    });
  });
});

describe("otp code validation", () => {
  it("accepts a complete six-digit code", () => {
    expect(validateOtpCode("123456")).toBeNull();
  });

  it("rejects a short or non-numeric code with its own copy", () => {
    expect(validateOtpCode("12345")).toBe("Please enter the 6-digit code.");
    expect(validateOtpCode("12345a")).toBe("Please enter the 6-digit code.");
    expect(validateOtpCode("")).toBe("Please enter the 6-digit code.");
  });
});

describe("auth flow reducer", () => {
  it("starts on the identifier screen with nothing to report", () => {
    expect(initialAuthFlowState).toEqual({
      status: "identifier",
      message: null,
    });
  });

  it("sends a code once an identifier is submitted", () => {
    expect(
      authFlowReducer(initialAuthFlowState, {
        type: "SUBMIT_IDENTIFIER",
        identifier: email,
      }),
    ).toEqual({ status: "sendingOtp", identifier: email, sendCount: 0 });
  });

  it("opens the otp screen with an empty field once the code is dispatched", () => {
    expect(
      authFlowReducer(
        { status: "sendingOtp", identifier: email, sendCount: 0 },
        { type: "OTP_SENT" },
      ),
    ).toEqual({
      status: "otp",
      identifier: email,
      code: "",
      sendCount: 1,
      failure: null,
    });
  });

  it("returns to the identifier screen when the code cannot be sent", () => {
    expect(
      authFlowReducer(
        { status: "sendingOtp", identifier: mobile, sendCount: 0 },
        { type: "OTP_SEND_FAILED" },
      ),
    ).toEqual({
      status: "identifier",
      message: "We couldn't send the verification code. Please try again.",
    });
  });

  it("records the digits as they are typed", () => {
    expect(
      authFlowReducer(
        {
          status: "otp",
          identifier: email,
          code: "12",
          sendCount: 1,
          failure: null,
        },
        { type: "CHANGE_OTP_CODE", code: "123" },
      ),
    ).toEqual({
      status: "otp",
      identifier: email,
      code: "123",
      sendCount: 1,
      failure: null,
    });
  });

  it("verifies the six digits it was given", () => {
    expect(
      authFlowReducer(
        {
          status: "otp",
          identifier: email,
          code: "123456",
          sendCount: 1,
          failure: "incorrect",
        },
        { type: "SUBMIT_OTP" },
      ),
    ).toEqual({
      status: "verifyingOtp",
      identifier: email,
      code: "123456",
      sendCount: 1,
    });
  });

  it("keeps the entered code on screen when verification is rejected", () => {
    expect(
      authFlowReducer(
        {
          status: "verifyingOtp",
          identifier: email,
          code: "123456",
          sendCount: 1,
        },
        { type: "OTP_REJECTED", reason: "expired" },
      ),
    ).toEqual({
      status: "otp",
      identifier: email,
      code: "123456",
      sendCount: 1,
      failure: "expired",
    });
  });

  it("follows the server to whichever screen comes after a good code", () => {
    const verifying = {
      status: "verifyingOtp",
      identifier: email,
      code: "123456",
      sendCount: 1,
    } as const;

    expect(
      authFlowReducer(verifying, { type: "OTP_VERIFIED", next: "newUserName" }),
    ).toEqual({ status: "newUserName", identifier: email });
    expect(
      authFlowReducer(verifying, {
        type: "OTP_VERIFIED",
        next: "twoFactorPasskey",
      }),
    ).toEqual({ status: "twoFactorPasskey", identifier: email });
    expect(
      authFlowReducer(verifying, {
        type: "OTP_VERIFIED",
        next: "twoFactorAuthenticator",
      }),
    ).toEqual({ status: "twoFactorAuthenticator", identifier: email });
    expect(
      authFlowReducer(verifying, {
        type: "OTP_VERIFIED",
        next: "authenticated",
      }),
    ).toEqual({ status: "authenticated" });
  });

  it("restarts the cooldown with a clean field when a code is resent", () => {
    const sending = authFlowReducer(
      {
        status: "otp",
        identifier: email,
        code: "1234",
        sendCount: 1,
        failure: "incorrect",
      },
      { type: "RESEND_OTP" },
    );

    expect(sending).toEqual({
      status: "sendingOtp",
      identifier: email,
      sendCount: 1,
    });
    expect(authFlowReducer(sending, { type: "OTP_SENT" })).toEqual({
      status: "otp",
      identifier: email,
      code: "",
      sendCount: 2,
      failure: null,
    });
  });

  it("goes back to a blank identifier screen when the learner changes it", () => {
    expect(
      authFlowReducer(
        {
          status: "otp",
          identifier: mobile,
          code: "1234",
          sendCount: 1,
          failure: "incorrect",
        },
        { type: "CHANGE_IDENTIFIER" },
      ),
    ).toEqual({ status: "identifier", message: null });
  });

  it("drops into the error state from anywhere on an unexpected failure", () => {
    const unexpected = { type: "UNEXPECTED_FAILURE" } as const;
    const expected = {
      status: "error",
      message: "Something went wrong. Please try again.",
    };

    expect(authFlowReducer(initialAuthFlowState, unexpected)).toEqual(expected);
    expect(
      authFlowReducer(
        {
          status: "verifyingOtp",
          identifier: email,
          code: "123456",
          sendCount: 1,
        },
        unexpected,
      ),
    ).toEqual(expected);
  });

  it("ignores an action that does not belong to the current state", () => {
    const verifying = {
      status: "verifyingOtp",
      identifier: email,
      code: "123456",
      sendCount: 1,
    } as const;

    expect(authFlowReducer(verifying, { type: "RESEND_OTP" })).toBe(verifying);
  });
});
