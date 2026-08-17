import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EC2_TRUST_RELATIONSHIP,
  generateFleetManagerIamPolicy,
  generateTerraformSnippet,
  generateWorkerIamPolicy,
} from "../src/iam-policies.ts";

describe("AWS IAM Roles & Security Generator", () => {
  it("should generate valid Worker IAM policy with Temp and Prod S3 bucket access", () => {
    const policy = generateWorkerIamPolicy({
      tempBucketName: "my-temp-bucket",
      prodBucketName: "my-prod-bucket",
    });

    assert.equal(policy.Version, "2012-10-17");
    assert.ok(policy.Statement.length >= 2);

    // Check temp bucket statements
    const tempStmt = policy.Statement.find(
      (s) => s.Sid === "VeoLMSTempScratchBucketAccess",
    );
    assert.ok(tempStmt);
    assert.ok(
      (tempStmt.Resource as string[]).includes("arn:aws:s3:::my-temp-bucket"),
    );

    // Check prod bucket statements
    const prodStmt = policy.Statement.find(
      (s) => s.Sid === "VeoLMSProductionHlsBucketAccess",
    );
    assert.ok(prodStmt);
    assert.ok(
      (prodStmt.Resource as string[]).includes("arn:aws:s3:::my-prod-bucket"),
    );
  });

  it("should generate valid Fleet Manager Control Plane IAM policy", () => {
    const policy = generateFleetManagerIamPolicy();
    assert.equal(policy.Version, "2012-10-17");
    const ec2Stmt = policy.Statement.find(
      (s) => s.Sid === "VeoLMSEC2SpotLifecycleManagement",
    );
    assert.ok(ec2Stmt);
    assert.ok((ec2Stmt.Action as string[]).includes("ec2:RunInstances"));
    assert.ok((ec2Stmt.Action as string[]).includes("ec2:TerminateInstances"));
  });

  it("should generate Terraform deployment snippet with lifecycle rules", () => {
    const tf = generateTerraformSnippet({
      tempBucket: "veolms-temp-test",
      prodBucket: "veolms-prod-test",
      region: "ap-southeast-1",
    });

    assert.ok(tf.includes('provider "aws"'));
    assert.ok(tf.includes("veolms_temp_lifecycle"));
    assert.ok(tf.includes("VeoLMSMediaWorkerInstanceProfile"));
  });

  it("should have valid EC2 trust relationship document", () => {
    assert.equal(EC2_TRUST_RELATIONSHIP.Version, "2012-10-17");
    assert.ok(EC2_TRUST_RELATIONSHIP.Statement.length > 0);
  });
});
