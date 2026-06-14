# Mobile App Strategy (iOS / Android)

> Status: **Strategy / planning doc** — no mobile code exists yet. Captures how a
> multi-tenant white-label LMS like ours should approach native mobile, and how
> the major competitors actually do it. Written 2026-05-29.

## The core problem

On **web**, multi-tenancy is free: every school is just a subdomain pointing at
one codebase, and `proxy.ts` resolves the tenant from the host header.

The **app stores have no concept of a subdomain.** There is a binary with one
name, one icon, one identity. So we have to *choose* how tenant identity maps
onto an installable app. That choice is the whole decision.

Good news: our backend is already mobile-ready. `tenant_id` lives in the JWT
(`custom_access_token_hook`), RLS enforces isolation, and Supabase has native
mobile SDKs. A mobile app is **just another client** hitting the same Supabase +
API routes — no second backend, no isolation rework.

---

## The models (and who uses each)

### Model 1 — Single branded "platform" container app  ← recommended start
One app in the stores, named after **our** platform. Student installs once, logs
in, and the app re-skins to the tenant's logo/colors after login. Tenant is
resolved from the user's JWT (`tenant_id`) or a first-launch school-picker.

- **Who:** Teachable, Thinkific, Podia, Circle (base tier), Mighty Networks (base app).
- **Pros:** one codebase, one listing we control, fast updates, trivial given our
  tenant-in-JWT + RLS model.
- **Cons:** creator's brand is secondary — students see *our* brand in the store.

### Model 2 — White-label branded app per tenant (premium tier)
Generate a **custom build** per premium school with their name/icon/splash and
`tenant_id` baked in at build time (no school-picker; launches straight into
their tenant). Same codebase, build-time config only.

- **Who:** Kajabi ("Branded Mobile App" add-on), Disco, Uscreen, Passion.io,
  Mighty Networks (higher tiers).
- **Publishing sub-models:**
  - Under **our** developer account — simpler for creator, heavy Apple scrutiny.
  - Under the **creator's own** developer account ($99/yr Apple fee) — Apple now
    prefers/requires this for white-label cases.
- **Cons:** per-app store review, per-app update submissions, and **Apple
  Guideline 4.3 (spam/duplicate apps)** rejects cookie-cutter clones. You cannot
  naively "let everyone ship a clone" — Apple's white-label provider guidance is
  the sanctioned path.

### Model 3 — PWA / installable mobile web (cheapest, underrated)
No native. Installable Progressive Web App; our Next.js app is most of the way
there.

- **Pros:** zero store overhead, instant updates, multi-tenancy works exactly
  like web (subdomain → tenant), **and avoids the App Store payment tax.**
- **Cons:** no store presence, iOS push limited (improving), weaker offline video
  download. Native's main LMS wins are push + offline lesson downloads.

---

## 🔴 The thing that will bite us: the App Store payment tax

Most important point for a course-*selling* platform.

Apple and Google require **In-App Purchase** for digital goods consumed in the
app, taking **15–30%**. Our economics today are platform cut + Stripe fee. Stack
Apple's 30% on top and the margin (ours and the school's) is gone.

**How everyone handles it:**
- Mobile app is **content-consumption only** — students *watch* lessons in-app
  but **buy on the web** (our existing Stripe Connect flow). App says "manage your
  subscription on the website."
- Post-*Epic v. Apple* (US) you can now include **external purchase links**;
  "multiplatform"/"reader" exemptions cover content bought elsewhere.
- This is exactly why Teachable/Thinkific apps historically didn't sell courses
  in-app.

**Rule: native app for *learning*, web for *buying*. Bake this in from day one.**

---

## How it maps onto our stack

- **Tenant context:** web = subdomain header; mobile = `tenant_id` in JWT (already
  injected). Container app resolves tenant from login; white-label build bakes the
  slug into config.
- **Data layer:** RLS + `tenant_id` filtering means an Expo/RN client hits the same
  Supabase + API routes safely. No new isolation work.
- **Auth:** Supabase Auth native mobile SDKs; same session/refresh model.
- **Build path:** React Native / Expo sharing our API + Supabase — **not** a second backend.

---

## Recommended phased path

1. **Phase 0 — PWA.** Nearly free given Next.js. "Installable on phone" + avoids
   IAP tax. Validate demand.
2. **Phase 1 — Single branded container app** (RN/Expo), consumption-only,
   purchases on web. One listing we control. The 80/20.
3. **Phase 2 — White-label branded apps** as a premium plan feature
   (`business`/`enterprise` tiers), published **under the creator's own developer
   account** using our shared codebase, to stay clear of Apple 4.3.

## Open questions to resolve before building
- Expo vs bare React Native?
- How do we surface "buy on web" without violating / while using Apple's external-link rules?
- Offline video download + DRM expectations for course content?
- Push notification provider (Expo Push vs FCM/APNs direct)?
