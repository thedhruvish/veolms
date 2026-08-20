import { z } from "zod";

export const awsProviderConfigSchema = z.object({
  AWS_REGION: z.string().default("us-east-1"),
  EC2_IAM_INSTANCE_PROFILE: z.string().default("VeoLMSWorkerInstanceProfile"),
  EC2_USE_SPOT: z.coerce.boolean().default(true),
  S3_BUCKET: z.string().optional(),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("s3"),
  AMI_ID: z.string().optional(),
  SUBNET_ID: z.string().optional(),
  SECURITY_GROUP_IDS: z.string().optional(),
  KEY_NAME: z.string().optional(),
});

export type AwsProviderEnvironmentConfig = z.infer<
  typeof awsProviderConfigSchema
>;

export function loadAwsProviderConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AwsProviderEnvironmentConfig {
  return awsProviderConfigSchema.parse(env);
}
