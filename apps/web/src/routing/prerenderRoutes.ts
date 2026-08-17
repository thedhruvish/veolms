const courseRouteSlugs = [
  "ui-ux-design-mastery",
  "backend-nodejs",
  "typescript-course",
  "javascript-course",
  "figma-ui-essentials",
  "mongodb-database-design",
  "aws-cloud-practitioner",
] as const;

const sourceLessonTitles = [
  "the-beginning-of-a-design-journey",
  "what-is-ui-ux-design",
  "the-design-mindset",
  "tools-overview",
  "career-opportunities",
  "understanding-your-users",
  "research-methods",
  "empathy-mapping",
  "designing-for-real-users",
  "usability-testing",
] as const;

const repeatedSectionLessonCounts = [6, 7, 8, 5, 5] as const;

const lessonRouteSlugs = [
  ...sourceLessonTitles,
  ...repeatedSectionLessonCounts.flatMap((count, sectionIndex) => {
    const firstLessonId =
      sourceLessonTitles.length +
      repeatedSectionLessonCounts
        .slice(0, sectionIndex)
        .reduce((total, sectionCount) => total + sectionCount, 0) +
      1;

    return sourceLessonTitles
      .slice(0, count)
      .map((slug, lessonIndex) => `${slug}-${firstLessonId + lessonIndex}`);
  }),
] as const;

/**
 * React Router cannot infer parameter values for a static build. Keep the
 * catalog's real lesson URLs here so cold visits receive the same complete HTML
 * as static pages instead of briefly rendering the empty SPA fallback.
 */
export const dynamicPrerenderPaths = courseRouteSlugs.flatMap((courseSlug) => [
  `/explore-courses/${courseSlug}/overview`,
  `/learn/${courseSlug}`,
  ...lessonRouteSlugs.map(
    (lessonSlug) => `/learn/${courseSlug}/${lessonSlug}`,
  ),
]);
