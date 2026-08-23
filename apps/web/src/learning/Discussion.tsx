import { ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Notepad } from "@phosphor-icons/react/Notepad";
import { PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { Question } from "@phosphor-icons/react/Question";
import { Toolbox } from "@phosphor-icons/react/Toolbox";
import { X } from "@phosphor-icons/react/X";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import { CommentCard } from "./CommentCard";
import type { Comment } from "./CommentCard";
import {
  isStoredBoolean,
  isStoredString,
  useSessionStorageState,
} from "./useSessionStorageState";

const initialComments: Comment[] = [
  {
    id: 1,
    name: "Ethan Park",
    time: "2 hours ago",
    avatar: "/assets/ethan-avatar-160.webp",
    text: "That dashboard animation breakdown was super helpful! Could you share the easing curve used for the chart transitions?",
    likes: 12,
    replies: 3,
  },
  {
    id: 2,
    name: "Sofia Chen",
    time: "1 hour ago",
    avatar: "/assets/sofia-avatar-160.webp",
    text: "Love how you explained the spacing system. The 8pt grid approach really makes things consistent.",
    likes: 8,
    replies: 1,
  },
  {
    id: 3,
    name: "Maya Rodriguez",
    time: "45 minutes ago",
    avatar: "/assets/sofia-avatar-160.webp",
    text: "The pacing in this section made the research workflow much easier to follow. The examples were especially clear.",
    likes: 5,
    replies: 2,
  },
  {
    id: 4,
    name: "Noah Williams",
    time: "28 minutes ago",
    avatar: "/assets/ethan-avatar-160.webp",
    text: "Could you revisit the part about choosing between qualitative and quantitative feedback in a future lesson?",
    likes: 4,
    replies: 1,
  },
  {
    id: 5,
    name: "Ava Patel",
    time: "12 minutes ago",
    avatar: "/assets/sofia-avatar-160.webp",
    text: "I tried the exercise alongside the video and it helped me spot a few gaps in my own process.",
    likes: 2,
    replies: 0,
  },
];

const tabs = [
  ["Comments", ChatCenteredDots, "blue"],
  ["Notes", Notepad, "cyan"],
  ["Resources", Toolbox, "orange"],
  ["Q&A", Question, "violet"],
] as const;

type Tab = (typeof tabs)[number][0];
type SupplementalTab = Exclude<Tab, "Comments">;
type TabPointerScrollSnapshot = {
  tab: Tab;
  target: Window | HTMLElement;
  top: number;
  capturedAt: number;
};
type LessonPinnedScrollSnapshot = Omit<
  TabPointerScrollSnapshot,
  "tab" | "capturedAt"
>;
const tabIds = tabs.map(([label]) => label);
const getLessonScrollTarget = (): Window | HTMLElement => {
  const mainScrollport = document.querySelector<HTMLElement>(
    "#courses-main-scrollport",
  );
  const mainScrollportStyle = mainScrollport
    ? getComputedStyle(mainScrollport)
    : null;
  return mainScrollport &&
    mainScrollportStyle &&
    (mainScrollportStyle.overflowY === "auto" ||
      mainScrollportStyle.overflowY === "scroll") &&
    mainScrollport.scrollHeight > mainScrollport.clientHeight
    ? mainScrollport
    : window;
};
const getLessonScrollTop = (target: Window | HTMLElement) =>
  target instanceof Window ? target.scrollY : target.scrollTop;
const restoreLessonScrollTop = (target: Window | HTMLElement, top: number) => {
  if (target instanceof Window) {
    const scrollingElement = document.scrollingElement;
    if (scrollingElement) scrollingElement.scrollTop = top;
    else target.scrollTo(0, top);
    return;
  }
  target.scrollTop = top;
};
const resolveLessonTabContentTop = ({ surface }: { surface: HTMLElement }) => {
  const discussion = surface.closest<HTMLElement>(".learning-discussion");
  const header = discussion?.querySelector<HTMLElement>(
    ".learning-discussion__header",
  );
  const player = document.querySelector<HTMLElement>(
    ".learning-workspace__player-wrap",
  );
  if (
    !header ||
    !player ||
    getComputedStyle(header).position !== "sticky" ||
    Math.abs(
      header.getBoundingClientRect().top -
        player.getBoundingClientRect().bottom,
    ) > 2
  )
    return null;
  return header.getBoundingClientRect().bottom + 12;
};
const getTabId = (tab: Tab) =>
  `lesson-tool-tab-${tab.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const supplementalContent: Record<
  SupplementalTab,
  { title: string; body: string; action: string }
> = {
  Notes: {
    title: "Your lesson notes",
    body: "Capture the questions, principles, and examples you want to revisit.",
    action: "Add a note",
  },
  Resources: {
    title: "Lesson resources",
    body: "Research-plan template, interview prompts, and the usability checklist are ready to download.",
    action: "View 3 resources",
  },
  "Q&A": {
    title: "Questions & answers",
    body: "Ask the instructor or browse answers from other students in this lesson.",
    action: "Ask a question",
  },
};

interface DiscussionProps {
  persistenceKey: string;
}

const isStoredComments = (value: unknown): value is Comment[] =>
  Array.isArray(value) &&
  value.every(
    (comment) =>
      Boolean(comment) &&
      typeof comment === "object" &&
      typeof (comment as Comment).id === "number" &&
      typeof (comment as Comment).name === "string" &&
      typeof (comment as Comment).time === "string" &&
      typeof (comment as Comment).avatar === "string" &&
      typeof (comment as Comment).text === "string" &&
      typeof (comment as Comment).likes === "number",
  );

export function Discussion({ persistenceKey }: DiscussionProps) {
  const storageBase = `veolms-learning-${persistenceKey}-discussion`;
  const [activeTab, setActiveTab] = useState<Tab>("Comments");
  const [search, setSearch] = useSessionStorageState(
    `${storageBase}-search`,
    "",
    isStoredString,
  );
  const [searchOpen, setSearchOpen] = useSessionStorageState(
    `${storageBase}-search-open`,
    false,
    isStoredBoolean,
  );
  const [searchFocused, setSearchFocused] = useState(false);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabPointerScrollRef = useRef<TabPointerScrollSnapshot | null>(null);
  const lastPinnedScrollRef = useRef<LessonPinnedScrollSnapshot | null>(null);
  const pendingTabChromeRestoreRef = useRef<LessonPinnedScrollSnapshot | null>(
    null,
  );
  const userScrollIntentUntilRef = useRef(0);
  const composerSearchInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useSessionStorageState(
    `${storageBase}-comment-draft`,
    "",
    isStoredString,
  );
  const [postedComments, setPostedComments] = useSessionStorageState<Comment[]>(
    `${storageBase}-posted-comments`,
    [],
    isStoredComments,
  );
  const [comments, setComments] = useState(() => [
    ...postedComments,
    ...initialComments,
  ]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setComments((current) => {
      const currentById = new Map(
        current.map((comment) => [comment.id, comment]),
      );
      return [
        ...postedComments.map(
          (comment) => currentById.get(comment.id) ?? comment,
        ),
        ...initialComments.map(
          (comment) => currentById.get(comment.id) ?? comment,
        ),
      ];
    });
  }, [postedComments]);

  useEffect(() => {
    const mainScrollport = document.querySelector<HTMLElement>(
      "#courses-main-scrollport",
    );
    const markUserScrollIntent = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        (![
          "ArrowDown",
          "ArrowUp",
          "End",
          "Home",
          "PageDown",
          "PageUp",
          " ",
        ].includes(event.key) ||
          (event.target instanceof Element &&
            Boolean(event.target.closest(".lesson-tool-tab"))))
      ) {
        return;
      }
      userScrollIntentUntilRef.current = performance.now() + 300;
    };
    const updatePinnedScroll = () => {
      const player = document.querySelector<HTMLElement>(
        ".learning-workspace__player-wrap",
      );
      const header = document.querySelector<HTMLElement>(
        ".learning-discussion__header",
      );
      if (!player || !header) return;

      const target = getLessonScrollTarget();
      const top = getLessonScrollTop(target);
      const pinned =
        top > 1 &&
        Math.abs(
          header.getBoundingClientRect().top -
            player.getBoundingClientRect().bottom,
        ) <= 2;
      if (pinned) {
        lastPinnedScrollRef.current = { target, top };
        return;
      }
      if (performance.now() < userScrollIntentUntilRef.current) {
        lastPinnedScrollRef.current = null;
        document
          .querySelector<HTMLElement>("#learning-discussion-tab-panel")
          ?.style.removeProperty("height");
      }
    };
    const updateAfterResize = () => {
      lastPinnedScrollRef.current = null;
      updatePinnedScroll();
    };

    updatePinnedScroll();
    window.addEventListener("wheel", markUserScrollIntent, { passive: true });
    window.addEventListener("touchmove", markUserScrollIntent, {
      passive: true,
    });
    window.addEventListener("keydown", markUserScrollIntent);
    window.addEventListener("scroll", updatePinnedScroll, { passive: true });
    window.addEventListener("resize", updateAfterResize);
    mainScrollport?.addEventListener("scroll", updatePinnedScroll, {
      passive: true,
    });
    return () => {
      window.removeEventListener("wheel", markUserScrollIntent);
      window.removeEventListener("touchmove", markUserScrollIntent);
      window.removeEventListener("keydown", markUserScrollIntent);
      window.removeEventListener("scroll", updatePinnedScroll);
      window.removeEventListener("resize", updateAfterResize);
      mainScrollport?.removeEventListener("scroll", updatePinnedScroll);
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const frame = window.requestAnimationFrame(() =>
      composerSearchInputRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  useLayoutEffect(() => {
    const snapshot = pendingTabChromeRestoreRef.current;
    if (!snapshot) return undefined;
    restoreLessonScrollTop(snapshot.target, snapshot.top);
    const frame = window.requestAnimationFrame(() => {
      if (pendingTabChromeRestoreRef.current !== snapshot) return;
      restoreLessonScrollTop(snapshot.target, snapshot.top);
      pendingTabChromeRestoreRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  const visibleComments = useMemo(
    () =>
      comments.filter((comment) =>
        `${comment.name} ${comment.text}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [comments, search],
  );

  const addComment = () => {
    const text = draft.trim();
    if (!text) {
      setNotice("Write a comment before sending.");
      return;
    }
    const comment: Comment = {
      id: Date.now(),
      name: "Sofia Chen",
      time: "Just now",
      avatar: "/assets/sofia-avatar-160.webp",
      text,
      likes: 0,
    };
    setPostedComments((current) => [comment, ...current]);
    setComments((current) => [comment, ...current]);
    setDraft("");
    setNotice("Comment posted.");
  };

  const onLike = (id: number, liked: boolean) => {
    setComments((current) =>
      current.map((comment) =>
        comment.id === id
          ? { ...comment, likes: Math.max(0, comment.likes + (liked ? 1 : -1)) }
          : comment,
      ),
    );
  };

  const preparePointerTabNavigation = (tab: Tab, button: HTMLButtonElement) => {
    const target = getLessonScrollTarget();
    tabPointerScrollRef.current = {
      tab,
      target,
      top: getLessonScrollTop(target),
      capturedAt: performance.now(),
    };
    button.focus({ preventScroll: true });
  };

  const navigateTab = (tab: Tab, preservePointerChrome = false) => {
    const pointerSnapshot = tabPointerScrollRef.current;
    const pinnedSnapshot = preservePointerChrome
      ? lastPinnedScrollRef.current
      : null;
    const liveTarget = preservePointerChrome ? getLessonScrollTarget() : null;
    const liveTop = liveTarget ? getLessonScrollTop(liveTarget) : 0;
    const player = preservePointerChrome
      ? document.querySelector<HTMLElement>(".learning-workspace__player-wrap")
      : null;
    const header = preservePointerChrome
      ? document.querySelector<HTMLElement>(".learning-discussion__header")
      : null;
    const livePinnedSnapshot =
      liveTarget &&
      liveTop > 1 &&
      player &&
      header &&
      Math.abs(
        header.getBoundingClientRect().top -
          player.getBoundingClientRect().bottom,
      ) <= 2
        ? {
            tab,
            target: liveTarget,
            top: liveTop,
            capturedAt: performance.now(),
          }
        : null;
    tabPointerScrollRef.current = null;
    const navigationSnapshot =
      livePinnedSnapshot ??
      (pointerSnapshot
        ? pointerSnapshot
        : pinnedSnapshot
          ? {
              tab,
              ...pinnedSnapshot,
              capturedAt: performance.now(),
            }
          : pointerSnapshot);
    if (
      navigationSnapshot?.tab === tab &&
      performance.now() - navigationSnapshot.capturedAt < 1_500
    ) {
      if (preservePointerChrome) {
        const panel = document.querySelector<HTMLElement>(
          "#learning-discussion-tab-panel",
        );
        if (panel) {
          panel.style.setProperty(
            "height",
            `${Math.ceil(panel.getBoundingClientRect().height)}px`,
            "important",
          );
        }
      }
      restoreLessonScrollTop(navigationSnapshot.target, navigationSnapshot.top);
      if (preservePointerChrome) {
        pendingTabChromeRestoreRef.current = {
          target: navigationSnapshot.target,
          top: navigationSnapshot.top,
        };
      }
    }
    setActiveTab(tab);
    setSearch("");
    setSearchOpen(false);
  };

  return (
    <section className="learning-discussion">
      <div className="learning-discussion__header min-w-0 border-b border-[var(--border)]">
        <div
          ref={tabListRef}
          className="page-tabs flex min-w-0 gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Lesson tools"
          data-sidebar-swipe-ignore
          data-learning-swipe-ignore
        >
          {tabs.map(([label, Icon, tone]) => (
            <button
              type="button"
              id={getTabId(label)}
              role="tab"
              aria-selected={activeTab === label}
              aria-controls="learning-discussion-tab-panel"
              data-page-tab-tone={tone}
              data-swipe-tab-id={label}
              tabIndex={activeTab === label ? 0 : -1}
              key={label}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                preparePointerTabNavigation(label, event.currentTarget);
              }}
              onPointerCancel={() => {
                tabPointerScrollRef.current = null;
              }}
              onClick={() => navigateTab(label, true)}
              onKeyDown={handleRovingTabKeyDown}
              className={`lesson-tool-tab relative inline-flex h-12 shrink-0 items-center gap-2 px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] ${activeTab === label ? "is-active font-semibold" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              <Icon
                size={20}
                weight={activeTab === label ? "fill" : "regular"}
              />{" "}
              {label}
            </button>
          ))}
          <span className="page-tabs__indicator" aria-hidden="true" />
        </div>
      </div>

      <SwipeableTabPanel
        tabs={tabIds}
        activeTab={activeTab}
        onTabChange={navigateTab}
        tabListRef={tabListRef}
        id="learning-discussion-tab-panel"
        labelledBy={getTabId(activeTab)}
        className="learning-discussion__tab-panel"
        preserveScrollPosition
        resolveDestinationContentTop={resolveLessonTabContentTop}
      >
        {(panelTab) =>
          panelTab === "Comments" ? (
            <div className="learning-comments-surface">
              <div
                className={`learning-comment-composer ${searchOpen ? "is-search-open" : ""}`}
              >
                <img
                  src="/assets/sofia-avatar-160.webp"
                  alt=""
                  className="learning-comment-composer__avatar"
                />
                <div className="learning-comment-composer__field">
                  <label className="learning-comment-composer__comment min-w-0 flex-1">
                    <span className="sr-only">Add a comment</span>
                    <input
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        setNotice("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addComment();
                      }}
                      placeholder="Add a comment..."
                      className="learning-comment-composer__input h-11 w-full bg-transparent px-1 outline-none placeholder:text-[var(--muted)]"
                    />
                  </label>
                  <button
                    type="button"
                    data-fixed-radius
                    onClick={addComment}
                    aria-label="Post comment"
                    className="learning-comment-composer__send"
                  >
                    <PaperPlaneTilt size={22} weight="fill" />
                  </button>
                </div>
                <button
                  type="button"
                  data-fixed-radius
                  aria-label={
                    searchOpen ? "Close comment search" : "Search comments"
                  }
                  aria-pressed={searchOpen}
                  aria-controls="learning-comment-search-input"
                  onClick={() => {
                    setSearchOpen((open) => {
                      const nextOpen = !open;
                      setSearchFocused(nextOpen);
                      return nextOpen;
                    });
                  }}
                  className="learning-comment-composer__search-toggle"
                >
                  {searchOpen ? <X size={18} /> : <MagnifyingGlass size={20} />}
                </button>
                <label
                  className="learning-comment-composer__search"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                >
                  <MagnifyingGlass size={18} aria-hidden="true" />
                  <span className="sr-only">
                    Search {activeTab.toLowerCase()}
                  </span>
                  <input
                    id="learning-comment-search-input"
                    ref={composerSearchInputRef}
                    type="search"
                    tabIndex={searchOpen ? 0 : -1}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      searchFocused
                        ? (activeTab as Tab) === "Q&A"
                          ? "Search Q&A"
                          : `Search ${activeTab.toLowerCase()}`
                        : "Search"
                    }
                    className="rounded-none"
                    data-fixed-radius
                    data-search-shortcut-target
                    aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
                  />
                  <SearchShortcutHint />
                </label>
              </div>
              {notice && (
                <p
                  role="status"
                  className={`learning-comment-notice text-xs ${notice.includes("posted") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                >
                  {notice}
                </p>
              )}

              <div className="learning-comment-feed">
                {visibleComments.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    onLike={onLike}
                  />
                ))}
                {visibleComments.length === 0 && (
                  <div className="learning-comment-empty px-5 py-10 text-center">
                    <p className="font-semibold">
                      No comments match that search
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Try a name, topic, or phrase from the discussion.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className="learning-supplemental-panel rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-center"
              data-learning-radius-surface
            >
              <h3 className="text-base font-semibold">
                {supplementalContent[panelTab].title}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
                {supplementalContent[panelTab].body}
              </p>
              <button
                type="button"
                data-control-radius-action
                onClick={() =>
                  setNotice(`${supplementalContent[panelTab].action} selected.`)
                }
                className="mt-5 rounded-[9px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {supplementalContent[panelTab].action}
              </button>
            </div>
          )
        }
      </SwipeableTabPanel>
    </section>
  );
}
