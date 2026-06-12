# devin-memory — technical reference

Implementation details for contributors and the curious. For installation and daily
usage, see the [README](../README.md).

> Unofficial community project — not affiliated with Cognition AI.

## Architecture

Three pieces, all local, zero npm dependencies, no network at runtime:

1. **Hook** (`context-monitor.js`) — runs on every `UserPromptSubmit`. Accumulates
   `len(prompt) + 2000` chars per turn in `<memory>/.session-state.json`, estimates
   usage against a 600,000-char budget (conservative heuristic for Opus-class models —
   **chars, not real tokens**), and logs each turn to `<memory>/.session-log.jsonl`.
   At ≥ 75% (with a 120 s cooldown) it emits the alert. Always exits 0 — it can never
   break or block the CLI. A new `session_id` resets the counter.
2. **memory-save skill** — writes a self-sufficient markdown snapshot (8 fixed sections:
   objective, current state, decisions, relevant files, next steps, open questions,
   critical context, how to resume) to `<memory>/snapshots/` and indexes it in
   `<memory>/index.md`. Section headers follow the configured language.
3. **memory-resume skill** — loads a snapshot (the most recent automatically, unless
   the user names another), **re-reads every file** listed in it
   (code may have changed), flags missing files, presents a resume briefing, and resets
   the session state.

## Hook output schema (Devin CLI, Claude Code hook format)

```json
{
  "systemMessage": "[memory] Estimated context at ~82% (492000 chars accumulated). Run /memory-save ...",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "<system_guidance>...remind the user in their language...</system_guidance>"
  }
}
```

Facts discovered empirically (validated on Devin CLI 4.24.1 and 2026.5.26-8):

- `additionalContext` **must** live inside `hookSpecificOutput` with the `hookEventName`
  discriminator — a top-level `additionalContext` is silently ignored.
- `systemMessage` (top-level) is the user-visible channel; hook **stderr is not
  propagated** by the CLI.
- The CLI spawns hook commands **without PATH lookup** — a bare `node` (or `cmd`) fails
  with *program not found*. The installer registers the absolute path of the Node
  executable (`process.execPath`). This makes the hook config machine-local — don't
  commit `.devin/config.local.json`; re-run setup per machine instead.
- Skill frontmatter quirk: a `triggers:` field switches a skill to event-triggered mode
  and removes it from slash-command/model invocation (`devin skills list` shows `[]`
  instead of `[user,model]`). Trigger phrases belong in the `description`.
- Registration goes into `.devin/config.local.json` (project) or the user config
  (`%APPDATA%\devin\config.json` on Windows, `~/.config/devin/config.json` elsewhere);
  `.devin/hooks.v1.json` is mirrored when it already exists.
- The `<system_guidance>` injection instructs the model to render the reminder as a
  standardized first line — `⚠️ **[devin-memory ~N%]** ...` — where the marker is a
  verbatim brand label and only the reminder sentence adapts to the user's language.

## Installation scopes (engine vs data)

Two independent decisions:

- **Engine** (`--scope`) = where the *code* lives (hook + skills).
- **Memory** (`--memory`) = where the *data* lives (snapshots, index, config).

The hook resolves the memory path at **runtime** from the working directory, which is
what allows "global engine + per-project memory".

| Engine | Memory | Use case |
|---|---|---|
| `project` (default) | `project` (default) | Teams, committable repos, cloud handoff |
| `user` | `project` | Solo dev: install once, memory isolated per project |
| `user` | `user` | Advanced: git worktrees / clean repo / central backup |
| `project` | `user` | Allowed, rare (engine in repo, centralized data) |

| | Engine `project` | Engine `user` |
|---|---|---|
| Hook config | `.devin/config.local.json` | `~/.config/devin/config.json` (Win: `%APPDATA%\devin\config.json`) |
| Hook script | `.devin/hooks/context-monitor.js` | `~/.config/devin/hooks/context-monitor.js` |
| Skills | `.devin/skills/memory-*/SKILL.md` | `~/.config/devin/skills/memory-*/SKILL.md` |
| AGENTS.md | block injected into the project | not injected (`--agents` forces it) |
| Hook command | absolute Node + relative script | absolute Node + absolute script |

| | Memory `project` | Memory `user` |
|---|---|---|
| Path | `<project>/.devin/memory/` | `~/.devin-memory/<project-key>/` |
| Versionable | yes | no |
| Survives cloud handoff | yes (travels with the repo) | no (stays on the laptop) |

With `--memory user`, the project key is resolved (in order) from the normalized git
remote URL → git toplevel slug + short hash → folder basename + short hash; the mapping
is recorded in `~/.devin-memory/.projects.json`.

**Anti-junk guard:** with a global engine, the hook only creates `.devin/memory/` in
directories that look like a project (contain `.git` or `.devin`). Other directories
are silently skipped.

## Internationalization

Resolution order for the runtime language:

1. `DEVIN_MEMORY_LANG` env var
2. `<memory>/config.json` → `lang` (written by `setup --lang`)
3. global engine config → `lang_default`
4. `LC_ALL` / `LANG` (`pt_BR*` → pt-BR, `es*` → es)
5. fallback `en` (unknown languages fall back silently)

Terminal strings avoid accented characters in all three languages (Windows console
safety). The `<system_guidance>` injection is language-agnostic by design: it tells the
model to remind the user *in whatever language the user is writing* — covering the
three official languages and any other.

## File layout (installed, default scope)

```
<project>/
├── AGENTS.md                          # devin-memory block injected (marker-delimited)
└── .devin/
    ├── config.local.json              # hook registration (machine-local)
    ├── hooks/context-monitor.js
    ├── skills/{memory-save,memory-resume}/SKILL.md
    └── memory/
        ├── README.md / index.md / config.json
        ├── i18n/messages.json
        ├── .gitignore                 # ignores .session-* runtime files
        ├── .session-state.json / .session-log.jsonl
        └── snapshots/YYYY-MM-DD_HH-mm_{slug}.md
```

Uninstall removes the engine, hook entries, AGENTS.md block and system files but
preserves `snapshots/`, `index.md` and `README.md`; `--purge` deletes the entire
memory directory (and the `.projects.json` entry for namespaced memories).

## Known limitations

- **Heuristic, not real tokens** — `/context` remains the official source of truth.
- **`/clear` is manual** — slash commands are intercepted before the agent sees them.
- **Hooks do not run in subagents** — only the main session is monitored.
- **The 600k-char budget is a guess** for Opus-class models; other models differ.
- **The hook schema is not officially documented** — config location has varied between
  CLI versions.
- **Global memory does not survive cloud handoff** — only per-project (committed)
  memory travels with the repo into the cloud sandbox.
- **The project key can change** if a repo without a git remote is moved — which can
  "fork" a global memory.
- **i18n covers 3 languages in the terminal** — others fall back to English; the
  model-rendered reminder still adapts to any language.

## Development

```sh
node tests/smoke.js     # 37 sandboxed checks (see tests/EVIDENCE.md)
npm pack --dry-run      # verify the published file whitelist
```
