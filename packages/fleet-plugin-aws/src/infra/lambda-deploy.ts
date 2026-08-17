import {
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

export interface DeployLambdaOptions {
  readonly region: string;
  readonly functionName?: string;
  readonly roleArn: string;
  readonly zipCodeBuffer?: Uint8Array;
  readonly databaseUrl: string;
  readonly tempBucket: string;
  readonly prodBucket: string;
  readonly memorySizeMb?: number;
  readonly timeoutSeconds?: number;
}

export interface DeployLambdaResult {
  readonly functionName: string;
  readonly functionArn: string;
  readonly isNew: boolean;
}

/**
 * Automates deployment and update of VeoLMS Serverless Fleet Manager Control Plane to AWS Lambda.
 */
export async function deployServerlessLambda(
  options: DeployLambdaOptions,
): Promise<DeployLambdaResult> {
  const {
    region,
    functionName = "VeoLMSFleetManager",
    roleArn,
    zipCodeBuffer = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // Empty zip header placeholder if not pre-bundled
    databaseUrl,
    tempBucket,
    prodBucket,
    memorySizeMb = 512,
    timeoutSeconds = 60,
  } = options;

  const lambda = new LambdaClient({ region });

  const envVariables = {
    DATABASE_URL: databaseUrl,
    STORAGE_DRIVER: "s3",
    S3_TEMP_BUCKET: tempBucket,
    S3_PROD_BUCKET: prodBucket,
    AWS_REGION: region,
    NODE_OPTIONS: "--enable-source-maps",
  };

  // 1. Check if function exists
  try {
    const getRes = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );

    const existingArn = getRes.Configuration?.FunctionArn || "";

    // Update existing function configuration
    await lambda.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Role: roleArn,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        MemorySize: memorySizeMb,
        Timeout: timeoutSeconds,
        Environment: { Variables: envVariables },
      }),
    );

    if (zipCodeBuffer.length > 30) {
      await lambda.send(
        new UpdateFunctionCodeCommand({
          FunctionName: functionName,
          ZipFile: zipCodeBuffer,
        }),
      );
    }

    return {
      functionName,
      functionArn: existingArn,
      isNew: false,
    };
  } catch {
    // 2. Create new function
    const createRes = await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: roleArn,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        MemorySize: memorySizeMb,
        Timeout: timeoutSeconds,
        Code: {
          ZipFile: zipCodeBuffer,
        },
        Environment: { Variables: envVariables },
        Tags: {
          Project: "VeoLMS",
        },
      }),
    );

    return {
      functionName,
      functionArn: createRes.FunctionArn || "",
      isNew: true,
    };
  }
}
