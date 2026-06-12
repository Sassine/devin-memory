#!/usr/bin/env node
/*
 * devin-memory v1.0.0 — installer
 *
 * Usage:
 *   npx devin-memory@latest setup [target] [--scope project|user] [--memory project|user]
 *                                          [--lang en|pt-BR|es] [--agents]
 *   node scripts/install.js [target] [flags]   # offline / cloned-repo fallback
 *
 * [target] is optional and defaults to the current working directory.
 *
 * Zero npm dependencies (npm is only the delivery mechanism). Node >= 12.
 * Idempotent: running twice never duplicates hook entries, AGENTS.md blocks,
 * or creates .bak files when nothing changed.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var childProcess = require('child_process');

var PKG_ROOT = path.resolve(__dirname, '..');
var PKG_DIR = path.join(PKG_ROOT, 'package');

var AGENTS_BEGIN = '<!-- BEGIN devin-memory v1 -->';
var AGENTS_END = '<!-- END devin-memory v1 -->';
var HOOK_FILENAME = 'context-monitor.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function log(msg) { console.log(msg); }
function fail(msg) { console.error('[devin-memory] ERROR: ' + msg); process.exit(1); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }
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
function timestamp() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
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

// Copy src -> dest. Skips when identical; backs up to .bak.<ts> when different.
function installFile(src, dest) {
  var content = fs.readFileSync(src);
  if (fs.existsSync(dest)) {
    var existing = fs.readFileSync(dest);
    if (existing.equals(content)) return 'unchanged';
    fs.copyFileSync(dest, dest + '.bak.' + timestamp());
    fs.writeFileSync(dest, content);
    return 'updated (backup created)';
  }
  mkdirp(path.dirname(dest));
  fs.writeFileSync(dest, content);
  return 'installed';
}

// ---------------------------------------------------------------------------
// Args / lang
// ---------------------------------------------------------------------------
function normalizeLang(v) {
  if (!v) return null;
  var low = String(v).trim().toLowerCase();
  if (/^pt[-_]br/.test(low)) return 'pt-BR';
  if (/^es/.test(low)) return 'es';
  if (/^en/.test(low)) return 'en';
  return null;
}

function parseArgs(argv) {
  var args = { target: null, scope: 'project', memory: 'project', lang: null, agents: false };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--scope') {
      args.scope = argv[++i];
    } else if (a === '--memory') {
      args.memory = argv[++i];
    } else if (a === '--lang') {
      args.lang = argv[++i];
      if (!normalizeLang(args.lang)) fail('invalid --lang "' + args.lang + '" (use en, pt-BR or es)');
      args.lang = normalizeLang(args.lang);
    } else if (a === '--agents') {
      args.agents = true;
    } else if (a.charAt(0) === '-') {
      fail('unknown flag "' + a + '"');
    } else if (!args.target) {
      args.target = a;
    } else {
      fail('unexpected argument "' + a + '"');
    }
  }
  if (!args.target) args.target = process.cwd();
  if (args.scope !== 'project' && args.scope !== 'user') fail('invalid --scope "' + args.scope + '" (use project or user)');
  if (args.memory !== 'project' && args.memory !== 'user') fail('invalid --memory "' + args.memory + '" (use project or user)');
  return args;
}

// Auto-detected language from the environment (null when there is no signal —
// in that case the memory config gets no "lang" key and the hook resolves the
// language dynamically at runtime).
function detectLang() {
  return normalizeLang(process.env.DEVIN_MEMORY_LANG) ||
    normalizeLang(process.env.LC_ALL || process.env.LANG) ||
    null;
}

// ---------------------------------------------------------------------------
// Project key (memory_mode user) — spec §3.5
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Hook registration (merge, deduplicated by command) — spec §4 / §7.2 step 5
// ---------------------------------------------------------------------------
function registerHook(configPath, command) {
  var cfg = readJson(configPath);
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};
  if (!cfg.hooks || typeof cfg.hooks !== 'object') cfg.hooks = {};
  var matchers = cfg.hooks.UserPromptSubmit;
  if (!Array.isArray(matchers)) matchers = cfg.hooks.UserPromptSubmit = [];

  var already = false;
  var changed = false;
  for (var i = 0; i < matchers.length; i++) {
    var entry = matchers[i];
    if (!entry || !Array.isArray(entry.hooks)) continue;
    var kept = [];
    for (var j = 0; j < entry.hooks.length; j++) {
      var h = entry.hooks[j];
      var cmd = h && typeof h.command === 'string' ? h.command : '';
      if (cmd.indexOf(HOOK_FILENAME) !== -1) {
        if (cmd === command && !already) { already = true; kept.push(h); }
        else changed = true; // stale/duplicate context-monitor entry — drop it
      } else {
        kept.push(h);
      }
    }
    entry.hooks = kept;
  }
  // drop matcher groups left empty
  var filtered = matchers.filter(function (m) { return m && Array.isArray(m.hooks) && m.hooks.length > 0; });
  if (filtered.length !== matchers.length) { changed = true; }
  cfg.hooks.UserPromptSubmit = matchers = filtered;

  if (!already) {
    var target = null;
    for (var k = 0; k < matchers.length; k++) {
      if (matchers[k] && matchers[k].matcher === '') { target = matchers[k]; break; }
    }
    if (!target) {
      target = { matcher: '', hooks: [] };
      matchers.push(target);
    }
    target.hooks.push({ type: 'command', command: command });
    changed = true;
  }

  if (changed) {
    mkdirp(path.dirname(configPath));
    writeJson(configPath, cfg);
  }
  return already ? 'already registered' : 'registered';
}

// ---------------------------------------------------------------------------
// AGENTS.md merge — spec §5.4 / §7.2 step 7
// ---------------------------------------------------------------------------
function injectAgentsBlock(agentsPath, block) {
  block = block.replace(/\s+$/, '');
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, block + '\n', 'utf8');
    return 'created';
  }
  var content = fs.readFileSync(agentsPath, 'utf8');
  var begin = content.indexOf(AGENTS_BEGIN);
  var end = content.indexOf(AGENTS_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    var current = content.slice(begin, end + AGENTS_END.length);
    if (current === block) return 'unchanged';
    fs.writeFileSync(agentsPath, content.slice(0, begin) + block + content.slice(end + AGENTS_END.length), 'utf8');
    return 'updated';
  }
  var sep = content.length && !/\n$/.test(content) ? '\n\n' : '\n';
  fs.writeFileSync(agentsPath, content + sep + block + '\n', 'utf8');
  return 'appended';
}

// ---------------------------------------------------------------------------
// i18n for the final summary — spec §15.9
// ---------------------------------------------------------------------------
function t(key, lang, vars) {
  var messages = readJson(path.join(PKG_DIR, 'i18n', 'messages.json')) || {};
  var entry = messages[key] || {};
  var tpl = entry[lang] || entry['en'] || key;
  return tpl.replace(/\{(\w+)\}/g, function (m, k) {
    return vars && vars[k] !== undefined ? String(vars[k]) : m;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(argv) {
  var args = parseArgs(argv || []);

  // 1. Validate target
  var target = path.resolve(args.target);
  if (!fs.existsSync(target)) fail('target does not exist: ' + target);
  if (!fs.statSync(target).isDirectory()) fail('target is not a directory: ' + target);
  try {
    fs.accessSync(target, fs.constants.W_OK);
  } catch (e) {
    fail('target is not writable: ' + target);
  }

  // 2. Resolve language and scopes
  var detected = detectLang();
  var lang = args.lang || detected || 'en';
  var engineDir = args.scope === 'user' ? userConfigDir() : path.join(target, '.devin');
  var hookConfigPath = args.scope === 'user'
    ? path.join(userConfigDir(), 'config.json')
    : path.join(target, '.devin', 'config.local.json');

  log('[devin-memory] installing v1.0.0');
  log('  target : ' + target);
  log('  scope  : ' + args.scope + ' (engine at ' + engineDir + ')');
  log('  memory : ' + args.memory);
  log('  lang   : ' + lang + (args.lang ? ' (explicit)' : detected ? ' (auto-detected)' : ' (default)'));

  // 3. Resolve memory dir
  var memoryBase = expandHome('~/.devin-memory');
  var memoryDir, projectKey = null;
  if (args.memory === 'user') {
    projectKey = resolveProjectKey(target);
    memoryDir = path.join(memoryBase, projectKey);
  } else {
    memoryDir = path.join(target, '.devin', 'memory');
  }
  log('  data   : ' + memoryDir);

  // 4. Copy engine code (hook + skills; i18n alongside the engine at user scope)
  mkdirp(path.join(engineDir, 'hooks'));
  var r = installFile(path.join(PKG_DIR, 'hooks', HOOK_FILENAME), path.join(engineDir, 'hooks', HOOK_FILENAME));
  log('  hook script: ' + r);
  ['memory-save', 'memory-resume'].forEach(function (skill) {
    var res = installFile(
      path.join(PKG_DIR, 'skills', skill, 'SKILL.md'),
      path.join(engineDir, 'skills', skill, 'SKILL.md')
    );
    log('  skill ' + skill + ': ' + res);
  });
  if (args.scope === 'user') {
    r = installFile(path.join(PKG_DIR, 'i18n', 'messages.json'), path.join(engineDir, 'i18n', 'messages.json'));
    log('  engine i18n catalog: ' + r);
  }

  // 5. Register the hook. The Devin CLI spawns hook commands WITHOUT PATH
  // lookup (a bare "node" or "cmd" fails with "program not found"), so the
  // program must be the absolute path of the running Node executable. The
  // script argument stays relative at project scope (resolved from the
  // project root) and absolute at user scope (§3.3).
  var nodeExe = '"' + process.execPath.replace(/\\/g, '/') + '"';
  var command;
  if (args.scope === 'user') {
    var absHook = path.join(engineDir, 'hooks', HOOK_FILENAME).replace(/\\/g, '/');
    command = nodeExe + ' "' + absHook + '"';
  } else {
    command = nodeExe + ' .devin/hooks/' + HOOK_FILENAME;
  }
  r = registerHook(hookConfigPath, command);
  log('  hook config (' + hookConfigPath + '): ' + r);
  // Newer CLIs also read .devin/hooks.v1.json — mirror the entry only if the
  // file already exists (evidence that this CLI version supports it).
  var hooksV1 = path.join(target, '.devin', 'hooks.v1.json');
  if (args.scope === 'project' && fs.existsSync(hooksV1)) {
    r = registerHook(hooksV1, command);
    log('  hooks.v1.json: ' + r);
  }

  // 6. Scope configs
  if (args.scope === 'user') {
    var globalCfgPath = path.join(userConfigDir(), 'devin-memory.config.json');
    var globalCfg = readJson(globalCfgPath) || {};
    globalCfg.version = '1';
    globalCfg.memory_mode = args.memory;
    if (!globalCfg.memory_base) globalCfg.memory_base = '~/.devin-memory';
    if (args.lang || !globalCfg.lang_default) globalCfg.lang_default = lang;
    writeJson(globalCfgPath, globalCfg);
    log('  engine config: ' + globalCfgPath);
  } else if (args.memory === 'user') {
    // project engine + user memory: record the mode next to the engine
    var localCfgPath = path.join(target, '.devin', 'devin-memory.config.json');
    var localCfg = readJson(localCfgPath) || {};
    localCfg.version = '1';
    localCfg.memory_mode = 'user';
    if (!localCfg.memory_base) localCfg.memory_base = '~/.devin-memory';
    writeJson(localCfgPath, localCfg);
    log('  engine config: ' + localCfgPath);
  }

  // 7. AGENTS.md (project scope only, unless --agents forces it)
  if (args.scope === 'project' || args.agents) {
    var block = fs.readFileSync(path.join(PKG_DIR, 'templates', 'AGENTS-block.md'), 'utf8');
    r = injectAgentsBlock(path.join(target, 'AGENTS.md'), block);
    log('  AGENTS.md: ' + r);
  } else {
    log('  AGENTS.md: skipped (user scope; use --agents to force)');
  }

  // 8. Seed the memory directory
  mkdirp(path.join(memoryDir, 'snapshots'));
  [
    ['memory-README.md', 'README.md'],
    ['memory-index.md', 'index.md'],
    ['memory-gitignore', '.gitignore']
  ].forEach(function (pair) {
    var dest = path.join(memoryDir, pair[1]);
    if (fs.existsSync(dest)) {
      log('  memory ' + pair[1] + ': unchanged (kept existing)');
    } else {
      fs.copyFileSync(path.join(PKG_DIR, 'templates', pair[0]), dest);
      log('  memory ' + pair[1] + ': installed');
    }
  });
  r = installFile(path.join(PKG_DIR, 'i18n', 'messages.json'), path.join(memoryDir, 'i18n', 'messages.json'));
  log('  memory i18n catalog: ' + r);

  var memCfgPath = path.join(memoryDir, 'config.json');
  var memCfg = readJson(memCfgPath);
  if (!memCfg) {
    memCfg = { version: '1' };
    // Only pin the language when there is an explicit choice or an environment
    // signal; otherwise the hook resolves it dynamically (LC_ALL/LANG) at runtime.
    if (args.lang || detected) memCfg.lang = lang;
    writeJson(memCfgPath, memCfg);
    log('  memory config.json: installed');
  } else if (args.lang && memCfg.lang !== args.lang) {
    memCfg.lang = args.lang;
    writeJson(memCfgPath, memCfg);
    log('  memory config.json: lang updated to ' + args.lang);
  } else {
    log('  memory config.json: unchanged (kept existing)');
  }

  // Global project index (memory_mode user)
  if (args.memory === 'user') {
    var indexFile = path.join(memoryBase, '.projects.json');
    var index = readJson(indexFile) || {};
    if (!index[projectKey] || index[projectKey].path !== target) {
      index[projectKey] = { path: target, updated_at: new Date().toISOString() };
      writeJson(indexFile, index);
    }
    log('  projects index: ' + indexFile + ' (key: ' + projectKey + ')');
  }

  // 9. Localized summary
  log('');
  log(t('install.done', lang, { scope: args.scope, memory: args.memory }));
  log(t('install.next', lang, {}));
}

module.exports = main;
if (require.main === module) main(process.argv.slice(2));
