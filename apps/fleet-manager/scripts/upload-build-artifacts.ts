import { buildAndUploadBuildArtifacts } from "@veolms/fleet-provider-aws/setup";
import { bold, cyan, green, red, yellow } from "@veolms/fleet-types/terminal";

async function main(): Promise<void> {
  const bucketName =
    process.env.S3_BUILD_BUCKET ||
    process.env.S3_BUCKET_NAME ||
    process.env.S3_BUCKET;
  const region =
    process.env.AWS_REGION ||
    process.env.FLEET_MANAGER_LAMBDA_REGION ||
    "us-east-1";

  const includeProbe = process.env.SETUP_PROBE_LAMBDA !== "false";
  const includeLambda = process.env.FLEET_MODE !== "serverful";

  console.info(`\n╔══════════════════════════════════════════════════════╗`);
  console.info(`║       VeoLMS Build Artifacts S3 Uploader           ║`);
  console.info(`╚══════════════════════════════════════════════════════╝\n`);

  if (!bucketName) {
    console.error(
      red(
        "✘ Error: S3_BUILD_BUCKET or S3_BUCKET is not configured in environment.",
      ),
    );
    process.exit(1);
  }

  console.info(`  Target Build Bucket:  ${bold(cyan(bucketName))}`);
  console.info(`  Target Region:        ${bold(cyan(region))}`);
  console.info(`  Building & uploading artifacts to S3...\n`);

  const result = await buildAndUploadBuildArtifacts({
    buildBucketName: bucketName,
    region,
    includeLambda,
    includeProbe,
  });

  console.info(`\n${bold("Upload Summary:")}`);
  if (result.workerBundleUploaded) {
    console.info(
      `  ${green("✔")} Media Worker:       ${bold(`s3://${bucketName}/bundles/media-worker.js`)}`,
    );
  } else {
    console.info(`  ${yellow("⚠")} Media Worker:       Upload failed or skipped`);
  }

  if (includeLambda) {
    if (result.lambdaZipUploaded) {
      console.info(
        `  ${green("✔")} Fleet Lambda:       ${bold(`s3://${bucketName}/bundles/fleet-manager.zip`)}`,
      );
    } else {
      console.info(`  ${yellow("⚠")} Fleet Lambda:       Upload failed or skipped`);
    }
  }

  if (includeProbe) {
    if (result.probeZipUploaded) {
      console.info(
        `  ${green("✔")} Probe Lambda:       ${bold(`s3://${bucketName}/bundles/probe-lambda.zip`)}`,
      );
    } else {
      console.info(`  ${yellow("⚠")} Probe Lambda:       Upload failed or skipped`);
    }
  }

  if (
    result.workerBundleUploaded &&
    (!includeLambda || result.lambdaZipUploaded) &&
    (!includeProbe || result.probeZipUploaded)
  ) {
    console.info(
      `\n${green("✔")} All build artifacts successfully uploaded to S3 build bucket!\n`,
    );
  } else {
    console.warn(
      yellow("\n⚠ Some build artifacts could not be uploaded. Check logs above.\n"),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
