import { useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  CaretDown,
  CheckCircle,
  Circle,
  Clock,
  FileText,
  Heart,
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
  ];
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface CurriculumSectionProps {
  section: CourseSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

function CurriculumSectionItem({
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
    <div className={`cov-section-card${isOpen ? " is-open" : ""}`} role="listitem">
      <button
        type="button"
        className="cov-section__toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span className="cov-section__num-badge" aria-hidden="true">
          {index + 1}
        </span>
        <span className="cov-section__title">{section.title}</span>
        <span className="cov-section__meta">
          {lectureCount} Lectures &bull; {durationLabel}
        </span>
        <span className="cov-section__caret" aria-hidden="true">
          <CaretDown size={16} weight="bold" />
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
                            ? "05:02"
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

// ─── Header & Hero Section ──────────────────────────────────────────────────

interface CourseHeroSectionProps {
  course: Course;
  title: string;
  thumbnail: string;
  wishlisted: boolean;
  pricing?: CourseOverviewPricingProps;
  inclusions?: string[];
  onNavigateCourses?: () => void;
  onToggleWishlist?: (event: MouseEvent<HTMLButtonElement>) => void;
  onNavigatePage?: NavigateTo;
  isReadOnlyPreview?: boolean;
}

function CourseHeroSection({
  course,
  title,
  thumbnail,
  wishlisted,
  pricing,
  inclusions,
  onNavigateCourses,
  onToggleWishlist,
  onNavigatePage,
  isReadOnlyPreview,
}: CourseHeroSectionProps) {
  const handlePreviewClick = () => {
    if (!isReadOnlyPreview && onNavigatePage) {
      onNavigatePage(`/courses/${encodeURIComponent(course.id)}`);
    }
  };

  const price = pricing?.price ?? DEFAULT_PRICE;
  const originalPrice =
    pricing?.originalPrice ??
    (pricing?.price ? undefined : DEFAULT_ORIGINAL_PRICE);
  const discount =
    pricing?.discount ?? (pricing?.price ? undefined : DEFAULT_DISCOUNT);

  const defaultPerks = [
    "Full lifetime access",
    "Certificate of completion",
    "Access on all devices",
  ];
  const perksList = inclusions !== undefined ? inclusions : defaultPerks;

  return (
    <div className="cov-hero-container">
      {/* Two-column Hero: Course Info & Pricing on Left, Trailer on Right */}
      <div className="cov-hero-split">
        <div className="cov-hero-split__left">
          {/* Header Info: Back Button, Badge, Title, Metadata */}
          <div className="cov-hero-left__header">
            {/* Top Row: Back Button + Level Badge */}
            <div className="cov-hero-left__top">
              {onNavigateCourses && (
                <button
                  type="button"
                  className="cov-back-icon-btn"
                  aria-label="Back to courses"
                  onClick={onNavigateCourses}
                  title="Back to courses"
                >
                  <ArrowLeft size={18} weight="bold" />
                </button>
              )}

              <span
                className="cov-level-badge"
                aria-label={`Level: ${course.level}`}
              >
                {course.level.toUpperCase()}
              </span>
            </div>

            {/* Title */}
            <h1 className="cov-title">{title}</h1>

            {/* Meta row */}
            <div className="cov-meta">
              <span className="cov-meta__item cov-meta__instructor">
                <User size={17} weight="bold" aria-hidden="true" />
                <span>Instructor</span>
              </span>
              <span className="cov-meta__dot" aria-hidden="true">
                •
              </span>
              <span className="cov-meta__item">
                <Stack size={17} aria-hidden="true" />
                <span>{course.sections} Sections</span>
              </span>
              <span className="cov-meta__dot" aria-hidden="true">
                •
              </span>
              <span className="cov-meta__item">
                <BookOpen size={17} aria-hidden="true" />
                <span>{course.lectures} Lectures</span>
              </span>
              <span className="cov-meta__dot" aria-hidden="true">
                •
              </span>
              <span className="cov-meta__item">
                <Clock size={17} aria-hidden="true" />
                <span>{course.duration}</span>
              </span>
            </div>
          </div>

          {/* Full-width Rich Pricing Section in Left Column */}
          <div
            className={`cov-hero-pricing${perksList.length > 0 ? " has-perks" : " no-perks"}`}
            aria-label="Course pricing and enrollment"
          >
            {/* Top Row: Prominent Price + Original Price + Discount (Left) and Favourite Button (Top Right) */}
            <div className="cov-hero-pricing__price-row">
              <div className="cov-hero-pricing__price-left">
                <span className="cov-hero-pricing__current">{price}</span>
                {originalPrice && (
                  <span className="cov-hero-pricing__original">{originalPrice}</span>
                )}
                {discount && (
                  <span className="cov-hero-pricing__discount">{discount}</span>
                )}
              </div>

              <button
                type="button"
                className={`cov-hero-pricing__wishlist-btn${wishlisted ? " is-wishlisted" : ""}`}
                aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                aria-pressed={wishlisted}
                disabled={isReadOnlyPreview}
                onClick={onToggleWishlist}
                title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
              >
                <Heart
                  size={20}
                  weight={wishlisted ? "fill" : "regular"}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* Middle Row: Actions (Apply Coupon + Buy Now) */}
            <div className="cov-hero-pricing__actions-row">
              <button
                type="button"
                className="cov-hero-pricing__coupon-btn"
                disabled={isReadOnlyPreview}
              >
                <Ticket size={18} aria-hidden="true" />
                <span>Apply coupon</span>
              </button>

              <button
                type="button"
                className="cov-hero-pricing__buy-btn"
                disabled={isReadOnlyPreview}
                onClick={() => {
                  if (!isReadOnlyPreview && onNavigatePage) {
                    onNavigatePage(`/courses/${encodeURIComponent(course.id)}`);
                  }
                }}
              >
                <ShoppingBag size={19} weight="bold" aria-hidden="true" />
                <span>
                  {price.toLowerCase() === "free"
                    ? "Enroll for Free"
                    : course.enrolled
                      ? "Continue Learning"
                      : "Buy Now"}
                </span>
              </button>
            </div>

            {/* Bottom Row: Additional Inclusions / Value Perks */}
            {perksList.length > 0 && (
              <div className="cov-hero-pricing__perks">
                {perksList.map((perk, idx) => (
                  <span key={idx} className="cov-hero-pricing__perk">
                    <CheckCircle size={16} weight="fill" className="cov-perk-icon" />
                    <span>{perk}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 16:9 Course Trailer */}
        <div className="cov-hero-split__right">
          <div className="cov-preview-hero" aria-label="Course preview player">
            <div className="cov-preview-hero__media">
              <img
                src={thumbnail}
                alt={`Preview thumbnail for ${title}`}
                className="cov-preview-hero__img"
              />
              <div className="cov-preview-hero__overlay" />

              {/* Center Play Button */}
              <button
                type="button"
                className="cov-preview-hero__play-btn"
                aria-label={`Play preview for ${title}`}
                onClick={handlePreviewClick}
                disabled={isReadOnlyPreview}
              >
                <span
                  className="cov-preview-hero__play-circle"
                  aria-hidden="true"
                >
                  <Play size={22} weight="fill" />
                </span>
              </button>

              {/* Bottom Left Pill Button */}
              <button
                type="button"
                className="cov-preview-hero__pill-btn"
                onClick={handlePreviewClick}
                disabled={isReadOnlyPreview}
                aria-label="View trailer"
              >
                <Play size={13} weight="fill" aria-hidden="true" />
                <span>View trailer</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <section className="cov-about-card" aria-labelledby="cov-about-heading">
      <h2 id="cov-about-heading" className="cov-section-heading">
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
          className="cov-see-more-btn"
          aria-expanded={showMore}
          onClick={onToggleShowMore}
        >
          <span>{showMore ? "See less" : "See more"}</span>
          <CaretDown
            size={14}
            weight="bold"
            className={`cov-see-more-btn__icon${showMore ? " is-open" : ""}`}
            aria-hidden="true"
          />
        </button>
      )}
    </section>
  );
}

// ─── Curriculum Section List sub-component ───────────────────────────────────

interface CourseCurriculumCardProps {
  course: Course;
  courseSections: CourseSection[];
  openSections: Set<number>;
  onToggleSection: (index: number) => void;
}

function CourseCurriculumCard({
  course,
  courseSections,
  openSections,
  onToggleSection,
}: CourseCurriculumCardProps) {
  return (
    <section className="cov-curriculum-card" aria-labelledby="cov-curriculum-heading">
      <div className="cov-curriculum__header">
        <div className="cov-curriculum__header-left">
          <h2 id="cov-curriculum-heading" className="cov-section-heading">
            Course curriculum
          </h2>
          <p className="cov-curriculum__subtitle">
            {course.sections} Sections &bull; {course.lectures} Lectures
          </p>
        </div>
      </div>

      <div className="cov-curriculum__sections-list" role="list">
        {courseSections.map((section, index) => (
          <CurriculumSectionItem
            key={section.id}
            section={section}
            index={index}
            isOpen={openSections.has(index)}
            onToggle={() => onToggleSection(index)}
          />
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
  customInclusions?: string[];
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
  customInclusions,
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
  const inclusions: string[] | undefined =
    customInclusions !== undefined
      ? Array.from(
          new Set(customInclusions.map((s) => s.trim()).filter(Boolean)),
        )
      : customIncludes !== undefined
        ? Array.from(
            new Set(
              customIncludes
                .map((inc) => inc.label.trim())
                .filter(
                  (label) =>
                    !/^\d+\s+(sections|lectures)/i.test(label) &&
                    !/on-demand content/i.test(label),
                ),
            ),
          )
        : undefined;

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
      <div className="cov-scroll-container">
        <div className="cov-content-inner">
          {/* 1. Two-Column Hero Section with Info & Pricing on Left, Trailer on Right */}
          <CourseHeroSection
            course={course}
            title={title}
            thumbnail={thumbnail}
            wishlisted={wishlisted}
            pricing={customPricing}
            inclusions={inclusions}
            onNavigateCourses={onNavigateCourses}
            onToggleWishlist={toggleWishlist}
            onNavigatePage={onNavigatePage}
            isReadOnlyPreview={isReadOnlyPreview}
          />

          {/* 2. About This Course */}
          <CourseAboutCard
            description={customDescription}
            aboutLead={aboutLead}
            aboutBody={aboutBody}
            aboutExtra={aboutExtra}
            showMore={showMore}
            onToggleShowMore={() => setShowMore((v) => !v)}
          />

          {/* 3. Course Curriculum */}
          <CourseCurriculumCard
            course={course}
            courseSections={courseSections}
            openSections={openSections}
            onToggleSection={toggleSection}
          />
        </div>
      </div>
    </div>
  );
}


