import {
  Bell,
  BookOpen,
  ChartBar,
  GearSix,
  GraduationCap,
  Heart,
  House,
  Star,
  Tote,
  Users,
  ChatCircleDots,
  EnvelopeSimple,
  SquaresFour,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { SidebarPreferences } from "../settings/settingsPreferences";

export type NavigationItem = readonly [label: string, icon: Icon];

const studentNavigation: readonly NavigationItem[] = [
  ["Home", House],
  ["My Learning", GraduationCap],
  ["Courses", BookOpen],
  ["Wishlist", Heart],
  ["Discussions", ChatCircleDots],
  ["Order History", Tote],
  ["Notifications", Bell],
  ["Settings", GearSix],
];

const creatorNavigation: readonly NavigationItem[] = [
  ["Dashboard", SquaresFour],
  ["Courses", BookOpen],
  ["Students", Users],
  ["Reviews", Star],
  ["Wishlist", Heart],
  ["Discussions", ChatCircleDots],
  ["Analytics", ChartBar],
  ["Orders", Tote],
  ["Messages", EnvelopeSimple],
  ["Settings", GearSix],
];

const navigationByRole: Record<string, readonly NavigationItem[]> = {
  student: studentNavigation,
  creator: creatorNavigation,
};

const navigationTones: Record<string, string> = {
  Home: "#5da9ff",
  Dashboard: "#5da9ff",
  "My Learning": "#ad7cff",
  Courses: "#8f70ff",
  Students: "#55d98b",
  Wishlist: "#ff6684",
  Reviews: "#f1be4b",
  "My Quiz": "#47d4d0",
  Discussions: "#58a8ff",
  Analytics: "#f09c4e",
  Orders: "#d68eea",
  "Order History": "#d68eea",
  Messages: "#63c8d5",
  Notifications: "#f1be4b",
  Settings: "#a16cff",
  Logout: "#8c9294",
};

export function getNavigationDisplayLabel(label: string, page: string): string {
  if (page !== "courses" && label === "Notifications") return "Notification";
  return label;
}

export function getInitialNavigationOrder(role: string): string[] {
  const defaultOrder = (navigationByRole[role] || studentNavigation).map(
    ([label]) => label,
  );
  try {
    const parsedOrder: unknown = JSON.parse(
      localStorage.getItem(`veolms-navigation-order-${role}`) || "[]",
    );
    if (!Array.isArray(parsedOrder)) return defaultOrder;
    const savedOrder = parsedOrder.filter(
      (label): label is string => typeof label === "string",
    );
    const validSavedOrder = savedOrder.filter(
      (label, index) =>
        defaultOrder.includes(label) && savedOrder.indexOf(label) === index,
    );
    return [
      ...validSavedOrder,
      ...defaultOrder.filter((label) => !validSavedOrder.includes(label)),
    ];
  } catch {
    return defaultOrder;
  }
}

export function getOrderedNavigation(
  role: string,
  order: readonly string[] | undefined,
): NavigationItem[] {
  const navigationItems = navigationByRole[role] || studentNavigation;
  const itemByLabel = new Map(navigationItems.map((item) => [item[0], item]));
  const orderedLabels = [
    ...(order || []),
    ...navigationItems.map(([label]) => label),
  ].filter(
    (label, index, labels) =>
      itemByLabel.has(label) && labels.indexOf(label) === index,
  );
  return orderedLabels.map((label) => itemByLabel.get(label)!);
}

export function getNavigationIconColor(
  label: string,
  sidebarPreferences?: SidebarPreferences | null,
): string {
  if (sidebarPreferences?.iconStyle !== "monochrome")
    return navigationTones[label] || "#8c9294";
  if (sidebarPreferences?.monochromeMode === "neutral") return "var(--text)";
  if (sidebarPreferences?.monochromeMode === "custom")
    return sidebarPreferences.monochromeColor || "#6c78ff";
  return "var(--accent)";
}
