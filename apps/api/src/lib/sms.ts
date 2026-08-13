import { config } from "../config.ts";

export interface SendSMSResult {
  success: boolean;
  provider: "mock" | "primary" | "backup";
}

// 1. Primary Engine HTTP query (decoupled, e.g., Vonage or Infobip)
async function sendViaPrimary(phoneNo: string, text: string): Promise<any> {
  const primaryUrl = config.SMS_PRIMARY_URL;
  const apiKey = config.SMS_PRIMARY_KEY;
  const apiSecret = config.SMS_PRIMARY_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("Primary SMS credentials missing");
  }

  // Standard REST POST fetch call
  const response = await fetch(primaryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"),
    },
    body: JSON.stringify({
      from: "VeoLMS",
      to: phoneNo,
      message_type: "text",
      text: text,
    }),
    signal: AbortSignal.timeout(4000), // 4 second tight timeout to detect primary outage quickly
  });

  if (!response.ok) {
    throw new Error(`Primary SMS provider returned status ${response.status}`);
  }

  return response.json();
}

// 2. Backup Engine HTTP query (decoupled, e.g., Twilio REST API)
async function sendViaBackup(phoneNo: string, text: string): Promise<any> {
  const backupUrl =
    config.SMS_BACKUP_URL ||
    `https://api.twilio.com/2010-04-01/Accounts/${config.SMS_BACKUP_SID}/Messages.json`;
  const sid = config.SMS_BACKUP_SID;
  const token = config.SMS_BACKUP_TOKEN;

  if (!sid || !token) {
    throw new Error("Backup SMS credentials missing");
  }

  // Create form-urlencoded body for Twilio
  const params = new URLSearchParams();
  params.append("To", phoneNo);
  params.append("From", config.SMS_BACKUP_FROM);
  params.append("Body", text);

  const response = await fetch(backupUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
    },
    body: params,
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Backup SMS provider returned status ${response.status}`);
  }

  return response.json();
}

// 3. Core SMS sender with automatic failover
export async function sendSMS(
  phoneNo: string,
  text: string,
): Promise<SendSMSResult> {
  // In development, log the SMS content to console
  if (config.NODE_ENV !== "production") {
    console.info(`
=========================================
[DEV SMS DISPATCH]
To: ${phoneNo}
Message: ${text}
=========================================
`);
    return { success: true, provider: "mock" };
  }

  // 1. Try Primary Cost-Effective Infrastructure
  try {
    await sendViaPrimary(phoneNo, text);
    console.log(`SMS sent successfully via Primary Network to ${phoneNo}`);
    return { success: true, provider: "primary" };
  } catch (primaryError: any) {
    console.warn(
      `Primary SMS Gateway down or timed out: ${primaryError.message}. Switching to Backup...`,
    );

    // 2. Failover to Twilio instantly
    try {
      await sendViaBackup(phoneNo, text);
      console.log(`SMS rescued via Backup Network to ${phoneNo}`);
      return { success: true, provider: "backup" };
    } catch (backupError: any) {
      console.error(
        `Complete SMS infrastructure blackout: ${backupError.message}`,
      );
      throw new Error(
        "SMS delivery platform is currently completely unavailable.",
      );
    }
  }
}
