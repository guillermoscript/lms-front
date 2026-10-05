# LMS MCP setup and troubleshooting

The server uses mcp-use 2.7.3, Streamable HTTP, and Supabase OAuth 2.1. Clients
sign in through Supabase; the MCP server verifies their access tokens and
queries the database with the caller's token so RLS enforces tenant access.
The Next.js app proxies the server at `/api/mcp`.

## Configure the standalone MCP server

From the repository root:

```bash
cd mcp-server
npm ci
cp .env.example .env
```

Set a URL and a **public API key from the same Supabase project** in `.env`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_PROJECT_KEY
PORT=3001
MCP_URL=http://localhost:3001
```

For hosted Supabase, `SUPABASE_PROJECT_ID` can replace `SUPABASE_URL`. For local
or self-hosted Supabase, use the gateway URL and the public API key actually
registered by that gateway. A legacy JWT **anon** key is also supported through
`SUPABASE_ANON_KEY`. A cloud publishable key is not interchangeable with a
local project's key.

The first nonblank variable wins, with surrounding whitespace removed:

| Setting | Resolution order |
| --- | --- |
| URL | `MCP_USE_OAUTH_SUPABASE_URL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`; otherwise project ID below |
| Project ID | `MCP_USE_OAUTH_SUPABASE_PROJECT_ID`, `SUPABASE_PROJECT_ID` |
| Public key | `MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

The standalone process reads `mcp-server/.env`, not the app's `.env.local`.
Deployment environment variables take precedence over `.env` entries. Set them
on the **MCP service** as well as the Next.js service when deploying separately.
Never use a secret key, service-role key, or user's access token as the public
API key. `SUPABASE_SERVICE_ROLE_KEY` is optional and reserved for audit logging.

Only projects still issuing HS256 access tokens need
`MCP_USE_OAUTH_SUPABASE_JWT_SECRET` / `SUPABASE_JWT_SECRET`. Leave it unset for
ES256 tokens: passing this secret selects HS256 verification instead of JWKS.

Check the key, then start the server:

```bash
npm run check:connection
npm run dev
```

The connection check makes one read-only request to `/auth/v1/settings` using
the public key. It prints no keys or upstream response bodies. It proves
gateway acceptance, not user authorization, tenant claims, or RLS access.
Run this command from the source checkout after `npm ci`, with the same
environment as the deployed MCP service; it is not included in the runtime
Docker image.

## Configure Supabase OAuth

In Supabase Dashboard → Authentication → OAuth Server:

1. Enable OAuth 2.1 and Dynamic OAuth Apps.
2. Configure the consent screen URL:
   - Standalone: `http://localhost:3001/auth/consent`.
   - Through the LMS app: `https://<platform-domain>/oauth/consent`.
3. Enable the appropriate sign-in method for your accounts.
4. Ensure access tokens include `tenant_id` and `tenant_role`, populated by
   the LMS access-token hook. The server recognizes student, teacher, and
   admin roles and exposes each role's permitted tools.

## Configure the Next.js proxy

In the app's `.env.local` for development, or its deployment environment:

```dotenv
# Internal listener, reachable from the Next.js process/container
MCP_SERVER_URL=http://127.0.0.1:3001
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=sb_publishable_REPLACE_WITH_PROJECT_KEY
```

In production, set `MCP_URL` on the MCP service to its externally visible
proxied base, such as `https://<tenant>.<platform-domain>/api/mcp`. The app's
`MCP_SERVER_URL` instead points to the internal MCP container (for example,
`http://<mcp-service>:3000`). Set `HOST=0.0.0.0` in containers; the Dockerfile
already does this. Configure both services against the same Supabase project.

## Connect and verify

Add the MCP endpoint in the client's connector settings and complete OAuth:

- Standalone: `http://localhost:3001/mcp` (a client on this machine).
- Production: `https://<tenant>.<platform-domain>/api/mcp`.

Use OAuth with the current server. The historical `/api/mcp/cli` route forwards
legacy identity headers without an OAuth bearer token; those headers do not
authenticate against this server. Older instructions using `/mcp/lms`,
`npm run start:http`, `HTTP_PROXY_AUTH`, or a shared proxy secret describe the
retired server implementation.

From `mcp-server`, the mcp-use CLI can drive the same endpoint:

```bash
npx mcp-use client connect dev http://localhost:3001/mcp
npx mcp-use client dev tools list
npx mcp-use client dev tools call lms_list_courses limit=1
npx mcp-use screenshot --server dev --tool lms_list_courses limit=1
```

Sign in as a teacher or admin to call `lms_list_courses`. Students should use
`lms_my_learning`. Confirm an expected course is returned and the View renders.
A successful discovery response alone does not prove database access.

## “Unregistered API key” / “Invalid API key”

If `lms_list_courses` returns `Listing courses: Unregistered API key`, the
request reached the tool but Supabase's gateway rejected the public key used
by the MCP server. OAuth token verification and gateway API-key validation are
separate checks. Reconnecting OAuth or changing `limit` cannot repair this key.

1. Check the MCP service's URL and the key from **that project's** API settings.
   A revoked key or a key belonging to a different project fails.
2. Check higher-priority `MCP_USE_OAUTH_SUPABASE_*` values. Updating a fallback
   such as `SUPABASE_ANON_KEY` has no effect while an old override remains set.
3. Replace the incorrect key in the MCP service's environment with its current
   public key. For self-hosted Supabase, use a key registered in its gateway.
4. Restart/redeploy the MCP service so it reads the changed environment.
5. Run `npm run check:connection` with that environment, then repeat the
   authenticated `lms_list_courses` call.

The updated tool error labels this as `UPSTREAM_CONFIGURATION_ERROR` instead
of suggesting invalid tool arguments. Missing or privileged public credentials
are also rejected at server startup.

Other failures:

- **401 before a tool runs:** inspect OAuth discovery, token issuer, signing
  algorithm, and expiry.
- **Tenant context missing:** check the token hook and refresh the session.
- **Empty results:** check tenant claims, ownership, and RLS using the intended
  user role. Do not bypass RLS to make results appear.
- **Proxy 502:** verify `MCP_SERVER_URL`, container networking, and the listener.

## Build and test

```bash
cd mcp-server
npm test
npm run typecheck
npm run build
npm start
```

The build needs URL/public-key-shaped environment values when importing the
server entry. The Dockerfile supplies build-only placeholders; the running
container requires its actual project URL and public key. The container health
check validates discovery availability; use the connection check and a real
tool call to validate Supabase access.

The Docker build includes the shared core package:

```bash
docker build --build-context core=../packages/core -t lms-mcp-server .
docker run --env-file .env -p 3001:3000 -e PORT=3000 lms-mcp-server
```

## References

- [mcp-use v2 welcome](https://docs.mcp-use.com/v2/typescript/getting-started/welcome)
- [Supabase OAuth provider and request-scoped RLS clients](https://docs.mcp-use.com/v2/typescript/server/authentication/providers/supabase)
- [mcp-use CLI client](https://docs.mcp-use.com/v2/typescript/tooling/client-cli)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Server implementation](../mcp-server/README.md)
