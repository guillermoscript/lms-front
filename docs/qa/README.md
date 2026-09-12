# QA evidence

Screenshots and GIFs attached to pull requests as visual proof of a change. **Images
only** — there is no prose here, and nothing in this folder is a specification.

## Layout

One directory per issue, named with the bare issue number:

```
docs/qa/675/          before/after for issue #675
docs/qa/issue-673/    older files use an "issue-" prefix; both forms exist
docs/qa/586-before.gif   single-file evidence sits loose, prefixed with the number
```

Name files so the issue, the state and the surface are readable without opening them:
`<issue>-<before|after>-<surface>[-<width>].png`, e.g. `586-after-student-dashboard-768.png`.
Sentry-sourced work uses the Sentry short id instead of an issue number
(`lms-front-9p-google-stalled.png`).

## Committing images

`.gitignore` ignores `*.png` repo-wide. Evidence must be forced in:

```bash
git add -f docs/qa/<issue>/*.png docs/qa/<issue>/*.gif
```

To embed one in a GitHub comment on a **private** repo, link the raw URL on `master`
(`https://raw.githubusercontent.com/guillermoscript/lms-front/master/docs/qa/...`) and add a
`?v=2` cache-buster — GitHub's camo proxy poisons its cache with the 404 it got before the
file was pushed.

## The written checklists are elsewhere

| You want | Read |
|--|--|
| What state each MVP loop is in | [`../STATUS.md`](../STATUS.md) |
| Manual QA steps to walk through | [`../MVP_MANUAL_TESTING_CHECKLIST.md`](../MVP_MANUAL_TESTING_CHECKLIST.md) |
| Feature-by-role map | [`../MVP_USER_JOURNEYS.md`](../MVP_USER_JOURNEYS.md) |
| Automated coverage and how to run it | [`../../tests/README.md`](../../tests/README.md) |
| Historical test reports | [`../archive/`](../archive/README.md) |

## Sibling folders

Evidence predating this convention lives in `docs/verification/`, `docs/evidence/`,
`docs/screenshots/`, `docs/media/` and `docs/images/`. They are not being migrated. Put new
evidence here.
