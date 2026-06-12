# devin-memory — memory folder

Persistent session memory for the Devin CLI, managed by the **devin-memory** system
(unofficial community project, not affiliated with Cognition AI).

## Layout

| Path | What it is | Versionable |
|---|---|---|
| `snapshots/` | Structured session snapshots (markdown, 8 fixed sections) | yes |
| `index.md` | Reverse-chronological index of snapshots | yes |
| `config.json` | Memory-level config (`version`, optional `lang`) | yes |
| `i18n/messages.json` | Runtime string catalog (en / pt-BR / es) | yes |
| `.session-state.json` | Runtime state of the context-monitor hook | no (gitignored) |
| `.session-log.jsonl` | Per-prompt audit log of the hook | no (gitignored) |

## How to use

- **Save**: run `/memory-save` (or say "save memory" / "salva memória" / "guardar memoria")
  before clearing the context. A snapshot is written to `snapshots/` and indexed in `index.md`.
- **Resume**: after `/clear` (or in a new session) run `/memory-resume`
  (or say "continue where we left off" / "continua de onde paramos" / "continúa donde lo dejamos").

Snapshots are plain markdown and self-sufficient: any agent (or human) can read one
and continue the work. Never store secrets in snapshots.
