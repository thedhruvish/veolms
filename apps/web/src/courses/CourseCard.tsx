import {
  Clock,
  DotsThree,
  Heart,
  List,
  Sparkle,
  Users,
  VideoCamera,
} from "@phosphor-icons/react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { Course, CourseRole } from "./catalogue";

function formatStudents(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export interface CourseCardProps {
  course: Course;
  role: CourseRole;
  wishlisted: boolean;
  onWishlist: (courseId: string) => void;
  onOpen: (course: Course) => void;
  onExplore: (course: Course) => void;
  menuOpen: boolean;
  setMenuOpen: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
}

export function CourseCard({
  course,
  role,
  wishlisted,
  onWishlist,
  onOpen,
  onExplore,
  menuOpen,
  setMenuOpen,
  setNotice,
}: CourseCardProps) {
  const interactive =
    role === "creator" || (role === "student" && course.enrolled);

  const openCard = () => {
    if (role === "creator" || course.enrolled) onOpen(course);
    else if (role === "student") onExplore(course);
  };

  return (
    <article
      className={`course-card ${interactive ? "course-card--interactive" : ""}`}
      onClick={openCard}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (
          (event.key === "Enter" || event.key === " ") &&
          event.target === event.currentTarget
        ) {
          event.preventDefault();
          openCard();
        }
      }}
      tabIndex={interactive ? 0 : -1}
      aria-label={`${course.title}${role === "creator" ? ", preview course" : course.enrolled ? `, ${course.progress}% complete` : ", not enrolled"}`}
    >
      <div className="course-card__media">
        <img src={course.thumbnail} alt="" className="course-card__image" />
        <span className="course-level">{course.level}</span>
        <button
          type="button"
          className={`course-wishlist ${wishlisted ? "course-wishlist--active" : ""}`}
          aria-label={
            wishlisted
              ? `Remove ${course.title} from wishlist`
              : `Add ${course.title} to wishlist`
          }
          aria-pressed={wishlisted}
          title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onWishlist(course.id);
          }}
        >
          <Heart size={24} weight={wishlisted ? "fill" : "regular"} />
        </button>
      </div>

      <div className="course-card__body">
        <h2>{course.title}</h2>
        <p>{course.description}</p>

        <div className="course-card__facts">
          <span>
            <List size={17} /> {course.sections} Sections
          </span>
          <i aria-hidden="true" />
          <span>
            <VideoCamera size={17} /> {course.lectures} Lectures
          </span>

          {role === "creator" && (
            <div className="course-more-wrap" data-course-menu>
              <button
                type="button"
                className="course-more-button"
                aria-label={`Actions for ${course.title}`}
                aria-expanded={menuOpen}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  setMenuOpen(menuOpen ? null : course.id);
                }}
              >
                <DotsThree size={22} weight="bold" />
              </button>
              {menuOpen && (
                <div
                  className="course-action-menu"
                  role="menu"
                  onClick={(event: MouseEvent<HTMLDivElement>) =>
                    event.stopPropagation()
                  }
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(null);
                      setNotice(
                        `Edit ${course.title} selected. The editor will be added later.`,
                      );
                    }}
                  >
                    <Sparkle size={17} /> Edit course
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {role === "student" ? (
          course.enrolled ? (
            <div
              className="course-progress"
              aria-label={`${course.progress}% complete`}
            >
              <span className="course-progress__track">
                <span style={{ width: `${course.progress}%` }} />
              </span>
              <strong>{course.progress}%</strong>
              <span>Complete</span>
            </div>
          ) : (
            <button
              type="button"
              className="course-explore"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onExplore(course);
              }}
            >
              Explore Course
            </button>
          )
        ) : (
          <div
            className="creator-metrics"
            aria-label={`${course.duration}, ${course.students} students enrolled`}
          >
            <span>
              <Clock size={17} /> {course.duration}
            </span>
            <span>
              <Users size={17} /> {formatStudents(course.students)} students
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
