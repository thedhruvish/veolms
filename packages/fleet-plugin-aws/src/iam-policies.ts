/**
 * AWS IAM Roles, Policies, and Security Setup for VeoLMS Fleet Manager & Media Workers.
 */

export interface IamPolicyDocument {
  readonly Version: string;
  readonly Statement: readonly {
    readonly Sid?: string;
    readonly Effect: "Allow" | "Deny";
    readonly Action: readonly string[] | string;
    readonly Resource: readonly string[] | string;
    readonly Condition?: Record<string, unknown>;
  }[];
}

/**
 * Trust Relationship allowing EC2 service to assume the Media Worker IAM Role.
 */
export const EC2_TRUST_RELATIONSHIP: IamPolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "sts:AssumeRole",
      Principal: {
        Service: "ec2.amazonaws.com",
      },
    },
  ] as unknown as IamPolicyDocument["Statement"],
};

/**
 * Generates the Media Worker IAM Policy granting least-privilege access
 * to the Temporary Scratch Bucket, Production CDN Bucket, and CloudWatch Logs.
 */
export function generateWorkerIamPolicy(options: {
  tempBucketName: string;
  prodBucketName: string;
}): IamPolicyDocument {
  const { tempBucketName, prodBucketName } = options;

  const statements: {
    Sid: string;
    Effect: "Allow";
    Action: string[];
    Resource: string[];
  }[] = [
    {
      Sid: "VeoLMSTempScratchBucketAccess",
      Effect: "Allow",
      Action: [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ],
      Resource: [
        `arn:aws:s3:::${tempBucketName}`,
        `arn:aws:s3:::${tempBucketName}/*`,
      ],
    },
    {
      Sid: "VeoLMSProductionHlsBucketAccess",
      Effect: "Allow",
      Action: ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      Resource: [
        `arn:aws:s3:::${prodBucketName}`,
        `arn:aws:s3:::${prodBucketName}/*`,
      ],
    },
    {
      Sid: "VeoLMSCloudWatchLogging",
      Effect: "Allow",
      Action: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams",
      ],
      Resource: ["arn:aws:logs:*:*:*"],
    },
  ];

  return {
    Version: "2012-10-17",
    Statement: statements,
  };
}

/**
 * Generates the Fleet Manager Control Plane IAM Policy for provisioning and terminating EC2 Spot instances.
 */
export function generateFleetManagerIamPolicy(): IamPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "VeoLMSEC2SpotLifecycleManagement",
        Effect: "Allow",
        Action: [
          "ec2:RunInstances",
          "ec2:TerminateInstances",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeSpotInstanceRequests",
          "ec2:RequestSpotInstances",
          "ec2:CancelSpotInstanceRequests",
          "ec2:CreateTags",
        ],
        Resource: ["*"],
      },
      {
        Sid: "VeoLMSSecurityGroupAndSubnetInspection",
        Effect: "Allow",
        Action: [
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeVpcs",
        ],
        Resource: ["*"],
      },
      {
        Sid: "VeoLMSPassRoleToWorkerInstanceProfile",
        Effect: "Allow",
        Action: ["iam:PassRole"],
        Resource: ["arn:aws:iam::*:role/VeoLMS*"],
      },
    ],
  };
}

/**
 * Generates an automated Terraform configuration snippet for 1-click IAM & S3 deployment.
 */
export function generateTerraformSnippet(options: {
  tempBucket: string;
  prodBucket: string;
  region?: string;
}): string {
  const { tempBucket, prodBucket, region = "us-east-1" } = options;

  return `# ==============================================================================
# VeoLMS AWS Infrastructure - IAM Roles & Dual S3 Buckets Terraform Snippet
# ==============================================================================
provider "aws" {
  region = "${region}"
}

# 1. Temporary Scratch S3 Bucket (Raw Video Chunks)
resource "aws_s3_bucket" "veolms_temp" {
  bucket        = "${tempBucket}"
  force_destroy = true
}

resource "aws_s3_bucket_lifecycle_configuration" "veolms_temp_lifecycle" {
  bucket = aws_s3_bucket.veolms_temp.id
  rule {
    id     = "auto-prune-temp-chunks"
    status = "Enabled"
    expiration {
      days = 1 # Auto delete stale temporary cuts after 24 hours
    }
  }
}

# 2. Production CDN S3 Bucket (Finalized HLS Stream)
resource "aws_s3_bucket" "veolms_prod" {
  bucket = "${prodBucket}"
}

# 3. Media Worker IAM Role & Instance Profile
resource "aws_iam_role" "worker_role" {
  name = "VeoLMSMediaWorkerRole"
  assume_role_policy = jsonencode(${JSON.stringify(EC2_TRUST_RELATIONSHIP, null, 2)})
}

resource "aws_iam_role_policy" "worker_policy" {
  name   = "VeoLMSMediaWorkerPolicy"
  role   = aws_iam_role.worker_role.id
  policy = jsonencode(${JSON.stringify(generateWorkerIamPolicy({ tempBucketName: tempBucket, prodBucketName: prodBucket }), null, 2)})
}

resource "aws_iam_instance_profile" "worker_profile" {
  name = "VeoLMSMediaWorkerInstanceProfile"
  role = aws_iam_role.worker_role.name
}

output "worker_instance_profile_arn" {
  value = aws_iam_instance_profile.worker_profile.arn
}
`;
}
