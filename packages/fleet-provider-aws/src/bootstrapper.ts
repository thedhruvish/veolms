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

  // Standard Debian 14 / Linux AMI with dynamic bootstrapper
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

echo "[bootstrapper] System dependencies verified (node $(node -v), ffmpeg $(ffmpeg -version | head -n1))"

# If worker package is pre-downloaded or pulled from S3
if [ -d "/opt/veolms/app" ]; then
  cd /opt/veolms/app
  node apps/media-worker/src/index.ts >> /var/log/veolms-worker.log 2>&1
else
  echo "[bootstrapper] Worker runtime environment configured."
fi
`;
}

export function encodeUserDataBase64(script: string): string {
  return Buffer.from(script, "utf-8").toString("base64");
}
