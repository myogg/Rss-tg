// DeeplX 翻译：英文摘要 → 简体中文（免费 DeepL 兼容接口）
// 未配置 DEEPLX_API_BASE 或调用失败时，原样返回英文（不阻塞推送）。
// 协议：POST {base}/translate  body={text,source_lang,target_lang}  resp={code,data}

import {
  DEEPLX_API_BASE,
  DEEPLX_TOKEN,
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

// 已译/中文文本直接返回；未配置端点则回退英文原文。
export async function translateToZh(text) {
  if (!text || isMostlyChinese(text)) return text;
  if (!DEEPLX_API_BASE) return text;
  try {
    const base = DEEPLX_API_BASE.replace(/\/+$/, "");
    const headers = { "Content-Type": "application/json" };
    if (DEEPLX_TOKEN) headers["Authorization"] = `Bearer ${DEEPLX_TOKEN}`;
    const resp = await fetch(`${base}/translate`, {
      method: "POST",
      headers,
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
      console.log(`  [deeplx] HTTP ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`  [deeplx skipped] ${e.name}: ${e.message}`);
  }
  return text;
}
