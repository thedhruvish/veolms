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

export interface Database {
  courses: CourseTable;
}
