import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Expected the gh-pages worktree path');

const workerUrl = pathToFileURL(resolve('dist/server/index.js'));
workerUrl.searchParams.set('export', `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request('http://localhost/vazuri-preview-liko-dark-shop-public/', { headers: { accept: 'text/html' } }),
  { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) throw new Error(`Render failed with HTTP ${response.status}`);
const html = await response.text();
if (!html.includes('class="case-dock case-dock--night"')) throw new Error('Rendered dock is missing');

await mkdir(target, { recursive: true });
const clientRoot = resolve('dist/client');
const publicBaseName = 'vazuri-preview-liko-dark-shop-public';
for (const entry of await readdir(clientRoot)) {
  if (entry === publicBaseName) continue;
  await cp(resolve(clientRoot, entry), resolve(target, entry), { recursive: true, force: true });
}
await cp(resolve(clientRoot, publicBaseName, '_next'), resolve(target, '_next'), { recursive: true, force: true });
await writeFile(resolve(target, 'index.html'), html, 'utf8');
await writeFile(resolve(target, '.nojekyll'), '', 'utf8');
