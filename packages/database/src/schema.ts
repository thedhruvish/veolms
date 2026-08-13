import type { Generated } from "kysely";

export type CourseStatus = "draft" | "published" | "archived";

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

export interface RoleTable {
  id: Generated<number>;
  roleName: string;
  lastPermissionUpdate: Generated<Date>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface MenuTable {
  id: Generated<number>;
  parentId: number | null;
  label: string;
  routeLink: string;
  icon: string | null;
  expanded: Generated<boolean>;
  checkList: string | null;
  isBoth: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface PermissionTable {
  id: Generated<number>;
  roleId: number;
  menuId: number;
  canCreate: Generated<boolean>;
  canRead: Generated<boolean>;
  canUpdate: Generated<boolean>;
  canDelete: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface UserTable {
  id: Generated<number>;
  userName: string;
  firstName: string;
  lastName: string | null;
  email: string;
  password: string;
  roleId: number;
  dateOfBirth: string | null;
  phone: string | null;
  address: string | null;
  avatarAssetId: number | null;
  passwordResetTokenHash: string | null;
  passwordResetExpires: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface Database {
  courses: CourseTable;
  roles: RoleTable;
  menus: MenuTable;
  permissions: PermissionTable;
  users: UserTable;
}
