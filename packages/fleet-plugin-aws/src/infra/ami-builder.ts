export interface AmiBuilderOptions {
  readonly includeNvidiaDrivers?: boolean;
  readonly veolmsGitRepo?: string;
  readonly veolmsBranch?: string;
}

/**
 * Generates the shell setup script to configure a golden EC2 AMI on Debian 14 for VeoLMS Media Worker.
 * Pre-installs Node.js 24 LTS and downloads the latest modern FFmpeg 7.x+ build directly
 * from official GitHub Releases with libx264, libx265, and hardware codecs.
 */
export function generateAmiSetupScript(options: AmiBuilderOptions = {}): string {
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
