import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
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
  await rm(output, { recursive: true, force: true });
  await rename(staged, output);
  console.log(`Project Harbor ${release.sourceCommit.slice(0, 7)} ready at /project-harbor/${basename(output)}/`);
} finally {
  await rm(staged, { recursive: true, force: true });
}
