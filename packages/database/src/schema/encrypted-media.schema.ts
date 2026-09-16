import type { Generated, JSONColumnType } from "kysely";

export type EncryptedMediaOutputStatus = "ready" | "failed";

export interface EncryptedDrmKeyTable {
  key_id: string;
  ciphertext: Buffer;
  nonce: Buffer;
  auth_tag: Buffer;
  key_version: string;
  algorithm: "aes-256-gcm";
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EncryptedMediaOutputTable {
  media_id: string;
  manifest_path: string;
  output_prefix: string;
  manifest_type: "application/dash+xml";
  scheme: "cenc-aes-ctr";
  key_system: "org.w3.clearkey";
  duration_seconds: number | null;
  qualities: JSONColumnType<string[]>;
  status: EncryptedMediaOutputStatus;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EncryptedMediaPeriodTable {
  media_id: string;
  period_index: number;
  source_segment_start: number;
  source_segment_count: number;
  start_ms: number | string;
  duration_ms: number | string;
  key_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
