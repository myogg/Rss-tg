// 翻译：英文摘要 → 简体中文
// 默认使用 MyMemory 公共翻译（免费、无需 token、零配置，匿名 500 次/天，足够日报用量）。
// 可选接入 DeeplX：配置 DEEPLX_API_KEY 后，优先走 DeeplX（key 置于 URL 路径，兼容 api.deeplx.org）。
// 任何失败都回退英文原文，不阻塞推送。

import {
  DEEPLX_API_BASE,
  DEEPLX_API_KEY,
  TRANSLATE_TIMEOUT,
} from "./config.js";

const CJK_RE = /[一-鿿぀-ヿ가-힯]/;

export function isMostlyChinese(text) {
  if (!text) return true;
  const cjk = (text.match(CJK_RE) || []).length;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  if (text.length === 0) return true;
  if (cjk / text.length > 0.2 || cjk >= letters) return true;
  return false;
}

// MyMemory：GET https://api.mymemory.translated.net/get?q=...&langpair=en|zh-CN
// 免费、无需 token；匿名 500 次/天。配额耗尽时 translatedText 会变成
// "MYMEMORY WARNING: ..." 警告文本，需识别并丢弃。
async function translateMyMemory(text) {
  const url =
    "https://api.mymemory.translated.net/get?langpair=en|zh-CN&q=" +
    encodeURIComponent(text.slice(0, 500));
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(TRANSLATE_TIMEOUT),
      });
      if (resp.status !== 200) {
        console.log(`  [mymemory] HTTP ${resp.status} (attempt ${attempt})`);
        if (attempt === 1) continue;
        return null;
      }
      const data = await resp.json();
      const t = data?.responseData?.translatedText || "";
      if (!t || /MYMEMORY WARNING/i.test(t)) return null;
      return t.trim();
    } catch (e) {
      console.log(`  [mymemory skipped] ${e.name}: ${e.message} (attempt ${attempt})`);
      if (attempt === 1) continue;
      return null;
    }
  }
  return null;
}

// DeeplX：POST {base}/{key}/translate  body={text,source_lang,target_lang}  resp={code,data}
// 仅当配置了 DEEPLX_API_KEY 时才启用（key 置于 URL 路径，兼容 api.deeplx.org 公益服务）。
async function translateDeeplx(text) {
  const endpoint = `${DEEPLX_API_BASE}/${encodeURIComponent(DEEPLX_API_KEY)}/translate`;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 500),
        source_lang: "EN",
        target_lang: "ZH",
      }),
      signal: AbortSignal.timeout(TRANSLATE_TIMEOUT),
    });
    if (resp.status === 200) {
      const data = await resp.json();
      const result = (data?.data || "").trim();
      if (result) return result;
    } else {
      console.log(`  [deeplx] HTTP ${resp.status}`);
    }
  } catch (e) {
    console.log(`  [deeplx skipped] ${e.name}: ${e.message}`);
  }
  return null;
}

// 翻译前兜底剥除残余 HTML 标签（解析层已尽量清理，这里再保险一次，
// 避免 <p>/<img> 等标签被当作翻译文本发出或原样泄漏）。
function stripHtml(text) {
  return (text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 主入口：已译/中文文本直接返回；优先 DeeplX（若已配置有效 API Key），否则走 MyMemory；失败回退英文。
export async function translateToZh(text) {
  const clean = stripHtml(text);
  if (!clean || isMostlyChinese(clean)) return text;
  if (DEEPLX_API_KEY) {
    const r = await translateDeeplx(clean);
    if (r) return r;
  }
  const r = await translateMyMemory(clean);
  return r || text;
}
