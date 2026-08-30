---
name: claude-sounds
description: Play a sound when a Claude Code turn ends, scaled by how much code was written, plus sounds for commits, pushes, PRs, test runs and permission prompts. Packs (tiktok, zelda, mario) and a rules file make every event remappable. Use when the user wants audio notifications, terminal sounds, asks to customize or mute them, wants to know why a sound played, or wants to share this setup with someone.
---

# claude-sounds — hear what just happened

Ambient awareness for long runs. Walk away from the terminal and still know
whether it landed, died, or is waiting on you — and, for turn endings, roughly
how big the change was.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/guillermoscript/agent-skills/main/skills/claude-sounds/install.sh | bash
```

Pick a pack while installing:

```bash
curl -fsSL .../install.sh | bash -s -- --pack zelda
```

Then **restart Claude Code, or open `/hooks` once** — the settings watcher does
not pick up a new hook mid-session. This is the most common reason it seems not
to work.

Requires `jq`, `curl`, and an audio player (`afplay` ships with macOS; `mpv`,
`ffplay`, `mpg123` or `paplay` on Linux).

The installer also drops the `/sound-setup` wizard into
`~/.claude/skills/sound-setup/`, so customizing works straight after a curl
install with no extra step.

Flags: `--pack <name>`, `--uninstall`, `--no-sounds` (hook only, spoken
fallbacks), `--no-git` (turn-end sounds only), `--no-skill` (skip the wizard),
`--dry-run`, `--yes`.

## What plays when

**When a turn ends**, scaled by lines written or edited in that turn (`Write`
content + `Edit` new_string, counted only since the last user prompt):

| Lines | Event | tiktok | zelda | mario |
|---|---|---|---|---|
| <50 | `done_tiny` | vine boom | rupee | coin |
| 50+ | `done_small` | FAAAH | korok | 1-up |
| 200+ | `done_medium` | Faaaa | secret jingle | 1-up mushroom |
| 500+ | `done_big` | boosted FAAAH | item catch | extra life |
| 1000+ | `done_epic` | **I GOT THIS FAAAAAHHHH** | high-value item | course clear |

Status comes from the last assistant message. The three background-job markers
are exact; the rest is a heuristic.

| Trigger | Event |
|---|---|
| contains `result:` | completed → one of the five above |
| contains `needs input:`, or ends with `?` | `needs_input` |
| contains `failed:`, or error keywords | `failed` (`failed_big` over 200 lines) |
| anything else | `other` |

**While you work** — only for commands run in your terminal, and only when they
succeed:

| Event | Fires on |
|---|---|
| `commit` / `push` | `git commit` / `git push` |
| `pr_opened` / `pr_merged` | `gh pr create` / `gh pr merge` |
| `tests_pass` / `tests_fail` | `npm test`, `pytest`, `go test`, `cargo test`, `jest`, `vitest`, `bun test` |
| `permission` | Claude is waiting for your approval |

## Customizing

The friendly way — a conversational wizard that plays each sound as you choose:

```
/sound-setup
```

By hand, with the same verbs the wizard drives:

```bash
TOOL=~/.claude/hooks/sound-tool.sh

bash $TOOL list                      # every event and what it plays
bash $TOOL preview pr_merged         # hear it
bash $TOOL pack zelda                # swap the whole pack
bash $TOOL set pr_merged done_epic   # remap one event
bash $TOOL mute other                # silence one event
bash $TOOL search zelda chest        # find a sound on myinstants
bash $TOOL fetch my_chest <url>      # download it into a slot
bash $TOOL custom add "shipped it" pr_merged
bash $TOOL test pr_merged            # fire an event by hand
```

Or edit `~/.claude/hooks/sound-rules.json` directly. It is re-read on every
event, so **changes apply immediately** — no reinstall, no restart.

```json
{
  "pack": "zelda",
  "enabled": true,
  "events": { "pr_merged": "done_epic", "other": null },
  "thresholds": { "small": 50, "medium": 200, "big": 500, "epic": 1000 },
  "custom": [{ "match": "deployed to production", "slot": "pr_merged" }]
}
```

- **`events`** maps an event to a *slot* — a file at
  `~/.claude/hooks/sounds/<slot>.mp3`. `null` means stay silent. Several events
  can share a slot.
- **`thresholds`** move the line counts that pick a `done_*` event.
- **`custom`** rules are extended regexes matched case-insensitively against
  Claude's final message, checked **before** built-in classification, in file
  order, first match wins. Keep them specific: `error` would fire on any turn
  that merely mentions an error.
- Drop any `.mp3` into the sounds directory and map an event to its filename.

A malformed rules file is ignored in favour of the defaults rather than
breaking the hook or silencing it.

## Muting

| Scope | How |
|---|---|
| One event | `bash $TOOL mute <event>` |
| Everything, this shell | `CLAUDE_SOUNDS_OFF=1` |
| Everything, persistently | `"enabled": false` in the rules file |

## Files

| Path | What |
|---|---|
| `~/.claude/hooks/status-sound.sh` | the dispatcher, wired to all three events |
| `~/.claude/hooks/sound-tool.sh` | the verbs above |
| `~/.claude/hooks/sound-rules.json` | your mapping (kept across reinstalls) |
| `~/.claude/hooks/sounds/*.mp3` | audio, one file per slot |
| `~/.claude/skills/sound-setup/` | the `/sound-setup` wizard |
| `~/.claude/settings.json` | hook entries (merged, never replaced) |

## Uninstall

```bash
curl -fsSL .../install.sh | bash -s -- --uninstall
```

Removes only its own entries; unrelated hooks and settings survive.

## How it works

One dispatcher wired to three hook events:

- **`Stop`** — reads the transcript, classifies the ending, counts the lines.
- **`PostToolUse`** — matches `Bash` with `if` gating
  (`"if": "Bash(gh pr merge *)"`), so the hook process only spawns for commands
  it reacts to — no overhead on every other Bash call. Reads `tool_response` to
  tell success from failure.
- **`Notification`** — `permission_prompt` only.

Playback is detached, so a 10-second sound never delays your next prompt, and
the hook always exits 0 so it can never block a turn.

## When it does the wrong thing

**No sound at all.** Almost always the settings watcher — restart Claude Code or
open `/hooks`. Then check:

```bash
jq '.hooks | keys' ~/.claude/settings.json    # expect Stop, PostToolUse, Notification
ls ~/.claude/hooks/sounds/
```

**Wrong sound.** Turn on the log and read what it decided:

```bash
CLAUDE_SOUNDS_DEBUG=1   # writes ~/.claude/claude-sounds.log
```

Each line records the hook event, the resolved event, the line count and the
chosen slot.

**Spurious failure sound.** The heuristic reads any message *mentioning* an
error as a failure. The `result:` / `failed:` markers and custom rules are the
reliable paths; keyword matching is best-effort.

**A git sound didn't fire.** Only commands run in your terminal are visible, and
only on success. A PR approved by a teammate on github.com is invisible to any
hook — nothing here polls GitHub.

## Notes on the audio

Packs are URL manifests (`packs/*.txt`); the installer downloads from
myinstants.com **to the user's own machine at install time**. This repo ships no
audio. The clips are third-party uploads of copyrighted material: fine as
personal notification sounds, not something to redistribute.

If a URL dies, the installer says so and that slot falls back to a spoken
reaction via `say`. Fix it by putting any mp3 at the slot path.

Heads-up when adding URLs: myinstants serves a **generic fallback file for dead
slugs**, so different-looking URLs can return byte-identical audio. Check with
`md5` before assuming a new sound is distinct.
