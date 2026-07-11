function isBenignPlayError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NotAllowedError")
  );
}

/** Attach lazy `data-src` to `src` once (avoids loading all testimonial clips at once). */
export function ensureVideoSource(video: HTMLVideoElement | null | undefined): boolean {
  if (!video) return false;

  const dataSrc = video.dataset.src;
  if (dataSrc && !video.getAttribute("src")) {
    video.src = dataSrc;
  }

  return Boolean(video.src || dataSrc);
}

/** Play a muted/inline video without surfacing AbortError from play/pause races. */
export function safePlay(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  if (!ensureVideoSource(video)) return;

  const playPromise = video.play();
  if (playPromise === undefined) return;

  playPromise.catch((error) => {
    if (!isBenignPlayError(error)) {
      console.debug("Video play failed:", error);
    }
  });
}

export function safePause(video: HTMLVideoElement | null | undefined): void {
  if (!video || video.paused) return;
  video.pause();
}
