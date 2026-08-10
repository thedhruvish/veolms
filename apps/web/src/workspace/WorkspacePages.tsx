import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MagnifyingGlass, Plus, SignOut } from "@phosphor-icons/react";
import type { CourseRole } from "../courses/catalogue";
import { DiscussionsWorkspace } from "./DiscussionsWorkspace";

export interface WorkspacePageProps {
  section: string;
  role: CourseRole;
  onNavigatePage: (page: string) => void;
  setNotice?: (message: string) => void;
  onSignOut?: () => void;
}

interface WorkspaceHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

function WorkspaceHeader({ title, description, action }: WorkspaceHeaderProps) {
  return (
    <header className="workspace-page__header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="workspace-page__action">{action}</div>}
    </header>
  );
}

function PageStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="workspace-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

const students = [
  {
    initials: "AM",
    name: "Aarav Mehta",
    email: "aarav@procodrr.dev",
    course: "UI/UX Design Mastery",
    progress: 74,
    activity: "12 min ago",
  },
  {
    initials: "PS",
    name: "Priya Shah",
    email: "priya@procodrr.dev",
    course: "The Ultimate TypeScript Course",
    progress: 61,
    activity: "2 hrs ago",
  },
  {
    initials: "NP",
    name: "Nisha Patel",
    email: "nisha@procodrr.dev",
    course: "Complete Backend with Node.js",
    progress: 38,
    activity: "Yesterday",
  },
  {
    initials: "RK",
    name: "Rohan Kapoor",
    email: "rohan@procodrr.dev",
    course: "Figma UI Essentials",
    progress: 92,
    activity: "Yesterday",
  },
];

function StudentsWorkspace({
  setNotice,
}: Pick<WorkspacePageProps, "setNotice">) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "active">("all");
  const visibleStudents = useMemo(
    () =>
      students.filter((student) => {
        const matchesQuery =
          `${student.name} ${student.email} ${student.course}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return matchesQuery && (view === "all" || student.progress >= 50);
      }),
    [query, view],
  );

  return (
    <div className="workspace-page">
      <WorkspaceHeader
        title="Students"
        description="Understand who is learning, where they are progressing, and who may need a nudge."
        action={
          <button
            type="button"
            className="workspace-button"
            onClick={() =>
              setNotice?.(
                "Student invites will be available when enrollment is connected.",
              )
            }
          >
            <Plus size={17} weight="bold" /> Invite student
          </button>
        }
      />
      <div className="workspace-stats">
        <PageStat
          label="Enrolled learners"
          value="3,481"
          note="+8.4% this month"
        />
        <PageStat
          label="Active this week"
          value="1,204"
          note="34.6% of learners"
        />
        <PageStat
          label="Course completion"
          value="68%"
          note="Across all courses"
        />
      </div>
      <section
        className="workspace-panel"
        aria-labelledby="student-directory-heading"
      >
        <div className="workspace-panel__topline workspace-panel__topline--tools">
          <div>
            <h2 id="student-directory-heading">Student directory</h2>
            <p>Review recent activity and learning progress.</p>
          </div>
          <div className="workspace-toolbar">
            <label className="workspace-search">
              <MagnifyingGlass size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search students"
              />
            </label>
            <div className="workspace-segmented">
              <button
                type="button"
                aria-pressed={view === "all"}
                className={view === "all" ? "is-active" : ""}
                onClick={() => setView("all")}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={view === "active"}
                className={view === "active" ? "is-active" : ""}
                onClick={() => setView("active")}
              >
                On track
              </button>
            </div>
          </div>
        </div>
        <div
          className="workspace-table workspace-table--students"
          role="table"
          aria-label="Student directory"
        >
          <div className="workspace-table__head" role="row">
            <span role="columnheader">Student</span>
            <span role="columnheader">Current course</span>
            <span role="columnheader">Progress</span>
            <span role="columnheader">Last active</span>
          </div>
          {visibleStudents.map((student) => (
            <article
              className="workspace-table__row"
              role="row"
              key={student.email}
            >
              <span role="cell" className="workspace-person">
                <i aria-hidden="true">{student.initials}</i>
                <span>
                  <strong>{student.name}</strong>
                  <small>{student.email}</small>
                </span>
              </span>
              <span role="cell" className="workspace-table__course">
                {student.course}
              </span>
              <span role="cell">
                <span className="workspace-progress">
                  <i>
                    <b style={{ width: `${student.progress}%` }} />
                  </i>
                  <strong>{student.progress}%</strong>
                </span>
              </span>
              <time role="cell">{student.activity}</time>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function LogoutWorkspace({
  onNavigatePage,
  setNotice,
  onSignOut,
}: Pick<WorkspacePageProps, "onNavigatePage" | "setNotice" | "onSignOut">) {
  const [ready, setReady] = useState(false);

  return (
    <div className="workspace-page workspace-page--logout">
      <section className="workspace-signout" aria-labelledby="signout-heading">
        <span className="workspace-signout__icon">
          <SignOut size={26} weight="duotone" />
        </span>
        <div>
          <h1 id="signout-heading">Sign out</h1>
          <p>End this local workspace session on this device.</p>
        </div>
        <div className="workspace-signout__actions">
          {ready && (
            <p role="status">
              This clears the local workspace session and returns you to the
              home screen. Server-side sign-out will follow when account
              sessions are connected.
            </p>
          )}
          <button
            type="button"
            className="workspace-button workspace-button--secondary"
            onClick={() => onNavigatePage("home")}
          >
            Stay signed in
          </button>
          <button
            type="button"
            className="workspace-button"
            onClick={() => {
              if (!ready) {
                setReady(true);
                return;
              }
              onSignOut?.();
              setNotice?.(
                "Local workspace session ended. You are back at home.",
              );
              onNavigatePage("home");
            }}
          >
            {ready ? "Confirm sign out" : "Sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function WorkspacePage({
  section,
  role,
  onNavigatePage,
  setNotice,
  onSignOut,
}: WorkspacePageProps) {
  if (section === "Discussions") {
    return (
      <DiscussionsWorkspace
        role={role}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
    );
  }
  if (section === "Students") {
    return <StudentsWorkspace setNotice={setNotice} />;
  }
  if (section === "Logout") {
    return (
      <LogoutWorkspace
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div className="workspace-page">
      <WorkspaceHeader
        title="Workspace"
        description="Choose a section from the navigation to continue."
      />
    </div>
  );
}
