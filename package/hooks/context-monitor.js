#!/usr/bin/env node
/*
 * devin-memory v1.0.0 — context-monitor hook (UserPromptSubmit)
 *
 * Estimates context usage from accumulated prompt chars and, past a threshold,
 * emits a `systemMessage` banner plus a `<system_guidance>` injection so the
 * model proactively reminds the user to run /memory-save before the context
 * fills up.
 *
 * Zero npm dependencies. Node >= 12. ALWAYS exits 0 — never breaks the CLI.
 *
 * Output schema (Devin CLI 4.24.1, Claude Code hook format):
 *   { "systemMessage": "...",
 *     "hookSpecificOutput": { "hookEventName": "UserPromptSubmit",
 *                             "additionalContext": "<system_guidance>...</system_guidance>" } }
 * Top-level `additionalContext` is silently ignored by the CLI — do not use it.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var childProcess = require('child_process');

// ---------------------------------------------------------------------------
// Tunables (heuristics — chars, not real tokens; /context is the source of truth)
// ---------------------------------------------------------------------------
var ESTIMATED_CONTEXT_BUDGET_CHARS = 600000; // conservative window estimate for Opus-class models
var ALERT_THRESHOLD_PCT = 75;
var ALERT_COOLDOWN_SECONDS = 120;
var OVERHEAD_PER_TURN = 2000;

// Embedded English fallback — used when no i18n catalog can be loaded.
var EMBEDDED_MESSAGES = {
  'hook.alert.systemMessage': {
    'en': "[memory] Estimated context at ~{pct}% ({chars} chars accumulated). Run /memory-save (or say 'save memory') before the context fills up."
  }
};

// Language-agnostic by design: instructs the model to remind the user in
// whatever language the user is writing in. Do not translate (see spec §15.4).
var ADDITIONAL_CONTEXT_TEMPLATE =
  '<system_guidance>Estimated context usage for this session is ~{pct}%\n' +
  '(heuristic estimate based on accumulated chars, not real tokens).\n' +
  'Before answering normally, proactively remind the user — IN THE SAME LANGUAGE\n' +
  'THEY ARE WRITING IN — that they can run /memory-save (or say the equivalent of\n' +
  '"save memory") to snapshot the current state into the memory folder, then run /clear,\n' +
  'then /memory-resume to continue where they left off.\n' +
  'Render the reminder as the VERY FIRST line of your reply, in exactly this shape:\n' +
  '⚠️ **[devin-memory ~{pct}%]** <reminder in the user\'s language, max 2 sentences>\n' +
  '(the "[devin-memory ~{pct}%]" marker is a brand label — keep it verbatim, never\n' +
  'translate it; only the reminder sentence adapts to the user\'s language)\n' +
  'followed by a blank line; then answer the original question normally.</system_guidance>';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function expandHome(p) {
  if (p && p.charAt(0) === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function userConfigDir() {
  if (process.platform === 'win32') {
    var appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'devin');
  }
  var base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'devin');
}

function gitOutput(args, cwd) {
  try {
    var out = childProcess.execSync('git ' + args, {
      cwd: cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000
    });
    return String(out).trim();
  } catch (e) {
    return '';
  }
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
}

function shortHash(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
}

// ---------------------------------------------------------------------------
// Project key (only used when memory_mode === 'user') — spec §3.5
// ---------------------------------------------------------------------------
function normalizeRemoteUrl(url) {
  var u = String(url).trim().toLowerCase();
  u = u.replace(/\.git$/, '');
  u = u.replace(/^[a-z+]+:\/\//, ''); // protocol
  u = u.replace(/^[^@\/]+@/, '');     // user@ (scp-like)
  u = u.replace(/:/g, '/');           // host:path -> host/path
  return slugify(u);
}

function resolveProjectKey(cwd) {
  var remote = gitOutput('config --get remote.origin.url', cwd);
  if (remote) return normalizeRemoteUrl(remote);
  var toplevel = gitOutput('rev-parse --show-toplevel', cwd);
  if (toplevel) {
    var abs = path.resolve(toplevel);
    return slugify(path.basename(abs)) + '-' + shortHash(abs);
  }
  var absCwd = path.resolve(cwd);
  return slugify(path.basename(absCwd)) + '-' + shortHash(absCwd);
}

function updateProjectsIndex(memoryBase, key, projectPath) {
  try {
    var indexFile = path.join(memoryBase, '.projects.json');
    var index = readJson(indexFile) || {};
    var entry = index[key];
    if (!entry || entry.path !== projectPath) {
      index[key] = { path: projectPath, updated_at: new Date().toISOString() };
      mkdirp(memoryBase);
      writeJson(indexFile, index);
    }
  } catch (e) { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Scope / memory dir resolution — spec §3
// ---------------------------------------------------------------------------
function loadEngineConfig() {
  // Engine-local config first (next to the engine that owns this script),
  // then the user-level config. Only exists when memory_mode was customized
  // or the engine is installed at user scope.
  var local = readJson(path.join(__dirname, '..', 'devin-memory.config.json'));
  if (local) return local;
  return readJson(path.join(userConfigDir(), 'devin-memory.config.json'));
}

function resolveMemoryDir(cwd, engineConfig) {
  var mode = engineConfig && engineConfig.memory_mode === 'user' ? 'user' : 'project';
  if (mode === 'project') {
    return { dir: path.join(cwd, '.devin', 'memory'), mode: mode };
  }
  var base = expandHome((engineConfig && engineConfig.memory_base) || '~/.devin-memory');
  var key = resolveProjectKey(cwd);
  return { dir: path.join(base, key), mode: mode, base: base, key: key };
}

function looksLikeProject(cwd) {
  return fs.existsSync(path.join(cwd, '.git')) || fs.existsSync(path.join(cwd, '.devin'));
}

// ---------------------------------------------------------------------------
// i18n — spec §15
// ---------------------------------------------------------------------------
function normalizeLang(v) {
  if (!v) return null;
  var low = String(v).trim().toLowerCase();
  if (!low) return null;
  if (/^pt[-_]br/.test(low)) return 'pt-BR';
  if (/^es/.test(low)) return 'es';
  if (/^en/.test(low)) return 'en';
  return null; // unknown -> keep walking the resolution chain (final fallback: en)
}

function resolveLang(memoryDir, engineConfig) {
  return normalizeLang(process.env.DEVIN_MEMORY_LANG) ||
    normalizeLang((readJson(path.join(memoryDir, 'config.json')) || {}).lang) ||
    normalizeLang(engineConfig && engineConfig.lang_default) ||
    normalizeLang(process.env.LC_ALL || process.env.LANG) ||
    'en';
}

function loadMessages(memoryDir) {
  return readJson(path.join(memoryDir, 'i18n', 'messages.json')) ||
    readJson(path.join(__dirname, '..', 'i18n', 'messages.json')) ||
    EMBEDDED_MESSAGES;
}

function t(messages, key, lang, vars) {
  vars = vars || {};
  var entry = messages[key] || EMBEDDED_MESSAGES[key] || {};
  var tpl = entry[lang] || entry['en'] || (EMBEDDED_MESSAGES[key] || {})['en'] || key;
  return tpl.replace(/\{(\w+)\}/g, function (m, k) {
    return vars[k] === undefined ? m : String(vars[k]);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

function main() {
  var input = {};
  try {
    input = JSON.parse(readStdin());
  } catch (e) {
    input = {};
  }
  if (!input || typeof input !== 'object') input = {};
  var prompt = typeof input.prompt === 'string' ? input.prompt : '';

  var cwd = process.cwd();
  var engineConfig = loadEngineConfig();
  var resolved = resolveMemoryDir(cwd, engineConfig);
  var memoryDir = resolved.dir;

  // Anti-junk guard (spec §3.6): never create memory in a directory that does
  // not look like a project — unless the memory already exists.
  if (!fs.existsSync(memoryDir)) {
    if (!looksLikeProject(cwd)) return;
    mkdirp(memoryDir);
  }
  if (resolved.mode === 'user') {
    updateProjectsIndex(resolved.base, resolved.key, path.resolve(cwd));
  }

  var lang = resolveLang(memoryDir, engineConfig);
  var messages = loadMessages(memoryDir);

  var stateFile = path.join(memoryDir, '.session-state.json');
  var state = readJson(stateFile) || {};
  var now = Math.floor(Date.now() / 1000);
  if (!state.session_start_ts) state.session_start_ts = now;

  // A new CLI session means a fresh context window — restart the estimate.
  if (input.session_id && state.session_id && input.session_id !== state.session_id) {
    state.accumulated_chars = 0;
    state.last_alert_ts = 0;
    state.session_start_ts = now;
  }
  if (input.session_id) state.session_id = input.session_id;

  var delta = prompt.length + OVERHEAD_PER_TURN;
  state.accumulated_chars = (state.accumulated_chars || 0) + delta;
  var pct = (state.accumulated_chars / ESTIMATED_CONTEXT_BUDGET_CHARS) * 100;
  var pctRounded = Math.round(pct);

  var shouldAlert = pct >= ALERT_THRESHOLD_PCT &&
    (now - (state.last_alert_ts || 0)) >= ALERT_COOLDOWN_SECONDS;

  try {
    fs.appendFileSync(
      path.join(memoryDir, '.session-log.jsonl'),
      JSON.stringify({
        ts: new Date().toISOString(),
        prompt_chars: prompt.length,
        delta_chars: delta,
        accumulated_chars: state.accumulated_chars,
        pct: Math.round(pct * 10) / 10,
        alerted: shouldAlert
      }) + '\n',
      'utf8'
    );
  } catch (e) { /* audit log is best effort */ }

  if (shouldAlert) {
    state.last_alert_ts = now;
    var output = {
      systemMessage: t(messages, 'hook.alert.systemMessage', lang, {
        pct: pctRounded,
        chars: state.accumulated_chars
      }),
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: ADDITIONAL_CONTEXT_TEMPLATE.replace(/\{pct\}/g, String(pctRounded))
      }
    };
    process.stdout.write(JSON.stringify(output));
  }

  writeJson(stateFile, state);
}

try {
  main();
} catch (e) {
  // Fail silent: never break the CLI. stderr is not propagated by the CLI,
  // but it helps when running the hook by hand.
  try { process.stderr.write('devin-memory hook error: ' + (e && e.stack || e) + '\n'); } catch (e2) { /* noop */ }
}
process.exitCode = 0;
