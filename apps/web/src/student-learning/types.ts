export interface LearningCourse {
  id: string;
  title: string;
  sections: number;
  lectures: number;
  status: "in-progress" | "not-started" | "completed";
  progress: number;
  lastLesson?: string;
  accessed?: string;
  enrolledOn?: string;
  completedOn?: string;
  thumbnail: string;
}
