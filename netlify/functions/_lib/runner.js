// 共享运行逻辑：模式判定、动态封面、推送与预览。供定时函数与预览函数复用。

import { collectArticles, groupBySource } from "./rss.js";
import { buildReportMessages } from "./report.js";
import { loadCache, saveCache } from "./store.js";
import { sendPhoto, sendMessage } from "./telegram.js";
import { buildCover } from "./image.js";
import { REPORT_MAX_ITEMS } from "./config.js";

// 按当前北京时间小时判定早报/晚报（<14 点早报，否则晚报）
export function detectMode() {
  const bjHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
  return bjHour < 14 ? "morning" : "evening";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 北京时间日期标签 YYYY.MM.DD
function bjDateLabel() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// 正式推送一期（morning/evening）
export async function runReport(mode, env) {
  const displayDate = bjDateLabel();
  const cache = await loadCache();
  const apiKey = env.DEEPSEEK_API_KEY || null;
  // 封面抓取与 RSS 抓取并行，节省 30s 时限
  const coverPromise = buildCover(mode, displayDate, env);
  const articles = await collectArticles(cache, apiKey);

  if (!articles.length) {
    console.log(`[mode] ${mode} 今日无新动态，静默跳过（不推送）`);
    return { ok: true, skipped: true, mode };
  }

  let groups = groupBySource(articles);
  // 每版固定取前 REPORT_MAX_ITEMS 家，其余丢弃（配合实心序号 1️⃣~8️⃣）
  if (groups.length > REPORT_MAX_ITEMS) {
    groups = groups.slice(0, REPORT_MAX_ITEMS);
  }
  console.log(`[group] ${articles.length} 条动态，取前 ${groups.length} 家推送`);
  const messages = buildReportMessages(groups, mode);
  const coverBuf = await coverPromise;

  // 首条：封面图 + caption；装不下的内容自动续篇（纯文本 4096），依次发送。
  let success = false;
  try {
    if (coverBuf && coverBuf.length) {
      try {
        await sendPhoto(coverBuf, messages[0], env);
      } catch (e) {
        console.log(`[sendPhoto failed] ${e.message}；改用纯文本发送首条`);
        await sendMessage(messages[0], env);
      }
    } else {
      await sendMessage(messages[0], env);
    }
    for (let i = 1; i < messages.length; i++) {
      await sleep(400);
      await sendMessage(messages[i], env);
    }
    success = true;
  } catch (e) {
    console.log(`[report failed] ${e.name}: ${e.message}`);
  }

  if (success) {
    const ts = new Date().toISOString();
    // 所有已发出的条目写入去重缓存
    let sentEntries = 0;
    for (const msg of messages) sentEntries += (msg.match(/<a href/g) || []).length;
    for (const [, items] of groups) {
      if (items && items.length) {
        const art = items[0];
        cache.set(art.key, { title: art.title, source: art.source, pushed_at: ts });
      }
    }
    await saveCache(cache);
    console.log(
      `[done] ${mode} 一期推送完成：共 ${messages.length} 条消息，发出 ${sentEntries} 条，候选 ${groups.length} 家`
    );
  } else {
    console.log(`[warn] ${mode} 推送失败，未写缓存，下次运行自动重试`);
  }

  return { ok: success, mode, companies: groups.length, messages: messages.length };
}

// 预览（不发送、不写缓存）：返回将推送的消息内容
export async function previewReport(mode, env) {
  const cache = await loadCache();
  const articles = await collectArticles(cache, env.DEEPSEEK_API_KEY || null);
  if (!articles.length) return { mode, skipped: true };
  const groups = groupBySource(articles);
  const messages = buildReportMessages(groups, mode);
  return { mode, companies: groups.length, messageCount: messages.length, messages };
}
