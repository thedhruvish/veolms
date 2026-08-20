import { execSync } from "node:child_process";

const REGION = process.env.AWS_REGION || "us-east-1";
const ROLE_NAME = "VeoLMSWorkerRole";
const INSTANCE_PROFILE_NAME = "VeoLMSWorkerInstanceProfile";
const LAMBDA_NAME = "veolms-fleet-manager";

function exec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}
function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}
function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}
function cyan(s: string): string {
  return `\x1b[36m${s}\x1b[0m`;
}

export async function runAwsInfraDestroy(): Promise<void> {
  console.info(`
${bold(red("╔══════════════════════════════════════════════════════╗"))}
${bold(red("║"))}          ${bold("VeoLMS AWS Infrastructure Teardown")}          ${bold(red("║"))}
${bold(red("╚══════════════════════════════════════════════════════╝"))}
`);

  console.info(`Region: ${bold(cyan(REGION))}\n`);

  // 1. Terminate any running EC2 instances
  console.info("[1/5] Terminating active EC2 worker instances...");
  const instanceIds = exec(
    `aws ec2 describe-instances --region ${REGION} --filters "Name=tag:ManagedBy,Values=veolms-fleet-manager,veolms-infra-setup" "Name=instance-state-name,Values=running,pending,stopped,stopping" --query 'Reservations[*].Instances[*].InstanceId' --output text`,
  );
  if (instanceIds) {
    const termRes = exec(
      `aws ec2 terminate-instances --instance-ids ${instanceIds} --region ${REGION}`,
    );
    if (termRes !== null) {
      console.info(`  ${green("✔")} Terminated instances: ${instanceIds}`);
    } else {
      console.info(
        `  ${red("✘")} Failed to terminate instances: ${instanceIds}`,
      );
    }
  } else {
    console.info(`  ${green("✔")} No active EC2 instances found.`);
  }

  // 2. Delete Lambda function
  console.info("\n[2/5] Deleting AWS Lambda function...");
  const lambdaDel = exec(
    `aws lambda delete-function --function-name ${LAMBDA_NAME} --region ${REGION}`,
  );
  if (lambdaDel !== null) {
    console.info(`  ${green("✔")} Deleted Lambda: ${LAMBDA_NAME}`);
  } else {
    console.info(
      `  ${red("✘")} Could not delete Lambda (may not exist): ${LAMBDA_NAME}`,
    );
  }

  // 3. Delete CloudWatch Log Groups
  console.info("\n[3/5] Deleting CloudWatch log groups...");
  const logGroups = [
    `/aws/lambda/${LAMBDA_NAME}`,
    "/veolms/workers",
    "/veolms/fleet-manager",
  ];
  for (const lg of logGroups) {
    const res = exec(
      `aws logs delete-log-group --log-group-name "${lg}" --region ${REGION}`,
    );
    if (res !== null) {
      console.info(`  ${green("✔")} Deleted log group: ${lg}`);
    } else {
      console.info(
        `  ${red("✘")} Could not delete log group (may not exist): ${lg}`,
      );
    }
  }

  // 4. Delete IAM Instance Profile
  console.info("\n[4/5] Deleting IAM Instance Profile...");
  exec(
    `aws iam remove-role-from-instance-profile --instance-profile-name ${INSTANCE_PROFILE_NAME} --role-name ${ROLE_NAME}`,
  );
  const profileDel = exec(
    `aws iam delete-instance-profile --instance-profile-name ${INSTANCE_PROFILE_NAME}`,
  );
  if (profileDel !== null) {
    console.info(
      `  ${green("✔")} Deleted instance profile: ${INSTANCE_PROFILE_NAME}`,
    );
  } else {
    console.info(
      `  ${red("✘")} Could not delete instance profile (may not exist): ${INSTANCE_PROFILE_NAME}`,
    );
  }

  // 5. Delete IAM Role
  console.info("\n[5/5] Deleting IAM Role & Policies...");
  const inlinePolicies = (
    exec(
      `aws iam list-role-policies --role-name ${ROLE_NAME} --query 'PolicyNames' --output text`,
    ) ?? ""
  )
    .split(/\s+/)
    .filter(Boolean);

  for (const pol of inlinePolicies) {
    const res = exec(
      `aws iam delete-role-policy --role-name ${ROLE_NAME} --policy-name "${pol}"`,
    );
    if (res !== null) {
      console.info(`  ${green("✔")} Deleted inline policy: ${pol}`);
    } else {
      console.info(`  ${red("✘")} Could not delete inline policy: ${pol}`);
    }
  }

  const attachedPolicies = (
    exec(
      `aws iam list-attached-role-policies --role-name ${ROLE_NAME} --query 'AttachedPolicies[*].PolicyArn' --output text`,
    ) ?? ""
  )
    .split(/\s+/)
    .filter(Boolean);

  for (const polArn of attachedPolicies) {
    const res = exec(
      `aws iam detach-role-policy --role-name ${ROLE_NAME} --policy-arn "${polArn}"`,
    );
    if (res !== null) {
      console.info(`  ${green("✔")} Detached managed policy: ${polArn}`);
    } else {
      console.info(
        `  ${red("✘")} Could not detach managed policy: ${polArn}`,
      );
    }
  }

  const roleDel = exec(`aws iam delete-role --role-name ${ROLE_NAME}`);
  if (roleDel !== null) {
    console.info(`  ${green("✔")} Deleted IAM role: ${ROLE_NAME}`);
  } else {
    console.info(
      `  ${red("✘")} Could not delete IAM role (may not exist): ${ROLE_NAME}`,
    );
  }

  console.info(`
${bold(green("╔══════════════════════════════════════════════════════╗"))}
${bold(green("║"))}        ${bold("All AWS Infrastructure Destroyed!")}           ${bold(green("║"))}
${bold(green("╚══════════════════════════════════════════════════════╝"))}
`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runAwsInfraDestroy().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✘ Destroy failed: ${msg}\n`);
    process.exit(1);
  });
}
