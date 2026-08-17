import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

export interface AwsAuthCheckResult {
  readonly valid: boolean;
  readonly accountId?: string;
  readonly arn?: string;
  readonly userId?: string;
  readonly region: string;
  readonly errorMessage?: string;
  readonly helpMessage?: string;
}

/**
 * Pre-flight verification for AWS credentials and IAM permissions.
 * Verifies active session identity before attempting any EC2 or S3 operations.
 */
export async function validateAwsCredentials(
  region = process.env.AWS_REGION || "us-east-1",
): Promise<AwsAuthCheckResult> {
  const sts = new STSClient({ region });

  try {
    const res = await sts.send(new GetCallerIdentityCommand({}));

    return {
      valid: true,
      accountId: res.Account,
      arn: res.Arn,
      userId: res.UserId,
      region,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    return {
      valid: false,
      region,
      errorMessage: errorMsg,
      helpMessage: [
        "❌ AWS Authentication Failed: No active AWS credentials or IAM role detected.",
        `   Error details: ${errorMsg}`,
        "",
        "👉 How to fix:",
        "   1. Local CLI: Run `aws configure` to set your Access Key & Secret Key.",
        "   2. Environment: Define AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in apps/fleet-manager/.env.local",
        "   3. Cloud EC2 / ECS: Attach an IAM Role (Instance Profile) with EC2/S3 permissions.",
        "   4. AWS SSO: Run `aws sso login` to refresh your temporary session tokens.",
      ].join("\n"),
    };
  }
}
