---
name: sound-setup
description: Interactive wizard to choose which sounds Claude Code plays and when — pick a pack (tiktok, zelda, mario), remap any event, add custom text triggers, and preview each sound out loud before committing. Use when the user wants to customize, change, mute or set up claude-sounds notification sounds.
---

# sound-setup

Walk the user through building their own sound mapping, previewing each choice
out loud. Writes `~/.claude/hooks/sound-rules.json`, which the hook re-reads on
every event — **changes apply immediately, no reinstall and no restart.**

## Before you start

Check the system is installed:

```bash
ls ~/.claude/hooks/status-sound.sh ~/.claude/hooks/sounds/ 2>/dev/null
```

If it isn't, install it first — the wizard has nothing to configure otherwise:

```bash
curl -fsSL https://raw.githubusercontent.com/guillermoscript/agent-skills/main/skills/claude-sounds/install.sh | bash -s -- --yes
```

That installer also places this skill, so a curl install gets `/sound-setup`
with no extra step.

Then use `TOOL=~/.claude/hooks/sound-tool.sh` for every command below. If that
file is missing, the user is on an older install — re-run the installer.

## The events you can map

| Event | Fires when |
|---|---|
| `done_tiny` … `done_epic` | A turn ended successfully, sized by lines written (<50, 50+, 200+, 500+, 1000+) |
| `needs_input` | Claude ended with a question |
| `failed` / `failed_big` | The turn hit an error |
| `other` | Anything else |
| `commit` / `push` | `git commit` / `git push` succeeded |
| `pr_opened` / `pr_merged` | `gh pr create` / `gh pr merge` succeeded |
| `tests_pass` / `tests_fail` | A test command finished |
| `permission` | Claude is waiting for your approval |

A **slot** is a sound file: `~/.claude/hooks/sounds/<slot>.mp3`. Events map to
slots, so several events can share one sound, and a pack swap changes the audio
without touching the mapping.

## How to run the wizard

Be conversational, not a form. Play sounds as you go — hearing it is the point.
Never ask about all sixteen events; that's an interrogation, not a wizard.

### 1. Show them where they are

```bash
bash $TOOL list
```

Present it as a short table and ask what they want to change. If the user
already said what they want ("zelda chest when a PR merges"), skip straight to
doing it — don't make them sit through a menu.

### 2. Offer a pack as a baseline

Only if they want a wholesale change. Packs: `tiktok` (meme sounds — FAAAA,
BRUH, vine boom), `zelda` (chest, secret jingle, rupee, Navi), `mario` (coin,
1-up, death tune, course clear).

```bash
bash $TOOL pack zelda
```

This downloads the pack into every slot and leaves their event mapping intact.

### 3. Preview before committing

Always play a sound before and after changing it:

```bash
bash $TOOL preview pr_merged        # what it plays today
bash $TOOL play zelda-open-chest    # a specific file
```

Ask "keep it?" after each. Use `AskUserQuestion` when offering a small set of
concrete choices; plain conversation when they're describing what they want.

### 4. Make the change

```bash
bash $TOOL set pr_merged done_epic     # map an event to a slot
bash $TOOL mute other                  # silence one event
```

### 5. Custom text triggers

For "when Claude says X, play Y". The pattern is an extended regex matched
case-insensitively against Claude's final message, and custom rules are checked
**before** the built-in status classification, so they win.

```bash
bash $TOOL custom add "deployed to production" pr_merged
bash $TOOL custom list
```

Keep patterns specific. `error` would fire on any turn that merely discusses an
error; `deploy failed` won't.

### 6. Pulling in a sound they don't have

Search, download into a slot, then map to it:

```bash
bash $TOOL search zelda chest        # lists candidate URLs
bash $TOOL fetch my_chest https://www.myinstants.com/media/sounds/zelda-open-chest.mp3
bash $TOOL set pr_merged my_chest
```

Play it before mapping — myinstants serves a generic fallback file for dead
slugs, so a URL can download "successfully" and be the wrong audio.

They can also drop any `.mp3` into `~/.claude/hooks/sounds/` themselves and map
an event to its filename.

### 7. Confirm

Show the final mapping with `bash $TOOL list` and mention that it took effect
immediately. Fire one as proof if it fits the conversation:

```bash
bash $TOOL test pr_merged
```

## Muting

- One event: `bash $TOOL mute <event>`
- Everything, temporarily: `CLAUDE_SOUNDS_OFF=1`
- Everything, persistently: set `"enabled": false` in the rules file

## Notes

- The rules file is plain JSON and safe to hand-edit; a malformed file makes the
  hook fall back to defaults rather than break or go silent.
- `git`/`gh` events only fire for commands run **in this terminal**. A PR
  approved by a teammate on github.com is invisible to any hook.
- Sounds are downloaded from myinstants.com to the user's own machine. If a URL
  dies, that slot falls back to a spoken voice.
