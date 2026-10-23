// 去重缓存（等价 Python 版 sent_articles.json）
// 线上用 Netlify Blobs（KV 等价物，站点级持久）；本地无 Blobs 上下文时回退内存，便于调试。
// 结构：{ [归一化链接]: { title, source, pushed_at } }，pushed_at 为 ISO 时间。
//
// 注意：@netlify/blobs 改为动态导入——避免在打包/运行环境解析不到该依赖时，
// 整个函数模块加载即崩溃。仅在检测到 Blobs 上下文时才尝试加载。

import { KEEP_DAYS } from "./config.js";

const CACHE_KEY = "articles";
const memCache = new Map(); // 本地回退用，进程级

let blobStore = null;
let mode = null;        // "blob" | "mem"
let resolving = null;   // 防止并发重复加载

async function resolveMode() {
  if (mode) return mode;
  if (resolving) return resolving;

  resolving = (async () => {
    // 仅当运行在真正的 Netlify Functions 环境（注入了 Blobs 上下文）时才用 Blobs。
    if (process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY) {
      try {
        const { getStore } = await import("@netlify/blobs");
        blobStore = getStore("rss-tg-cache");
        // 冒烟测试：能拿到 store 即视为可用
        if (blobStore) {
          mode = "blob";
          return mode;
        }
      } catch (e) {
        console.log(`[cache] Blobs 加载失败，回退内存：${e.message}`);
      }
    }
    mode = "mem";
    return mode;
  })();

  mode = await resolving;
  resolving = null;
  return mode;
}

export async function loadCache() {
  if ((await resolveMode()) === "blob") {
    try {
      const raw = await blobStore.get(CACHE_KEY, { type: "json" });
      return raw && typeof raw === "object" ? new Map(Object.entries(raw)) : new Map();
    } catch (e) {
      console.log(`[cache] 读取失败，回退空缓存：${e.message}`);
      return new Map();
    }
  }
  return memCache;
}

export async function saveCache(cache) {
  if ((await resolveMode()) !== "blob") return; // 内存模式不持久化
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400 * 1000).toISOString().slice(0, 10);
  const pruned = {};
  let count = 0;
  for (const [k, v] of cache) {
    if (v && v.pushed_at && v.pushed_at.slice(0, 10) >= cutoff) {
      pruned[k] = v;
      count += 1;
    }
  }
  try {
    await blobStore.setJSON(CACHE_KEY, pruned);
    console.log(`[cache] 已保存 ${count} 条记录（清理前 ${cache.size} 条）`);
  } catch (e) {
    console.log(`[cache] 保存失败：${e.message}`);
  }
}

// 清空去重缓存（测试/强制重发用）
export async function clearCache() {
  if ((await resolveMode()) === "blob") {
    try {
      await blobStore.delete(CACHE_KEY);
      console.log("[cache] 已清空");
      return true;
    } catch (e) {
      console.log(`[cache] 清空失败：${e.message}`);
      return false;
    }
  }
  memCache.clear();
  return true;
}
