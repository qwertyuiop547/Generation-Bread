export const SMOOTH_SCROLLER = "#smooth-wrapper";

export const smoothScroll = {
  scroller: SMOOTH_SCROLLER,
  invalidateOnRefresh: true,
} as const;

/**
 * Prefer this inside useGSAP({ scope }) — string selectors like "#smooth-wrapper"
 * are scoped to the section and resolve to undefined (ancestor, not descendant).
 */
export function smoothScrollVars(fromEl?: Element | null) {
  const scroller =
    (fromEl?.closest?.(SMOOTH_SCROLLER) as Element | null) ??
    (typeof document !== "undefined" ? document.querySelector(SMOOTH_SCROLLER) : null);

  return {
    invalidateOnRefresh: true as const,
    ...(scroller ? { scroller } : {}),
  };
}
