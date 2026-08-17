import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AwsCloudDriver } from "../src/driver.ts";
import { awsPluginManifest } from "../src/manifest.ts";

describe("AWS Cloud Driver & Manifest Suite", () => {
  it("should initialize AwsCloudDriver with valid spot provider type and options", () => {
    const driver = new AwsCloudDriver({
      region: "us-east-1",
      tempS3Bucket: "temp-bucket",
      prodS3Bucket: "prod-bucket",
      fleetManagerApiUrl: "http://127.0.0.1:4000",
      useSpotInstances: true,
      instanceType: "c6i.xlarge",
    });

    assert.equal(driver.name, "aws");
    assert.equal(driver.providerType, "aws_ec2");
    assert.equal(driver.options.region, "us-east-1");
    assert.equal(driver.options.instanceType, "c6i.xlarge");
  });

  it("should have a complete FleetPluginManifest conforming to @veolms/fleet-types", () => {
    assert.equal(awsPluginManifest.packageName, "@veolms/fleet-plugin-aws");
    assert.equal(awsPluginManifest.provider, "aws");
    assert.equal(awsPluginManifest.defaultRunnerMode, "spot");
    assert.ok(awsPluginManifest.supportedRunnerModes.includes("spot"));
    assert.ok(awsPluginManifest.supportedRunnerModes.includes("on_demand"));
    assert.ok(awsPluginManifest.supportedRunnerModes.includes("ecs_fargate"));

    const envTemplate = awsPluginManifest.getEnvTemplate({
      runnerMode: "spot",
      databaseUrl: "postgresql://user:pass@localhost/db",
      storagePath: "./s3-bucket",
      fleetManagerUrl: "http://127.0.0.1:4000",
      isHardwareAccelerated: false,
    });

    assert.equal(envTemplate.PROVIDER, "aws");
    assert.equal(envTemplate.RUNNER_MODE, "spot");
    assert.equal(envTemplate.S3_TEMP_BUCKET, "veolms-temp-scratch-bucket");
    assert.equal(envTemplate.S3_PROD_BUCKET, "veolms-production-media-bucket");
    assert.equal(envTemplate.STORAGE_DRIVER, "s3");
  });
});
