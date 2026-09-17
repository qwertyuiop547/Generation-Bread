// Dev-only: suppress Next.js 15 devtools-induced warnings and browser-extension hydration noise.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const NOISE_PATTERNS = [
    // Next.js 15 async params / devtools inspection noise
    "should be unwrapped with `React.use()`",
    "keys of `searchParams` were accessed directly",
    "`params` should be unwrapped with `React.use()`",
    "`searchParams` should be unwrapped with `React.use()`",
    // Browser extension DOM tampering (e.g. Bitdefender TrafficLight, Grammarly, ColorZilla)
    "bis_skin_checked",
    "bis_register",
    "bis_frame_id",
    "data-grammarly",
    "cz-shortcut-listen",
    "M_ID",
    "200.js",
    "executors/200.js",
    "chrome-extension://",
    "chrome-extension",
    "GSAP target",
  ];

  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const fullMessage = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
        try {
          return String(arg);
        } catch {
          return "";
        }
      })
      .join(" ");

    if (NOISE_PATTERNS.some((pattern) => fullMessage.includes(pattern))) {
      return;
    }

    originalError(...args);
  };

  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const fullMessage = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        try {
          return String(arg);
        } catch {
          return "";
        }
      })
      .join(" ");

    if (
      fullMessage.includes("was detected as the Largest Contentful Paint (LCP)") ||
      NOISE_PATTERNS.some((pattern) => fullMessage.includes(pattern))
    ) {
      return;
    }

    originalWarn(...args);
  };

  // Suppress unhandled promise rejections from browser extensions
  // (e.g. IDM 200.js, Cache API failing on chrome-extension:// scheme URLs).
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}\n${reason.stack || ""}`
        : String(reason ?? "");

    if (
      NOISE_PATTERNS.some((pattern) => msg.includes(pattern)) ||
      msg.includes("Request scheme 'chrome-extension' is unsupported") ||
      msg.includes("M_ID")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
  });

  // Suppress uncaught global errors caused by browser extensions injected scripts (e.g. 200.js)
  window.addEventListener(
    "error",
    (event) => {
      const errorStr = `${event.message || ""} ${event.filename || ""} ${
        event.error instanceof Error ? event.error.stack || "" : ""
      }`;

      if (NOISE_PATTERNS.some((pattern) => errorStr.includes(pattern))) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
      }
    },
    true
  );
}


