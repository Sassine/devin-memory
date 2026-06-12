**English** · [Português](README.pt-BR.md) · [Español](README.es.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Sassine/devin-memory/main/banner.png" alt="devin-memory — Memory + context for Devin CLI" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/devin-memory"><img src="https://img.shields.io/npm/v/devin-memory.svg?logo=npm&logoColor=fff&style=flat&labelColor=2C2C2C&color=28CF8D" alt="npm version" /></a>
</p>

Never lose a Devin CLI session again. **devin-memory** watches your context usage,
warns you *before* the window fills up, and lets you save and resume your session —
so `/clear` stops meaning "start over".

> Unofficial community project, **not affiliated with Cognition AI**.
> "Devin" is a trademark of Cognition AI.

## Install

From the root of your project:

```sh
npx devin-memory@latest setup
```

That's it. Everything is installed into `.devin/` — no dependencies, no servers,
nothing running in the background. npm is only the installer; at runtime everything
is local and offline.

<sub>No npm? Clone the repo and run `node scripts/install.js` instead.</sub>

## How it works

1. **Work normally.** On every prompt, a hook estimates how full your context is.
2. **Past ~75% you get warned** — the agent reminds you, in your language, to save.
3. **`/memory-save`** (or just say *"save memory"*) → your session state is written to
   a markdown snapshot: objective, progress, decisions, files, next steps.
4. **`/clear`** — with zero anxiety.
5. **`/memory-resume`** (or *"continue where we left off"*) → the agent reloads the
   snapshot, re-reads the relevant files and picks up exactly where you stopped.

<p align="center">
  <img src="https://raw.githubusercontent.com/Sassine/devin-memory/main/docs/alert-screenshot.png" alt="The devin-memory warning in the Devin CLI at ~84% context usage" />
  <br>
  <sub>The warning in action — the agent reminds you in whatever language you're writing in.</sub>
</p>

Snapshots are plain markdown in `.devin/memory/snapshots/` — readable by you, by any
agent, and committable so your team (or the cloud sandbox) gets them too.

Works in English, Portuguese and Spanish — the agent always answers in the language
you're writing in.

## Options

| Flag | What it does |
|---|---|
| `--scope user` | Install the engine once, globally, instead of per project |
| `--memory user` | Keep memory data out of the repo (in `~/.devin-memory/`) |
| `--lang en\|pt-BR\|es` | Pin the language of terminal messages |

Example: `npx devin-memory@latest setup --scope user --lang pt-BR`

## Uninstall

```sh
npx devin-memory@latest uninstall          # removes the system, KEEPS your snapshots
npx devin-memory@latest uninstall --purge  # removes everything, snapshots included
```

## Good to know

- The usage estimate is a heuristic (characters, not real tokens) — `/context` remains
  the official number.
- `/clear` is still yours to run; the system can't clear for you.
- Re-run `setup` on each machine — the hook registration is machine-local.

Curious about the internals (hook schema, install scopes, i18n, CLI quirks)?
See the [technical reference](docs/TECHNICAL.md).

## License

MIT — see [LICENSE](LICENSE).
