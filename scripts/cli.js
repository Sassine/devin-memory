#!/usr/bin/env node
/*
 * devin-memory v1.0.0 — npx entrypoint
 *
 *   npx devin-memory@latest setup [target] [--scope project|user] [--memory project|user] [--lang en|pt-BR|es] [--agents]
 *   npx devin-memory@latest uninstall [target] [--scope project|user] [--purge] [--yes]
 *
 * npm is only the delivery mechanism for setup/uninstall — the installed system
 * stays self-contained and runs offline (no npm, no network at runtime).
 */
'use strict';

var cmd = process.argv[2];
var args = process.argv.slice(3);

if (cmd === 'setup') {
  require('./install.js')(args);
} else if (cmd === 'uninstall') {
  require('./uninstall.js')(args);
} else {
  console.log(
    'devin-memory\n' +
    'Usage:\n' +
    '  npx devin-memory@latest setup [--scope project|user] [--memory project|user] [--lang en|pt-BR|es] [--agents]\n' +
    '  npx devin-memory@latest uninstall [--scope project|user] [--purge]\n' +
    '\n' +
    'The target directory defaults to the current working directory;\n' +
    'pass a path as the first positional argument to override it.\n'
  );
  process.exit(cmd ? 1 : 0);
}
