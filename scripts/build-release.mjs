// Builds a download-and-double-click release for the current platform:
//
//   dist/ScoreBug-<version>-<os>-<arch>/
//     ScoreBug(.exe)     Node.js + the server in one executable
//     public/ shared/    the control panel and renderer pages
//     graphics/          the templates (users can add their own here)
//     docs/ README.txt
//   dist/ScoreBug-<version>-<os>-<arch>.zip
//
// Uses Node's single executable application support (node --build-sea,
// Node 25.5 or newer). Run it on each platform you want a build for.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 25 || (major === 25 && minor < 5)) {
  console.error(`Building a release needs Node 25.5 or newer (this is ${process.versions.node}).`);
  process.exit(1);
}

const os = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] ?? process.platform;
const name = `ScoreBug-${pkg.version}-${os}-${process.arch}`;
const buildDir = path.join(root, 'build');
const distDir = path.join(root, 'dist');
const outDir = path.join(distDir, name);
const exe = path.join(outDir, process.platform === 'win32' ? 'ScoreBug.exe' : 'ScoreBug');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });

fs.rmSync(buildDir, { recursive: true, force: true });
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. Bundle the server and its dependencies into one CommonJS file.
await build({
  entryPoints: [path.join(root, 'server/index.js')],
  outfile: path.join(buildDir, 'server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${major}`,
  // Optional native speed-ups for ws; it works without them.
  external: ['bufferutil', 'utf-8-validate'],
  // import.meta.url is only read when running from source.
  logOverride: { 'empty-import-meta': 'silent' },
});

// 2. Inject it into a copy of this Node binary.
const seaConfig = path.join(buildDir, 'sea-config.json');
fs.writeFileSync(
  seaConfig,
  JSON.stringify({
    main: path.join(buildDir, 'server.cjs'),
    output: exe,
    disableExperimentalSEAWarning: true,
  }),
);
run(process.execPath, ['--build-sea', seaConfig]);
if (process.platform === 'darwin') run('codesign', ['--force', '--sign', '-', exe]);
if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);

// 3. The folders the server reads at run time.
for (const dir of ['public', 'shared', 'graphics', 'docs']) {
  fs.cpSync(path.join(root, dir), path.join(outDir, dir), { recursive: true });
}

const launcher = process.platform === 'win32' ? 'ScoreBug.exe' : 'ScoreBug';
fs.writeFileSync(
  path.join(outDir, 'README.txt'),
  `ScoreBug ${pkg.version}

1. Double-click ${launcher}. A console window opens and your browser shows
   the control panel. Keep the console window open while you stream.
2. In OBS add a Browser source, 1920 x 1080, with the URL shown at the
   bottom of the control panel.

Control panel:  http://localhost:4747/control/

Your teams, logos and match state are saved in the "data" folder here.
To add your own templates see docs/custom-templates.md.

Options (run from a terminal):
  ${launcher} --lan       let other devices on your network use the control panel
  ${launcher} --no-open   do not open the browser on start
`.replace(/\n/g, process.platform === 'win32' ? '\r\n' : '\n'),
);

// 4. Zip it.
const zip = path.join(distDir, `${name}.zip`);
fs.rmSync(zip, { force: true });
if (process.platform === 'win32') {
  // bsdtar ships with Windows 10 and later and writes zip with -a.
  run(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, name], { cwd: distDir });
} else {
  run('zip', ['-r', '-q', '-y', zip, name], { cwd: distDir });
}

console.log(`\nBuilt ${path.relative(root, zip)}`);
