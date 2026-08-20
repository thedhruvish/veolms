import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeUserDataBase64,
  generateUserDataScript,
} from "../src/bootstrapper.ts";

describe("EC2 UserData Bootstrapper Generator", () => {
  it("should generate Debian 13 / Linux bootstrapper script with environment variables", () => {
    const script = generateUserDataScript({
      workerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      spec: {
        cpu: 2,
        memoryMb: 4096,
        architecture: "arm64",
        storageGb: 30,
        region: "us-east-1",
        environmentVariables: {
          JOB_ID: "job-123",
          DATABASE_URL: "postgresql://veolms:veolms@db:5432/veolms",
        },
      },
      usePrebakedAmi: false,
    });

    assert.ok(script.startsWith("#!/bin/bash"));
    assert.ok(
      script.includes('WORKER_ID="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"'),
    );
    assert.ok(script.includes('JOB_ID="job-123"'));
    assert.ok(script.includes("apt-get install -y ffmpeg"));
  });

  it("should generate pre-baked AMI bootstrapper with systemd service start", () => {
    const script = generateUserDataScript({
      workerId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      spec: {
        cpu: 4,
        memoryMb: 8192,
        architecture: "arm64",
        storageGb: 50,
        region: "us-east-1",
        environmentVariables: {
          JOB_ID: "job-456",
        },
      },
      usePrebakedAmi: true,
    });

    assert.ok(
      script.includes(
        "systemctl restart veolms-media-worker || systemctl start veolms-media-worker",
      ),
    );
    assert.ok(
      script.includes('WORKER_ID="b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"'),
    );
  });

  it("should encode UserData script to Base64", () => {
    const script = "#!/bin/bash\necho hello";
    const encoded = encodeUserDataBase64(script);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");

    assert.equal(decoded, script);
  });
});
