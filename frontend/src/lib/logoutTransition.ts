export const LOGOUT_GOODBYE_KEY = "gb_logout_goodbye";

export function markLogoutGoodbye() {
  try {
    sessionStorage.setItem(LOGOUT_GOODBYE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Read-and-clear flag set right before logout redirect. */
export function consumeLogoutGoodbye(): boolean {
  try {
    if (sessionStorage.getItem(LOGOUT_GOODBYE_KEY) === "1") {
      sessionStorage.removeItem(LOGOUT_GOODBYE_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function clearAuthStorage() {
  localStorage.removeItem("spylt_user");
  localStorage.removeItem("spylt_access_token");
  localStorage.removeItem("spylt_refresh_token");
}

export async function performLogout(
  // next-auth signOut has overloaded signatures; keep this loose on purpose
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signOut: (options?: any) => Promise<any>
) {
  markLogoutGoodbye();
  clearAuthStorage();
  await signOut({ redirect: false });
  window.location.href = "/";
}
