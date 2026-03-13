# API Reference

All API routes live under `app/api/`. Tenant context (`x-tenant-id` header) is injected by `proxy.ts` for all routes.

---

## 1. Auth

### `GET /api/auth/callback`

| | |
|---|---|
| **Auth** | No (exchanges OAuth code for session) |
| **Description** | OAuth callback handler. Exchanges authorization code from social provider for a Supabase session, then redirects to the appropriate role-based dashboard. |

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `code` | `string` | OAuth authorization code from provider |
| `next` | `string?` | Post-login redirect path (default: `/dashboard/student`) |

**Response:** `302 Redirect` to `/dashboard/{role}` on success, or `/auth/error` on failure.

---

## 2. Stripe -- Student Payments (Connect)

### `POST /api/stripe/create-payment-intent`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Creates a Stripe PaymentIntent via Connect with revenue split (platform fee + transfer to school's connected account). |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `planId` | `number` | One of planId/productId | School subscription plan ID |
| `productId` | `number` | One of planId/productId | One-time product ID |

**Success Response (200):**

| Field | Type |
|-------|------|
| `clientSecret` | `string` |
| `transactionId` | `number` |

**Error Responses:** `400` missing IDs, `401` unauthorized, `404` plan/product/school not found, `500` internal error.

---

### `POST /api/stripe/webhook`

| | |
|---|---|
| **Auth** | Stripe signature (`stripe-signature` header) |
| **Description** | Handles Stripe Connect webhook events for student payments: payment success/failure, refunds, payouts, subscription lifecycle, and account updates. |

**Handled Events:**

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Marks transaction `successful`, triggers enrollment, sends email |
| `payment_intent.payment_failed` | Marks transaction `failed` |
| `charge.refunded` | Marks transaction `refunded`, disables enrollments (full refund) or logs partial refund |
| `payout.paid` | Updates payout record to `paid` |
| `payout.failed` | Updates payout record to `failed` |
| `customer.subscription.deleted` | Expires subscription, triggers enrollment deactivation |
| `invoice.payment_failed` | Marks subscription `past_due` |
| `account.updated` | Syncs Connect account status (charges/payouts enabled) |

**Response:** `{ received: true }` (200) or `400`/`500` on error.

---

### `POST /api/stripe/connect`

| | |
|---|---|
| **Auth** | Yes (`getUser()` + tenant admin check) |
| **Description** | Creates or retrieves a Stripe Connect Standard account for the tenant, then returns an account onboarding link. |

**Request Body:** None.

**Success Response (200):**

| Field | Type |
|-------|------|
| `url` | `string` (Stripe account link URL) |

**Error Responses:** `401` unauthorized, `400` no tenant context, `403` not admin.

---

## 3. Stripe -- Platform Billing

### `POST /api/stripe/checkout-session`

| | |
|---|---|
| **Auth** | Yes (`getUser()` + tenant admin check) |
| **Description** | Creates a Stripe Checkout Session for a school to subscribe to a platform plan (Stripe Billing, not Connect). |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `planId` | `string` | Yes | Platform plan ID |
| `interval` | `string` | No | `monthly` (default) or `yearly` |

**Success Response (200):**

| Field | Type |
|-------|------|
| `url` | `string` (Stripe Checkout URL) |

**Error Responses:** `400` missing plan / free plan / active sub exists / no Stripe price, `401` unauthorized, `403` not admin, `404` plan not found.

---

### `POST /api/stripe/billing-portal`

| | |
|---|---|
| **Auth** | Yes (`getUser()` + tenant admin check) |
| **Description** | Creates a Stripe Billing Portal session for the school admin to manage their platform subscription. |

**Request Body:** None.

**Success Response (200):**

| Field | Type |
|-------|------|
| `url` | `string` (Stripe portal URL) |

**Error Responses:** `400` no billing account, `401` unauthorized, `403` not admin.

---

### `POST /api/stripe/platform-webhook`

| | |
|---|---|
| **Auth** | Stripe signature (`stripe-signature` header, `STRIPE_PLATFORM_WEBHOOK_SECRET`) |
| **Description** | Handles Stripe Billing webhook events for school-to-platform subscriptions. |

**Handled Events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activates platform subscription, updates tenant plan and revenue splits |
| `customer.subscription.updated` | Syncs period/status, handles plan changes via portal (with downgrade limit checks) |
| `customer.subscription.deleted` | Downgrades tenant to free plan, resets revenue split to 10% |
| `invoice.payment_failed` | Marks subscription `past_due`, emails school admins |
| `invoice.paid` | Re-activates subscription after successful retry |

**Response:** `{ received: true }` (200) or `400`/`500` on error.

---

## 4. Certificates

### `GET /api/certificates/[id]`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Returns a certificate as HTML (default) or PDF download (`?format=pdf`). Owner or admin access required. Passes template design_settings (colors, logo, signature) to both HTML and PDF generators. |

**Path Params:** `id` -- certificate UUID.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `format` | `string?` | Set to `pdf` for PDF download; omit for HTML view |

**Success Response:** `text/html` (luxury-styled HTML certificate) or `application/pdf` (PDF with matching design — guilloche pattern, frames, QR code, signature).

**Error Responses:** `401` unauthorized, `403` forbidden (not owner/admin or wrong tenant), `404` not found.

> **Note:** For public/unauthenticated access, use `/api/certificates/view/[code]` instead (by verification code, no auth required).

---

### `POST /api/certificates/generate`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Generates a certificate for the authenticated user if eligible (all lessons completed). Returns existing certificate if already issued. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `courseId` | `number` | Yes | Course to generate certificate for |

**Success Response (200):**

| Field | Type |
|-------|------|
| `certificate` | `object` (full certificate row) |

**Error Responses:** `400` not eligible / no lessons, `401` unauthorized, `403` not enrolled, `404` course not found.

---

### `POST /api/certificates/issue`

| | |
|---|---|
| **Auth** | Yes (`getUser()`; teacher/admin role for issuing to other users) |
| **Description** | Issues a certificate. Supports both student self-serve and teacher-initiated issuance. Sends email notification on success. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `courseId` | `number` | Yes | Course ID |
| `userId` | `string?` | No | Target student ID (teacher-initiated; omit for self-serve) |

**Success Response (200):**

| Field | Type |
|-------|------|
| `success` | `boolean` |
| `certificateId` | `string` |

**Error Responses:** `400` not eligible, `401` unauthorized, `403` not teacher/admin for target user, `404` course not found.

---

### `GET /api/certificates/issue`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Checks certificate eligibility for the authenticated user on a given course. |

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `courseId` | `string` | Course ID to check |

**Success Response (200):**

| Field | Type |
|-------|------|
| `eligible` | `boolean` |
| `completion` | `object` (totalLessons, completedLessons, completionPercentage) |
| `reason` | `string?` |

---

### `POST /api/certificates/share`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Logs a certificate sharing event and increments the share count. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `certificateId` | `string` | Yes | Certificate UUID |
| `platform` | `string` | Yes | Sharing platform (e.g. `linkedin`, `twitter`) |
| `shareUrl` | `string?` | No | URL where certificate was shared |

**Success Response (200):** `{ success: true }`

**Error Responses:** `400` missing fields, `401` unauthorized, `403` wrong tenant, `404` not found or not owner.

---

### `GET /api/certificates/view/[code]`

| | |
|---|---|
| **Auth** | No (public endpoint) |
| **Description** | Renders the certificate as a styled HTML page by verification code. No authentication required — used by the public verification page's "View Certificate" button. Uses `createAdminClient()` to bypass RLS. |

**Path Params:** `code` -- 20-character verification code.

**Success Response (200):** `text/html` — Full luxury-styled HTML certificate with Cormorant Garamond typography, guilloche watermark, template colors/logo/signature, and a "Print / Save as PDF" button.

**Error Responses:**

| Status | Condition |
|--------|-----------|
| `404` | Certificate not found |
| `410` | Certificate revoked |
| `500` | Internal error |

**Cache:** `public, max-age=3600` (1 hour)

### `GET /api/certificates/verify/[code]`

| | |
|---|---|
| **Auth** | No (public endpoint) |
| **Description** | Publicly verifies a certificate by its verification code (JSON API). Rate-limited to 10 requests/minute per IP. |

**Path Params:** `code` -- 20-character verification code.

**Success Response (200):**

| Field | Type |
|-------|------|
| `found` | `boolean` |
| `valid` | `boolean` |
| `certificate` | `object` (id, verification_code, issued_at, user_name, course_name, credential, etc.) |

**Error/Invalid Responses:**

| Status | Condition | Key Fields |
|--------|-----------|------------|
| `404` | Not found | `found: false` |
| `200` | Revoked | `valid: false, revoked: true` |
| `200` | Expired | `valid: false, expired: true` |
| `429` | Rate limited | `error` message |

---

## 5. AI / Chat

### `POST /api/chat/exercises/student`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Streams an AI coach response for a student working on an exercise. Saves messages to `exercise_messages`. Uses AI tools for grading/feedback. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `array` | Yes | Chat message history (AI SDK format) |
| `exerciseId` | `number` | Yes | Exercise ID |

**Success Response:** Streaming `UIMessageStreamResponse` (AI SDK streaming format).

**Error Responses:** `401` unauthorized, `400` missing exerciseId, `404` exercise not found or wrong tenant.

---

### `POST /api/chat/exercises/student/restart`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Deletes all chat messages for an exercise for the current user, resetting the conversation. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `exerciseId` | `number` | Yes | Exercise ID |

**Success Response (200):** `"Restarted successfully"` (plain text).

**Error Responses:** `401` unauthorized, `400` missing exerciseId, `404` exercise not found or wrong tenant.

---

### `POST /api/chat/lesson-task`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Streams an AI tutor response for a student working on a lesson's AI task. Saves messages to `lessons_ai_task_messages`. Uses AI tools for completion tracking. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `array` | Yes | Chat message history (AI SDK format) |
| `lessonId` | `number` | Yes | Lesson ID |

**Success Response:** Streaming `UIMessageStreamResponse`.

**Error Responses:** `401` unauthorized, `400` missing lessonId, `404` lesson not found or wrong tenant.

---

### `POST /api/chat/lesson-task/restart`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Deletes all AI task messages and the lesson completion record for the current user, allowing retry. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lessonId` | `number` | Yes | Lesson ID |

**Success Response (200):** `"Restarted successfully"` (plain text).

**Error Responses:** `401` unauthorized, `400` missing lessonId, `404` lesson not found or wrong tenant.

---

## 6. Teacher

### `POST /api/teacher/exams/[examId]/grade`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | AI-grades a student's exam submission. Free-text questions are graded by AI; multiple-choice/true-false use existing correctness. Saves scores and feedback. |

**Path Params:** `examId` -- exam ID.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `submission_id` | `number` | Yes | Exam submission ID |

**Success Response (200):**

| Field | Type |
|-------|------|
| `success` | `boolean` |
| `score` | `number` (average 0-100) |
| `feedback` | `array` of `{ question, score, feedback }` |

**Error Responses:** `401` unauthorized, `404` exam or submission not found.

---

### `POST /api/teacher/submissions/[submissionId]/override`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Allows a teacher to override the AI grade for an exam submission with manual scores, feedback, and per-question corrections. |

**Path Params:** `submissionId` -- submission ID.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `score` | `number` | Yes | Override score (0-100) |
| `feedback` | `string` | Yes | Overall feedback |
| `teacher_notes` | `string?` | No | Internal teacher notes |
| `question_overrides` | `array?` | No | Per-question overrides: `{ question_id, is_correct, feedback }` |

**Success Response (200):** `{ success: true }`

**Error Responses:** `401` unauthorized, `404` submission not found or wrong tenant.

---

### `POST /api/teacher/preview/exercise`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Streams an AI coach response in preview mode (no database saves, no tools). For teachers to test exercise prompts before publishing. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instructions` | `string` | Yes | Exercise instructions |
| `system_prompt` | `string` | Yes | System prompt to preview |
| `messages` | `array` | Yes | Chat message history |

**Success Response:** Streaming `UIMessageStreamResponse`.

---

### `POST /api/teacher/preview/lesson-task`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Streams an AI tutor response in preview mode (no database saves). For teachers to test lesson task prompts. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instructions` | `string` | Yes | Task description |
| `system_prompt` | `string` | Yes | System prompt to preview |
| `messages` | `array` | Yes | Chat message history |

**Success Response:** Streaming `UIMessageStreamResponse`.

---

### `GET /api/teacher/templates`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Lists prompt templates for the current teacher (own templates + system templates) within the tenant. |

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `category` | `string?` | Filter by category (e.g. `lesson_task`) |
| `search` | `string?` | Search by name (case-insensitive partial match) |

**Success Response (200):** Array of `prompt_templates` rows.

---

### `POST /api/teacher/templates`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Creates a new prompt template owned by the authenticated teacher. |

**Request Body:** `prompt_templates` fields (name, category, content, etc.). `created_by` and `is_system` are set automatically.

**Success Response (200):** Created `prompt_templates` row.

---

### `PUT /api/teacher/templates/[id]`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Updates a prompt template. Only the creator can update their own templates. |

**Path Params:** `id` -- template ID.

**Request Body:** Fields to update (partial `prompt_templates` row).

**Success Response (200):** Updated `prompt_templates` row.

---

### `DELETE /api/teacher/templates/[id]`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Deletes a prompt template. Only the creator can delete their own templates. |

**Path Params:** `id` -- template ID.

**Success Response:** `204 No Content`.

---

## 7. Other

### `GET /api/cron/expire-subscriptions`

| | |
|---|---|
| **Auth** | Bearer token (`CRON_SECRET` env var) |
| **Description** | Cron job that finds active subscriptions past their billing period end and marks them as `expired`. DB trigger automatically disables linked enrollments. |

**Headers:** `Authorization: Bearer <CRON_SECRET>`

**Success Response (200):**

| Field | Type |
|-------|------|
| `expired` | `number` (count of expired subscriptions) |
| `ids` | `array?` (subscription IDs) |

**Error Responses:** `401` invalid secret, `500` query/update error.

---

### `GET /api/invoices/[invoiceNumber]`

| | |
|---|---|
| **Auth** | Yes (`getUser()`) |
| **Description** | Generates and returns an HTML invoice for a payment request. Accessible by the student who owns it or an admin. |

**Path Params:** `invoiceNumber` -- invoice number string.

**Success Response:** `text/html` (rendered invoice HTML).

**Error Responses:** `401` unauthorized, `403` not owner and not admin / wrong tenant, `404` invoice not found.

---

### `POST /api/mcp`

| | |
|---|---|
| **Auth** | Yes (`getUser()` + teacher/admin role via `getUserRole()`) |
| **Description** | MCP (Model Context Protocol) proxy for browser-based clients. Forwards JSON-RPC 2.0 requests to the internal MCP server. Rate-limited to 100 req/min per user. |

**Request Body:** JSON-RPC 2.0 object (`jsonrpc`, `method`, `params`, `id`).

**Success Response (200):** JSON-RPC 2.0 response from MCP server.

**Error Responses:** `401` not logged in, `403` not teacher/admin, `429` rate limited, `400` invalid JSON-RPC, `502` MCP server error.

---

### `POST /api/mcp/cli`

| | |
|---|---|
| **Auth** | Bearer token (MCP API token validated via `validate_mcp_api_token` RPC) |
| **Description** | MCP proxy for CLI tools (e.g. OpenCode). Same as `/api/mcp` but uses API token auth instead of session cookies. Rate-limited to 100 req/min per user. |

**Headers:** `Authorization: Bearer <mcp_api_token>`

**Request Body:** JSON-RPC 2.0 object.

**Success Response (200):** JSON-RPC 2.0 response from MCP server.

**Error Responses:** `401` invalid/expired token, `403` not teacher/admin, `429` rate limited, `400` invalid JSON-RPC, `502` MCP server error.

---

### `OPTIONS /api/mcp` and `OPTIONS /api/mcp/cli`

| | |
|---|---|
| **Auth** | No |
| **Description** | CORS preflight handlers. Returns `204` with appropriate CORS headers. |

---

### `POST /api/oauth/decision`

| | |
|---|---|
| **Auth** | Yes (`getUser()` + teacher/admin role) |
| **Description** | Approves or denies an OAuth authorization request for MCP access. |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `authorization_id` | `string` | Yes | OAuth authorization request ID |
| `decision` | `string` | Yes | `approve` or `deny` |

**Success Response (200):**

| Field | Type |
|-------|------|
| `redirect_to` | `string` (OAuth redirect URL) |

**Error Responses:** `400` missing fields / invalid decision, `401` not authenticated, `403` not teacher/admin.

---

### `POST /api/seed-test-data`

| | |
|---|---|
| **Auth** | No (blocked in production via `NODE_ENV` check) |
| **Description** | Development-only endpoint that seeds test data: creates a product, enrollments, lesson completions, and exam submissions for `student@test.com`. |

**Request Body:** None.

**Success Response (200):**

| Field | Type |
|-------|------|
| `success` | `boolean` |
| `message` | `string` |
| `summary` | `object` (studentUserId, counts, expectedProgress) |

**Error Responses:** `403` production environment, `404` test user not found, `500` seeding error.
