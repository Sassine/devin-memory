---
name: memory-resume
description: >-
  Restore a previously saved devin-memory snapshot and continue the work where it stopped.
  Trigger phrases — pt-BR: "continua de onde paramos", "retoma", "carrega memória",
  "continua a tarefa" | en: "continue where we left off", "resume", "restore context",
  "load memory" | es: "continúa donde lo dejamos", "retoma", "carga la memoria",
  "restaurar contexto".
---

# memory-resume

Load a snapshot saved by **memory-save**, validate it against the real state of the
project, and present a resume briefing so the work continues exactly where it stopped.

**Always interact in the language the user is writing in.**

## Step 1 — Resolve the memory directory

Default first, configs only as fallback — **never blind-read config files that may not
exist** (missing configs are the normal case, not an error; avoid failed read attempts
in the output):

1. If `<cwd>/.devin/memory/` exists → that is the memory directory (default
   project mode; engine configs are irrelevant — do not read them).
   Use ONE existence check suited to the shell (PowerShell: `Test-Path .devin/memory`;
   POSIX: `test -d .devin/memory`) — do not try `ls -la` variants until one works.
2. Only if it does NOT exist: check (via listing, not blind reads) for an engine config
   at `<cwd>/.devin/devin-memory.config.json`, then `%APPDATA%\devin\devin-memory.config.json`
   (Linux/macOS: `~/.config/devin/devin-memory.config.json`). If one exists with
   `memory_mode: "user"` → `memory_dir = <memory_base>/<project-key>/` (base default
   `~/.devin-memory`; key via `<memory_base>/.projects.json` or derived from git
   remote / toplevel / basename+hash).
3. Nothing found → tell the user there is no saved memory yet and offer to start fresh.

Read `memory_dir/index.md`. If it has no entries below the `<!-- devin-memory:index -->`
marker: tell the user there is no saved memory yet and offer to start fresh.

## Step 2 — Select the snapshot (automatic by default)

- Bare `/memory-resume` / "resume" / "continue where we left off" → **load the most
  recent snapshot automatically. Do not ask.** After loading, mention in one line which
  snapshot was loaded and, if others exist, that the user can say e.g. "load <title>"
  to switch.
- The user's request names a title or tags → load the best match automatically; ask
  only if two snapshots match equally well.
- Asking the user to pick is the LAST resort, not the default.

## Step 3 — Load and validate

1. Read the snapshot file in full.
2. **Re-read every file** listed in the "Relevant files" section — the code may have
   changed since the snapshot was taken. Never trust the snapshot over the real files.
3. Flag any listed file that no longer exists.
4. If the snapshot contradicts the real state of the project (e.g. a "next step" is
   already done, or a file changed in a way that invalidates a decision):
   **report the conflict and ask for guidance before proceeding.**

## Step 4 — Present the resume briefing

In the user's language, summarize:

- Where we were (objective + current state)
- What is already done
- Decisions already made (do not re-litigate them)
- The immediate next step
- Open questions / blockers

Then continue the work from the next step (or wait for the user's go-ahead if there
were conflicts).

## Step 5 — Reset the context monitor

Overwrite `memory_dir/.session-state.json` with:

```json
{ "accumulated_chars": 0, "last_alert_ts": 0, "session_start_ts": <now, unix seconds> }
```

**Get `<now>` from the system** (PowerShell: `[DateTimeOffset]::Now.ToUnixTimeSeconds()`;
POSIX: `date +%s`) — never guess the timestamp from memory.

This restarts the context-usage estimate for the fresh session.

## Constraints

- **Always interact in the language the user is writing in.**
- Never invent context — everything stated in the briefing must come from the snapshot
  or from files actually re-read in Step 4.
- On conflict between snapshot and reality, stop and ask — do not guess.
