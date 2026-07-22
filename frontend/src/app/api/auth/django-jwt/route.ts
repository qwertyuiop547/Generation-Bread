import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Server-only bridge: NextAuth Google session → Django JWT.
 * Never expose AUTH_BRIDGE_SECRET / AUTH_SECRET to the browser.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req, secret });

  if (!token?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const bridgeSecret =
    process.env.AUTH_BRIDGE_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";

  if (!bridgeSecret) {
    return NextResponse.json(
      { error: "Auth bridge is not configured." },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/google/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Bridge-Secret": bridgeSecret,
      },
      body: JSON.stringify({
        email: token.email,
        name: (token.name as string) || "",
        image: (token.picture as string) || "",
      }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach auth backend." },
      { status: 502 },
    );
  }
}
