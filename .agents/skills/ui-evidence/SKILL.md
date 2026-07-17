---
name: ui-evidence
description: Produce visual proof of a UI change and post it to the pull request — "before" screenshots captured while the code is still untouched, a recorded GIF of the changed flow, matching "after" screenshots, and the private-repo browser-upload dance to attach them as a PR comment. Use whenever a change touches anything a user can see or click (components, pages, styles, client-side behavior) and a reviewer needs visual evidence, or when the user asks to "record a GIF of this change", "take before/after screenshots", or "post the screenshots to the PR".
---

# UI Evidence — before/after screenshots and a verification GIF

Reviewers weigh a before/after pair far more than a description of what
changed, and the GIF comment is what tells them "this needs your visual
sign-off". For any user-visible change this evidence is **mandatory**, not
decorative.

**Chrome is a single shared resource — never delegate it.** All browser
steps here (screenshots, GIF recording, uploads) run in the main agent via
the claude-in-chrome tools; parallel subagents fighting over one browser
serialize badly and corrupt each other's recordings. If several tasks need
Chrome, queue their browser steps and do them one at a time at the end.

## 1. Before-captures — do this BEFORE touching the code

The only moment the "before" state exists is before implementation — once
the change lands, it's gone. As soon as it's known that a change touches UI:

1. Start (or find) the locally running app — check for a `run` skill or repo
   docs for the start command and local URL/basePath conventions.
2. Open the affected screen(s) in Chrome and screenshot each
   (`mcp__claude-in-chrome__computer`, screenshot action), saved as
   `issue-<N>-before-<screen>.png` (or `before-<screen>.png` if there's no
   issue number).
3. If the local app isn't running and starting it is disruptive right now,
   note that "before" captures were skipped and why — don't silently drop
   them.

## 2. Verification GIF + after-shots — after implementing

1. Drive the changed flow end-to-end in the running app (the `verify` skill
   covers how to exercise it; this skill covers how to record it).
2. Record the drive with `mcp__claude-in-chrome__gif_creator`: start capture
   **before** the first action, capture extra frames before and after each
   step so playback is smooth, and name the file after the work (e.g.
   `issue-<N>-verification.gif`). Save it somewhere durable and note the
   path.
3. Take "after" screenshots of the same screens captured in step 1
   (`issue-<N>-after-<screen>.png`) so the PR can show matched before/after
   pairs — same screen, same viewport, ideally same scroll position.

## 3. Posting to the PR

How the media gets attached depends on repo visibility — check
`gh repo view --json isPrivate`:

- **Private repo**: raw file links won't render for other viewers;
  attachments must be uploaded as real comment attachments, which only works
  through the browser. Open the PR page in Chrome, attach the before shots,
  after shots, and GIF in the comment box with
  `mcp__claude-in-chrome__file_upload`, then submit.
- **Public repo**: embed the images/GIF directly in the PR body or a
  `gh pr comment` markdown body via a hosted path, whichever is simpler —
  the browser dance exists only to work around private-repo restrictions.

Comment text, either way: label each image (Before / After / Flow
recording), one or two sentences on what flow the GIF shows, and that the
reviewer should visually verify it before merging. Write it for the
reviewer, in normal full-sentence English.

## Fallback

If the Chrome extension isn't available or the upload fails twice, don't
spin: post a text comment saying the verification media exists, and give
the user the local file paths so they can drag-drop the files themselves.
