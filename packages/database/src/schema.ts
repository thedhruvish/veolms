import type { Generated } from "kysely";

export type CourseStatus = "draft" | "published" | "archived";
export type OtpIdentifierType = "email" | "phone";
export type OtpPurpose =
  "login" | "registration" | "email_verification" | "phone_verification";

export interface CourseTable {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  description: string;
  status: CourseStatus;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AcademyTable {
  id: string;
  name: string;
  logo_url: string | null;
  custom_domain: string | null;
  setup_completed: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserTable {
  id: string;
  email: string | null;
  phone_no: string | null;
  username: string;
  display_name: string;
  email_verified_at: Date | null;
  mfa_mandatory: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RoleTable {
  id: string;
  name: string;
  description: string | null;
  last_permission_update: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserRoleTable {
  user_id: string;
  role_id: string;
  created_at: Generated<Date>;
}

export interface MenuTable {
  id: string;
  parent_id: string | null;
  label: string;
  route_link: string;
  icon: string | null;
  expanded: Generated<boolean>;
  check_list: string | null;
  is_both: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PermissionTable {
  id: string;
  role_id: string;
  menu_id: string;
  can_create: Generated<boolean>;
  can_read: Generated<boolean>;
  can_update: Generated<boolean>;
  can_delete: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SessionTable {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  mfa_verified: Generated<boolean>;
  revoked_at: Date | null;
  expires_at: Date;
  last_used_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OauthAccountTable {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OtpCodeTable {
  id: string;
  identifier: string;
  identifier_type: OtpIdentifierType | string;
  purpose: OtpPurpose | string;
  code_hash: string;
  attempts: Generated<number>;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}

export interface PasskeyTable {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: Generated<number>;
  transports: string | null;
  created_at: Generated<Date>;
}

export interface UserTotpCredentialTable {
  id: string;
  user_id: string;
  secret_encrypted: string;
  enabled: Generated<boolean>;
  last_used_step: string | null;
  failed_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MfaBackupCodeTable {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface WebauthnChallengeTable {
  id: string;
  user_id: string | null;
  challenge: string;
  type: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}

export interface VideoJobTable {
  id: string;
  status: string;
  source_key: string;
  duration_seconds: number;
  source_width: number;
  source_height: number;
  source_fps: number;
  source_codec: string;
  requested_qualities: string;
  quality_complexity: number;
  source_complexity: number;
  chunk_duration_seconds: number;
  chunk_count: number;
  required_workers: number;
  active_workers: Generated<number>;
  completed_chunks: Generated<number>;
  output_manifest_key: string | null;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoChunkTable {
  id: string;
  video_id: string;
  chunk_index: number;
  start_seconds: number;
  duration_seconds: number;
  source_key: string;
  status: string;
  worker_id: string | null;
  output_key: string | null;
  retry_count: Generated<number>;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkerTable {
  id: string;
  instance_id: string;
  provider: string;
  instance_type: string;
  state: string;
  current_job_id: string | null;
  current_video_id: string | null;
  current_chunk_id: string | null;
  progress_percent: Generated<number>;
  estimated_remaining_seconds: number | null;
  fps: number | null;
  last_heartbeat_at: Date | null;
  idle_since: Date | null;
  started_at: Generated<Date>;
  terminated_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkerHeartbeatTable {
  id: string;
  worker_id: string;
  job_id: string | null;
  video_id: string | null;
  chunk_id: string | null;
  progress_percent: number;
  fps: number | null;
  frames: number | null;
  estimated_remaining_seconds: number | null;
  cpu_usage: number | null;
  memory_usage: number | null;
  created_at: Generated<Date>;
}

export interface Database {
  courses: CourseTable;
  academy: AcademyTable;
  users: UserTable;
  roles: RoleTable;
  user_roles: UserRoleTable;
  menus: MenuTable;
  permissions: PermissionTable;
  sessions: SessionTable;
  oauth_accounts: OauthAccountTable;
  otp_codes: OtpCodeTable;
  passkeys: PasskeyTable;
  user_totp_credentials: UserTotpCredentialTable;
  mfa_backup_codes: MfaBackupCodeTable;
  webauthn_challenges: WebauthnChallengeTable;
  video_jobs: VideoJobTable;
  video_chunks: VideoChunkTable;
  workers: WorkerTable;
  worker_heartbeats: WorkerHeartbeatTable;
}
