import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

const TRACK_INSET = 8;
const MINIMUM_THUMB_HEIGHT = 40;

type FloatingScrollbarProps = {
  scrollportRef: RefObject<HTMLElement | null>;
};

export function FloatingScrollbar({ scrollportRef }: FloatingScrollbarProps) {
  const scrollbarRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const scrollport = scrollportRef.current;
    const scrollbar = scrollbarRef.current;
    if (!scrollport || !scrollbar) return;

    let animationFrame = 0;

    const syncScrollbar = () => {
      animationFrame = 0;
      const scrollportStyle = window.getComputedStyle(scrollport);
      const canScroll =
        (scrollportStyle.overflowY === "auto" ||
          scrollportStyle.overflowY === "scroll") &&
        scrollport.scrollHeight > scrollport.clientHeight + 1;

      scrollbar.classList.toggle("is-visible", canScroll);
      if (!canScroll) return;

      const scrollportRect = scrollport.getBoundingClientRect();
      const trackHeight = Math.max(0, scrollportRect.height - TRACK_INSET * 2);
      const thumbHeight = Math.min(
        trackHeight,
        Math.max(
          MINIMUM_THUMB_HEIGHT,
          trackHeight * (scrollport.clientHeight / scrollport.scrollHeight),
        ),
      );
      const maximumThumbOffset = Math.max(0, trackHeight - thumbHeight);
      const maximumScrollOffset = Math.max(
        1,
        scrollport.scrollHeight - scrollport.clientHeight,
      );
      const thumbOffset =
        maximumThumbOffset * (scrollport.scrollTop / maximumScrollOffset);

      scrollbar.style.setProperty(
        "--floating-scrollbar-top",
        `${scrollportRect.top + TRACK_INSET}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-right",
        `${Math.max(2, window.innerWidth - scrollportRect.right + 4)}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-height",
        `${trackHeight}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-thumb-height",
        `${thumbHeight}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-thumb-offset",
        `${thumbOffset}px`,
      );
    };

    const scheduleSync = () => {
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(syncScrollbar);
      }
    };

    scrollport.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleSync);
    resizeObserver?.observe(scrollport);
    Array.from(scrollport.children).forEach((child) =>
      resizeObserver?.observe(child),
    );

    const contentObserver = new MutationObserver(() => {
      Array.from(scrollport.children).forEach((child) =>
        resizeObserver?.observe(child),
      );
      scheduleSync();
    });
    contentObserver.observe(scrollport, { childList: true, subtree: true });

    scheduleSync();

    return () => {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
      scrollport.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      resizeObserver?.disconnect();
      contentObserver.disconnect();
    };
  }, [scrollportRef]);

  return (
    <span ref={scrollbarRef} className="floating-scrollbar" aria-hidden="true">
      <span className="floating-scrollbar__thumb" />
    </span>
  );
}
