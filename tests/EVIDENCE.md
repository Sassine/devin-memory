# devin-memory v1.0.0 — smoke test evidence (spec §11 + CR npm/npx §5)

**Run:** 2026-06-12 · Windows 11 Pro (win32) · Node v24.2.0 · npm 11.16.0 · `node tests/smoke.js`
**Result:** 37 automated checks passed, 0 failed, 4 manual (LLM-dependent).

All automated checks run fully sandboxed: user-scope operations use a fake
`HOME`/`USERPROFILE`/`APPDATA` inside a temp directory — the real machine is never touched.

## Criteria map

| # | Criterion | Check id(s) | Result |
|---|---|---|---|
| 1 | Hook executes; state + log written | `1`, `1b`, `1c` | PASS |
| 2 | Threshold fires (systemMessage + `<system_guidance>` + `last_alert_ts`) | `2`, `2b`, `2c` | PASS |
| 3 | Cooldown suppresses repeat alerts within 120 s | `3` | PASS |
| 4 | memory-save creates snapshot + updates index.md | — | **PASS (manual)** — verified live on Devin CLI 2026.5.26-8: `/memory-save` in a pt-BR session wrote `snapshots/...exploracao-projeto-devin-memory-playground.md` with the 8 fixed sections (pt-BR headers), inserted the index entry below the marker and presented the resume phrase |
| 5 | memory-resume reads snapshot + re-reads files | — | **PASS (manual)** — verified live on Devin CLI 2026.5.26-8: `/memory-resume` auto-loaded the most recent snapshot, listed the alternative, re-read and validated all listed files, presented the briefing and reset `.session-state.json` |
| 6 | Idempotent install (no duplicate hook/AGENTS block, no spurious .bak) | `6` | PASS |
| 7 | Uninstall preserves snapshots/index/README, removes engine | `7`, `7b`, `7c` | PASS |
| 8 | Uninstall `--purge` removes the whole memory dir | `8` | PASS |
| 9 | `DEVIN_MEMORY_LANG=es` → Spanish banner | `9` | PASS |
| 10 | `LANG=pt_BR.UTF-8` → pt-BR banner (auto-detect) | `10` | PASS |
| 11 | Unknown lang (`fr`) → English fallback, no error | `11` | PASS |
| 12 | Trigger phrases fire the right skill (6 cases) | `12s` (static) | PASS (static) / partially verified live (slash-command invocation of both skills works; per-language phrase triggers still MANUAL¹) |
| 13 | additionalContext adapts the reminder language | — | **PASS (manual)** — verified live on Devin CLI 2026.5.26-8: pt-BR prompt → `⚠️[devin-memory ~84%] O contexto está em ~84%...` (screenshot: `docs/alert-screenshot.png`); en prompt → English reminder |
| 14 | `install --lang` persists; runtime respects it without env vars | `14` | PASS |
| 15 | 3 READMEs exist and cross-link (+ disclaimer) | `15`, `15b` | PASS |
| 16 | Terminal strings ASCII-only in all 3 languages | `16` | PASS |
| 17 | `--scope user`: hook in user config with **absolute** path, skills in user dir | `17`, `17b` | PASS |
| 18 | Global engine + 2 projects → 2 distinct `.devin/memory/` | `18` | PASS |
| 19 | `--memory user`: namespaced dir, stable key, distinct per project | `19`, `19b`, `19c` | PASS |
| 20 | Anti-junk: global engine creates nothing in non-project dirs | `20` | PASS |
| 21 | `uninstall --scope user` cleans user config, leaves project files | `21`, `21b` | PASS |
| 22 (CR) | `npm pack` respects the `files` whitelist (no tests/zip/wrappers) | `22` | PASS |
| 23 (CR) | `cli.js setup` defaults target to `process.cwd()` | `23` | PASS |
| 24 (CR) | `cli.js setup --scope user` installs the global engine | `24` | PASS |
| 25 (CR) | `cli.js uninstall` preserves snapshots | `25` | PASS |
| 26 (CR) | no subcommand → help + exit 0; invalid subcommand → exit 1 | `26` | PASS |
| 27 (CR) | hook installed via cli.js runs offline with plain node | `27` | PASS |
| 28 (CR) | install.js works as function (cli.js) and direct (`node scripts/install.js`) | `28` (+ `23`–`25`) | PASS |

¹ Criteria 4, 5, the runtime half of 12, and 13 are executed by the Devin CLI agent/LLM
(skill invocation and language adaptation) and cannot be asserted without a live Devin CLI
session. The static half of 12 (all trigger phrases present in both SKILL.md files in the
three languages) is verified automatically (`12s`). To verify manually inside a Devin CLI
session in an installed project:

1. Say "salva memória" / "save memory" / "guardar memoria" → memory-save runs, a file
   appears under `.devin/memory/snapshots/` and a line is inserted in `index.md` (4, 12).
2. Run `/clear`, then say "continua de onde paramos" / "resume" / "continúa donde lo
   dejamos" → memory-resume loads the latest snapshot and re-reads the listed files (5, 12).
3. Set `.devin/memory/.session-state.json` → `accumulated_chars: 500000`, send a prompt in
   Spanish and one in English → the model's reminder follows the prompt language (13).

## Wrapper evidence

- `install.ps1 -Target <tmp> -Lang pt-BR` → exit 0, localized summary
  (`devin-memory instalado (escopo: project, memoria: project)...`);
  `uninstall.ps1 -Target <tmp> -Purge -Yes` → exit 0, memory dir purged.
- `sh -n install.sh / uninstall.sh` → OK; full install/purge cycle through the sh
  wrappers under Git Bash (MINGW64) → exit 0.

## Raw output

```
devin-memory smoke tests — sandbox: %TEMP%\devin-memory-smoke-<pid>

— project scope —
  PASS  [inst] installer exits 0 (project scope)
  PASS  [1] hook runs, exit 0, accumulates chars
  PASS  [1b] .session-log.jsonl has >= 1 line
  PASS  [1c] no alert below threshold (empty stdout)
  PASS  [2] alert emitted past 75%
  PASS  [2b] hookSpecificOutput has hookEventName + <system_guidance>
  PASS  [2c] last_alert_ts updated
  PASS  [3] no second alert within cooldown
  PASS  [9] DEVIN_MEMORY_LANG=es -> Spanish banner
  PASS  [10] LANG=pt_BR.UTF-8 -> pt-BR banner
  PASS  [11] unknown lang (fr) -> English fallback, exit 0
  PASS  [6] second install: 1 hook entry, 1 AGENTS block, no .bak files
  PASS  [7] uninstall preserves snapshots/, index.md, README.md
  PASS  [7b] uninstall removes engine + hook entry + AGENTS block
  PASS  [7c] uninstall removes system files, keeps data
  PASS  [8] uninstall --purge removes the entire memory dir
  PASS  [14] install --lang es: config.json pinned + Spanish banner without env

— user scope (sandboxed fake home) —
  PASS  [17] user scope: hook registered in user config with ABSOLUTE path
  PASS  [17b] user scope: skills + engine config in user dir, no AGENTS.md in project
  PASS  [18] global engine + project memory: two distinct .devin/memory dirs
  PASS  [20] anti-junk: no .devin/ created in non-project dir, exit 0, silent
  PASS  [21] uninstall --scope user: user engine + config cleaned
  PASS  [21b] uninstall --scope user: project files untouched

— user (namespaced) memory —
  PASS  [19] memory user: namespaced dir created, key stable, distinct per project
  PASS  [19b] .projects.json maps keys to project paths
  PASS  [19c] hook writes session state into the namespaced memory dir

— npm/npx delivery (cli.js) —
  PASS  [22] npm pack: whitelist only (no tests/zip/wrappers)
  PASS  [23] cli.js setup: target defaults to cwd
  PASS  [27] hook installed via cli.js runs offline with plain node
  PASS  [25] cli.js uninstall: engine removed, snapshots preserved
  PASS  [24] cli.js setup --scope user: global engine, absolute hook path
  PASS  [26] cli.js: no subcommand -> help + exit 0; invalid -> exit 1
  PASS  [28] node scripts/install.js (direct, no target): installs into cwd

— static checks —
  PASS  [15] three READMEs exist and cross-link each other
  PASS  [15b] READMEs carry the non-affiliation disclaimer
  PASS  [16] terminal strings are accent-free (ASCII) in all 3 languages
  PASS  [12s] trigger phrases present in both skills for all 3 languages
  MANUAL[4] memory-save creates a snapshot + updates index.md — requires the Devin CLI agent (manual)
  MANUAL[5] memory-resume loads the latest snapshot and re-reads files — requires the Devin CLI agent (manual)
  MANUAL[12] runtime trigger matching (6 cases) — requires the Devin CLI agent (manual; static half verified above)
  MANUAL[13] additionalContext makes the model remind in the prompt language — requires the LLM (manual)

37 passed, 0 failed, 4 manual
```
