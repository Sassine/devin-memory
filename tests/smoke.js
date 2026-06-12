#!/usr/bin/env node
/*
 * devin-memory v1.0.0 — smoke tests (spec §11)
 *
 * Usage: node tests/smoke.js
 *
 * Fully sandboxed: user-scope operations run against a fake HOME/APPDATA inside
 * a temp directory — the real machine is never touched. Zero dependencies.
 *
 * Criteria 4, 5, 12 (runtime part) and 13 are LLM-driven (skills executed by the
 * Devin CLI agent) and cannot be automated here; they are reported as MANUAL,
 * with the static part of 12 (trigger phrases present) checked automatically.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var INSTALL = path.join(ROOT, 'scripts', 'install.js');
var UNINSTALL = path.join(ROOT, 'scripts', 'uninstall.js');
var TMP = path.join(os.tmpdir(), 'devin-memory-smoke-' + process.pid);

var passed = 0, failed = 0, manual = 0;
var failures = [];

function check(id, desc, cond, detail) {
  if (cond) {
    passed++;
    console.log('  PASS  [' + id + '] ' + desc);
  } else {
    failed++;
    failures.push(id + ' ' + desc + (detail ? ' :: ' + detail : ''));
    console.log('  FAIL  [' + id + '] ' + desc + (detail ? ' :: ' + detail : ''));
  }
}
function note(id, desc) {
  manual++;
  console.log('  MANUAL[' + id + '] ' + desc);
}

function mkdirp(d) { fs.mkdirSync(d, { recursive: true }); }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function read(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } }
function exists(f) { return fs.existsSync(f); }
function rmrf(p) {
  if (!fs.existsSync(p)) return;
  var st = fs.lstatSync(p);
  if (st.isDirectory() && !st.isSymbolicLink()) {
    fs.readdirSync(p).forEach(function (n) { rmrf(path.join(p, n)); });
    fs.rmdirSync(p);
  } else fs.unlinkSync(p);
}
function findFiles(dir, pred, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir).forEach(function (n) {
    var p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) findFiles(p, pred, acc);
    else if (pred(p)) acc.push(p);
  });
  return acc;
}

// Where the engine's user config dir lands inside a sandboxed fake home.
function fakeConfigDir(home) {
  return process.platform === 'win32'
    ? path.join(home, 'AppData', 'Roaming', 'devin')
    : path.join(home, '.config', 'devin');
}

// Minimal, locale-free child environment with a sandboxed home.
function makeEnv(home, extra) {
  var env = {};
  ['Path', 'PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'windir', 'SystemDrive'].forEach(function (k) {
    if (process.env[k]) env[k] = process.env[k];
  });
  env.USERPROFILE = home;
  env.HOME = home;
  env.APPDATA = path.join(home, 'AppData', 'Roaming');
  if (extra) Object.keys(extra).forEach(function (k) { env[k] = extra[k]; });
  return env;
}

function runNode(script, args, opts) {
  opts = opts || {};
  var r = childProcess.spawnSync(process.execPath, [script].concat(args || []), {
    cwd: opts.cwd || ROOT,
    env: opts.env,
    input: opts.input !== undefined ? opts.input : '',
    encoding: 'utf8',
    timeout: 60000
  });
  return r;
}

function runHook(hookPath, cwd, env, inputObj) {
  return runNode(hookPath, [], { cwd: cwd, env: env, input: JSON.stringify(inputObj || { prompt: 'hello', session_id: 'smoke-1' }) });
}

console.log('devin-memory smoke tests — sandbox: ' + TMP + '\n');
mkdirp(TMP);

// ===========================================================================
// Sandbox A — project scope (criteria 1, 2, 3, 6, 7, 8, 9, 10, 11, 14)
// ===========================================================================
console.log('— project scope —');
var homeA = path.join(TMP, 'homeA');
var proj1 = path.join(TMP, 'proj1');
mkdirp(homeA); mkdirp(proj1);
var envA = makeEnv(homeA);
var hookA = path.join(proj1, '.devin', 'hooks', 'context-monitor.js');
var memA = path.join(proj1, '.devin', 'memory');
var stateA = path.join(memA, '.session-state.json');

var r = runNode(INSTALL, [proj1], { env: envA });
check('inst', 'installer exits 0 (project scope)', r.status === 0, (r.stderr || '').trim());

// 1. hook executes
r = runHook(hookA, proj1, envA, { prompt: 'hello world', session_id: 'smoke-1' });
var st = readJson(stateA);
check('1', 'hook runs, exit 0, accumulates chars', r.status === 0 && st && st.accumulated_chars > 0, JSON.stringify({ status: r.status, state: st, err: (r.stderr || '').trim() }));
check('1b', '.session-log.jsonl has >= 1 line', read(path.join(memA, '.session-log.jsonl')).trim().split('\n').length >= 1);
check('1c', 'no alert below threshold (empty stdout)', r.stdout.trim() === '', r.stdout);

// 2. threshold fires
st.accumulated_chars = 500000; st.last_alert_ts = 0;
fs.writeFileSync(stateA, JSON.stringify(st));
r = runHook(hookA, proj1, envA, { prompt: 'next prompt', session_id: 'smoke-1' });
var out = null; try { out = JSON.parse(r.stdout); } catch (e) { /* checked below */ }
check('2', 'alert emitted past 75%', !!out && typeof out.systemMessage === 'string' && out.systemMessage.indexOf('[memory]') === 0, r.stdout.slice(0, 200));
check('2b', 'hookSpecificOutput has hookEventName + <system_guidance>', !!out && !!out.hookSpecificOutput &&
  out.hookSpecificOutput.hookEventName === 'UserPromptSubmit' &&
  out.hookSpecificOutput.additionalContext.indexOf('<system_guidance>') === 0);
check('2c', 'last_alert_ts updated', (readJson(stateA) || {}).last_alert_ts > 0);

// 3. cooldown
r = runHook(hookA, proj1, envA, { prompt: 'another prompt', session_id: 'smoke-1' });
check('3', 'no second alert within cooldown', r.status === 0 && r.stdout.trim() === '', r.stdout.slice(0, 200));

// 9. DEVIN_MEMORY_LANG=es
st = readJson(stateA); st.accumulated_chars = 500000; st.last_alert_ts = 0;
fs.writeFileSync(stateA, JSON.stringify(st));
r = runHook(hookA, proj1, makeEnv(homeA, { DEVIN_MEMORY_LANG: 'es' }), { prompt: 'hola', session_id: 'smoke-1' });
try { out = JSON.parse(r.stdout); } catch (e) { out = null; }
check('9', 'DEVIN_MEMORY_LANG=es -> Spanish banner', !!out && out.systemMessage.indexOf('[memoria] Contexto estimado en') === 0, r.stdout.slice(0, 120));

// 10. LANG=pt_BR auto-detect (memory config.json has no pinned lang: installed without env signal)
st = readJson(stateA); st.accumulated_chars = 500000; st.last_alert_ts = 0;
fs.writeFileSync(stateA, JSON.stringify(st));
r = runHook(hookA, proj1, makeEnv(homeA, { LANG: 'pt_BR.UTF-8' }), { prompt: 'oi', session_id: 'smoke-1' });
try { out = JSON.parse(r.stdout); } catch (e) { out = null; }
check('10', 'LANG=pt_BR.UTF-8 -> pt-BR banner', !!out && out.systemMessage.indexOf('[memoria] Contexto estimado em') === 0, r.stdout.slice(0, 120));

// 11. unknown lang -> en fallback, no error
st = readJson(stateA); st.accumulated_chars = 500000; st.last_alert_ts = 0;
fs.writeFileSync(stateA, JSON.stringify(st));
r = runHook(hookA, proj1, makeEnv(homeA, { LANG: 'fr_FR.UTF-8', DEVIN_MEMORY_LANG: 'fr' }), { prompt: 'bonjour', session_id: 'smoke-1' });
try { out = JSON.parse(r.stdout); } catch (e) { out = null; }
check('11', 'unknown lang (fr) -> English fallback, exit 0', r.status === 0 && !!out && out.systemMessage.indexOf('[memory] Estimated context at') === 0, r.stdout.slice(0, 120));

// 6. idempotency
r = runNode(INSTALL, [proj1], { env: envA });
var cfgTxt = read(path.join(proj1, '.devin', 'config.local.json'));
var hookCount = (cfgTxt.match(/context-monitor\.js/g) || []).length;
var agentsTxt = read(path.join(proj1, 'AGENTS.md'));
var blockCount = (agentsTxt.match(/BEGIN devin-memory v1/g) || []).length;
var baks = findFiles(proj1, function (p) { return /\.bak\./.test(p); });
check('6', 'second install: 1 hook entry, 1 AGENTS block, no .bak files',
  r.status === 0 && hookCount === 1 && blockCount === 1 && baks.length === 0,
  JSON.stringify({ hookCount: hookCount, blockCount: blockCount, baks: baks }));

// 7. uninstall preserves snapshots
mkdirp(path.join(memA, 'snapshots'));
fs.writeFileSync(path.join(memA, 'snapshots', '2026-06-12_10-00_test.md'), '# Snapshot: test\n');
r = runNode(UNINSTALL, [proj1], { env: envA });
check('7', 'uninstall preserves snapshots/, index.md, README.md',
  r.status === 0 &&
  exists(path.join(memA, 'snapshots', '2026-06-12_10-00_test.md')) &&
  exists(path.join(memA, 'index.md')) &&
  exists(path.join(memA, 'README.md')), (r.stderr || '').trim());
check('7b', 'uninstall removes engine + hook entry + AGENTS block',
  !exists(hookA) &&
  !exists(path.join(proj1, '.devin', 'skills', 'memory-save')) &&
  read(path.join(proj1, '.devin', 'config.local.json')).indexOf('context-monitor') === -1 &&
  read(path.join(proj1, 'AGENTS.md')).indexOf('devin-memory') === -1);
check('7c', 'uninstall removes system files, keeps data',
  !exists(path.join(memA, 'config.json')) && !exists(path.join(memA, '.session-state.json')) && !exists(path.join(memA, 'i18n')));

// 8. purge removes the whole memory dir
runNode(INSTALL, [proj1], { env: envA });
r = runNode(UNINSTALL, [proj1, '--purge', '--yes'], { env: envA });
check('8', 'uninstall --purge removes the entire memory dir', r.status === 0 && !exists(memA), (r.stderr || '').trim());

// 14. install --lang persists and runtime respects it without env vars
var projLang = path.join(TMP, 'projLang');
mkdirp(projLang);
runNode(INSTALL, [projLang, '--lang', 'es'], { env: envA });
var memCfg = readJson(path.join(projLang, '.devin', 'memory', 'config.json'));
var stateL = path.join(projLang, '.devin', 'memory', '.session-state.json');
fs.writeFileSync(stateL, JSON.stringify({ accumulated_chars: 500000, last_alert_ts: 0, session_start_ts: 1 }));
r = runHook(path.join(projLang, '.devin', 'hooks', 'context-monitor.js'), projLang, envA, { prompt: 'hola' });
try { out = JSON.parse(r.stdout); } catch (e) { out = null; }
check('14', 'install --lang es: config.json pinned + Spanish banner without env',
  !!memCfg && memCfg.lang === 'es' && !!out && out.systemMessage.indexOf('[memoria] Contexto estimado en') === 0,
  JSON.stringify({ cfg: memCfg, out: r.stdout.slice(0, 120) }));

// ===========================================================================
// Sandbox B — user scope engine (criteria 17, 18, 20, 21)
// ===========================================================================
console.log('\n— user scope (sandboxed fake home) —');
var homeB = path.join(TMP, 'homeB');
var projA = path.join(TMP, 'projA');
var projB = path.join(TMP, 'projB');
var junk = path.join(TMP, 'junkdir');
[homeB, projA, projB, junk].forEach(mkdirp);
mkdirp(path.join(projA, '.git')); // "looks like a project"
mkdirp(path.join(projB, '.git'));
var envB = makeEnv(homeB);
var cfgDirB = fakeConfigDir(homeB);
var hookB = path.join(cfgDirB, 'hooks', 'context-monitor.js');

r = runNode(INSTALL, [projA, '--scope', 'user'], { env: envB });
var userCfg = readJson(path.join(cfgDirB, 'config.json'));
var cmd = '';
try { cmd = userCfg.hooks.UserPromptSubmit[0].hooks[0].command; } catch (e) { /* checked below */ }
// Devin CLI spawns hooks without PATH lookup: program AND script must be absolute.
var quoted = (cmd.match(/"([^"]+)"/g) || []).map(function (s) { return s.slice(1, -1); });
check('17', 'user scope: hook registered with absolute node + absolute script path',
  r.status === 0 && exists(hookB) && quoted.length === 2 &&
  path.isAbsolute(quoted[0]) && path.isAbsolute(quoted[1]) && /context-monitor\.js$/.test(quoted[1]),
  JSON.stringify({ cmd: cmd, err: (r.stderr || '').trim() }));
check('17b', 'user scope: skills + engine config in user dir, no AGENTS.md in project',
  exists(path.join(cfgDirB, 'skills', 'memory-save', 'SKILL.md')) &&
  exists(path.join(cfgDirB, 'skills', 'memory-resume', 'SKILL.md')) &&
  exists(path.join(cfgDirB, 'devin-memory.config.json')) &&
  !exists(path.join(projA, 'AGENTS.md')));

// 18. global engine resolves a distinct per-project memory from cwd
runHook(hookB, projA, envB, { prompt: 'in project A', session_id: 'sA' });
runHook(hookB, projB, envB, { prompt: 'in project B', session_id: 'sB' });
check('18', 'global engine + project memory: two distinct .devin/memory dirs',
  exists(path.join(projA, '.devin', 'memory', '.session-state.json')) &&
  exists(path.join(projB, '.devin', 'memory', '.session-state.json')));

// 20. anti-junk: no memory created outside project-looking dirs
r = runHook(hookB, junk, envB, { prompt: 'random dir', session_id: 'sJ' });
check('20', 'anti-junk: no .devin/ created in non-project dir, exit 0, silent',
  r.status === 0 && r.stdout.trim() === '' && !exists(path.join(junk, '.devin')));

// 21. uninstall user scope cleans user config, leaves project files alone
r = runNode(UNINSTALL, [projA, '--scope', 'user'], { env: envB });
var userCfgAfter = read(path.join(cfgDirB, 'config.json'));
check('21', 'uninstall --scope user: user engine + config cleaned',
  r.status === 0 && !exists(hookB) && !exists(path.join(cfgDirB, 'skills', 'memory-save')) &&
  !exists(path.join(cfgDirB, 'devin-memory.config.json')) &&
  userCfgAfter.indexOf('context-monitor') === -1, (r.stderr || '').trim());
check('21b', 'uninstall --scope user: project files untouched',
  exists(path.join(projA, '.devin', 'memory', '.session-state.json')) &&
  exists(path.join(projB, '.devin', 'memory', '.session-state.json')));

// ===========================================================================
// Sandbox C — user (namespaced) memory (criterion 19)
// ===========================================================================
console.log('\n— user (namespaced) memory —');
var homeC = path.join(TMP, 'homeC');
var projC = path.join(TMP, 'projC');
var projD = path.join(TMP, 'projD');
[homeC, projC, projD].forEach(mkdirp);
var envC = makeEnv(homeC);
var baseC = path.join(homeC, '.devin-memory');

function memDirsIn(base) {
  if (!exists(base)) return [];
  return fs.readdirSync(base).filter(function (n) { return fs.statSync(path.join(base, n)).isDirectory(); });
}
runNode(INSTALL, [projC, '--memory', 'user'], { env: envC });
var dirs1 = memDirsIn(baseC);
runNode(INSTALL, [projC, '--memory', 'user'], { env: envC }); // again: key must be stable
var dirs2 = memDirsIn(baseC);
runNode(INSTALL, [projD, '--memory', 'user'], { env: envC });
var dirs3 = memDirsIn(baseC);
var projectsIdx = readJson(path.join(baseC, '.projects.json')) || {};
check('19', 'memory user: namespaced dir created, key stable, distinct per project',
  dirs1.length === 1 && dirs2.length === 1 && dirs2[0] === dirs1[0] && dirs3.length === 2,
  JSON.stringify({ dirs1: dirs1, dirs2: dirs2, dirs3: dirs3 }));
check('19b', '.projects.json maps keys to project paths',
  Object.keys(projectsIdx).length === 2 &&
  Object.keys(projectsIdx).some(function (k) { return projectsIdx[k].path === projC; }) &&
  Object.keys(projectsIdx).some(function (k) { return projectsIdx[k].path === projD; }));
// hook in projC must write state into the namespaced dir, not the project
runHook(path.join(projC, '.devin', 'hooks', 'context-monitor.js'), projC, envC, { prompt: 'namespaced', session_id: 'sC' });
check('19c', 'hook writes session state into the namespaced memory dir',
  exists(path.join(baseC, dirs1[0], '.session-state.json')) && !exists(path.join(projC, '.devin', 'memory')));

// ===========================================================================
// Sandbox D — npm/npx delivery (criteria 22–28)
// ===========================================================================
console.log('\n— npm/npx delivery (cli.js) —');
var CLI = path.join(ROOT, 'scripts', 'cli.js');
var homeD = path.join(TMP, 'homeD');
var projE = path.join(TMP, 'projE');
var projF = path.join(TMP, 'projF');
var projG = path.join(TMP, 'projG');
[homeD, projE, projF, projG].forEach(mkdirp);
var envD = makeEnv(homeD);

// 22. npm pack respects the files whitelist
var packOut = '';
try {
  packOut = childProcess.execSync('npm pack --dry-run --json', { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
} catch (e) { packOut = ''; }
var packFiles = [];
try { packFiles = JSON.parse(packOut)[0].files.map(function (f) { return f.path.replace(/\\/g, '/'); }); } catch (e) { /* checked below */ }
var mustHave = ['package.json', 'LICENSE', 'README.md', 'README.pt-BR.md', 'README.es.md',
  'scripts/cli.js', 'scripts/install.js', 'scripts/uninstall.js',
  'package/hooks/context-monitor.js', 'package/i18n/messages.json'];
var mustNotHave = packFiles.filter(function (p) {
  return /^tests\//.test(p) || /\.zip$/.test(p) || /^(install|uninstall)\.(sh|ps1)$/.test(p);
});
check('22', 'npm pack: whitelist only (no tests/zip/wrappers)',
  packFiles.length > 0 && mustHave.every(function (f) { return packFiles.indexOf(f) !== -1; }) && mustNotHave.length === 0,
  JSON.stringify({ missing: mustHave.filter(function (f) { return packFiles.indexOf(f) === -1; }), unexpected: mustNotHave }));

// 23. cli.js setup with no target installs into cwd
r = runNode(CLI, ['setup'], { cwd: projE, env: envD });
check('23', 'cli.js setup: target defaults to cwd',
  r.status === 0 &&
  exists(path.join(projE, '.devin', 'hooks', 'context-monitor.js')) &&
  exists(path.join(projE, '.devin', 'memory', 'index.md')) &&
  exists(path.join(projE, 'AGENTS.md')), (r.stderr || '').trim());

// 27. installed hook runs standalone (no npm, no network — plain node + filesystem)
r = runHook(path.join(projE, '.devin', 'hooks', 'context-monitor.js'), projE, envD, { prompt: 'offline check', session_id: 'sE' });
check('27', 'hook installed via cli.js runs offline with plain node',
  r.status === 0 && ((readJson(path.join(projE, '.devin', 'memory', '.session-state.json')) || {}).accumulated_chars > 0),
  (r.stderr || '').trim());

// 25. cli.js uninstall preserves snapshots
mkdirp(path.join(projE, '.devin', 'memory', 'snapshots'));
fs.writeFileSync(path.join(projE, '.devin', 'memory', 'snapshots', '2026-06-12_11-00_cli.md'), '# Snapshot: cli\n');
r = runNode(CLI, ['uninstall'], { cwd: projE, env: envD });
check('25', 'cli.js uninstall: engine removed, snapshots preserved',
  r.status === 0 &&
  !exists(path.join(projE, '.devin', 'hooks', 'context-monitor.js')) &&
  exists(path.join(projE, '.devin', 'memory', 'snapshots', '2026-06-12_11-00_cli.md')) &&
  exists(path.join(projE, '.devin', 'memory', 'index.md')), (r.stderr || '').trim());

// 24. cli.js setup --scope user
r = runNode(CLI, ['setup', '--scope', 'user'], { cwd: projF, env: envD });
var cfgDirD = fakeConfigDir(homeD);
var userCfgD = readJson(path.join(cfgDirD, 'config.json'));
var cmdD = '';
try { cmdD = userCfgD.hooks.UserPromptSubmit[0].hooks[0].command; } catch (e) { /* checked below */ }
var quotedD = (cmdD.match(/"([^"]+)"/g) || []).map(function (s) { return s.slice(1, -1); });
check('24', 'cli.js setup --scope user: global engine, absolute node + script paths',
  r.status === 0 && exists(path.join(cfgDirD, 'hooks', 'context-monitor.js')) &&
  quotedD.length === 2 && path.isAbsolute(quotedD[0]) &&
  path.isAbsolute(quotedD[1]) && /context-monitor\.js$/.test(quotedD[1]),
  JSON.stringify({ cmd: cmdD, err: (r.stderr || '').trim() }));

// 26. help exits 0; invalid subcommand exits 1
r = runNode(CLI, [], { env: envD });
var rBad = runNode(CLI, ['bogus'], { env: envD });
check('26', 'cli.js: no subcommand -> help + exit 0; invalid -> exit 1',
  r.status === 0 && r.stdout.indexOf('Usage:') !== -1 && rBad.status === 1,
  JSON.stringify({ help: r.status, bad: rBad.status }));

// 28. install.js still works invoked directly (fallback), target defaulting to cwd
r = runNode(INSTALL, [], { cwd: projG, env: envD });
check('28', 'node scripts/install.js (direct, no target): installs into cwd',
  r.status === 0 && exists(path.join(projG, '.devin', 'hooks', 'context-monitor.js')), (r.stderr || '').trim());

// ===========================================================================
// Static checks (criteria 15, 16 and the static half of 12)
// ===========================================================================
console.log('\n— static checks —');
var readmes = ['README.md', 'README.pt-BR.md', 'README.es.md'].map(function (n) { return read(path.join(ROOT, n)); });
check('15', 'three READMEs exist and cross-link each other',
  readmes.every(function (c) { return c.length > 0; }) &&
  readmes[0].indexOf('README.pt-BR.md') !== -1 && readmes[0].indexOf('README.es.md') !== -1 &&
  readmes[1].indexOf('README.md') !== -1 && readmes[1].indexOf('README.es.md') !== -1 &&
  readmes[2].indexOf('README.md') !== -1 && readmes[2].indexOf('README.pt-BR.md') !== -1);
check('15b', 'READMEs carry the non-affiliation disclaimer',
  readmes[0].indexOf('Cognition AI') !== -1 && readmes[1].indexOf('Cognition AI') !== -1 && readmes[2].indexOf('Cognition AI') !== -1);

var catalog = readJson(path.join(ROOT, 'package', 'i18n', 'messages.json'));
var nonAscii = [];
Object.keys(catalog).forEach(function (key) {
  Object.keys(catalog[key]).forEach(function (lng) {
    if (/[^\x00-\x7F]/.test(catalog[key][lng])) nonAscii.push(key + ':' + lng);
  });
});
check('16', 'terminal strings are accent-free (ASCII) in all 3 languages', nonAscii.length === 0, nonAscii.join(', '));

var saveSkill = read(path.join(ROOT, 'package', 'skills', 'memory-save', 'SKILL.md'));
var resumeSkill = read(path.join(ROOT, 'package', 'skills', 'memory-resume', 'SKILL.md'));
check('12s', 'trigger phrases present in both skills for all 3 languages',
  ['salva mem', 'save memory', 'guardar memoria'].every(function (t) { return saveSkill.indexOf(t) !== -1; }) &&
  ['continua de onde paramos', 'continue where we left off', 'donde lo dejamos'].every(function (t) { return resumeSkill.indexOf(t) !== -1; }));

note('4', 'memory-save creates a snapshot + updates index.md — requires the Devin CLI agent (manual)');
note('5', 'memory-resume loads the latest snapshot and re-reads files — requires the Devin CLI agent (manual)');
note('12', 'runtime trigger matching (6 cases) — requires the Devin CLI agent (manual; static half verified above)');
note('13', 'additionalContext makes the model remind in the prompt language — requires the LLM (manual)');

// ===========================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + manual + ' manual');
if (process.env.SMOKE_KEEP_TMP) {
  console.log('sandbox kept at ' + TMP);
} else {
  rmrf(TMP);
}
if (failed > 0) {
  console.log('\nFailures:\n  ' + failures.join('\n  '));
  process.exit(1);
}
