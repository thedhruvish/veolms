import { useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  BookmarkSimple,
  CaretDown,
  CaretRight,
  Certificate,
  CheckCircle,
  Circle,
  Clock,
  FileText,
  Play,
  PlayCircle,
  ShoppingBag,
  Stack,
  Ticket,
  User,
} from "@phosphor-icons/react";
import { courses } from "./catalogue";
import type { Course } from "./catalogue";
import { sections } from "../learning/courseContent";
import type { CourseSection } from "../learning/courseContent";
import { getCourseTitle, getCourseThumbnail } from "../learning/courseMetadata";
import type { NavigateTo } from "../routing/navigation";
import { RenderMarkdown } from "./RichTextEditor";

// ─── per-course curriculum adapter ──────────────────────────────────────────

function buildFallbackSections(course: Course): CourseSection[] {
  return Array.from({ length: course.sections }, (_, i) => ({
    id: i + 1,
    title: getSectionTitle(course, i),
    progress: "0/0",
    lessons: [],
  }));
}

function getSectionTitle(course: Course, index: number): string {
  const generic = [
    "Introduction",
    "Getting Started",
    "Core Concepts",
    "Practical Application",
    "Advanced Topics",
    "Real-World Projects",
    "Best Practices",
    "Testing & Debugging",
    "Deployment",
    "Performance Optimization",
    "Security Considerations",
    "Scaling & Architecture",
  ];
  const words = course.title.split(/\s+/).filter((w) => w.length > 3);
  const topic = words[0] ?? course.category;
  const domainSections: Record<string, string[]> = {
    Development: [
      "Introduction",
      `${topic} Fundamentals`,
      "Environment Setup",
      "Core APIs",
      "Building REST APIs",
      "Database Integration",
      "Authentication & Security",
      "Testing Strategies",
      "Error Handling",
      "Deployment & CI/CD",
      "Performance Tuning",
      "Capstone Project",
    ],
    Design: [
      "Introduction",
      "Design Thinking",
      "Research & Discovery",
      "Wireframing",
      "Visual Hierarchy",
      "Typography & Color",
      "Prototyping",
      "Usability Testing",
      "Handoff Workflow",
      "Portfolio Projects",
    ],
    Database: [
      "Introduction",
      "Data Modeling",
      "Query Language",
      "Indexing & Performance",
      "Transactions",
      "Schema Design",
      "Replication",
      "Backup & Recovery",
      "Security",
      "Real-World Projects",
    ],
    Cloud: [
      "Introduction",
      "Core Services",
      "Compute & Networking",
      "Storage Solutions",
      "Identity & Access",
      "Monitoring & Logging",
      "Serverless",
      "Cost Optimization",
      "Security",
      "Certification Prep",
    ],
  };
  const domain = domainSections[course.category] ?? generic;
  return domain[index] ?? generic[index] ?? `Section ${index + 1}`;
}

function getCourseSections(courseSlug: string | undefined): CourseSection[] {
  if (!courseSlug || courseSlug === "ui-ux-design-mastery") return sections;
  const course = courses.find((c) => c.id === courseSlug);
  if (!course) return sections;
  return buildFallbackSections(course);
}

// ─── static per-overview pricing / includes data ────────────────────────────

const DEFAULT_PRICE = "₹1,999";
const DEFAULT_ORIGINAL_PRICE = "₹2,999";
const DEFAULT_DISCOUNT = "33% OFF";

export interface CourseInclude {
  icon: typeof BookOpen;
  label: string;
}

export interface CourseOverviewPricingProps {
  price?: string;
  originalPrice?: string;
  discount?: string;
}

function buildIncludes(course: Course): CourseInclude[] {
  return [
    { icon: Stack, label: `${course.sections} Sections` },
    { icon: BookOpen, label: `${course.lectures} Lectures` },
    { icon: Clock, label: `${course.duration} On-demand content` },
    { icon: Certificate, label: "Certificate of completion" },
  ];
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface CurriculumSectionProps {
  section: CourseSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

function CurriculumSection({
  section,
  index,
  isOpen,
  onToggle,
}: CurriculumSectionProps) {
  const lectureCount = section.lessons.length || Math.max(3, 5 - (index % 3));
  const minutes = 20 + index * 7 + (index % 4) * 5;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const durationLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className={`cov-section-card${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="cov-section__toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span
          className={`cov-section__icon-circle${isOpen ? " is-open" : ""}`}
          aria-hidden="true"
        >
          <CaretRight size={14} weight="bold" />
        </span>
        <span className="cov-section__title">
          {index + 1}. {section.title}
        </span>
        <span className="cov-section__meta">
          {lectureCount} Lectures &bull; {durationLabel}
        </span>
        <span className="cov-section__caret-end" aria-hidden="true">
          <CaretDown size={15} />
        </span>
      </button>

      <div
        className={`cov-section__lessons${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
      >
        <div className="cov-section__lessons-inner">
          {section.lessons.length > 0
            ? section.lessons.map(([number, title, duration, status]) => {
                const isDoc =
                  title.toLowerCase().includes("discord") ||
                  title.toLowerCase().includes("app") ||
                  title.toLowerCase().includes("community") ||
                  title.toLowerCase().includes("download");
                return (
                  <div className="cov-lesson" key={number}>
                    <span className="cov-lesson__type-icon" aria-hidden="true">
                      {isDoc ? (
                        <FileText size={16} weight="regular" />
                      ) : (
                        <PlayCircle size={16} weight="regular" />
                      )}
                    </span>
                    <span className="cov-lesson__title">{title}</span>
                    <span className="cov-lesson__duration">{duration}</span>
                    <span
                      className="cov-lesson__status-icon"
                      aria-hidden="true"
                    >
                      {status === "done" ? (
                        <CheckCircle
                          size={16}
                          weight="fill"
                          className="is-check"
                        />
                      ) : (
                        <Circle size={16} className="is-circle" />
                      )}
                    </span>
                  </div>
                );
              })
            : Array.from({ length: lectureCount }, (_, i) => {
                const isDoc = i === 1 || i === 2;
                const isDone = i === 0 || i === 3;
                return (
                  <div className="cov-lesson" key={i}>
                    <span className="cov-lesson__type-icon" aria-hidden="true">
                      {isDoc ? (
                        <FileText size={16} weight="regular" />
                      ) : (
                        <PlayCircle size={16} weight="regular" />
                      )}
                    </span>
                    <span className="cov-lesson__title">
                      {i === 0
                        ? "Welcome to the course and setup your environment"
                        : i === 1
                          ? "Join Premium Discord Community"
                          : i === 2
                            ? "Download ProCodrr's Mobile App"
                            : i === 3
                              ? "Prerequisites"
                              : `Lesson ${i + 1}`}
                    </span>
                    <span className="cov-lesson__duration">
                      {isDoc
                        ? "--:--"
                        : i === 0
                          ? "05:24"
                          : i === 3
                            ? "05:03"
                            : "04:35"}
                    </span>
                    <span
                      className="cov-lesson__status-icon"
                      aria-hidden="true"
                    >
                      {isDone ? (
                        <CheckCircle
                          size={16}
                          weight="fill"
                          className="is-check"
                        />
                      ) : (
                        <Circle size={16} className="is-circle" />
                      )}
                    </span>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}

// ─── Header sub-component ───────────────────────────────────────────────────

interface CourseHeaderSectionProps {
  course: Course;
  title: string;
  onNavigateCourses?: () => void;
  isReadOnlyPreview?: boolean;
}

function CourseHeaderSection({
  course,
  title,
  onNavigateCourses,
  isReadOnlyPreview,
}: CourseHeaderSectionProps) {
  return (
    <>
      {/* Header Top Bar: Back button + Eyebrow badge */}
      <div className="cov-header-top">
        {onNavigateCourses && (
          <button
            type="button"
            className="cov-back"
            aria-label="Back to courses"
            onClick={onNavigateCourses}
          >
            <ArrowLeft size={16} weight="bold" />
          </button>
        )}
        <span className="cov-badge" aria-label={`Level: ${course.level}`}>
          {course.level.toUpperCase()}
        </span>
      </div>

      {/* Hero Header */}
      <header className="cov-hero">
        <h1 className="cov-hero__title">{title}</h1>
        <div className="cov-hero__meta">
          <span>
            <User size={15} weight="bold" aria-hidden="true" />
            Instructor
          </span>
          <span className="cov-hero__dot" aria-hidden="true">
            •
          </span>
          <span>
            <Stack size={15} aria-hidden="true" />
            {course.sections} Sections
          </span>
          <span className="cov-hero__dot" aria-hidden="true">
            •
          </span>
          <span>
            <BookOpen size={15} aria-hidden="true" />
            {course.lectures} Lectures
          </span>
          <span className="cov-hero__dot" aria-hidden="true">
            •
          </span>
          <span>
            <Clock size={15} aria-hidden="true" />
            {course.duration}
          </span>
        </div>
      </header>
    </>
  );
}

// ─── Purchase Card sub-component ─────────────────────────────────────────────

interface CoursePurchaseCardProps {
  course: Course;
  title: string;
  thumbnail: string;
  wishlisted: boolean;
  onToggleWishlist?: (event: MouseEvent<HTMLButtonElement>) => void;
  onNavigatePage?: NavigateTo;
  pricing?: CourseOverviewPricingProps;
  isReadOnlyPreview?: boolean;
}

function CoursePurchaseCard({
  course,
  title,
  thumbnail,
  wishlisted,
  onToggleWishlist,
  onNavigatePage,
  pricing,
  isReadOnlyPreview,
}: CoursePurchaseCardProps) {
  const price = pricing?.price ?? DEFAULT_PRICE;
  const originalPrice = pricing?.originalPrice ?? (pricing?.price ? undefined : DEFAULT_ORIGINAL_PRICE);
  const discount = pricing?.discount ?? (pricing?.price ? undefined : DEFAULT_DISCOUNT);

  return (
    <aside
      className="cov-card cov-purchase-card"
      aria-label="Course purchase information"
    >
      {/* Preview thumbnail */}
      <div className="cov-panel__preview">
        <img
          src={thumbnail}
          alt={`Preview thumbnail for ${title}`}
          className="cov-panel__thumb"
        />
        <button
          type="button"
          className="cov-panel__play"
          aria-label={`Play preview for ${title}`}
          onClick={() => {
            if (!isReadOnlyPreview && onNavigatePage) {
              onNavigatePage(`/courses/${encodeURIComponent(course.id)}`);
            }
          }}
        >
          <span className="cov-panel__play-circle" aria-hidden="true">
            <Play size={22} weight="fill" />
          </span>
        </button>
        <span className="cov-panel__timestamp" aria-hidden="true">
          <Play size={11} weight="fill" /> 02:15
        </span>
      </div>

      {/* Inner Details Container Box */}
      <div className="cov-panel__details">
        {/* Pricing */}
        <div className="cov-panel__pricing">
          <span className="cov-panel__price">{price}</span>
          {originalPrice && (
            <span className="cov-panel__original">{originalPrice}</span>
          )}
          {discount && (
            <span className="cov-panel__discount">{discount}</span>
          )}
        </div>

        {/* Coupon */}
        <button type="button" className="cov-panel__coupon" disabled={isReadOnlyPreview}>
          <Ticket
            size={20}
            className="cov-panel__ticket-icon"
            aria-hidden="true"
          />
          <span>
            <strong>Apply coupon</strong>
            <small>Get additional discount</small>
          </span>
          <CaretRight
            size={15}
            className="cov-panel__coupon-caret"
            aria-hidden="true"
          />
        </button>

        {/* CTA Buy Button */}
        <button
          type="button"
          className="cov-panel__buy"
          disabled={isReadOnlyPreview}
          onClick={() => {
            if (!isReadOnlyPreview && onNavigatePage) {
              onNavigatePage(`/courses/${encodeURIComponent(course.id)}`);
            }
          }}
        >
          <ShoppingBag size={18} weight="bold" aria-hidden="true" />
          {price.toLowerCase() === "free" ? "Enroll for Free" : course.enrolled ? "Continue Learning" : "Buy Now"}
        </button>

        {/* Wishlist Button */}
        <button
          type="button"
          className={`cov-panel__wishlist${wishlisted ? " is-wishlisted" : ""}`}
          aria-pressed={wishlisted}
          disabled={isReadOnlyPreview}
          onClick={onToggleWishlist}
        >
          <BookmarkSimple
            size={17}
            weight={wishlisted ? "fill" : "regular"}
            aria-hidden="true"
          />
          {wishlisted ? "Wishlisted" : "Add to Wishlist"}
        </button>
      </div>
    </aside>
  );
}

// ─── About Card sub-component ────────────────────────────────────────────────

interface CourseAboutCardProps {
  description?: string;
  aboutLead?: string;
  aboutBody?: string;
  aboutExtra?: string;
  showMore: boolean;
  onToggleShowMore: () => void;
}

function CourseAboutCard({
  description,
  aboutLead,
  aboutBody,
  aboutExtra,
  showMore,
  onToggleShowMore,
}: CourseAboutCardProps) {
  return (
    <section
      className="cov-card cov-about-card"
      aria-labelledby="cov-about-heading"
    >
      <h2 id="cov-about-heading" className="cov-card__heading">
        About this course
      </h2>
      <div className="cov-about__body">
        {description ? (
          <div className="course-preview-markdown-content">
            <RenderMarkdown content={description} />
          </div>
        ) : (
          <>
            {aboutLead && <p>{aboutLead}</p>}
            {aboutBody && <p>{aboutBody}</p>}
            {showMore && aboutExtra && <p>{aboutExtra}</p>}
          </>
        )}
      </div>
      {!description && (
        <button
          type="button"
          className="cov-see-more"
          aria-expanded={showMore}
          onClick={onToggleShowMore}
        >
          {showMore ? "See less..." : "See more..."}{" "}
          <CaretDown
            size={14}
            weight="bold"
            className={`cov-see-more__icon${showMore ? " is-open" : ""}`}
            aria-hidden="true"
          />
        </button>
      )}
    </section>
  );
}

// ─── Includes Card sub-component ─────────────────────────────────────────────

interface CourseIncludesCardProps {
  includes: CourseInclude[];
}

function CourseIncludesCard({ includes }: CourseIncludesCardProps) {
  return (
    <aside
      className="cov-card cov-includes-card"
      aria-label="Course details list"
    >
      <h3 className="cov-includes__heading">This course includes</h3>
      <ul className="cov-includes__list">
        {includes.map(({ icon: Icon, label }) => (
          <li key={label}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ─── Curriculum Section List sub-component ───────────────────────────────────

interface CourseCurriculumSectionListProps {
  course: Course;
  courseSections: CourseSection[];
  openSections: Set<number>;
  onToggleSection: (index: number) => void;
}

function CourseCurriculumSectionList({
  course,
  courseSections,
  openSections,
  onToggleSection,
}: CourseCurriculumSectionListProps) {
  return (
    <section
      className="cov-curriculum-section"
      aria-labelledby="cov-curriculum-heading"
    >
      <div className="cov-curriculum__header">
        <h2 id="cov-curriculum-heading" className="cov-curriculum__title">
          Course curriculum
        </h2>
        <p className="cov-curriculum__subtitle">
          {course.sections} Sections &bull; {course.lectures} Lectures
        </p>
      </div>

      <div className="cov-sections-list" role="list">
        {courseSections.map((section, index) => (
          <div role="listitem" key={section.id}>
            <CurriculumSection
              section={section}
              index={index}
              isOpen={openSections.has(index)}
              onToggle={() => onToggleSection(index)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export interface CourseOverviewPageProps {
  courseSlug?: string | undefined;
  onNavigateCourses?: () => void;
  onNavigatePage?: NavigateTo;
  // Custom overview data override for Course Wizard Preview
  customCourse?: Course;
  customDescription?: string;
  customSections?: CourseSection[];
  customIncludes?: CourseInclude[];
  customPricing?: CourseOverviewPricingProps;
  isReadOnlyPreview?: boolean;
}

export function CourseOverviewPage({
  courseSlug,
  onNavigateCourses,
  onNavigatePage,
  customCourse,
  customDescription,
  customSections,
  customIncludes,
  customPricing,
  isReadOnlyPreview = false,
}: CourseOverviewPageProps) {
  const course =
    customCourse ??
    courses.find((c) => c.id === courseSlug) ??
    courses[0]!;

  const title = customCourse?.title ?? getCourseTitle(courseSlug);
  const thumbnail = customCourse?.thumbnail ?? getCourseThumbnail(courseSlug);
  const courseSections = customSections ?? getCourseSections(courseSlug);
  const includes = customIncludes ?? buildIncludes(course);

  const [openSections, setOpenSections] = useState<Set<number>>(
    () => new Set([0]),
  );
  const [showMore, setShowMore] = useState(false);
  const [wishlisted, setWishlisted] = useState(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("veolms-wishlist") || "[]",
      );
      return Array.isArray(saved) && saved.includes(course.id);
    } catch {
      return false;
    }
  });

  const toggleSection = (index: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleWishlist = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isReadOnlyPreview) return;
    setWishlisted((prev) => {
      const next = !prev;
      try {
        const saved: unknown = JSON.parse(
          localStorage.getItem("veolms-wishlist") || "[]",
        );
        const list = Array.isArray(saved) ? (saved as string[]) : [];
        const updated = next
          ? [...list, course.id]
          : list.filter((id) => id !== course.id);
        localStorage.setItem("veolms-wishlist", JSON.stringify(updated));
      } catch {
        // best effort
      }
      return next;
    });
  };

  const aboutLead = `This course is designed to take you from the basics of ${course.title} to building complex, scalable ${course.category.toLowerCase()} applications.`;
  const aboutBody = `${course.description} You'll learn core concepts, work with databases, authentication, APIs, and deploy real-world projects. Whether you're a beginner or looking to level up your ${course.category.toLowerCase()} skills, this course provides practical knowledge and hands-on experience to help you build professional-grade applications.`;
  const aboutExtra = `By the end of this course, you will have built complete production-ready projects, learned testing and deployment workflows, and acquired the professional skill set needed for industry roles.`;

  return (
    <div className="cov-page">
      {/* ── Desktop Composition (min-width: 901px) ── */}
      <div className="cov-desktop-flow">
        <div className="cov-layout">
          <div className="cov-content">
            <CourseHeaderSection
              course={course}
              title={title}
              onNavigateCourses={onNavigateCourses}
              isReadOnlyPreview={isReadOnlyPreview}
            />
            <CourseAboutCard
              description={customDescription}
              aboutLead={aboutLead}
              aboutBody={aboutBody}
              aboutExtra={aboutExtra}
              showMore={showMore}
              onToggleShowMore={() => setShowMore((v) => !v)}
            />
            <CourseCurriculumSectionList
              course={course}
              courseSections={courseSections}
              openSections={openSections}
              onToggleSection={toggleSection}
            />
          </div>

          <div className="cov-right-column">
            <CoursePurchaseCard
              course={course}
              title={title}
              thumbnail={thumbnail}
              wishlisted={wishlisted}
              onToggleWishlist={toggleWishlist}
              onNavigatePage={onNavigatePage}
              pricing={customPricing}
              isReadOnlyPreview={isReadOnlyPreview}
            />
            <CourseIncludesCard includes={includes} />
          </div>
        </div>
      </div>

      {/* ── Mobile Composition (max-width: 900px) ── */}
      <div className="cov-mobile-flow">
        <CourseHeaderSection
          course={course}
          title={title}
          onNavigateCourses={onNavigateCourses}
          isReadOnlyPreview={isReadOnlyPreview}
        />
        <CoursePurchaseCard
          course={course}
          title={title}
          thumbnail={thumbnail}
          wishlisted={wishlisted}
          onToggleWishlist={toggleWishlist}
          onNavigatePage={onNavigatePage}
          pricing={customPricing}
          isReadOnlyPreview={isReadOnlyPreview}
        />
        <CourseAboutCard
          description={customDescription}
          aboutLead={aboutLead}
          aboutBody={aboutBody}
          aboutExtra={aboutExtra}
          showMore={showMore}
          onToggleShowMore={() => setShowMore((v) => !v)}
        />
        <CourseIncludesCard includes={includes} />
        <CourseCurriculumSectionList
          course={course}
          courseSections={courseSections}
          openSections={openSections}
          onToggleSection={toggleSection}
        />
      </div>
    </div>
  );
}
