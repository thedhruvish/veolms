import type { Generated, JSONColumnType } from "kysely";
import type {
  Architecture,
  FleetEventType,
  JobRequirements,
  JobStatus,
  ProviderType,
  WorkerStatus,
} from "@veolms/fleet-types";

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

export interface JobTable {
  id: string;
  status: JobStatus;
  video_key: string;
  output_prefix: string;
  requirements: JSONColumnType<JobRequirements>;
  worker_id: string | null;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  error_message: string | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  updated_at: Generated<Date>;
}

export interface WorkerTable {
  id: string;
  provider: ProviderType;
  provider_worker_id: string;
  status: WorkerStatus;
  architecture: Architecture;
  cpu: number;
  memory_mb: number;
  storage_gb: Generated<number>;
  region: Generated<string>;
  job_id: string | null;
  metadata: JSONColumnType<Record<string, unknown>>;
  last_heartbeat_at: Date | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  terminated_at: Date | null;
  updated_at: Generated<Date>;
}

export interface WorkerMonitoringTable {
  worker_id: string;
  next_check_at: Date;
  last_check_at: Date | null;
  estimated_duration_sec: number;
  progress_percent: Generated<number>;
  last_progress_at: Date | null;
  monitoring_attempts: Generated<number>;
  check_interval_sec: Generated<number>;
  updated_at: Generated<Date>;
}

export interface WorkerEventTable {
  id: string;
  worker_id: string | null;
  job_id: string | null;
  event: FleetEventType;
  metadata: JSONColumnType<Record<string, unknown>>;
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
  jobs: JobTable;
  workers: WorkerTable;
  worker_monitoring: WorkerMonitoringTable;
  worker_events: WorkerEventTable;
}
