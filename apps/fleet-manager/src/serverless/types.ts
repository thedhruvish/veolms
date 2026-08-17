export interface APIGatewayProxyEventV2Like {
  readonly rawPath?: string;
  readonly path?: string;
  readonly httpMethod?: string;
  readonly requestContext?: {
    readonly http?: {
      readonly method: string;
      readonly path: string;
    };
  };
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface APIGatewayProxyResultV2Like {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
}

export interface EventBridgeScheduledEventLike {
  readonly source: "aws.events" | string;
  readonly "detail-type": "Scheduled Event" | string;
  readonly time: string;
  readonly id?: string;
}

export interface SQSRecordLike {
  readonly messageId: string;
  readonly body: string;
  readonly eventSource?: string;
}

export interface SQSEventLike {
  readonly Records: readonly SQSRecordLike[];
}

export interface LambdaContextLike {
  readonly awsRequestId?: string;
  readonly functionName?: string;
  readonly getRemainingTimeInMillis?: () => number;
}
