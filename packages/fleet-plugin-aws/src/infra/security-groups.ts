import {
  AuthorizeSecurityGroupEgressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";

export interface ProvisionSecurityGroupOptions {
  readonly region: string;
  readonly vpcId?: string;
  readonly groupName?: string;
  readonly description?: string;
}

export interface ProvisionSecurityGroupResult {
  readonly securityGroupId: string;
  readonly groupName: string;
  readonly isNew: boolean;
}

/**
 * Automates creation of EC2 Security Group for VeoLMS Media Workers.
 */
export async function provisionSecurityGroup(
  options: ProvisionSecurityGroupOptions,
): Promise<ProvisionSecurityGroupResult> {
  const {
    region,
    vpcId,
    groupName = "veolms-media-worker-sg",
    description = "Security group for VeoLMS Media Transcoding Workers",
  } = options;

  const ec2 = new EC2Client({ region });

  // 1. Check if security group exists
  try {
    const describeRes = await ec2.send(
      new DescribeSecurityGroupsCommand({
        GroupNames: [groupName],
      }),
    );

    const existingId = describeRes.SecurityGroups?.[0]?.GroupId;
    if (existingId) {
      return {
        securityGroupId: existingId,
        groupName,
        isNew: false,
      };
    }
  } catch {
    // Does not exist, proceed to create
  }

  // 2. Create Security Group
  const createRes = await ec2.send(
    new CreateSecurityGroupCommand({
      GroupName: groupName,
      Description: description,
      VpcId: vpcId,
      TagSpecifications: [
        {
          ResourceType: "security-group",
          Tags: [
            { Key: "Name", Value: groupName },
            { Key: "Project", Value: "VeoLMS" },
          ],
        },
      ],
    }),
  );

  const securityGroupId = createRes.GroupId || "";

  // 3. Ensure Outbound HTTPS (443) and Database (5432) Access
  try {
    await ec2.send(
      new AuthorizeSecurityGroupEgressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: "tcp",
            FromPort: 443,
            ToPort: 443,
            IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTPS Outbound for S3/Fleet API" }],
          },
          {
            IpProtocol: "tcp",
            FromPort: 5432,
            ToPort: 5432,
            IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "PostgreSQL Database Connection" }],
          },
        ],
      }),
    );
  } catch {
    // Default VPC may already have open egress
  }

  return {
    securityGroupId,
    groupName,
    isNew: true,
  };
}

/**
 * Deletes the EC2 Security Group.
 */
export async function destroySecurityGroup(options: {
  region: string;
  groupName?: string;
  groupId?: string;
}): Promise<boolean> {
  const { region, groupName = "veolms-media-worker-sg", groupId } = options;
  const ec2 = new EC2Client({ region });

  try {
    await ec2.send(
      new DeleteSecurityGroupCommand({
        GroupName: groupId ? undefined : groupName,
        GroupId: groupId,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies existence of the EC2 Security Group.
 */
export async function checkSecurityGroup(options: {
  region: string;
  groupName?: string;
}): Promise<{ exists: boolean; groupId?: string }> {
  const { region, groupName = "veolms-media-worker-sg" } = options;
  const ec2 = new EC2Client({ region });

  try {
    const describeRes = await ec2.send(
      new DescribeSecurityGroupsCommand({
        GroupNames: [groupName],
      }),
    );
    const id = describeRes.SecurityGroups?.[0]?.GroupId;
    return { exists: Boolean(id), groupId: id };
  } catch {
    return { exists: false };
  }
}
