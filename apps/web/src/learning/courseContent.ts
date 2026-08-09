export interface CourseVideo {
  fileName: string;
  duration: number;
  src: string;
}

export type LessonStatus = "done" | "active" | "todo";
export type Lesson = [number, string, string, LessonStatus];

export interface CourseSection {
  id: number;
  title: string;
  progress: string;
  lessons: Lesson[];
}

export const formatMediaTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours)
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const configuredCourseMediaBaseUrl =
  import.meta.env.VITE_COURSE_MEDIA_BASE_URL?.trim();

export const courseMediaBaseUrl = (
  configuredCourseMediaBaseUrl || "/course-videos"
).replace(/\/+$/, "");

export function resolveCourseVideoSrc(
  fileName: string,
  baseUrl = courseMediaBaseUrl,
) {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(fileName)}`;
}

const courseVideo = (fileName: string, duration: number): CourseVideo => ({
  fileName,
  duration,
  src: resolveCourseVideoSrc(fileName),
});

export const courseVideos: CourseVideo[] = [
  courseVideo("04 ui design system and storybook.mp4", 2090.61),
  courseVideo("00 welcome to the typescript course.mp4", 103.05),
  courseVideo("03 the idea of veolms.mp4", 699.94),
  courseVideo("02 Frontend Tech and UI Discussions.mp4", 4040.78),
  courseVideo("01 introduction to veolms.mp4", 553.74),
  courseVideo("03 creating velms respository.mp4", 8743),
  courseVideo("02 how to follow this course.mp4", 312.02),
  courseVideo("01 team introduction and product discussion.mp4", 11087.32),
];

export const lessonVideoMap: Record<number, CourseVideo | undefined> = {
  1: courseVideos[4],
  2: courseVideos[1],
  3: courseVideos[7],
  4: courseVideos[0],
  5: courseVideos[5],
  6: courseVideos[2],
  7: courseVideos[6],
  8: courseVideos[3],
  9: courseVideos[0],
  10: courseVideos[2],
};

const lesson = (
  number: number,
  title: string,
  status: LessonStatus,
): Lesson => [
  number,
  title,
  formatMediaTime(lessonVideoMap[number]!.duration),
  status,
];

export const sections: CourseSection[] = [
  {
    id: 1,
    title: "Introduction",
    progress: "5/5",
    lessons: [
      lesson(1, "The Beginning of a Design Journey", "done"),
      lesson(2, "What is UI/UX Design?", "done"),
      lesson(3, "The Design Mindset", "done"),
      lesson(4, "Tools Overview", "done"),
      lesson(5, "Career Opportunities", "done"),
    ],
  },
  {
    id: 2,
    title: "User Research",
    progress: "4/6",
    lessons: [
      lesson(6, "Understanding Your Users", "done"),
      lesson(7, "Research Methods", "done"),
      lesson(8, "Empathy Mapping", "done"),
      lesson(9, "Designing for Real Users", "active"),
      lesson(10, "Usability Testing", "todo"),
    ],
  },
  { id: 3, title: "Information Architecture", progress: "0/6", lessons: [] },
  { id: 4, title: "Wireframing", progress: "0/7", lessons: [] },
  { id: 5, title: "Visual Design", progress: "0/8", lessons: [] },
  { id: 6, title: "Prototyping", progress: "0/5", lessons: [] },
  { id: 7, title: "Handoff & Beyond", progress: "0/5", lessons: [] },
];

export const lessonsById = new Map<number, Lesson>(
  sections.flatMap((section) =>
    section.lessons.map((item): [number, Lesson] => [item[0], item]),
  ),
);
export const lessonSequence = [...lessonsById.keys()];
