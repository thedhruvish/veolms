import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../../src/VideoPlayer.js";

describe("video playback consent", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("waits for an explicit play action even after media becomes ready", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const { container } = render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
        lessonTitle="Consent-first lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();

    fireEvent.canPlay(video!);
    fireEvent.ended(video!);
    expect(play).not.toHaveBeenCalled();
    expect(screen.queryByRole("switch", { name: /Autoplay/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
  });
});
