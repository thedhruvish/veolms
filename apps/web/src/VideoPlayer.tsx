import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  CaretLeft,
  CaretRight,
  Check,
  ClosedCaptioning,
  CornersOut,
  Gauge,
  GearSix,
  Monitor,
  Pause,
  PictureInPicture,
  Play,
  Rectangle,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
} from "@phosphor-icons/react";
import type { CourseVideo } from "./learning/courseContent";

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

const formatMediaTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours)
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

interface SwitchVisualProps {
  checked: boolean;
}

function SwitchVisual({ checked }: SwitchVisualProps) {
  return (
    <span
      aria-hidden="true"
      className={`player-switch ${checked ? "player-switch--on" : ""}`}
    >
      <span className="player-switch-thumb" />
    </span>
  );
}

interface VideoPlayerProps {
  media: CourseVideo;
  lessonTitle: string;
  theaterMode: boolean;
  onTheaterToggle: () => void;
  onAutoplayNext?: () => boolean;
  autoStart?: boolean;
}

export function VideoPlayer({
  media,
  lessonTitle,
  theaterMode,
  onTheaterToggle,
  onAutoplayNext,
  autoStart = false,
}: VideoPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const suppressNextPlayerActionRef = useRef(false);
  const autoplayNextRef = useRef(false);
  const courseLaunchRef = useRef(autoStart);
  const controlsTimerRef = useRef<number | undefined>(undefined);
  const hudTimerRef = useRef<number | undefined>(undefined);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(media.duration);
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"main" | "speed">("main");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hud, setHud] = useState("");
  const [mediaError, setMediaError] = useState(false);
  const [autoplay, setAutoplay] = useState(
    () => localStorage.getItem("veolms-player-autoplay") === "on",
  );
  const [ambient, setAmbient] = useState(
    () => localStorage.getItem("veolms-player-ambient") !== "off",
  );

  const showHud = (message: string) => {
    window.clearTimeout(hudTimerRef.current);
    setHud(message);
    hudTimerRef.current = window.setTimeout(() => setHud(""), 1100);
  };

  const consumeDismissedAction = () => {
    if (!suppressNextPlayerActionRef.current) return false;
    suppressNextPlayerActionRef.current = false;
    return true;
  };

  const runPlayerAction = (action: () => void | Promise<void>) => {
    if (consumeDismissedAction()) return;
    action();
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
      setMediaError(false);
    } catch {
      setMediaError(true);
    }
  };

  const skip = (amount: number, announce = true) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(
      0,
      Math.min(video.duration || duration, video.currentTime + amount),
    );
    if (announce)
      showHud(`${amount > 0 ? "+" : "−"}${Math.abs(amount)} seconds`);
  };

  const seekToProgress = (next: number) => {
    const safeProgress = Math.max(0, Math.min(100, next));
    setProgress(safeProgress);
    if (videoRef.current?.duration)
      videoRef.current.currentTime =
        (safeProgress / 100) * videoRef.current.duration;
  };

  const setPlaybackSpeed = (next: number, announce = true) => {
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    if (announce) showHud(`${next}×`);
  };

  const adjustSpeed = (direction: number) => {
    const currentIndex = playbackSpeeds.indexOf(speed);
    const safeIndex =
      currentIndex < 0 ? playbackSpeeds.indexOf(1) : currentIndex;
    const nextIndex = Math.max(
      0,
      Math.min(playbackSpeeds.length - 1, safeIndex + direction),
    );
    setPlaybackSpeed(playbackSpeeds[nextIndex]!);
  };

  const toggleCaptions = () => {
    const next = !captions;
    setCaptions(next);
    const captionsTrack = videoRef.current?.textTracks?.[0];
    if (captionsTrack) captionsTrack.mode = next ? "showing" : "hidden";
    showHud(next ? "Captions on" : "Captions off");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
    showHud(next ? "Muted" : "Sound on");
  };

  const changeVolume = (next: number) => {
    setVolume(next);
    setMuted(next === 0);
    if (videoRef.current) {
      videoRef.current.volume = next;
      videoRef.current.muted = next === 0;
    }
  };

  const requestPip = async () => {
    if (!document.pictureInPictureEnabled || !videoRef.current) return;
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else await videoRef.current.requestPictureInPicture();
    } catch {
      showHud("Picture-in-picture unavailable");
    }
  };

  const requestFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (shellRef.current?.requestFullscreen)
      await shellRef.current.requestFullscreen();
  };

  const paintAmbientFrame = () => {
    const video = videoRef.current;
    const canvas = ambientCanvasRef.current;
    if (!ambient || !video || !canvas || video.readyState < 2) return;
    try {
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      if (canvas.width !== 96) canvas.width = 96;
      if (canvas.height !== 54) canvas.height = 54;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      // Playback remains available when a cross-origin media response cannot be drawn to canvas.
    }
  };

  const scheduleControlsHide = () => {
    window.clearTimeout(controlsTimerRef.current);
    setControlsVisible(true);
    if (playing && !settingsOpen) {
      controlsTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        2200,
      );
    }
  };

  const handleFramePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!settingsOpen) return;
    const target = event.target;
    if (
      settingsMenuRef.current?.contains(target as Node) ||
      settingsButtonRef.current?.contains(target as Node)
    )
      return;
    suppressNextPlayerActionRef.current = true;
    setSettingsOpen(false);
    setSettingsPage("main");
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    courseLaunchRef.current = autoStart;
    video.pause();
    video.load();
    video.playbackRate = speed;
    video.volume = volume;
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(media.duration);
    setMediaError(false);
    setControlsVisible(true);
  }, [media.src, autoStart]);

  useEffect(() => {
    localStorage.setItem("veolms-player-autoplay", autoplay ? "on" : "off");
  }, [autoplay]);

  useEffect(() => {
    localStorage.setItem("veolms-player-ambient", ambient ? "on" : "off");
  }, [ambient]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        settingsMenuRef.current?.contains(event.target as Node) ||
        settingsButtonRef.current?.contains(event.target as Node)
      )
        return;
      setSettingsOpen(false);
      setSettingsPage("main");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setSettingsPage("main");
      settingsButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  useEffect(() => {
    window.clearTimeout(controlsTimerRef.current);
    if (playing && !settingsOpen)
      controlsTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        2200,
      );
    else setControlsVisible(true);
    return () => window.clearTimeout(controlsTimerRef.current);
  }, [playing, settingsOpen]);

  useEffect(() => {
    if (!ambient) return undefined;
    paintAmbientFrame();
    if (!playing) return undefined;
    let animationFrame: number;
    let lastPaint = 0;
    const draw = (time: number) => {
      if (time - lastPaint > 120) {
        paintAmbientFrame();
        lastPaint = time;
      }
      animationFrame = window.requestAnimationFrame(draw);
    };
    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [ambient, playing, media.src]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          activeElement?.tagName ?? "",
        ) ||
        activeElement?.isContentEditable
      )
        return;
      if (event.ctrlKey || event.metaKey || event.altKey || settingsOpen)
        return;

      const key = event.key.toLowerCase();
      const speedDown =
        event.shiftKey &&
        (event.code === "Comma" ||
          event.code === "ArrowLeft" ||
          event.key === "<");
      const speedUp =
        event.shiftKey &&
        (event.code === "Period" ||
          event.code === "ArrowRight" ||
          event.key === ">");
      if (speedDown || speedUp) {
        event.preventDefault();
        adjustSpeed(speedUp ? 1 : -1);
        return;
      }

      if (event.code === "Space" || key === "k") {
        event.preventDefault();
        togglePlay();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        skip(-5);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        skip(5);
      } else if (key === "j") {
        event.preventDefault();
        skip(-10);
      } else if (key === "l") {
        event.preventDefault();
        skip(10);
      } else if (key === "m") {
        event.preventDefault();
        toggleMute();
      } else if (key === "c") {
        event.preventDefault();
        toggleCaptions();
      } else if (key === "f") {
        event.preventDefault();
        requestFullscreen();
      } else if (key === "t") {
        event.preventDefault();
        onTheaterToggle();
      } else if (key === "i") {
        event.preventDefault();
        requestPip();
      } else if (event.code === "Home") {
        event.preventDefault();
        seekToProgress(0);
      } else if (event.code === "End") {
        event.preventDefault();
        seekToProgress(100);
      } else if (!event.shiftKey && /^Digit[0-9]$/.test(event.code)) {
        event.preventDefault();
        seekToProgress(Number(event.code.slice(-1)) * 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [speed, captions, muted, settingsOpen, onTheaterToggle]);

  useEffect(
    () => () => {
      window.clearTimeout(controlsTimerRef.current);
      window.clearTimeout(hudTimerRef.current);
    },
    [],
  );

  const controlsAreVisible = controlsVisible || !playing || settingsOpen;

  return (
    <div
      ref={shellRef}
      className={`video-shell relative isolate ${theaterMode ? "video-shell--theater" : ""}`}
    >
      <canvas
        ref={ambientCanvasRef}
        aria-hidden="true"
        className={`ambient-canvas ${ambient && !mediaError ? "ambient-canvas--visible" : ""}`}
      />
      <section
        ref={frameRef}
        aria-label={`Lesson video player for ${lessonTitle}`}
        onPointerDownCapture={handleFramePointerDown}
        onMouseMove={scheduleControlsHide}
        onMouseLeave={() =>
          playing && !settingsOpen && setControlsVisible(false)
        }
        onFocusCapture={() => setControlsVisible(true)}
        onClick={(event) => {
          if (
            (event.target as Element).closest(
              "[data-player-control], [data-player-menu], input",
            )
          )
            return;
          runPlayerAction(togglePlay);
        }}
        className={`youtube-player group relative z-10 w-full overflow-hidden rounded-[13px] border border-[var(--learning-panel-border)] bg-black shadow-[0_18px_50px_rgba(0,0,0,.2)] ${theaterMode ? "lg:h-[calc(100vh-94px)] lg:min-h-[420px]" : ""} ${playing && !controlsAreVisible ? "cursor-none" : ""}`}
      >
        <video
          ref={videoRef}
          className="size-full object-contain"
          preload="metadata"
          src={media.src}
          muted={muted}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration);
            const savedTime = Number(
              localStorage.getItem(`veolms-watch-${media.fileName}`),
            );
            event.currentTarget.currentTime =
              Number.isFinite(savedTime) && savedTime > 0
                ? Math.min(
                    savedTime,
                    Math.max(0, event.currentTarget.duration - 1),
                  )
                : Math.min(0.01, event.currentTarget.duration || 0);
            event.currentTarget.playbackRate = speed;
            event.currentTarget.volume = volume;
          }}
          onLoadedData={paintAmbientFrame}
          onSeeked={paintAmbientFrame}
          onCanPlay={() => {
            setMediaError(false);
            if (autoplayNextRef.current || courseLaunchRef.current) {
              autoplayNextRef.current = false;
              courseLaunchRef.current = false;
              videoRef.current?.play().catch(() => setControlsVisible(true));
            }
          }}
          onPlay={() => {
            setPlaying(true);
            setControlsVisible(true);
          }}
          onPause={() => {
            setPlaying(false);
            setControlsVisible(true);
          }}
          onTimeUpdate={(event) => {
            const nextTime = event.currentTarget.currentTime;
            const nextDuration = event.currentTarget.duration;
            setCurrentTime(nextTime);
            setProgress(nextDuration ? (nextTime / nextDuration) * 100 : 0);
            if (nextTime > 0)
              localStorage.setItem(
                `veolms-watch-${media.fileName}`,
                String(nextTime),
              );
          }}
          onError={() => setMediaError(true)}
          onEnded={() => {
            setPlaying(false);
            if (autoplay && onAutoplayNext?.()) autoplayNextRef.current = true;
          }}
        >
          <track
            kind="captions"
            src="/assets/designing-users.vtt"
            srcLang="en"
            label="English"
          />
        </video>

        {mediaError && (
          <div
            role="alert"
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 px-6 text-center text-sm text-white"
          >
            This lesson video could not be loaded. Check your connection, then
            try again.
          </div>
        )}

        {hud && (
          <div role="status" className="player-hud">
            {hud}
          </div>
        )}

        <button
          type="button"
          data-player-control
          aria-label={playing ? "Pause video" : "Play video"}
          onClick={() => runPlayerAction(togglePlay)}
          className={`absolute left-1/2 top-1/2 z-10 flex size-[68px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-2xl transition duration-200 hover:bg-black/80 focus-visible:outline-4 focus-visible:outline-white/80 ${playing ? "pointer-events-none scale-90 opacity-0" : "opacity-100"}`}
        >
          <Play size={34} weight="fill" className="translate-x-0.5" />
        </button>

        <div
          className={`player-chrome ${controlsAreVisible ? "player-chrome--visible" : ""}`}
        >
          <div className="absolute inset-x-3 bottom-3 z-20 text-white sm:inset-x-4">
            <label className="relative block h-3" aria-label="Video position">
              <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
                <span
                  className="block h-full rounded-full bg-[var(--accent)]"
                  style={{
                    width: `${Number.isFinite(progress) ? progress : 0}%`,
                  }}
                />
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={Number.isFinite(progress) ? progress : 0}
                onInput={(event) =>
                  seekToProgress(Number(event.currentTarget.value))
                }
                onChange={(event) =>
                  seekToProgress(Number(event.currentTarget.value))
                }
                className="video-scrubber absolute inset-0 w-full"
              />
            </label>

            <div className="mt-2 flex h-9 items-center gap-1 sm:gap-2">
              <button
                data-player-control
                type="button"
                title={playing ? "Pause (k)" : "Play (k)"}
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => runPlayerAction(togglePlay)}
                className="player-control"
              >
                {playing ? (
                  <Pause size={25} weight="fill" />
                ) : (
                  <Play size={25} weight="fill" />
                )}
              </button>

              <div className="player-volume-group flex items-center">
                <button
                  data-player-control
                  type="button"
                  title={muted ? "Unmute (m)" : "Mute (m)"}
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={() => runPlayerAction(toggleMute)}
                  className="player-control"
                >
                  {muted || volume === 0 ? (
                    <SpeakerSlash size={25} />
                  ) : (
                    <SpeakerHigh size={25} />
                  )}
                </button>
                <input
                  data-player-control
                  aria-label="Volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onInput={(event) =>
                    changeVolume(Number(event.currentTarget.value))
                  }
                  onChange={(event) =>
                    changeVolume(Number(event.currentTarget.value))
                  }
                  className="player-volume-slider"
                />
              </div>

              <span className="ml-0.5 whitespace-nowrap text-xs text-white/85 sm:text-sm">
                {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
              </span>
              <span className="flex-1" />

              <button
                data-player-control
                type="button"
                role="switch"
                aria-checked={autoplay}
                aria-label={`Autoplay ${autoplay ? "on" : "off"}`}
                title={`Autoplay ${autoplay ? "on" : "off"}`}
                onClick={() =>
                  runPlayerAction(() => setAutoplay((current) => !current))
                }
                className="player-control autoplay-control"
              >
                <SwitchVisual checked={autoplay} />
              </button>

              <button
                data-player-control
                type="button"
                title="Subtitles/closed captions (c)"
                aria-label="Toggle captions"
                aria-pressed={captions}
                onClick={() => runPlayerAction(toggleCaptions)}
                className={`player-control ${captions ? "bg-white text-black" : ""}`}
              >
                <ClosedCaptioning size={26} />
              </button>

              <div className="relative">
                <button
                  ref={settingsButtonRef}
                  data-player-control
                  data-settings-button
                  type="button"
                  title="Settings"
                  aria-label="Player settings"
                  aria-expanded={settingsOpen}
                  onClick={() => {
                    setSettingsPage("main");
                    setSettingsOpen((open) => !open);
                  }}
                  className={`player-control ${settingsOpen ? "bg-white/15" : ""}`}
                >
                  <GearSix size={25} />
                </button>

                {settingsOpen && (
                  <div
                    ref={settingsMenuRef}
                    data-player-menu
                    role="menu"
                    aria-label={
                      settingsPage === "speed"
                        ? "Playback speed"
                        : "Player settings"
                    }
                    className="player-menu absolute bottom-12 right-0 w-64 rounded-xl border border-white/15 bg-[#0b0b0b]/90 p-2 text-sm text-white shadow-[0_18px_48px_rgba(0,0,0,.42)] backdrop-blur-[2px]"
                  >
                    {settingsPage === "main" ? (
                      <>
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={ambient}
                          onClick={() => setAmbient((current) => !current)}
                          className="player-menu-row"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Sparkle size={21} />
                            <span>Ambient mode</span>
                          </span>
                          <SwitchVisual checked={ambient} />
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setSettingsPage("speed")}
                          className="player-menu-row"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Gauge size={21} />
                            <span>Playback speed</span>
                          </span>
                          <span className="flex items-center gap-1 text-white/65">
                            {speed}x <CaretRight size={16} />
                          </span>
                        </button>
                        <div
                          className="player-menu-row"
                          aria-label="Quality: Auto"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Monitor size={21} />
                            <span>Quality</span>
                          </span>
                          <span className="text-white/65">Auto</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setSettingsPage("main")}
                          className="player-menu-row justify-start gap-3 border-b border-white/10"
                        >
                          <CaretLeft size={18} />
                          <span className="font-semibold">Playback speed</span>
                        </button>
                        {playbackSpeeds.map((item) => (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={speed === item}
                            key={item}
                            onClick={() => {
                              setPlaybackSpeed(item);
                              setSettingsOpen(false);
                              setSettingsPage("main");
                            }}
                            className={`player-menu-row ${speed === item ? "bg-white/10" : ""}`}
                          >
                            <span>{item === 1 ? "Normal" : `${item}x`}</span>
                            {speed === item && (
                              <Check size={16} weight="bold" />
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                data-player-control
                type="button"
                title="Picture in picture (i)"
                aria-label="Picture in picture"
                onClick={() => runPlayerAction(requestPip)}
                className="player-control player-secondary-control"
              >
                <PictureInPicture size={25} />
              </button>
              <button
                data-player-control
                type="button"
                title={`${theaterMode ? "Default view" : "Theater mode"} (t)`}
                aria-label={
                  theaterMode ? "Exit theater mode" : "Enter theater mode"
                }
                aria-pressed={theaterMode}
                onClick={() => runPlayerAction(onTheaterToggle)}
                className={`player-control player-secondary-control ${theaterMode ? "bg-white text-black" : ""}`}
              >
                <Rectangle
                  size={24}
                  weight={theaterMode ? "fill" : "regular"}
                />
              </button>
              <button
                data-player-control
                type="button"
                title="Fullscreen (f)"
                aria-label="Toggle fullscreen"
                onClick={() => runPlayerAction(requestFullscreen)}
                className="player-control"
              >
                <CornersOut size={25} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
