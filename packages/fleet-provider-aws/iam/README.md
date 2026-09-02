# VeoLMS Video Fleet CI/CD Infrastructure Setup

This directory contains the IAM least-privilege policy and automated provisioning scripts to create the dedicated CI/CD deployer user for GitHub Actions.

## Files

- **`cicd-infra-deployer-policy.json`**: Least-privilege IAM policy document scoping access strictly to:
  - **S3 Build Bucket**: `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`, `s3:ListBucket` on the build bucket (`s3://${S3_BUILD_BUCKET}/*`).
  - **AWS Lambda Functions**: `lambda:UpdateFunctionCode`, `lambda:GetFunction`, `lambda:GetFunctionConfiguration`, `lambda:PublishVersion` on `veolms-fleet-manager` and `veolms-video-metadata-probe`.
  - **CloudWatch Logs**: `logs:DescribeLogGroups`.
  - No wildcard admin permissions (`*`).
- **`setup-cicd-iam.sh`**: Automated bash script using AWS CLI to create the user, render & attach the policy, and generate access keys.
- **`setup-cicd-iam.ts`**: Node.js/TypeScript script using AWS SDK (`@aws-sdk/client-iam`) for the same automation.

---

## One-Command Setup

Run either the bash script or the Node script on your local machine where AWS CLI credentials are configured:

### Option A: Using AWS CLI (Bash)
```bash
S3_BUILD_BUCKET="<your-s3-build-bucket>" AWS_REGION="<your-region>" ./packages/fleet-provider-aws/iam/setup-cicd-iam.sh
```

### Option B: Using Node.js
```bash
node --env-file-if-exists=apps/fleet-manager/.env packages/fleet-provider-aws/iam/setup-cicd-iam.ts
```

---

## GitHub Repository Secrets Configuration

Add the generated credentials in your GitHub repository:
**Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**:

| Secret Name | Description | Example |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Access Key ID for `veolms-cicd-infra-deployer` | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Secret Access Key for the deployer user | `wJal...` |
| `AWS_REGION` *(optional, can be a variable)* | AWS Region where resources reside | `ap-south-1` |
| `S3_BUILD_BUCKET` *(optional, can be a variable)* | S3 bucket storing worker bundle and lambda packages | `my-media-bucket` |

---

## CI/CD Workflow Lifecycle (`.github/workflows/deploy-video-fleet-infra.yml`)

1. **Trigger Constraints**:
   - Only triggers on push to the `development` branch when files in `apps/fleet-manager/**`, `apps/media-worker/**`, `packages/fleet-provider-aws/**`, `packages/fleet-types/**`, or the workflow file itself are modified.
   - Can also be triggered manually on-demand via `workflow_dispatch`.
2. **Phase 1: Test & Quality Gate**:
   - Runs type-checking across all fleet packages.
   - Runs all unit test suites (`@veolms/media-worker`, `@veolms/fleet-manager`, `@veolms/fleet-provider-aws`).
   - If any test fails, deployment is aborted immediately.
3. **Phase 2: Targeted Deployment**:
   - **Worker changes**: Builds and uploads `s3://${S3_BUILD_BUCKET}/bundles/media-worker.js`.
   - **Lambda changes**: Builds and uploads `s3://${S3_BUILD_BUCKET}/bundles/fleet-manager.zip` and `bundles/probe-lambda.zip`, then calls `aws lambda update-function-code` to update the running Lambdas.
