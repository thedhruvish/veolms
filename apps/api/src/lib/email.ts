import { config } from "../config.ts";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: SendEmailOptions): Promise<void> {
  // In development/test mode, print the email structure to console
  if (config.NODE_ENV !== "production") {
    console.info(`
=========================================
[DEV EMAIL DISPATCH]
To: ${to}
Subject: ${subject}
-----------------------------------------
${text}
=========================================
`);
    return;
  }

  // In production, we'll try sending via SMTP if host is configured
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            }
          : undefined,
    });

    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("Failed to send email via SMTP:", err);
  }
}
