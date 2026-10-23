// 把两张报头图（assets/*.jpg）编码成 base64，写入 netlify/functions/_lib/covers.js
// 这样报头图自包含在函数包内，无需 R2 等额外存储。运行：npm run gen:covers
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const assets = join(root, "assets");

function toDataUri(file) {
  const buf = readFileSync(join(assets, file));
  const b64 = buf.toString("base64");
  return `data:image/jpeg;base64,${b64}`;
}

const morning = toDataUri("report_cover_morning.jpg");
const evening = toDataUri("report_cover_evening.jpg");

const out = `// 自动生成，请勿手动编辑。由 scripts/gen-covers.mjs 依据 assets/*.jpg 生成。
// 报头图以 data URI（base64）内嵌，避免依赖外部存储。
export const COVERS = {
  morning: ${JSON.stringify(morning)},
  evening: ${JSON.stringify(evening)},
};
`;

writeFileSync(join(root, "netlify", "functions", "_lib", "covers.js"), out);
console.log("covers.js 已生成（morning/evening 已内嵌 base64）");
