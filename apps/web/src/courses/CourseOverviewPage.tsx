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

const PRICE = "₹1,999";
const ORIGINAL_PRICE = "₹2,999";
const DISCOUNT = "33% OFF";

interface CourseInclude {
  icon: typeof BookOpen;
  label: string;
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

// ─── main page ───────────────────────────────────────────────────────────────

export interface CourseOverviewPageProps {
  courseSlug: string | undefined;
  onNavigateCourses: () => void;
  onNavigatePage: NavigateTo;
}

export function CourseOverviewPage({
  courseSlug,
  onNavigateCourses,
  onNavigatePage,
}: CourseOverviewPageProps) {
  const course = courses.find((c) => c.id === courseSlug) ?? courses[0]!;
  const title = getCourseTitle(courseSlug);
  const thumbnail = getCourseThumbnail(courseSlug);
  const courseSections = getCourseSections(courseSlug);
  const includes = buildIncludes(course);

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
      <div className="cov-layout">
        {/* ── Left / main column ─────────────────────────────────────── */}
        <div className="cov-content">
          {/* Header Top Bar: Back button + Eyebrow badge */}
          <div className="cov-header-top">
            <button
              type="button"
              className="cov-back"
              aria-label="Back to courses"
              onClick={onNavigateCourses}
            >
              <ArrowLeft size={16} weight="bold" />
            </button>
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
                Anurag Singh
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

          {/* About Card */}
          <section
            className="cov-card cov-about-card"
            aria-labelledby="cov-about-heading"
          >
            <h2 id="cov-about-heading" className="cov-card__heading">
              About this course
            </h2>
            <div className="cov-about__body">
              <p>{aboutLead}</p>
              <p>{aboutBody}</p>
              {showMore && <p>{aboutExtra}</p>}
            </div>
            <button
              type="button"
              className="cov-see-more"
              aria-expanded={showMore}
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? "See less..." : "See more..."}{" "}
              <CaretDown
                size={14}
                weight="bold"
                className={`cov-see-more__icon${showMore ? " is-open" : ""}`}
                aria-hidden="true"
              />
            </button>
          </section>

          {/* Curriculum Section */}
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
                    onToggle={() => toggleSection(index)}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Right column (Cohesive Purchase Card + Includes Card) ── */}
        <div className="cov-right-column">
          {/* Card 1: Purchase Card (Preview + Pricing + Coupon + CTA + Wishlist) */}
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
                onClick={() =>
                  onNavigatePage(`/courses/${encodeURIComponent(course.id)}`)
                }
              >
                <span className="cov-panel__play-circle" aria-hidden="true">
                  <Play size={22} weight="fill" />
                </span>
              </button>
              <span className="cov-panel__timestamp" aria-hidden="true">
                <Play size={11} weight="fill" /> 02:15
              </span>
            </div>

            {/* Pricing */}
            <div className="cov-panel__pricing">
              <span className="cov-panel__price">{PRICE}</span>
              <span className="cov-panel__original">{ORIGINAL_PRICE}</span>
              <span className="cov-panel__discount">{DISCOUNT}</span>
            </div>

            {/* Coupon */}
            <button type="button" className="cov-panel__coupon">
              <Ticket
                size={22}
                className="cov-panel__ticket-icon"
                aria-hidden="true"
              />
              <span>
                <strong>Apply coupon</strong>
                <small>Get additional discount</small>
              </span>
              <CaretRight
                size={16}
                className="cov-panel__coupon-caret"
                aria-hidden="true"
              />
            </button>

            {/* CTA Buy Button */}
            <button
              type="button"
              className="cov-panel__buy"
              onClick={() =>
                onNavigatePage(`/courses/${encodeURIComponent(course.id)}`)
              }
            >
              <ShoppingBag size={18} weight="bold" aria-hidden="true" />
              {course.enrolled ? "Continue Learning" : "Buy Now"}
            </button>

            {/* Wishlist Button */}
            <button
              type="button"
              className={`cov-panel__wishlist${wishlisted ? " is-wishlisted" : ""}`}
              aria-pressed={wishlisted}
              onClick={toggleWishlist}
            >
              <BookmarkSimple
                size={17}
                weight={wishlisted ? "fill" : "regular"}
                aria-hidden="true"
              />
              {wishlisted ? "Wishlisted" : "Add to Wishlist"}
            </button>
          </aside>

          {/* Card 2: Includes Card */}
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
        </div>
      </div>
    </div>
  );
}
