import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapEc2StateToWorkerStatus } from "../src/provider.ts";
import { loadAwsProviderConfig, resolveS3BucketName } from "../src/config.ts";

describe("AWS Fleet Provider", () => {
  it("should map EC2 instance states to fleet WorkerStatus correctly", () => {
    assert.equal(mapEc2StateToWorkerStatus("pending"), "STARTING");
    assert.equal(mapEc2StateToWorkerStatus("running"), "PROCESSING");
    assert.equal(mapEc2StateToWorkerStatus("shutting-down"), "TERMINATING");
    assert.equal(mapEc2StateToWorkerStatus("terminated"), "TERMINATED");
    assert.equal(mapEc2StateToWorkerStatus("stopped"), "FAILED");
    assert.equal(mapEc2StateToWorkerStatus("stopping"), "FAILED");
    assert.equal(mapEc2StateToWorkerStatus("unknown"), "PENDING");
  });

  it("should load config with EC2_KEY_NAME and EC2_SECURITY_GROUP_IDS fallback", () => {
    const config = loadAwsProviderConfig({
      EC2_KEY_NAME: "key-03fe15e84e3eee02c",
      EC2_SECURITY_GROUP_IDS: "sg-12345678",
      S3_BUCKET_NAME: "my-test-bucket",
    });

    assert.equal(config.KEY_NAME, "key-03fe15e84e3eee02c");
    assert.equal(config.SECURITY_GROUP_IDS, "sg-12345678");
    assert.equal(config.S3_BUCKET, "my-test-bucket");
  });

  describe("resolveS3BucketName", () => {
    it("prefers S3_BUCKET over S3_BUCKET_NAME when both are set", () => {
      assert.equal(
        resolveS3BucketName({ S3_BUCKET: "a", S3_BUCKET_NAME: "b" }),
        "a",
      );
    });

    it("falls back to S3_BUCKET_NAME when S3_BUCKET is unset", () => {
      assert.equal(resolveS3BucketName({ S3_BUCKET_NAME: "b" }), "b");
    });

    it("returns null when neither is set", () => {
      assert.equal(resolveS3BucketName({}), null);
    });
  });

  describe("listActiveInstances", () => {
    it("should query and return active EC2 instances with mapped statuses and worker IDs", async () => {
      const { createAwsProvider } = await import("../src/provider.ts");
      const mockEc2 = {
        send: async (cmd: any) => {
          if (cmd.constructor.name === "DescribeInstancesCommand") {
            return {
              Reservations: [
                {
                  Instances: [
                    {
                      InstanceId: "i-0123456789abcdef0",
                      State: { Name: "running" },
                      LaunchTime: new Date("2026-08-25T12:00:00Z"),
                      Tags: [
                        { Key: "ManagedBy", Value: "veolms-fleet-manager" },
                        { Key: "WorkerId", Value: "w-abc-123" },
                      ],
                    },
                    {
                      InstanceId: "i-0123456789abcdef1",
                      State: { Name: "pending" },
                      LaunchTime: new Date("2026-08-25T12:05:00Z"),
                      Tags: [{ Key: "ManagedBy", Value: "veolms-fleet-manager" }],
                    },
                  ],
                },
              ],
            };
          }
          return {};
        },
      } as any;

      const provider = createAwsProvider({ ec2Client: mockEc2 });
      const instances = await provider.listActiveInstances!();

      assert.equal(instances.length, 2);
      assert.equal(instances[0]!.providerWorkerId, "i-0123456789abcdef0");
      assert.equal(instances[0]!.status, "PROCESSING");
      assert.equal(instances[0]!.workerId, "w-abc-123");
      assert.equal(instances[1]!.providerWorkerId, "i-0123456789abcdef1");
      assert.equal(instances[1]!.status, "STARTING");
      assert.equal(instances[1]!.workerId, null);
    });
  });

  describe("verifyJobOutput", () => {
    it("should verify existence of master.m3u8 playlist in S3", async () => {
      const { createAwsProvider } = await import("../src/provider.ts");
      let requestedKey = "";
      const mockS3 = {
        send: async (cmd: any) => {
          requestedKey = cmd.input.Key;
          if (cmd.input.Key === "transcoded/video-1/master.m3u8") {
            return { ContentLength: 2048 };
          }
          throw new Error("NoSuchKey");
        },
      } as any;

      const provider = createAwsProvider({
        s3Client: mockS3,
        s3BucketName: "test-bucket",
      });

      const verified = await provider.verifyJobOutput!("transcoded/video-1/");
      assert.equal(verified, true);
      assert.equal(requestedKey, "transcoded/video-1/master.m3u8");

      const notFound = await provider.verifyJobOutput!("transcoded/nonexistent/");
      assert.equal(notFound, false);
    });
  });
});

