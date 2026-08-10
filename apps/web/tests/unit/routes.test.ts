import { describe, expect, it } from "vitest";
import frameworkRoutes from "../../src/routes.ts";
import {
  destinationPaths,
  getDestinationPath,
  getEffectiveRouteId,
  getMatchedRouteDescriptor,
  getRouteDescriptor,
  getRouteMeta,
  normalizeNavigationPath,
  routeDescriptors,
} from "../../src/routing/routeDescriptors.ts";

describe("React Router framework route configuration", () => {
  const academyLayout = frameworkRoutes[0]!;
  const childRoutes = academyLayout.children!;

  it("keeps every app URL beneath one persistent academy layout", () => {
    expect(academyLayout).toMatchObject({
      id: "academy-layout",
      file: "routes/academy-layout.tsx",
    });
    expect(
      Object.fromEntries(
        childRoutes.map(({ id, index, path }) => [id, index ? "/" : path]),
      ),
    ).toEqual({
      home: "/",
      "home-alias": "home",
      dashboard: "dashboard",
      "my-learning": "my-learning",
      courses: "courses",
      "course-create": "courses/create",
      wishlist: "wishlist",
      students: "students",
      reviews: "reviews",
      discussions: "discussions",
      "discussions-q-and-a": "discussions/q-and-a",
      "discussions-comments": "discussions/comments",
      "discussions-mentions": "discussions/mentions",
      "discussions-following": "discussions/following",
      "discussions-saved": "discussions/saved",
      analytics: "analytics",
      orders: "orders",
      messages: "messages",
      "order-history": "order-history",
      notifications: "notifications",
      settings: "settings",
      "settings-profile": "settings/profile",
      "settings-appearance": "settings/appearance",
      "settings-sidebar": "settings/sidebar",
      "settings-notifications": "settings/notifications",
      "settings-learning": "settings/learning",
      "settings-security": "settings/security",
      "settings-account": "settings/account",
      logout: "logout",
      "course-overview": "courses/:courseSlug/overview",
      learning: "courses/:courseSlug",
      "home-fallback": "*",
    });
  });

  it("declares the root, learning, and fallback routes explicitly", () => {
    expect(childRoutes.find(({ id }) => id === "home")).toMatchObject({
      index: true,
      file: "routes/academy-marker.tsx",
    });
    expect(childRoutes.find(({ id }) => id === "learning")).toMatchObject({
      path: "courses/:courseSlug",
      file: "routes/learning.tsx",
      caseSensitive: true,
    });
    expect(
      childRoutes.find(({ id }) => id === "course-overview"),
    ).toMatchObject({
      path: "courses/:courseSlug/overview",
      file: "routes/academy-marker.tsx",
      caseSensitive: true,
    });
    expect(childRoutes.find(({ id }) => id === "home-fallback")).toMatchObject({
      path: "*",
      file: "routes/academy-marker.tsx",
      caseSensitive: true,
    });
    expect(
      childRoutes
        .filter(({ index }) => !index)
        .every(({ caseSensitive }) => caseSensitive),
    ).toBe(true);
  });
});

describe("framework route descriptors", () => {
  it("normalizes same-route comparisons without changing leading path syntax", () => {
    expect(normalizeNavigationPath("/courses///")).toBe("/courses");
    expect(normalizeNavigationPath("///")).toBe("/");
    expect(normalizeNavigationPath("")).toBe("/");
    expect(normalizeNavigationPath("//home")).toBe("//home");
  });

  it("maps route IDs to the existing shell contracts", () => {
    expect(getRouteDescriptor("home-alias")).toEqual(routeDescriptors.home);
    expect(getRouteDescriptor("settings-learning")).toMatchObject({
      kind: "shell",
      page: "settings",
      section: "Settings",
      settingsTab: "learning",
    });
    expect(getRouteDescriptor("discussions-comments")).toMatchObject({
      kind: "shell",
      page: "workspace",
      section: "Discussions",
      discussionTab: "comments",
    });
    expect(getRouteDescriptor("learning")).toEqual({
      kind: "learning",
      page: "learning",
      section: "Courses",
    });
    expect(getRouteDescriptor("missing")).toBeUndefined();
  });

  it("preserves case-sensitive route behavior around framework hydration", () => {
    expect(getEffectiveRouteId("courses", "/courses")).toBe("courses");
    expect(getEffectiveRouteId("courses", "/courses/")).toBe("courses");
    expect(getEffectiveRouteId("courses", "/COURSES")).toBe("home-fallback");
    expect(getEffectiveRouteId("dashboard", "/DASHBOARD")).toBe(
      "home-fallback",
    );
    expect(getEffectiveRouteId("settings-learning", "/settings/Learning")).toBe(
      "home-fallback",
    );
    expect(
      getEffectiveRouteId("discussions-comments", "/discussions/Comments"),
    ).toBe("home-fallback");
  });

  it("validates learning-route structure and encoding without changing course-slug casing", () => {
    expect(getEffectiveRouteId("learning", "/courses/TypeScript-Course")).toBe(
      "learning",
    );
    expect(getEffectiveRouteId("learning", "/courses/c%2B%2B-basics/")).toBe(
      "learning",
    );
    expect(getEffectiveRouteId("learning", "/courses/%2F")).toBe("learning");
    expect(getEffectiveRouteId("learning", "/COURSES/typescript-course")).toBe(
      "home-fallback",
    );
    expect(
      getEffectiveRouteId("learning", "/courses/typescript-course/lesson-1"),
    ).toBe("home-fallback");
    expect(getEffectiveRouteId("learning", "/courses/%E0%A4%A")).toBe(
      "home-fallback",
    );
    expect(
      getEffectiveRouteId(
        "course-overview",
        "/courses/typescript-course/overview",
      ),
    ).toBe("course-overview");
    expect(
      getEffectiveRouteId("course-overview", "/courses/%E0%A4%A/overview"),
    ).toBe("home-fallback");
  });

  it("selects the deepest matched descriptor and safely falls back home", () => {
    expect(
      getMatchedRouteDescriptor([
        { id: "academy-layout" },
        { id: "settings-sidebar" },
      ]),
    ).toBe(routeDescriptors["settings-sidebar"]);
    expect(getMatchedRouteDescriptor([{ id: "academy-layout" }])).toBe(
      routeDescriptors.home,
    );
  });

  it("generates the existing static and course metadata", () => {
    expect(getRouteMeta("courses")).toEqual({
      title: "Courses \u00B7 ProCodrr",
      description: "Browse enrolled and available ProCodrr courses.",
    });
    expect(
      getRouteMeta("learning", { courseSlug: "typescript-course" }),
    ).toEqual({
      title: "The Ultimate TypeScript Course \u00B7 ProCodrr",
      description:
        "Continue The Ultimate TypeScript Course in the focused ProCodrr learning workspace.",
    });
    expect(getRouteMeta("missing")).toEqual({
      title: "Home \u00B7 ProCodrr",
      description: routeDescriptors.home.description,
    });
    expect(getRouteMeta("courses", {}, "/COURSES")).toEqual({
      title: "Home \u00B7 ProCodrr",
      description: routeDescriptors.home.description,
    });
  });

  it("preserves navigation destination aliases and direct paths", () => {
    expect(destinationPaths).toMatchObject({
      home: "/",
      settings: "/settings/appearance",
      Settings: "/settings",
      discussions: "/discussions/q-and-a",
      Discussions: "/discussions/q-and-a",
      "Create Course": "/courses/create",
      Students: "/students",
      "Order History": "/order-history",
      Logout: "/logout",
    });
    expect(getDestinationPath("Settings")).toBe("/settings");
    expect(getDestinationPath("/courses/custom-course")).toBe(
      "/courses/custom-course",
    );
  });

  it("keeps deferred product surfaces on the shared empty state", () => {
    for (const routeId of [
      "students",
      "reviews",
      "course-create",
      "course-overview",
      "analytics",
      "orders",
      "messages",
      "order-history",
      "notifications",
    ]) {
      expect(getRouteDescriptor(routeId)).toMatchObject({
        kind: "shell",
        page: "placeholder",
      });
    }
  });
});
