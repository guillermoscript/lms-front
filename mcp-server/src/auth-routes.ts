/**
 * Supabase OAuth 2.1 consent UI — mounted on the MCP server's Hono app.
 *
 * HOW IT FITS IN:
 *   Supabase hosts /authorize, /token, /register, and .well-known discovery on
 *   its own infrastructure. This module hosts only the consent UI that Supabase
 *   redirects users to when an OAuth client requests authorization.
 *
 * SETUP (required once):
 *   1. Supabase Dashboard → Authentication → OAuth Server
 *      Set "Consent screen URL" to:  <your server base URL>/auth/consent
 *      Supabase appends ?authorization_id=<uuid> before redirecting.
 *   2. Authentication → Sign In / Providers
 *      Enable "Email" (for real teacher/admin accounts) and optionally
 *      "Anonymous" sign-ins for quick demos.
 *
 * ROUTES:
 *   GET  /auth/consent?authorization_id=<uuid>
 *        Renders sign-in page (no session) or consent page (authenticated).
 *   POST /auth/signin
 *        Signs in with email+password. Sets session cookie. Responds JSON.
 *   POST /auth/signin/anonymous
 *        Signs in anonymously. Sets session cookie. Responds JSON.
 *   POST /auth/consent?authorization_id=<uuid>
 *        Body: { approve: boolean }
 *        Submits the decision to Supabase; returns { redirect_url } JSON.
 *        The browser-side JS performs the final navigation to redirect_url.
 *
 * SDK CALLS USED:
 *   supabase.auth.setSession(stored)                   — restore session from cookie
 *   supabase.auth.signInWithPassword({ email, pass })  — email sign-in
 *   supabase.auth.signInAnonymously()                  — anonymous sign-in
 *   supabase.auth.oauth.getAuthorizationDetails(id)    — load pending authorization
 *   supabase.auth.oauth.approveAuthorization(id, opts) — approve + get redirect_url
 *   supabase.auth.oauth.denyAuthorization(id, opts)    — deny + get redirect_url
 *
 * SOURCE:
 *   Faithfully adapted from the official mcp-use example:
 *   https://github.com/mcp-use/mcp-use/tree/main/libraries/typescript/packages/mcp-use/examples/server/oauth/supabase/src/auth-routes.ts
 *   Differences from the original:
 *   - Uses @supabase/supabase-js directly (no @supabase/ssr) — keeps deps minimal
 *   - Supports email+password sign-in in addition to anonymous (LMS users are real teachers/admins)
 *   - LMS purple accent (#7c3aed) instead of Supabase green (#3ecf8e)
 *   - Light/dark-friendly palette via CSS color-scheme
 *   - getSupabaseUrl() / getPublishableKey() from ./env.js instead of raw env vars
 *   - Exported as installAuthRoutes(server) per the requested API
 */

import type { MCPServer } from "mcp-use/server";
import {
  createClient,
  type OAuthAuthorizationDetails,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getSupabaseUrl, getPublishableKey } from "./env.js";

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "sb-mcp-session";
const SESSION_MAX_AGE = 600; // 10 minutes — just long enough to finish consent

interface StoredSession {
  access_token: string;
  refresh_token: string;
}

function parseSessionCookie(cookieHeader: string | undefined): StoredSession | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as StoredSession;
  } catch {
    return null;
  }
}

function serializeSessionCookie(session: StoredSession): string {
  const value = encodeURIComponent(JSON.stringify(session));
  // HttpOnly: JS on consent page cannot read token (only used by POST handler)
  // SameSite=Lax: safe for same-site navigations triggered by OAuth redirect
  // Path=/auth: scoped so it isn't sent outside the /auth/* routes
  return `${SESSION_COOKIE}=${value}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---------------------------------------------------------------------------
// Supabase client factory (per-request, no persistent session)
// ---------------------------------------------------------------------------

function makeSupabaseClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getPublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c
  );
}

/**
 * Common CSS — purple LMS brand accent, light/dark via color-scheme.
 * Minimal: enough for a clear, accessible consent UI.
 */
function commonCss(): string {
  return /* css */ `
    :root {
      color-scheme: light dark;
      --accent:   #7c3aed;
      --accent-h: #6d28d9;
      --bg:       #f5f4f8;
      --card-bg:  #ffffff;
      --text:     #1a1523;
      --muted:    #6b7280;
      --border:   #e5e7eb;
      --error:    #dc2626;
      --deny-bg:  #f3f4f6;
      --deny-h:   #e5e7eb;
      --deny-txt: #374151;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg:       #0f0d14;
        --card-bg:  #1c1827;
        --text:     #f3f0ff;
        --muted:    #9ca3af;
        --border:   #2d2640;
        --deny-bg:  #2d2640;
        --deny-h:   #3b3256;
        --deny-txt: #d1d5db;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: var(--card-bg);
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
      width: 100%;
      max-width: 420px;
      border: 1px solid var(--border);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: .5rem;
      margin-bottom: 1.5rem;
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--accent);
    }
    .logo svg { flex-shrink: 0; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: .5rem; }
    p  { color: var(--muted); font-size: .95rem; margin-bottom: 1.25rem; }
    label { display: block; font-size: .875rem; font-weight: 500; margin-bottom: .375rem; }
    input {
      width: 100%;
      padding: .625rem .75rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: .95rem;
      background: var(--card-bg);
      color: var(--text);
      margin-bottom: 1rem;
      outline-offset: 2px;
    }
    input:focus { outline: 2px solid var(--accent); }
    .buttons { display: flex; gap: .75rem; margin-top: 1.25rem; }
    button {
      flex: 1;
      padding: .625rem 1.25rem;
      border: none;
      border-radius: 8px;
      font-size: .95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background .15s;
    }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-h); }
    .btn-deny { background: var(--deny-bg); color: var(--deny-txt); }
    .btn-deny:hover:not(:disabled) { background: var(--deny-h); }
    .divider { text-align: center; color: var(--muted); font-size: .8rem; margin: 1rem 0; }
    .scopes { list-style: none; margin-bottom: 1rem; }
    .scopes li {
      padding: .5rem 0;
      border-bottom: 1px solid var(--border);
      font-size: .9rem;
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .scopes li:last-child { border-bottom: none; }
    .scopes li::before { content: "✓"; color: var(--accent); font-weight: 700; }
    .client-name { font-weight: 600; color: var(--text); }
    .error-msg {
      margin-top: .75rem;
      font-size: .85rem;
      color: var(--error);
      min-height: 1.2em;
    }
    .footer { margin-top: 1.25rem; font-size: .8rem; color: var(--muted); text-align: center; }
  `;
}

/** LMS wordmark SVG — purple gradient "L" cap */
function lmsLogo(): string {
  return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="28" height="28" rx="7" fill="#7c3aed"/>
    <path d="M8 7h4v10h6v3H8V7z" fill="white"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// HTML page renderers
// ---------------------------------------------------------------------------

function renderSignInPage(authorizationId: string): string {
  const aidEncoded = encodeURIComponent(authorizationId);
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in — LMS MCP</title>
  <style>${commonCss()}</style>
</head>
<body>
  <div class="card">
    <div class="logo">${lmsLogo()} LMS</div>
    <h1>Sign in to continue</h1>
    <p>An application is requesting access to your LMS account. Sign in to review the request.</p>

    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email" placeholder="you@school.com" />

    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />

    <button class="btn-primary" id="signin-btn" onclick="signIn()">Sign in</button>

    <div class="divider">or</div>

    <button class="btn-deny" style="width:100%" onclick="signInAnonymous()">Continue as guest</button>

    <div class="error-msg" id="msg" role="alert"></div>

    <div class="footer">
      This consent page is hosted by the LMS MCP server.<br />
      The authorization request was initiated by Supabase OAuth.
    </div>
  </div>

  <script>
    var AUTH_ID = ${JSON.stringify(authorizationId)};
    var AID_ENCODED = ${JSON.stringify(aidEncoded)};

    function setMsg(text) {
      document.getElementById('msg').textContent = text || '';
    }

    function setLoading(loading) {
      document.querySelectorAll('button, input').forEach(function(el) {
        el.disabled = loading;
      });
    }

    async function signIn() {
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      if (!email || !password) { setMsg('Please enter your email and password.'); return; }
      setLoading(true);
      setMsg('');
      try {
        var res = await fetch('/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password }),
          credentials: 'include',
        });
        var data = await res.json();
        if (data.ok) {
          window.location.href = '/auth/consent?authorization_id=' + AID_ENCODED;
        } else {
          setMsg(data.error || 'Sign-in failed. Please check your credentials.');
          setLoading(false);
        }
      } catch (err) {
        setMsg('Network error. Please try again.');
        setLoading(false);
      }
    }

    async function signInAnonymous() {
      setLoading(true);
      setMsg('');
      try {
        var res = await fetch('/auth/signin/anonymous', {
          method: 'POST',
          credentials: 'include',
        });
        var data = await res.json();
        if (data.ok) {
          window.location.href = '/auth/consent?authorization_id=' + AID_ENCODED;
        } else {
          setMsg(data.error || 'Anonymous sign-in failed. Enable it in the Supabase dashboard.');
          setLoading(false);
        }
      } catch (err) {
        setMsg('Network error. Please try again.');
        setLoading(false);
      }
    }

    // Allow Enter key to submit
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') signIn();
    });
  </script>
</body>
</html>`;
}

function renderConsentPage(
  authorizationId: string,
  details: OAuthAuthorizationDetails
): string {
  const aidEncoded = encodeURIComponent(authorizationId);

  // details.client may not exist in all Supabase SDK versions — guard defensively
  const clientDetails = (details as unknown as { client?: { name?: string; uri?: string } }).client;
  const clientName = escapeHtml(clientDetails?.name || "An application");
  const clientUri = clientDetails?.uri ? escapeHtml(clientDetails.uri) : null;

  const rawScope = (details as unknown as { scope?: string }).scope ?? "";
  const scopes = rawScope
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean);

  const scopeListHtml = scopes.length
    ? scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
    : "<li>No specific scopes requested</li>";

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize — LMS MCP</title>
  <style>${commonCss()}</style>
</head>
<body>
  <div class="card">
    <div class="logo">${lmsLogo()} LMS</div>
    <h1>Authorize Application</h1>
    <p>
      ${clientUri
        ? `<a href="${clientUri}" target="_blank" rel="noopener noreferrer" class="client-name">${clientName}</a>`
        : `<span class="client-name">${clientName}</span>`
      }
      is requesting access to your LMS account with the following permissions:
    </p>

    <ul class="scopes">
      ${scopeListHtml}
    </ul>

    <div class="buttons">
      <button class="btn-deny" data-action="deny" onclick="decide(false)">Deny</button>
      <button class="btn-primary" data-action="approve" onclick="decide(true)">Allow</button>
    </div>

    <div class="error-msg" id="consent-error" role="alert"></div>

    <div class="footer">
      Approving grants <strong>${clientName}</strong> access to your LMS data.<br />
      You can revoke access at any time from your account settings.
    </div>
  </div>

  <script>
    var AUTH_ID = ${JSON.stringify(authorizationId)};
    var AID_ENCODED = ${JSON.stringify(aidEncoded)};

    function setMsg(text) {
      document.getElementById('consent-error').textContent = text || '';
    }

    async function decide(approve) {
      var buttons = document.querySelectorAll('button');
      buttons.forEach(function(b) { b.disabled = true; });
      setMsg('');

      try {
        var res = await fetch('/auth/consent?authorization_id=' + AID_ENCODED, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ approve: approve }),
        });
        var data = await res.json();
        if (data && data.redirect_url) {
          window.location.href = data.redirect_url;
        } else {
          throw new Error((data && data.error) || 'Consent submission failed.');
        }
      } catch (err) {
        setMsg(String((err && err.message) || err));
        buttons.forEach(function(b) { b.disabled = false; });
      }
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount the Supabase OAuth consent routes on the MCP server's Hono app.
 *
 * Call this in your server entry point after creating the MCPServer instance,
 * before calling server.listen():
 *
 *   import { installAuthRoutes } from "./src/auth-routes.js";
 *   installAuthRoutes(server);
 *
 * Then configure the consent screen URL in the Supabase Dashboard:
 *   Authentication → OAuth Server → Consent screen URL
 *   → <your server base URL>/auth/consent
 */
export function installAuthRoutes(server: MCPServer): void {
  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getPublishableKey();

  // -------------------------------------------------------------------------
  // GET /auth/consent?authorization_id=<uuid>
  //
  // ** Configure this URL in Supabase Dashboard → Authentication → OAuth Server **
  //
  // Flow:
  //   1. Check for a session cookie.
  //   2. No session → render sign-in page.
  //   3. Session found → restore it with supabase.auth.setSession().
  //   4. Load authorization details via supabase.auth.oauth.getAuthorizationDetails().
  //   5. If Supabase already has consent recorded (returns redirect_url directly) → 302.
  //   6. Otherwise → render the approve/deny consent page.
  // -------------------------------------------------------------------------
  server.app.get("/auth/consent", async (c) => {
    const authorizationId = new URL(c.req.url).searchParams.get("authorization_id");
    if (!authorizationId) {
      return c.text("Missing authorization_id query parameter.", 400);
    }

    const session = parseSessionCookie(c.req.header("Cookie"));

    // Not signed in yet — show sign-in form.
    if (!session) {
      return c.html(renderSignInPage(authorizationId));
    }

    // Restore session from cookie.
    const supabase: SupabaseClient = makeSupabaseClient();
    const { error: sessionError } = await supabase.auth.setSession(session);
    if (sessionError) {
      // Session expired or invalid — clear cookie and show sign-in.
      c.header("Set-Cookie", clearSessionCookie());
      return c.html(renderSignInPage(authorizationId));
    }

    // Load the pending authorization from Supabase.
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !data) {
      const msg = error?.message ?? "Unknown error";
      return c.text(`Failed to load authorization details: ${msg}`, 500);
    }

    // Supabase short-circuits when the user already consented — redirect immediately.
    if ("redirect_url" in data && data.redirect_url) {
      return c.redirect(data.redirect_url as string, 302);
    }

    return c.html(renderConsentPage(authorizationId, data as OAuthAuthorizationDetails));
  });

  // -------------------------------------------------------------------------
  // POST /auth/signin
  //   Body: { email: string; password: string }
  //   Response: { ok: true } | { error: string }
  //
  // Signs in with Supabase email+password and stores the session in an
  // HttpOnly cookie for use by the consent POST handler.
  // -------------------------------------------------------------------------
  server.app.post("/auth/signin", async (c) => {
    let email: string;
    let password: string;
    try {
      const body = await c.req.json<{ email: string; password: string }>();
      email = body.email;
      password = body.password;
    } catch {
      return c.json({ error: "Invalid request body." }, 400);
    }

    if (!email || !password) {
      return c.json({ error: "email and password are required." }, 400);
    }

    const supabase = makeSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return c.json({ error: error?.message ?? "Sign-in failed." }, 401);
    }

    c.header(
      "Set-Cookie",
      serializeSessionCookie({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
    );

    return c.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // POST /auth/signin/anonymous
  //   Response: { ok: true } | { error: string }
  //
  // Signs in anonymously. Useful for demos / zero-setup clients.
  // Requires "Anonymous sign-ins" to be enabled in the Supabase dashboard:
  //   Authentication → Providers → Anonymous
  // -------------------------------------------------------------------------
  server.app.post("/auth/signin/anonymous", async (c) => {
    const supabase = makeSupabaseClient();
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error || !data.session) {
      return c.json(
        { error: error?.message ?? "Anonymous sign-in failed. Enable anonymous sign-ins in the Supabase dashboard." },
        500
      );
    }

    c.header(
      "Set-Cookie",
      serializeSessionCookie({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
    );

    return c.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // POST /auth/consent?authorization_id=<uuid>
  //   Body: { approve: boolean }
  //   Response: { redirect_url: string } | { error: string }
  //
  // Restores the session from cookie, then calls:
  //   supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
  //   supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
  //
  // `skipBrowserRedirect: true` prevents the SDK from redirecting the (non-
  // existent) server-side browser — we return redirect_url to the client JS
  // which performs window.location.href navigation.
  // -------------------------------------------------------------------------
  server.app.post("/auth/consent", async (c) => {
    const authorizationId = new URL(c.req.url).searchParams.get("authorization_id");
    if (!authorizationId) {
      return c.json({ error: "Missing authorization_id." }, 400);
    }

    let approve: boolean;
    try {
      const body = await c.req.json<{ approve: boolean }>();
      approve = body.approve;
    } catch {
      return c.json({ error: "Invalid request body." }, 400);
    }

    const session = parseSessionCookie(c.req.header("Cookie"));
    if (!session) {
      return c.json({ error: "not_authenticated" }, 401);
    }

    const supabase = makeSupabaseClient();
    const { error: sessionError } = await supabase.auth.setSession(session);
    if (sessionError) {
      return c.json({ error: "Session expired. Please sign in again." }, 401);
    }

    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });

    if (error || !data) {
      return c.json({ error: error?.message ?? "Consent submission failed." }, 500);
    }

    // Clear the short-lived consent session cookie now that we're done.
    c.header("Set-Cookie", clearSessionCookie());

    return c.json({ redirect_url: (data as { redirect_url: string }).redirect_url });
  });

  // Log mounted routes for easier debugging during setup.
  console.log(
    "[auth-routes] Mounted: GET /auth/consent, POST /auth/signin, POST /auth/signin/anonymous, POST /auth/consent"
  );
  console.log(
    "[auth-routes] Configure consent URL in Supabase Dashboard → Authentication → OAuth Server → Consent screen URL: <base_url>/auth/consent"
  );
}
