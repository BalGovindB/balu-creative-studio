import { NextResponse, type NextRequest } from "next/server";

/**
 * Shared-password gate for the whole app, including the generated files.
 *
 * Set APP_PASSWORD and the browser shows its own sign-in box - no login screen to build, and
 * the credentials are then sent automatically with the image and video requests the page makes.
 * Leave APP_PASSWORD unset (as in local development) and the gate is off entirely.
 *
 * This is deliberately one shared password, not user accounts: it stops strangers who find the
 * URL from spending the account's generation credits, which is all a prototype needs.
 */
export function middleware(request: NextRequest): NextResponse {
  const expected = process.env.APP_PASSWORD?.trim();
  if (!expected) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      // Any username is accepted; only the password is checked.
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (constantTimeEquals(supplied, expected)) return NextResponse.next();
    } catch {
      // Malformed header - fall through to the challenge below.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Balu Creative Studio", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next.js's own static assets, which carry no data worth protecting.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/** Compares without leaking how much of the password was correct through response timing. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
