## What

<!-- What changed, in one or two sentences. -->

Closes #

## Why

<!-- The problem this solves. Link the issue if there is one. -->

## How to QA

<!-- Steps a reviewer can follow on a fresh `npm run db:reset`. Include the account and subdomain. -->

1.
2.

## Screenshots / GIF

<!-- Required for anything a user can see or click. Before + after if it's a change. -->

## Checklist

- [ ] `npm run typecheck` and `npm run test:unit` pass
- [ ] `npm run build` passes
- [ ] Every new tenant-scoped query filters by `tenant_id` (or the table genuinely has no such column)
- [ ] Tested with every relevant role (student / teacher / admin)
- [ ] Loading and error states handled
- [ ] New UI strings added to both `messages/en.json` and `messages/es.json`
- [ ] Migration (if any) applies cleanly on `npm run db:reset`, has RLS policies, and `lib/database.types.ts` was regenerated
