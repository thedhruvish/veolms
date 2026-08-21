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
});
