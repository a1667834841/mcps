// 把 monorepo 中的 ../skills/mcp-database 同步到包内 ./skill 目录。
// 由 npm prepublishOnly 调用，确保发布到 npm 的 tarball 含 skill/。
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const src = resolve(pkgRoot, '..', 'skills', 'mcp-database');
const dest = resolve(pkgRoot, 'skill');

if (!existsSync(src)) {
    console.error(`[sync-skill] 源目录不存在: ${src}`);
    process.exit(1);
}

if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
}
cpSync(src, dest, { recursive: true });
console.log(`[sync-skill] copied ${src} -> ${dest}`);
