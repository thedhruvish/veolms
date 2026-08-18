import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateAmiSetupScript,
  generatePackerTemplate,
} from "../src/infra/ami-builder.ts";
import { validateAwsCredentials } from "../src/infra/auth-check.ts";
import {
  bundleFleetManagerLambda,
  createSingleFileZip,
} from "../src/infra/lambda-deploy.ts";

describe("AWS Infrastructure Automations Suite", () => {
  it("should generate valid AMI setup script for Debian 14 with GitHub Release FFmpeg", () => {
    const script = generateAmiSetupScript();
    assert.ok(script.includes("#!/bin/bash"));
    assert.ok(script.includes("apt-get update"));
    assert.ok(
      script.includes("github.com/BtbN/FFmpeg-Builds/releases/download/latest"),
    );
    assert.ok(script.includes("/usr/local/bin/ffmpeg"));
    assert.ok(script.includes("deb.nodesource.com/node_24.x"));
    assert.ok(script.includes("pnpm"));
    assert.ok(script.includes("/opt/veolms"));
    assert.ok(script.includes("veolms-worker.service"));
  });

  it("should generate valid HashiCorp Packer HCL template targeting Debian 14", () => {
    const packer = generatePackerTemplate({
      region: "us-east-1",
      instanceType: "c6i.large",
    });
    assert.ok(packer.includes("packer {"));
    assert.ok(packer.includes('source "amazon-ebs" "veolms_debian14_worker"'));
    assert.ok(packer.includes('name                = "debian-14-*"'));
    assert.ok(packer.includes('ssh_username = "admin"'));
    assert.ok(packer.includes("build {"));
    assert.ok(
      packer.includes("github.com/BtbN/FFmpeg-Builds/releases/download/latest"),
    );
  });

  it("should generate valid standalone zip buffer for Lambda deployment", () => {
    const zip = createSingleFileZip(
      "index.mjs",
      "export async function handler() {}",
    );
    assert.ok(zip.length > 30);
    // Check zip header signature: PK\x03\x04
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.equal(zip[2], 0x03);
    assert.equal(zip[3], 0x04);
  });

  it("should bundle real fleet-manager code for Lambda", async () => {
    const zip = await bundleFleetManagerLambda();
    assert.ok(zip.length > 1000);
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
  });

  it("should return clean error and help message when AWS credentials are not set", async () => {
    const auth = await validateAwsCredentials("us-east-1");
    if (!auth.valid) {
      assert.ok(auth.errorMessage);
      assert.ok(auth.helpMessage);
      assert.ok(auth.helpMessage.includes("AWS Authentication Failed"));
      assert.ok(auth.helpMessage.includes("aws configure"));
    } else {
      assert.ok(auth.accountId);
    }
  });
});
