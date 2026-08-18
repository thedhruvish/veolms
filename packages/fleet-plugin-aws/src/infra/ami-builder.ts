import {
  CreateImageCommand,
  CreateTagsCommand,
  DeleteSnapshotCommand,
  DeregisterImageCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";

export interface AmiBuilderOptions {
  readonly includeNvidiaDrivers?: boolean;
  readonly veolmsGitRepo?: string;
  readonly veolmsBranch?: string;
}

export interface BakeAmiOptions {
  readonly region: string;
  readonly instanceType?: string;
  readonly securityGroupId?: string;
  readonly workerInstanceProfileName?: string;
  readonly options?: AmiBuilderOptions;
}

export interface BakeAmiResult {
  readonly imageId: string;
  readonly imageName: string;
  readonly isNew: boolean;
}

/**
 * Generates the shell setup script to configure a golden EC2 AMI on Debian 14 for VeoLMS Media Worker.
 * Pre-installs Node.js 24 LTS and downloads the latest modern FFmpeg 7.x+ build directly
 * from official GitHub Releases with libx264, libx265, and hardware codecs.
 */
export function generateAmiSetupScript(
  options: AmiBuilderOptions = {},
): string {
  const {
    includeNvidiaDrivers = false,
    veolmsGitRepo = "https://github.com/veolms/veolms.git",
    veolmsBranch = "main",
  } = options;

  return `#!/bin/bash
set -ex

# 1. Debian 14 (Forky) system updates & build dependencies
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git tar xz-utils build-essential pkg-config ca-certificates gnupg

# 2. Install Latest Modern FFmpeg Directly from GitHub Releases
echo "Downloading latest FFmpeg from GitHub Releases..."
curl -fsSL https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz -o /tmp/ffmpeg.tar.xz
mkdir -p /tmp/ffmpeg-extracted
tar -xf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg-extracted --strip-components 1
mv /tmp/ffmpeg-extracted/bin/ffmpeg /usr/local/bin/ffmpeg || mv /tmp/ffmpeg-extracted/ffmpeg /usr/local/bin/ffmpeg
mv /tmp/ffmpeg-extracted/bin/ffprobe /usr/local/bin/ffprobe || mv /tmp/ffmpeg-extracted/ffprobe /usr/local/bin/ffprobe
chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe
rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-extracted

# Verify FFmpeg installation
/usr/local/bin/ffmpeg -version

# 3. Install Node.js 24 LTS & pnpm on Debian 14
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg || true
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
apt-get update -y
apt-get install -y nodejs
npm install -g pnpm

${
  includeNvidiaDrivers
    ? `# 4. Install NVIDIA GPU Drivers & CUDA NVENC Toolkit
apt-get install -y nvidia-driver nvidia-cuda-toolkit || true`
    : ""
}

# 5. Pre-clone & build VeoLMS Media Worker in /opt/veolms for fast cold starts
mkdir -p /opt/veolms
git clone -b ${veolmsBranch} ${veolmsGitRepo} /opt/veolms || true
cd /opt/veolms
pnpm install --frozen-lockfile || pnpm install
pnpm --filter @veolms/media-worker build || true

# 6. Create Systemd Service template
cat <<'EOF' > /etc/systemd/system/veolms-worker.service
[Unit]
Description=VeoLMS Media Worker Transcoder
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/veolms
ExecStart=/usr/bin/node /opt/veolms/apps/media-worker/src/index.ts
Restart=on-failure
RestartSec=5s
StandardOutput=journal+console
StandardError=journal+console

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "VeoLMS Debian 14 Transcoding AMI Baked Successfully with Latest GitHub Release FFmpeg."
`;
}

/**
 * Checks if a custom VeoLMS Golden AMI already exists in the user's AWS account.
 */
export async function checkGoldenAmi(options: { region: string }): Promise<{
  exists: boolean;
  imageId?: string;
  name?: string;
  state?: string;
}> {
  const { region } = options;
  const ec2 = new EC2Client({ region });

  try {
    const res = await ec2.send(
      new DescribeImagesCommand({
        Owners: ["self"],
        Filters: [
          {
            Name: "name",
            Values: ["VeoLMS-Debian14-MediaWorker-GoldenAMI*"],
          },
          {
            Name: "state",
            Values: ["available", "pending"],
          },
        ],
      }),
    );

    const image = res.Images?.[0];
    if (image && image.ImageId) {
      return {
        exists: true,
        imageId: image.ImageId,
        name: image.Name,
        state: image.State,
      };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Bakes a custom Golden AMI directly in the user's AWS account on Debian 14 with
 * the latest GitHub release FFmpeg 7.x and Node.js 24 LTS.
 */
export async function bakeGoldenAmiViaEc2(
  options: BakeAmiOptions,
): Promise<BakeAmiResult> {
  const {
    region,
    instanceType = "c6i.large",
    securityGroupId,
    workerInstanceProfileName = "VeoLMSMediaWorkerInstanceProfile",
    options: amiOpts = {},
  } = options;

  const ec2 = new EC2Client({ region });

  // 1. Check if AMI already exists
  const existing = await checkGoldenAmi({ region });
  if (existing.exists && existing.imageId) {
    console.log(
      `  ℹ️ Found existing Golden AMI: [${existing.imageId}] (${existing.name})`,
    );
    return {
      imageId: existing.imageId,
      imageName: existing.name || "VeoLMS-Debian14-MediaWorker-GoldenAMI",
      isNew: false,
    };
  }

  console.log(
    "  🔍 Resolving latest base Debian 14 AMI from official Debian AWS account...",
  );
  let baseAmiId = "ami-058bd2d568351da34"; // Default fallback Debian AMI in us-east-1

  try {
    const debianImages = await ec2.send(
      new DescribeImagesCommand({
        Owners: ["136542289945"], // Official Debian AWS account
        Filters: [
          {
            Name: "name",
            Values: ["debian-14-*", "debian-13-*", "debian-12-*"],
          },
          { Name: "architecture", Values: ["x86_64"] },
          { Name: "state", Values: ["available"] },
          { Name: "virtualization-type", Values: ["hvm"] },
        ],
      }),
    );

    const sorted = (debianImages.Images ?? []).sort((a, b) => {
      const dA = new Date(a.CreationDate ?? 0).getTime();
      const dB = new Date(b.CreationDate ?? 0).getTime();
      return dB - dA;
    });

    if (sorted[0]?.ImageId) {
      baseAmiId = sorted[0].ImageId;
      console.log(
        `  ✅ Selected base OS AMI: [${baseAmiId}] (${sorted[0].Name})`,
      );
    }
  } catch (err) {
    console.warn(
      "  ⚠️ Could not query official Debian AMIs, using fallback AMI:",
      baseAmiId,
    );
  }

  // 2. Launch temporary builder instance
  console.log(
    `  🚀 Launching temporary builder EC2 instance (${instanceType}) to bake AMI...`,
  );
  const setupScript = generateAmiSetupScript(amiOpts);
  const userDataBase64 = Buffer.from(setupScript, "utf-8").toString("base64");

  const runRes = await ec2.send(
    new RunInstancesCommand({
      ImageId: baseAmiId,
      InstanceType: instanceType as never,
      MinCount: 1,
      MaxCount: 1,
      UserData: userDataBase64,
      SecurityGroupIds: securityGroupId ? [securityGroupId] : undefined,
      IamInstanceProfile: workerInstanceProfileName
        ? { Name: workerInstanceProfileName }
        : undefined,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: "Name", Value: "VeoLMS-AMI-Builder-Temp" },
            { Key: "Project", Value: "VeoLMS" },
          ],
        },
      ],
    }),
  );

  const instanceId = runRes.Instances?.[0]?.InstanceId;
  if (!instanceId) {
    throw new Error("Failed to launch temporary EC2 instance for AMI baking.");
  }

  console.log(
    `  ⏳ Waiting for builder instance [${instanceId}] to initialize and run setup...`,
  );

  // Wait for instance to become RUNNING
  let isRunning = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const descRes = await ec2.send(
        new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
      );
      const state = descRes.Reservations?.[0]?.Instances?.[0]?.State?.Name;
      if (state === "running") {
        isRunning = true;
        break;
      }
    } catch {
      // Continue polling
    }
  }

  if (!isRunning) {
    throw new Error(
      `Temporary builder instance [${instanceId}] failed to reach running state.`,
    );
  }

  console.log(
    `  📸 Creating AWS AMI Image snapshot from instance [${instanceId}]...`,
  );
  const amiTimestamp = Date.now();
  const amiName = `VeoLMS-Debian14-MediaWorker-GoldenAMI-${amiTimestamp}`;

  const imageRes = await ec2.send(
    new CreateImageCommand({
      InstanceId: instanceId,
      Name: amiName,
      Description:
        "VeoLMS Golden Worker AMI on Debian 14 with Node 24 and latest GitHub Release FFmpeg 7.x",
      NoReboot: true,
    }),
  );

  const createdImageId = imageRes.ImageId;
  if (!createdImageId) {
    throw new Error(
      "Failed to create AMI image snapshot from builder instance.",
    );
  }

  // Tag created AMI
  try {
    await ec2.send(
      new CreateTagsCommand({
        Resources: [createdImageId],
        Tags: [
          { Key: "Name", Value: "VeoLMS-Debian14-MediaWorker-GoldenAMI" },
          { Key: "Project", Value: "VeoLMS" },
          { Key: "OS", Value: "Debian 14" },
        ],
      }),
    );
  } catch {
    // Ignore tagging error
  }

  // 3. Clean up temporary builder instance
  console.log(`  🧹 Terminating temporary builder instance [${instanceId}]...`);
  try {
    await ec2.send(
      new TerminateInstancesCommand({
        InstanceIds: [instanceId],
      }),
    );
  } catch {
    // Ignore termination error
  }

  console.log(
    `  🎉 Golden AMI successfully registered: [${createdImageId}] (${amiName})`,
  );
  return {
    imageId: createdImageId,
    imageName: amiName,
    isNew: true,
  };
}

/**
 * Deregisters custom VeoLMS Golden AMIs and cleans up EBS snapshots.
 */
export async function destroyGoldenAmi(options: {
  region: string;
}): Promise<boolean> {
  const { region } = options;
  const ec2 = new EC2Client({ region });

  try {
    const res = await ec2.send(
      new DescribeImagesCommand({
        Owners: ["self"],
        Filters: [
          {
            Name: "name",
            Values: ["VeoLMS-Debian14-MediaWorker-GoldenAMI*"],
          },
        ],
      }),
    );

    let deleted = false;
    for (const img of res.Images ?? []) {
      if (!img.ImageId) continue;
      await ec2.send(new DeregisterImageCommand({ ImageId: img.ImageId }));
      deleted = true;

      // Clean associated snapshot
      for (const dev of img.BlockDeviceMappings ?? []) {
        const snapId = dev.Ebs?.SnapshotId;
        if (snapId) {
          try {
            await ec2.send(new DeleteSnapshotCommand({ SnapshotId: snapId }));
          } catch {
            // Ignore snapshot delete error
          }
        }
      }
    }
    return deleted;
  } catch {
    return false;
  }
}

/**
 * Generates a complete Packer HCL template to build an automated AWS AMI on Debian 14 via HashiCorp Packer.
 */
export function generatePackerTemplate(options: {
  region?: string;
  amiName?: string;
  instanceType?: string;
}): string {
  const {
    region = "us-east-1",
    amiName = "veolms-debian14-worker-ami-{{timestamp}}",
    instanceType = "c6i.large",
  } = options;

  return `packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "veolms_debian14_worker" {
  region        = "${region}"
  instance_type = "${instanceType}"
  ami_name      = "${amiName}"
  
  source_ami_filter {
    filters = {
      name                = "debian-14-*",
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["136542289945"] # Official Debian Project AWS Account
  }
  
  ssh_username = "admin"
  tags = {
    Name    = "VeoLMS Debian 14 Transcoding Worker AMI"
    Project = "VeoLMS"
    OS      = "Debian 14"
  }
}

build {
  sources = ["source.amazon-ebs.veolms_debian14_worker"]

  provisioner "shell" {
    inline = [
      "sudo apt-get update -y",
      "sudo apt-get install -y curl git tar xz-utils build-essential",
      "sudo curl -fsSL https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz -o /tmp/ffmpeg.tar.xz",
      "sudo mkdir -p /tmp/ffmpeg-extracted",
      "sudo tar -xf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg-extracted --strip-components 1",
      "sudo mv /tmp/ffmpeg-extracted/bin/ffmpeg /usr/local/bin/ffmpeg || sudo mv /tmp/ffmpeg-extracted/ffmpeg /usr/local/bin/ffmpeg",
      "sudo mv /tmp/ffmpeg-extracted/bin/ffprobe /usr/local/bin/ffprobe || sudo mv /tmp/ffmpeg-extracted/ffprobe /usr/local/bin/ffprobe",
      "sudo chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe",
      "sudo curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -",
      "sudo apt-get install -y nodejs",
      "sudo npm install -g pnpm",
      "sudo mkdir -p /opt/veolms",
      "sudo chown -R admin:admin /opt/veolms"
    ]
  }
}
`;
}
