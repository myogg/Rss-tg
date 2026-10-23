// RSS 抓取 + 解析 + 并发翻译（等价 Python 版 collect_articles）
// 用纯 JS parse.js 解析 RSS / Atom；翻译改为分批并发，适配 Netlify 定时函数 30s 上限。

import {
  FEEDS,
  MAX_ARTICLES_PER_FEED,
  SCAN_DEPTH,
  PREFER_TODAY,
  SUMMARY_MAX_LENGTH,
  USER_AGENT,
  REQUEST_TIMEOUT,
  TRANSLATE_BATCH,
  MAX_ARTICLES_PER_RUN,
  DOMAIN_ALIAS,
} from "./config.js";
import { parseFeed } from "./parse.js";
import { translateToZh } from "./translate.js";

function toBeijingDateStr(d) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 域名优先解析来源名（稳定），标题文本兜底
function sourceNameFor(url, title) {
  try {
    const host = new URL(url).hostname;
    for (const [k, alias] of Object.entries(DOMAIN_ALIAS)) {
      if (host.includes(k)) return alias;
    }
  } catch {
    /* ignore */
  }
  const t = (title || "").trim();
  return t || "(未知来源)";
}

export function normalizeLink(link) {
  if (!link) return "";
  let s = link.trim();
  s = s.replace(/[?&](utm_[^=&]+|from|spm|share_token|ref)=[^&]*/g, "");
  s = s.replace(/[?&]+$/, "");
  s = s.replace(/#.*$/, "");
  return s.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFeed(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
      const resp = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.status >= 400) throw new Error(`HTTP ${resp.status}`);
      const xml = await resp.text();
      const parsed = parseFeed(xml);
      if (!parsed.items.length) throw new Error("no entries");
      return parsed;
    } catch (e) {
      console.log(`  [retry ${attempt}/3] ${url} -> ${e.name}: ${e.message}`);
      if (attempt < 3) await sleep(2000);
    }
  }
  return null;
}

// 并发分批翻译：一批同时翻译若干文本（标题或摘要），适配 Netlify 30s 上限。
// 返回与 texts 等长的翻译结果数组。
async function batchTranslate(texts, apiKey) {
  if (!apiKey) return texts.slice();
  const out = new Array(texts.length).fill(null);
  for (let i = 0; i < texts.length; i += TRANSLATE_BATCH) {
    const slice = texts.slice(i, i + TRANSLATE_BATCH);
    const settled = await Promise.all(slice.map((t) => translateToZh(t || "", apiKey)));
    slice.forEach((_, j) => {
      out[i + j] = settled[j];
    });
  }
  return out;
}

// 按来源分组，每组内保持出现顺序。返回 [[source, [article,...]], ...]
export function groupBySource(articles) {
  const groups = {};
  const order = [];
  for (const art of articles) {
    const src = art.source;
    if (!(src in groups)) {
      groups[src] = [];
      order.push(src);
    }
    groups[src].push(art);
  }
  return order.map((src) => [src, groups[src]]);
}

// cache：Map（key=归一化链接，value={title,source,pushed_at}）。apiKey：DeepSeek key 或 null。
export async function collectArticles(cache, apiKey) {
  const stats = { ok: 0, fail: 0, dup: 0, with_img: 0, translated: 0, total: 0 };
  const today = toBeijingDateStr(new Date(Date.now() + 8 * 3600 * 1000));

  // 1) 并行抓取所有源
  const results = await Promise.all(FEEDS.map((url) => fetchFeed(url)));

  // 2) 每个源构建候选（去重 + 当天优先 + 每源限条）
  const perFeed = [];
  for (let fi = 0; fi < results.length; fi++) {
    const r = results[fi];
    const feedUrl = FEEDS[fi];
    if (!r) {
      stats.fail += 1;
      continue;
    }
    stats.ok += 1;
    const source = sourceNameFor(feedUrl, r.title);
    const logo = r.logo || "";

    const todayEntries = [];
    const otherEntries = [];
    for (const item of r.items.slice(0, SCAN_DEPTH)) {
      const stamp = item.pubDate ? new Date(item.pubDate) : null;
      if (stamp && !isNaN(stamp.getTime()) && toBeijingDateStr(stamp) === today) {
        todayEntries.push(item);
      } else {
        otherEntries.push(item);
      }
    }
    const ordered = PREFER_TODAY
      ? [...todayEntries, ...otherEntries]
      : [...otherEntries, ...todayEntries];

    const feedCands = [];
    for (const item of ordered) {
      if (feedCands.length >= MAX_ARTICLES_PER_FEED) break;
      const rawLink = item.link || "";
      const key = normalizeLink(rawLink);
      if (!key) continue;
      if (cache.has(key)) {
        stats.dup += 1;
        continue;
      }
      feedCands.push({
        key,
        link: rawLink,
        title: item.title || "无标题",
        summary: item.summary || "",
        source,
        image: item.image || null,
        logo,
      });
    }
    if (feedCands.length) perFeed.push(feedCands);
  }

  // 3) 轮询合并：每个源先各取 1 条，再取第 2 条……保证所有源都被覆盖，直到总量上限。
  const candidates = [];
  const pointers = perFeed.map(() => 0);
  while (candidates.length < MAX_ARTICLES_PER_RUN) {
    let progressed = false;
    for (let f = 0; f < perFeed.length; f++) {
      if (candidates.length >= MAX_ARTICLES_PER_RUN) break;
      if (pointers[f] < perFeed[f].length) {
        candidates.push(perFeed[f][pointers[f]++]);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  stats.total = candidates.length;

  // 4) 并发分批翻译（标题 + 摘要，消息里两者都会展示）
  const translated = await batchTranslate(
    candidates.map((c) => c.title),
    apiKey
  );
  candidates.forEach((c, i) => {
    if (translated[i] !== c.title) stats.translated += 1;
    c.title = translated[i];
  });

  // 摘要也译为中文（无摘要时回退标题）
  const summarySrc = candidates.map((c) => c.summary || c.title);
  const translatedSum = await batchTranslate(summarySrc, apiKey);
  candidates.forEach((c, i) => {
    const s = (translatedSum[i] || "").trim();
    c.summary = s || c.title;
  });

  // 5) 组装最终文章（摘要截断；摘要不展示，仅保留截断后的原始文本）
  const articles = candidates.map((c) => {
    let summary = c.summary || "";
    if (summary.length > SUMMARY_MAX_LENGTH) summary = summary.slice(0, SUMMARY_MAX_LENGTH).trimEnd() + "…";
    const hasImg = !!c.image;
    if (hasImg) stats.with_img += 1;
    return {
      key: c.key,
      link: c.link,
      title: c.title,
      summary,
      source: c.source,
      image: c.image,
    };
  });

  console.log(
    `[stats] 源 ${stats.ok} 成功 / ${stats.fail} 失败；待推 ${articles.length} 条，` +
      `跳过重复 ${stats.dup} 条，自带配图 ${stats.with_img} 条，翻译 ${stats.translated} 条`
  );
  return articles;
}
