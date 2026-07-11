// Dev-only: suppress Next.js 15 devtools-induced warnings.
// In Next.js 15, page `params` and `searchParams` are async proxies. The
// React/Next.js DevTools component inspector enumerates their keys to render
// the Components panel, which trips the "sync-dynamic-apis" warning even
// though app code never accesses them. Filter only these exact messages so
// real errors still surface.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const NOISE = [
    "should be unwrapped with `React.use()`",
    "keys of `searchParams` were accessed directly",
    "`params` should be unwrapped with `React.use()`",
    "`searchParams` should be unwrapped with `React.use()`",
  ];

  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.find((arg) => typeof arg === "string") ?? "";
    if (typeof message === "string" && NOISE.some((n) => message.includes(n))) {
      return;
    }
    originalError(...args);
  };
}
