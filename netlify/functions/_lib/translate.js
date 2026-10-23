// DeepSeek 翻译：英文标题/摘要 → 简体中文
// 未配置 DEEPSEEK_API_KEY 或调用失败时，原样返回英文（不阻塞推送）。

import {
  DEEPSEEK_API_BASE,
  DEEPSEEK_MODEL,
  TRANSLATE_PROMPT,
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

export async function translateToZh(text, apiKey) {
  if (!text || isMostlyChinese(text)) return text;
  if (!apiKey) return text;
  try {
    const resp = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: TRANSLATE_PROMPT },
          { role: "user", content: text.slice(0, 500) },
        ],
        temperature: 0.2,
        max_tokens: 512,
      }),
      signal: AbortSignal.timeout(TRANSLATE_TIMEOUT),
    });
    if (resp.status === 200) {
      const data = await resp.json();
      const choices = data.choices || [];
      if (choices.length) {
        let result = (choices[0].message?.content || "").trim();
        result = result.replace(/^["“”']|["“”']$/g, "").trim();
        if (result) return result;
      }
    } else {
      console.log(`  [deepseek] HTTP ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`  [deepseek skipped] ${e.name}: ${e.message}`);
  }
  return text;
}
