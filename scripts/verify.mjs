// 本地验证：拉取真实 RSS、构建早报/晚报消息，断言约束（不发送、不写缓存）。
// 运行：node scripts/verify.mjs [morning|evening]
// 可选：DEEPSEEK_API_KEY=xxx node scripts/verify.mjs 测试真实翻译。
import { collectArticles, groupBySource } from "../netlify/functions/_lib/rss.js";
import { buildReportMessages, visibleLength } from "../netlify/functions/_lib/report.js";
import { loadCache } from "../netlify/functions/_lib/store.js";

const mode = process.argv[2] === "evening" ? "evening" : "morning";
const apiKey = process.env.DEEPSEEK_API_KEY || null;

console.log(`=== 验证模式: ${mode} | 翻译: ${apiKey ? "开启(真实 DeepSeek)" : "关闭(英文原文)"} ===`);

const cache = await loadCache();
const t0 = Date.now();
const articles = await collectArticles(cache, apiKey);
const tFetch = Date.now() - t0;

if (!articles.length) {
  console.log("⚠️ 当前无新文章（已被缓存去重或各源今日无更新），无法构建消息。");
  console.log("   可清空缓存或换一个源有大量更新的时段重试；也可临时把 KEEP_DAYS 调小。");
  process.exit(0);
}

const groups = groupBySource(articles);
const messages = buildReportMessages(groups, mode);

let failures = 0;
const firstLen = visibleLength(messages[0]);
if (firstLen > 1024) {
  console.log(`❌ FAIL: 首条(caption)可见长度 ${firstLen} > 1024`);
  failures++;
}
for (const [i, m] of messages.entries()) {
  const L = visibleLength(m);
  if (L > 4096) {
    console.log(`❌ FAIL: 第 ${i + 1} 条可见长度 ${L} > 4096`);
    failures++;
  }
}
const lastMsg = messages[messages.length - 1];
if (!lastMsg.endsWith("​")) {
  console.log("⚠️ WARN: 末条未以零宽字符结尾（末尾留白可能未生效）");
}
if (messages.length > 1 && !messages[1].includes("（续）")) {
  console.log("⚠️ WARN: 续篇消息缺少「（续）」标记");
}

console.log(`\n--- 统计 ---`);
console.log(`抓取+构建耗时: ${tFetch} ms`);
console.log(`待推文章: ${articles.length} 条，来自 ${groups.length} 家公司`);
console.log(`消息条数: ${messages.length}（首条作 caption，其余纯文本）`);
console.log(`首条可见长度: ${firstLen} / 1024`);
console.log(`末条可见长度: ${visibleLength(lastMsg)} / 4096`);

console.log(`\n--- 首条消息预览 ---`);
console.log(messages[0]);
if (messages[1]) {
  console.log(`\n--- 续篇首条预览 ---`);
  console.log(messages[1]);
}

console.log(`\n=== 验证结果: ${failures === 0 ? "✅ 通过" : `❌ ${failures} 项失败`} ===`);
process.exit(failures === 0 ? 0 : 1);
