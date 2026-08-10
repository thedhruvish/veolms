import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CourseCard } from "../../src/courses/CourseCard.tsx";
import type { CourseCardProps } from "../../src/courses/CourseCard.tsx";
import { PlaceholderPage } from "../../src/courses/PlaceholderPage.tsx";
import type { Course } from "../../src/courses/catalogue.ts";

const enrolledCourse: Course = {
  id: "typescript-course",
  title: "The Ultimate TypeScript Course",
  description: "Master TypeScript from basics to advanced concepts.",
  category: "Development",
  level: "Intermediate",
  sections: 24,
  lectures: 160,
  progress: 50,
  enrolled: true,
  duration: "28h 10m",
  students: 967,
  thumbnail: "/course.jpg",
};

const nonEnrolledCourse = {
  ...enrolledCourse,
  id: "figma-ui-essentials",
  title: "Figma UI Essentials",
  enrolled: false,
  progress: null,
};

const renderCard = (props: Partial<CourseCardProps> = {}) => {
  const callbacks = {
    onWishlist: vi.fn(),
    onOpen: vi.fn(),
    onExplore: vi.fn(),
    setMenuOpen: vi.fn(),
    setNotice: vi.fn(),
  };
  const view = render(
    <CourseCard
      course={enrolledCourse}
      role="student"
      wishlisted={false}
      menuOpen={false}
      {...callbacks}
      {...props}
    />,
  );

  return { ...callbacks, ...view };
};

describe("CourseCard", () => {
  it("opens an enrolled course from its full-card overlay button", () => {
    const { onOpen } = renderCard();
    const card = screen.getByRole("article");
    const open = screen.getByRole("button", {
      name: "Open The Ultimate TypeScript Course",
    });

    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("tabindex");
    expect(open).toHaveAttribute("type", "button");
    expect(open).toHaveClass("course-card__open");
    open.focus();
    expect(open).toHaveFocus();
    fireEvent.click(open);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(enrolledCourse);
  });

  it("explores a non-enrolled course from its overlay and action", () => {
    const { onExplore, onOpen } = renderCard({ course: nonEnrolledCourse });
    const card = screen.getByRole("article");
    const exploreOverlay = screen.getByRole("button", {
      name: "Explore Figma UI Essentials",
    });

    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("tabindex");
    expect(exploreOverlay).toHaveClass("course-card__open");
    fireEvent.click(exploreOverlay);
    fireEvent.click(screen.getByRole("button", { name: "Explore Course" }));

    expect(onExplore).toHaveBeenCalledTimes(2);
    expect(onExplore).toHaveBeenLastCalledWith(nonEnrolledCourse);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("toggles the wishlist without opening the card", () => {
    const { onWishlist, onOpen } = renderCard();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add The Ultimate TypeScript Course to wishlist",
      }),
    );

    expect(onWishlist).toHaveBeenCalledWith("typescript-course");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps creator course actions and notices within the card menu", () => {
    const { onOpen, setMenuOpen, setNotice, rerender } = renderCard({
      role: "creator",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Actions for The Ultimate TypeScript Course",
      }),
    );
    expect(setMenuOpen).toHaveBeenCalledWith("typescript-course");
    expect(onOpen).not.toHaveBeenCalled();

    rerender(
      <CourseCard
        course={enrolledCourse}
        role="creator"
        wishlisted={false}
        menuOpen
        onWishlist={vi.fn()}
        onOpen={onOpen}
        onExplore={vi.fn()}
        setMenuOpen={setMenuOpen}
        setNotice={setNotice}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit course" }));

    expect(setMenuOpen).toHaveBeenLastCalledWith(null);
    expect(setNotice).toHaveBeenCalledWith(
      "Edit The Ultimate TypeScript Course selected. The editor will be added later.",
    );
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("PlaceholderPage", () => {
  it("renders known content with the role-specific eyebrow", () => {
    render(<PlaceholderPage section="Students" role="creator" />);

    expect(screen.getByRole("heading", { name: "Students" })).toBeVisible();
    expect(screen.getByText("Creator workspace")).toBeVisible();
    expect(
      screen.getByText("Student management is not implemented yet.", {
        exact: false,
      }),
    ).toBeVisible();
  });

  it("renders fallback content and keeps the Logout modifier class", () => {
    const { rerender, container } = render(
      <PlaceholderPage section="Future feature" role="student" />,
    );

    expect(
      screen.getByRole("heading", { name: "Future feature" }),
    ).toBeVisible();
    expect(screen.getByText("Student workspace")).toBeVisible();
    expect(
      screen.getByText("Future feature is not implemented yet.", {
        exact: false,
      }),
    ).toBeVisible();

    rerender(<PlaceholderPage section="Logout" role="student" />);
    expect(container.firstChild).toHaveClass(
      "courses-placeholder-page--logout",
    );
  });
});
