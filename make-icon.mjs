// 把 DeepSeek Harness 的黑鲸 favicon.svg 栅格化成多尺寸 Windows .ico
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const SVG_SRC = process.env.DSH_WHALE_SVG ||
  "C:/Users/zouku/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-web-frontend/dist/favicon.svg";
const OUT = process.env.DSH_ICO_OUT || join(__dirname, "dsh.ico");

let sharp;
try {
  sharp = require("C:/Users/zouku/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/sharp");
} catch {
  try { sharp = require("sharp"); } catch { /* ignore */ }
}
if (!sharp) {
  console.error("sharp 不可用");
  process.exit(1);
}

let svg = readFileSync(SVG_SRC, "utf8");
// 去掉 <style>（含 dark 模式的 @media），保留 path 的 fill="#000"（黑鲸）
svg = svg.replace(/<style>[\s\S]*?<\/style>/i, "");

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const pngs = [];
for (const size of sizes) {
  const buf = await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .png()
    .toBuffer();
  pngs.push({ size, buffer: buf });
}

// 组装 ICO（PNG 压缩条目，Vista+ 均支持）
const count = pngs.length;
const headerSize = 6 + 16 * count;
const parts = [];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);
parts.push(header);

let offset = headerSize;
for (const { size, buffer } of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(buffer.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += buffer.length;
  parts.push(e);
}
for (const { buffer } of pngs) parts.push(buffer);

writeFileSync(OUT, Buffer.concat(parts));
console.log(`OK ${OUT} (${Buffer.concat(parts).length} bytes, ${count} sizes: ${sizes.join(",")})`);
