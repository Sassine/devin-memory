---
name: memory-save
description: >-
  Save a structured snapshot of the current session into the persistent memory folder
  (devin-memory) so work can resume after /clear or in a new session.
  Trigger phrases — pt-BR: "salva memória", "salvar memória", "salva o contexto",
  "preciso limpar", "vou dar clear" | en: "save memory", "save context", "memory save",
  "i need to clear" | es: "guardar memoria", "guarda el contexto", "necesito limpiar",
  "voy a limpiar". Also trigger when a <system_guidance> injection recommends saving memory.
---

# memory-save

Save a self-sufficient snapshot of the current session state to disk so that the user
can run `/clear` (or close the session) and later continue exactly where they left off
via the **memory-resume** skill.

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
   `~/.devin-memory`; key via `<memory_base>/.projects.json` — match the entry whose
   `path` is the current project — or derive it: normalized git remote URL → slug of
   git toplevel + short hash → basename + short hash).
3. Still nothing → use `<cwd>/.devin/memory/` and create it.

Create `memory_dir/snapshots/` if it does not exist. Read `memory_dir/config.json`
(if present) to get `lang` (fallback: the language the user is writing in).

## Step 2 — Collect the snapshot content

From the conversation (or by inference; ask only if essential information is missing):

- Short title and tags
- Session objective
- Current state (what is done ✅, in progress 🚧, pending ⏳)
- Decisions made (and why)
- Relevant files (paths the work touches)
- Next steps (concrete, ordered)
- Open questions / blockers
- Critical non-obvious context (gotchas, constraints, things a fresh agent would not guess)

## Step 3 — Write the snapshot file

Path: `memory_dir/snapshots/{YYYY-MM-DD_HH-mm}_{slug}.md` (slug from the title,
lowercase, hyphen-separated).

**Get the real current date/time from the system** (e.g. a quick shell `date` /
`Get-Date` call) for the filename, the "Created at" field and the index entry —
never guess it from memory.

Use exactly 8 fixed sections. Write the section headers in the resolved `lang`
(content language follows the session). Header table:

| # | en | pt-BR | es |
|---|---|---|---|
| 1 | Session objective | Objetivo da sessão | Objetivo de la sesión |
| 2 | Current state | Estado atual | Estado actual |
| 3 | Decisions made | Decisões tomadas | Decisiones tomadas |
| 4 | Relevant files | Arquivos relevantes | Archivos relevantes |
| 5 | Next steps | Próximos passos | Próximos pasos |
| 6 | Open questions / blockers | Questões em aberto / blockers | Preguntas abiertas / bloqueos |
| 7 | Critical context (non-obvious) | Contexto crítico (não óbvio) | Contexto crítico (no obvio) |
| 8 | How to resume | Como retomar | Cómo retomar |

Template (en headers shown; substitute per the table):

```markdown
# Snapshot: {Short title}

**Created at:** {ISO 8601 UTC}
**Session:** {optional session name}
**Tags:** tag1, tag2, ...

## 1. Session objective
## 2. Current state
- ✅ done  ⏳ pending  🚧 in-progress
## 3. Decisions made
## 4. Relevant files
## 5. Next steps
## 6. Open questions / blockers
## 7. Critical context (non-obvious)
## 8. How to resume
{Exact phrase the user should say to trigger memory-resume for this snapshot.}
```

## Step 4 — Update the index

Insert one line in `memory_dir/index.md`, directly **below** the
`<!-- devin-memory:index -->` marker (reverse chronological order — newest on top):

```markdown
- {YYYY-MM-DD HH:mm} — [{Short title}](snapshots/{filename}.md) — tags: tag1, tag2
```

If `index.md` does not exist, create it with a `# devin-memory — snapshot index` title
and the marker line, then insert the entry.

## Step 5 — Confirm to the user

Present (in the user's language): a short summary of what was saved, the snapshot path,
and the **exact phrase** to resume later (e.g. `/memory-resume` or "continua de onde paramos").

## Constraints

- **Always interact in the language the user is writing in.**
- Never invent context — if essential information is missing, ask before saving.
- Never write secrets (tokens, passwords, keys) into snapshots.
- The snapshot must be self-sufficient: readable by another agent with zero prior context.
