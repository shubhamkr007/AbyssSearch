import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'static');
const dest = join(root, 'dist');

mkdirSync(dest, { recursive: true });
for (const name of readdirSync(src)) {
  copyFileSync(join(src, name), join(dest, name));
}
