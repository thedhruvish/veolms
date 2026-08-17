import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateAmiSetupScript,
  generatePackerTemplate,
} from "../src/infra/ami-builder.ts";
import { validateAwsCredentials } from "../src/infra/auth-check.ts";

describe("AWS Infrastructure Automations Suite", () => {
  it("should generate valid AMI setup script for Debian 14 with GitHub Release FFmpeg", () => {
    const script = generateAmiSetupScript();
    assert.ok(script.includes("#!/bin/bash"));
    assert.ok(script.includes("apt-get update"));
    assert.ok(script.includes("github.com/BtbN/FFmpeg-Builds/releases/download/latest"));
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
    assert.ok(packer.includes('packer {'));
    assert.ok(packer.includes('source "amazon-ebs" "veolms_debian14_worker"'));
    assert.ok(packer.includes('name                = "debian-14-*"'));
    assert.ok(packer.includes('ssh_username = "admin"'));
    assert.ok(packer.includes("build {"));
    assert.ok(packer.includes("github.com/BtbN/FFmpeg-Builds/releases/download/latest"));
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
