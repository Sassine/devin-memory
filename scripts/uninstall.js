#!/usr/bin/env node
/*
 * devin-memory v1.0.0 — uninstaller
 *
 * Usage:
 *   npx devin-memory@latest uninstall [target] [--scope project|user] [--purge] [--yes]
 *   node scripts/uninstall.js [target] [flags]   # offline / cloned-repo fallback
 *
 * [target] is optional and defaults to the current working directory.
 *
 * Default (no --purge): removes engine code, hook entries, AGENTS.md block and
 * system files, but PRESERVES the user's snapshots, index.md and README.md.
 * --purge removes the entire memory directory (asks for confirmation; --yes skips it).
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var childProcess = require('child_process');
var readline = require('readline');

var PKG_ROOT = path.resolve(__dirname, '..');
var PKG_DIR = path.join(PKG_ROOT, 'package');

var AGENTS_BEGIN = '<!-- BEGIN devin-memory v1 -->';
var AGENTS_END = '<!-- END devin-memory v1 -->';
var HOOK_FILENAME = 'context-monitor.js';

// ---------------------------------------------------------------------------
// Utilities (same conventions as install.js)
// ---------------------------------------------------------------------------
function log(msg) { console.log(msg); }
function fail(msg) { console.error('[devin-memory] ERROR: ' + msg); process.exit(1); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
function expandHome(p) {
  return p && p.charAt(0) === '~' ? path.join(os.homedir(), p.slice(1)) : p;
}
function userConfigDir() {
  if (process.platform === 'win32') {
    var appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'devin');
  }
  var base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'devin');
}
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
}
function shortHash(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
}
function gitOutput(args, cwd) {
  try {
    var out = childProcess.execSync('git ' + args, {
      cwd: cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000
    });
    return String(out).trim();
  } catch (e) { return ''; }
}
function removeIfExists(file, label) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    log('  removed ' + (label || file));
    return true;
  }
  return false;
}
function rmrf(p) {
  if (!fs.existsSync(p)) return;
  var st = fs.lstatSync(p);
  if (st.isDirectory() && !st.isSymbolicLink()) {
    fs.readdirSync(p).forEach(function (name) { rmrf(path.join(p, name)); });
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}
function rmdirIfEmpty(dir) {
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch (e) { /* best effort */ }
}

function normalizeRemoteUrl(url) {
  var u = String(url).trim().toLowerCase();
  u = u.replace(/\.git$/, '');
  u = u.replace(/^[a-z+]+:\/\//, '');
  u = u.replace(/^[^@\/]+@/, '');
  u = u.replace(/:/g, '/');
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

function t(key, lang, vars) {
  var messages = readJson(path.join(PKG_DIR, 'i18n', 'messages.json')) || {};
  var entry = messages[key] || {};
  var tpl = entry[lang] || entry['en'] || key;
  return tpl.replace(/\{(\w+)\}/g, function (m, k) {
    return vars && vars[k] !== undefined ? String(vars[k]) : m;
  });
}
function normalizeLang(v) {
  if (!v) return null;
  var low = String(v).trim().toLowerCase();
  if (/^pt[-_]br/.test(low)) return 'pt-BR';
  if (/^es/.test(low)) return 'es';
  if (/^en/.test(low)) return 'en';
  return null;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function removeAgentsBlock(agentsPath) {
  if (!fs.existsSync(agentsPath)) return;
  var content = fs.readFileSync(agentsPath, 'utf8');
  var begin = content.indexOf(AGENTS_BEGIN);
  var end = content.indexOf(AGENTS_END);
  if (begin === -1 || end === -1 || end <= begin) return;
  var rest = content.slice(0, begin) + content.slice(end + AGENTS_END.length);
  if (rest.trim() === '') {
    fs.unlinkSync(agentsPath);
    log('  removed AGENTS.md (only contained the devin-memory block)');
  } else {
    fs.writeFileSync(agentsPath, rest.replace(/\n{3,}/g, '\n\n'), 'utf8');
    log('  removed devin-memory block from AGENTS.md');
  }
}

// Remove every context-monitor entry from a hook config file; clean empty keys.
function unregisterHook(configPath) {
  var cfg = readJson(configPath);
  if (!cfg || typeof cfg !== 'object') return;
  var changed = false;
  if (cfg.hooks && Array.isArray(cfg.hooks.UserPromptSubmit)) {
    var matchers = cfg.hooks.UserPromptSubmit;
    for (var i = 0; i < matchers.length; i++) {
      var entry = matchers[i];
      if (!entry || !Array.isArray(entry.hooks)) continue;
      var kept = entry.hooks.filter(function (h) {
        return !(h && typeof h.command === 'string' && h.command.indexOf(HOOK_FILENAME) !== -1);
      });
      if (kept.length !== entry.hooks.length) { entry.hooks = kept; changed = true; }
    }
    var filtered = matchers.filter(function (m) { return m && Array.isArray(m.hooks) && m.hooks.length > 0; });
    if (filtered.length !== matchers.length) changed = true;
    if (filtered.length === 0) delete cfg.hooks.UserPromptSubmit;
    else cfg.hooks.UserPromptSubmit = filtered;
    if (cfg.hooks && Object.keys(cfg.hooks).length === 0) { delete cfg.hooks; changed = true; }
  }
  if (changed) {
    writeJson(configPath, cfg);
    log('  removed hook entry from ' + configPath);
  }
}

function removeEngineFiles(engineDir) {
  removeIfExists(path.join(engineDir, 'hooks', HOOK_FILENAME));
  rmdirIfEmpty(path.join(engineDir, 'hooks'));
  ['memory-save', 'memory-resume'].forEach(function (skill) {
    var dir = path.join(engineDir, 'skills', skill);
    if (fs.existsSync(dir)) { rmrf(dir); log('  removed ' + dir); }
  });
  rmdirIfEmpty(path.join(engineDir, 'skills'));
  removeIfExists(path.join(engineDir, 'i18n', 'messages.json'));
  rmdirIfEmpty(path.join(engineDir, 'i18n'));
}

// Remove system files from a memory dir, preserving snapshots/index/README.
function cleanMemorySystemFiles(memoryDir) {
  if (!fs.existsSync(memoryDir)) return;
  removeIfExists(path.join(memoryDir, 'config.json'));
  removeIfExists(path.join(memoryDir, '.session-state.json'));
  removeIfExists(path.join(memoryDir, '.session-log.jsonl'));
  var i18nDir = path.join(memoryDir, 'i18n');
  if (fs.existsSync(i18nDir)) { rmrf(i18nDir); log('  removed ' + i18nDir); }
  log('  preserved snapshots/, index.md and README.md in ' + memoryDir);
}

function purgeMemory(memoryDir, memoryBase, projectKey) {
  if (fs.existsSync(memoryDir)) {
    rmrf(memoryDir);
    log('  purged ' + memoryDir);
  }
  if (memoryBase && projectKey) {
    var indexFile = path.join(memoryBase, '.projects.json');
    var index = readJson(indexFile);
    if (index && index[projectKey]) {
      delete index[projectKey];
      writeJson(indexFile, index);
      log('  removed key "' + projectKey + '" from .projects.json');
    }
  }
}

function confirmPurge(memoryDir, cb) {
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('[devin-memory] --purge will DELETE the entire memory folder:\n  ' +
    memoryDir + '\nType "yes" to confirm: ', function (answer) {
    rl.close();
    cb(String(answer).trim().toLowerCase() === 'yes');
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  var args = { target: null, scope: null, purge: false, yes: false };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--scope') args.scope = argv[++i];
    else if (a === '--purge') args.purge = true;
    else if (a === '--yes') args.yes = true;
    else if (a.charAt(0) === '-') fail('unknown flag "' + a + '"');
    else if (!args.target) args.target = a;
    else fail('unexpected argument "' + a + '"');
  }
  if (!args.target) args.target = process.cwd();
  if (args.scope && args.scope !== 'project' && args.scope !== 'user') {
    fail('invalid --scope "' + args.scope + '" (use project or user)');
  }
  return args;
}

function main(argv) {
  var args = parseArgs(argv || []);
  var target = path.resolve(args.target);
  var lang = normalizeLang(process.env.DEVIN_MEMORY_LANG) ||
    normalizeLang(process.env.LC_ALL || process.env.LANG) || 'en';

  // Auto-detect scope: project engine first, then user engine.
  var scope = args.scope;
  if (!scope) {
    if (fs.existsSync(path.join(target, '.devin', 'hooks', HOOK_FILENAME))) scope = 'project';
    else if (fs.existsSync(path.join(userConfigDir(), 'hooks', HOOK_FILENAME))) scope = 'user';
    else { log('[devin-memory] nothing to uninstall (no engine found for ' + target + ')'); return; }
  }
  log('[devin-memory] uninstalling (scope: ' + scope + ', target: ' + target + (args.purge ? ', PURGE' : '') + ')');

  var engineDir = scope === 'user' ? userConfigDir() : path.join(target, '.devin');
  var engineCfg = readJson(path.join(engineDir, 'devin-memory.config.json')) ||
    (scope === 'project' ? readJson(path.join(userConfigDir(), 'devin-memory.config.json')) : null);
  var memoryMode = engineCfg && engineCfg.memory_mode === 'user' ? 'user' : 'project';
  var memoryBase = expandHome((engineCfg && engineCfg.memory_base) || '~/.devin-memory');
  var projectKey = memoryMode === 'user' ? resolveProjectKey(target) : null;

  // Memory dir this uninstall run is responsible for. At user scope with
  // project-mode memory, per-project files are intentionally left untouched.
  var memoryDir = null;
  if (memoryMode === 'user') memoryDir = path.join(memoryBase, projectKey);
  else if (scope === 'project') memoryDir = path.join(target, '.devin', 'memory');

  function finish() {
    if (scope === 'project') {
      removeAgentsBlock(path.join(target, 'AGENTS.md'));
      unregisterHook(path.join(target, '.devin', 'config.local.json'));
      unregisterHook(path.join(target, '.devin', 'hooks.v1.json'));
      removeEngineFiles(path.join(target, '.devin'));
      removeIfExists(path.join(target, '.devin', 'devin-memory.config.json'));
      rmdirIfEmpty(path.join(target, '.devin'));
    } else {
      unregisterHook(path.join(userConfigDir(), 'config.json'));
      removeEngineFiles(userConfigDir());
      removeIfExists(path.join(userConfigDir(), 'devin-memory.config.json'));
      if (memoryMode === 'project') {
        log('  per-project memory folders left untouched (run uninstall --scope project in each project to clean them)');
      }
    }
    log('');
    log(t(args.purge ? 'uninstall.purged' : 'uninstall.done', lang, {}));
  }

  if (args.purge && memoryDir) {
    if (args.yes) {
      purgeMemory(memoryDir, memoryMode === 'user' ? memoryBase : null, projectKey);
      finish();
    } else if (!process.stdin.isTTY) {
      fail('--purge requires confirmation; re-run with --yes in non-interactive mode');
    } else {
      confirmPurge(memoryDir, function (ok) {
        if (!ok) fail('purge aborted by user');
        purgeMemory(memoryDir, memoryMode === 'user' ? memoryBase : null, projectKey);
        finish();
      });
    }
  } else {
    if (memoryDir) cleanMemorySystemFiles(memoryDir);
    finish();
  }
}

module.exports = main;
if (require.main === module) main(process.argv.slice(2));
