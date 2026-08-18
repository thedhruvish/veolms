import {
  AddRoleToInstanceProfileCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  DeleteInstanceProfileCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  GetInstanceProfileCommand,
  GetRoleCommand,
  IAMClient,
  ListRolePoliciesCommand,
  PutRolePolicyCommand,
  RemoveRoleFromInstanceProfileCommand,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";

import {
  CONTROL_PLANE_TRUST_RELATIONSHIP,
  EC2_TRUST_RELATIONSHIP,
  generateFleetManagerIamPolicy,
  generateWorkerIamPolicy,
} from "../iam-policies.ts";

export interface ProvisionIamOptions {
  readonly region?: string;
  readonly tempBucketName: string;
  readonly prodBucketName: string;
  readonly workerRoleName?: string;
  readonly workerProfileName?: string;
  readonly managerRoleName?: string;
}

export interface ProvisionIamResult {
  readonly workerRoleArn: string;
  readonly workerInstanceProfileArn: string;
  readonly managerRoleArn: string;
}

/**
 * Automates creation of AWS IAM Roles, Instance Profiles, and Policies
 * for EC2 Media Workers and Fleet Manager Control Plane.
 */
export async function provisionIamRoles(
  options: ProvisionIamOptions,
): Promise<ProvisionIamResult> {
  const {
    region = "us-east-1",
    tempBucketName,
    prodBucketName,
    workerRoleName = "VeoLMSMediaWorkerRole",
    workerProfileName = "VeoLMSMediaWorkerInstanceProfile",
    managerRoleName = "VeoLMSFleetManagerRole",
  } = options;

  const iam = new IAMClient({ region });

  // 1. Ensure Media Worker IAM Role
  let workerRoleArn = "";
  try {
    const roleRes = await iam.send(
      new GetRoleCommand({ RoleName: workerRoleName }),
    );
    workerRoleArn = roleRes.Role?.Arn || "";
  } catch {
    const createRes = await iam.send(
      new CreateRoleCommand({
        RoleName: workerRoleName,
        Description: "IAM Role assumed by VeoLMS EC2 Transcoding Workers",
        AssumeRolePolicyDocument: JSON.stringify(EC2_TRUST_RELATIONSHIP),
      }),
    );
    workerRoleArn = createRes.Role?.Arn || "";
  }

  // 2. Attach Worker Least-Privilege Policy
  const workerPolicy = generateWorkerIamPolicy({
    tempBucketName,
    prodBucketName,
  });

  await iam.send(
    new PutRolePolicyCommand({
      RoleName: workerRoleName,
      PolicyName: "VeoLMSMediaWorkerPolicy",
      PolicyDocument: JSON.stringify(workerPolicy),
    }),
  );

  // 3. Ensure Media Worker IAM Instance Profile
  let workerInstanceProfileArn = "";
  try {
    const profRes = await iam.send(
      new GetInstanceProfileCommand({ InstanceProfileName: workerProfileName }),
    );
    workerInstanceProfileArn = profRes.InstanceProfile?.Arn || "";
  } catch {
    const createProf = await iam.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: workerProfileName,
      }),
    );
    workerInstanceProfileArn = createProf.InstanceProfile?.Arn || "";

    try {
      await iam.send(
        new AddRoleToInstanceProfileCommand({
          InstanceProfileName: workerProfileName,
          RoleName: workerRoleName,
        }),
      );
    } catch {
      // Ignore if already attached
    }
  }

  // 4. Ensure Fleet Manager Control Plane IAM Role
  let managerRoleArn = "";
  try {
    const mgrRes = await iam.send(
      new GetRoleCommand({ RoleName: managerRoleName }),
    );
    managerRoleArn = mgrRes.Role?.Arn || "";

    // Ensure trust relationship includes Lambda and EC2
    await iam.send(
      new UpdateAssumeRolePolicyCommand({
        RoleName: managerRoleName,
        PolicyDocument: JSON.stringify(CONTROL_PLANE_TRUST_RELATIONSHIP),
      }),
    );
  } catch {
    const createMgr = await iam.send(
      new CreateRoleCommand({
        RoleName: managerRoleName,
        Description: "IAM Role for VeoLMS Fleet Manager Control Plane",
        AssumeRolePolicyDocument: JSON.stringify(
          CONTROL_PLANE_TRUST_RELATIONSHIP,
        ),
      }),
    );
    managerRoleArn = createMgr.Role?.Arn || "";
  }

  // Attach Fleet Manager Lifecycle Policy
  const managerPolicy = generateFleetManagerIamPolicy();
  await iam.send(
    new PutRolePolicyCommand({
      RoleName: managerRoleName,
      PolicyName: "VeoLMSFleetManagerLifecyclePolicy",
      PolicyDocument: JSON.stringify(managerPolicy),
    }),
  );

  return {
    workerRoleArn,
    workerInstanceProfileArn,
    managerRoleArn,
  };
}

/**
 * Tears down and deletes IAM roles, instance profiles, and policies created for VeoLMS.
 */
export async function destroyIamRoles(options: {
  region?: string;
  workerRoleName?: string;
  workerProfileName?: string;
  managerRoleName?: string;
}): Promise<{ rolesDeleted: number; profilesDeleted: number }> {
  const {
    region = "us-east-1",
    workerRoleName = "VeoLMSMediaWorkerRole",
    workerProfileName = "VeoLMSMediaWorkerInstanceProfile",
    managerRoleName = "VeoLMSFleetManagerRole",
  } = options;

  const iam = new IAMClient({ region });
  let rolesDeleted = 0;
  let profilesDeleted = 0;

  // 1. Remove role from instance profile and delete profile
  try {
    await iam.send(
      new RemoveRoleFromInstanceProfileCommand({
        InstanceProfileName: workerProfileName,
        RoleName: workerRoleName,
      }),
    );
  } catch {
    // Ignore
  }

  try {
    await iam.send(
      new DeleteInstanceProfileCommand({
        InstanceProfileName: workerProfileName,
      }),
    );
    profilesDeleted++;
  } catch {
    // Ignore
  }

  // 2. Delete inline policies and delete roles
  for (const roleName of [workerRoleName, managerRoleName]) {
    try {
      const listPolicies = await iam.send(
        new ListRolePoliciesCommand({ RoleName: roleName }),
      );
      for (const pol of listPolicies.PolicyNames ?? []) {
        await iam.send(
          new DeleteRolePolicyCommand({
            RoleName: roleName,
            PolicyName: pol,
          }),
        );
      }
      await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
      rolesDeleted++;
    } catch {
      // Ignore
    }
  }

  return { rolesDeleted, profilesDeleted };
}

/**
 * Verifies existence of IAM roles and instance profile.
 */
export async function checkIamRoles(options: {
  region?: string;
  workerRoleName?: string;
  workerProfileName?: string;
  managerRoleName?: string;
}): Promise<{
  workerRole: boolean;
  workerProfile: boolean;
  managerRole: boolean;
}> {
  const {
    region = "us-east-1",
    workerRoleName = "VeoLMSMediaWorkerRole",
    workerProfileName = "VeoLMSMediaWorkerInstanceProfile",
    managerRoleName = "VeoLMSFleetManagerRole",
  } = options;

  const iam = new IAMClient({ region });

  async function roleExists(name: string): Promise<boolean> {
    try {
      await iam.send(new GetRoleCommand({ RoleName: name }));
      return true;
    } catch {
      return false;
    }
  }

  async function profileExists(name: string): Promise<boolean> {
    try {
      await iam.send(
        new GetInstanceProfileCommand({ InstanceProfileName: name }),
      );
      return true;
    } catch {
      return false;
    }
  }

  const [workerRole, workerProfile, managerRole] = await Promise.all([
    roleExists(workerRoleName),
    profileExists(workerProfileName),
    roleExists(managerRoleName),
  ]);

  return { workerRole, workerProfile, managerRole };
}
