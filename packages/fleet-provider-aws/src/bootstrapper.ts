import type { WorkerSpec } from "@veolms/fleet-types";

export interface BootstrapperOptions {
  workerId: string;
  spec: WorkerSpec;
  usePrebakedAmi?: boolean;
  repoUrl?: string;
  workerBundleS3Url?: string;
  extraEnv?: Readonly<Record<string, string>>;
}

export function generateUserDataScript(options: BootstrapperOptions): string {
  const { workerId, spec, usePrebakedAmi, extraEnv } = options;

  const mergedEnv: Record<string, string> = {
    WORKER_ID: workerId,
    PROVIDER: "aws",
    ...spec.environmentVariables,
    ...extraEnv,
  };

  const envFileLines = Object.entries(mergedEnv)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join("\n");

  if (usePrebakedAmi) {
    // Pre-baked AMI already contains Node 24, FFmpeg, and the pre-installed media worker service
    return `#!/bin/bash
set -euo pipefail

mkdir -p /opt/veolms
cat << 'EOF' > /opt/veolms/worker.env
${envFileLines}
EOF

chmod 600 /opt/veolms/worker.env
systemctl daemon-reload
systemctl restart veolms-media-worker || systemctl start veolms-media-worker
`;
  }

  // Standard Debian 13 / Linux AMI with dynamic bootstrapper
  return `#!/bin/bash
set -euo pipefail

exec > >(tee -a /var/log/veolms-bootstrap.log) 2>&1
echo "[bootstrapper] Initializing VeoLMS Transcoder Worker: ${workerId} at $(date)"

mkdir -p /opt/veolms
cat << 'EOF' > /opt/veolms/worker.env
${envFileLines}
EOF
chmod 600 /opt/veolms/worker.env

# Export environment variables for the current session
set -a
source /opt/veolms/worker.env
set +a

# Install Node.js 24 and FFmpeg if missing
if ! command -v node &> /dev/null; then
  echo "[bootstrapper] Installing Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

if ! command -v ffmpeg &> /dev/null; then
  echo "[bootstrapper] Installing FFmpeg..."
  apt-get update -y && apt-get install -y ffmpeg
fi

if ! command -v aws &> /dev/null; then
  echo "[bootstrapper] Installing AWS CLI..."
  apt-get update -y && apt-get install -y awscli || true
fi

echo "[bootstrapper] System dependencies verified (node $(node -v), ffmpeg $(ffmpeg -version | head -n1))"

# Download worker bundle from S3 and run
BUCKET_NAME="\${S3_BUCKET:-\${S3_BUCKET_NAME:-}}"
if [ -n "\$BUCKET_NAME" ]; then
  echo "[bootstrapper] Downloading worker bundle from s3://\$BUCKET_NAME/bundles/media-worker.js..."
  aws s3 cp "s3://\$BUCKET_NAME/bundles/media-worker.js" /opt/veolms/worker.js --region "\${AWS_REGION:-us-east-1}" || true
fi

if [ -f "/opt/veolms/worker.js" ]; then
  echo "[bootstrapper] Launching VeoLMS Media Worker..."
  cd /opt/veolms
  node worker.js >> /var/log/veolms-worker.log 2>&1 || true
  echo "[bootstrapper] Worker run complete."
else
  echo "[bootstrapper] Worker bundle not found at /opt/veolms/worker.js"
fi

# Automatic EC2 Self-Termination after job finishes
echo "[bootstrapper] Terminating EC2 instance after job completion..."
TOKEN=\$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
if [ -n "\$TOKEN" ]; then
  INSTANCE_ID=\$(curl -s -H "X-aws-ec2-metadata-token: \$TOKEN" http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)
  REGION=\$(curl -s -H "X-aws-ec2-metadata-token: \$TOKEN" http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || true)
else
  INSTANCE_ID=\$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)
  REGION="\${AWS_REGION:-us-east-1}"
fi

if [ -n "\$INSTANCE_ID" ]; then
  echo "[bootstrapper] Terminating instance \$INSTANCE_ID in \$REGION..."
  aws ec2 terminate-instances --instance-ids "\$INSTANCE_ID" --region "\${REGION:-us-east-1}" || shutdown -h now
else
  shutdown -h now
fi
`;
}

export function encodeUserDataBase64(script: string): string {
  return Buffer.from(script, "utf-8").toString("base64");
}
