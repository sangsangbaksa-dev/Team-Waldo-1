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
  const extras = join(source, 'freeroam');
  execFileSync(process.execPath, ['--test', join(extras, 'tests/freeroam.test.mjs'), join(extras, 'tests/drive-audio.test.mjs')], { stdio: 'inherit' });
  for (const name of ['freeroam-domain.mjs', 'freeroam-ui.mjs', 'drive-audio-domain.mjs', 'drive-audio-ui.mjs']) await copyFile(join(extras, name), join(staged, name));
  const page = join(staged, 'index.html');
  const html = await readFile(page, 'utf8');
  if (!html.includes('</body>')) throw new Error('Harbor browser entry is missing a body');
  await writeFile(page, html.replace('</body>', '<script type="module" src="./freeroam-ui.mjs"></script>\n</body>'));
  await rm(output, { recursive: true, force: true });
  await rename(staged, output);
  console.log(`Project Harbor ${release.sourceCommit.slice(0, 7)} ready at /project-harbor/${basename(output)}/`);
} finally {
  await rm(staged, { recursive: true, force: true });
}
