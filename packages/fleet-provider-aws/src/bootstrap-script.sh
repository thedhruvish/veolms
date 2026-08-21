#!/bin/bash
set -uo pipefail

exec > >(tee -a /var/log/veolms-bootstrap.log) 2>&1
echo "[bootstrapper] Initializing VeoLMS Transcoder Worker: __WORKER_ID__ at $(date)"

# Runs on any exit (success, failure, or set -e abort) so a failed launch
# uploads its log and terminates instead of vanishing silently. Reads
# BUCKET_NAME with a default (${BUCKET_NAME:-}) since this can fire before
# the real assignment further down (after worker.env is sourced) runs.
cleanup_and_terminate() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    echo "[bootstrapper] Bootstrap failed with exit code $exit_code."
  fi

  if [ -n "${BUCKET_NAME:-}" ] && command -v aws &> /dev/null; then
    aws s3 cp /var/log/veolms-bootstrap.log \
      "s3://$BUCKET_NAME/worker-logs/__WORKER_ID__/bootstrap.log" \
      --region "${AWS_REGION:-us-east-1}" 2>/dev/null || true
  fi

  echo "[bootstrapper] Terminating EC2 instance..."
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
  if [ -n "$TOKEN" ]; then
    INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)
    INSTANCE_REGION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || true)
  else
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)
    INSTANCE_REGION="${AWS_REGION:-us-east-1}"
  fi

  if [ -n "$INSTANCE_ID" ] && command -v aws &> /dev/null; then
    aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "${INSTANCE_REGION:-us-east-1}" || shutdown -h now
  else
    shutdown -h now
  fi
}
trap cleanup_and_terminate EXIT

mkdir -p /opt/veolms
cat << 'EOF' > /opt/veolms/worker.env
__ENV_FILE_LINES__
EOF
chmod 600 /opt/veolms/worker.env

# Export environment variables for the current session
set -a
source /opt/veolms/worker.env
set +a

BUCKET_NAME="${S3_BUCKET:-${S3_BUCKET_NAME:-}}"

set -e

# Masked permanently on AMIs built via build-ami.ts; repeated here as a
# fallback for older/non-prebaked AMIs where these timers still race the
# dpkg lock during early boot.
systemctl stop apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service unattended-upgrades.service 2>/dev/null || true
systemctl kill --kill-who=all apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
WAIT_START=$(date +%s)
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
  if [ $(( $(date +%s) - WAIT_START )) -gt 60 ]; then
    echo "[bootstrapper] Timed out waiting for dpkg/apt lock after 60s — continuing anyway."
    break
  fi
  sleep 1
done

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
  apt-get update -y && apt-get install -y awscli
fi

echo "[bootstrapper] System dependencies verified (node $(node -v), ffmpeg $(ffmpeg -version | head -n1))"

if [ -z "$BUCKET_NAME" ]; then
  echo "[bootstrapper] No S3 bucket configured (S3_BUCKET/S3_BUCKET_NAME) — cannot download worker bundle."
  exit 1
fi

echo "[bootstrapper] Downloading worker bundle from s3://$BUCKET_NAME/bundles/media-worker.js..."
aws s3 cp "s3://$BUCKET_NAME/bundles/media-worker.js" /opt/veolms/worker.js --region "${AWS_REGION:-us-east-1}"

echo "[bootstrapper] Launching VeoLMS Media Worker..."
cd /opt/veolms
node worker.js >> /var/log/veolms-worker.log 2>&1
echo "[bootstrapper] Worker run complete."
