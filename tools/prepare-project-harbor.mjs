import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'project-harbor');
const archive = join(source, 'browser-bundle.tar.gz');
const release = JSON.parse(await readFile(join(source, 'browser-bundle.json'), 'utf8'));
const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
if (hash !== release.sha256) throw new Error('Project Harbor bundle checksum does not match its source manifest');

const output = join(root, 'public', 'project-harbor', 'play');
await mkdir(dirname(output), { recursive: true });
const staged = await mkdtemp(join(root, '.harbor-browser-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', staged], { stdio: 'inherit' });
  const requiredFiles = ['index.html', 'godot/harbor.js', 'godot/harbor.wasm',
    'godot/harbor.pck', 'runtime/_framework/dotnet.js', 'world/harbor_front.json'];
  await Promise.all(requiredFiles.map(file => access(join(staged, file))));
  const chunks = await readdir(join(staged, 'godot/chunks'));
  if (!chunks.some(file => /^cell_-?\d+_-?\d+\.[\da-f]{12}\.scn$/.test(file))) {
    throw new Error('Project Harbor bundle is missing the streamed Godot map chunks');
  }
  // Keep a single free-roam UI, preserving the previous module's regression tests.
  const legacy = join(source, 'freeroam');
  execFileSync(process.execPath, ['--test', join(legacy, 'tests/freeroam.test.mjs')], { stdio: 'inherit' });
  const extras = join(source, 'sandbox-extras.js');
  execFileSync(process.execPath, ['--check', extras], { stdio: 'inherit' });
  await copyFile(extras, join(staged, 'sandbox-extras.js'));
  execFileSync(process.execPath, ['--test', join(legacy, 'tests/city-activities.test.mjs')], { stdio: 'inherit' });
  for (const name of ['city-activities-domain.mjs', 'city-activities-ui.mjs']) {
    execFileSync(process.execPath, ['--check', join(legacy, name)], { stdio: 'inherit' });
    await copyFile(join(legacy, name), join(staged, name));
  }
  const page = join(staged, 'index.html');
  const html = (await readFile(page, 'utf8')).replace(/<script\b[^>]*src=["'][^"']*freeroam-ui\.mjs["'][^>]*>\s*<\/script>/g, '');
  if (!html.includes('</body>')) throw new Error('Harbor browser entry is missing a body');
  let entry = html;
  if (!entry.includes('sandbox-extras.js')) entry = entry.replace('</body>', '<script defer src="./sandbox-extras.js"></script>\n</body>');
  if (!entry.includes('city-activities-ui.mjs')) entry = entry.replace('</body>', '<script type="module" src="./city-activities-ui.mjs"></script>\n</body>');
  await writeFile(page, entry);
  await rm(output, { recursive: true, force: true });
  await rename(staged, output);
  console.log(`Project Harbor ${release.sourceCommit.slice(0, 7)} ready at /project-harbor/${basename(output)}/`);
} finally {
  await rm(staged, { recursive: true, force: true });
}
