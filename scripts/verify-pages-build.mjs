import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const base = '/crm-chat-gantt/';
const output = path.resolve('dist');
const html = await readFile(path.join(output, 'index.html'), 'utf8');
if (/\/src\/|\.jsx(?:["'?]|$)/i.test(html)) {
  throw new Error('Pages artifact contains source code. Build with Vite and upload dist, not the repository root.');
}
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
if (!assets.some(url => url.startsWith(`${base}assets/`) && url.endsWith('.js'))) {
  throw new Error(`Missing compiled JavaScript at ${base}assets/. Check the Vite base path.`);
}
if (!assets.includes(`${base}favicon.svg`)) throw new Error('Missing Pages favicon link.');
for (const url of assets) {
  if (!url.startsWith(base)) throw new Error(`Asset uses the wrong Pages base path: ${url}`);
  const file = path.resolve(output, url.slice(base.length));
  if (!file.startsWith(`${output}${path.sep}`) || !(await stat(file)).isFile()) throw new Error(`Missing built asset: ${url}`);
}
console.log('Pages artifact verified: compiled assets and favicon exist under the correct base path.');
