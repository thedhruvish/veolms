import type { StreamResponse } from "@veolms/contracts";
import type { LessonContentType, CourseStatus } from "@veolms/database";

export interface StreamUserContext {
  id: string;
  roles?: string[];
}

export interface LessonWithCourseInfo {
  id: string;
  course_id: string;
  section_id: string;
  title: string;
  description: string | null;
  content_type: LessonContentType;
  content_media_id: string | null;
  position: number;
  is_preview: boolean;
  is_published: boolean;
  course_status: CourseStatus;
  course_creator_id: string | null;
  course_deleted_at: Date | null;
  lesson_deleted_at: Date | null;
}

export type StreamServiceResult = StreamResponse;
