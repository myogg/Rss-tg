// 早报/晚报消息构建（等价 Python 版 build_report_messages）
// heading + 编号列表（1️⃣~⑳），超 1024 caption 拆续篇纯文本（4096），
// 整条裁掉不切断 HTML，末尾补零宽字符留白。

import {
  REPORT_NUMBER_EMOJI,
  CAPTION_LIMIT,
  MAX_MESSAGE_LENGTH,
  REPORT_TRAILING_BLANK_LINES,
  COMPANY_ALIAS,
  SUMMARY_MAX_LENGTH,
} from "./config.js";

function esc(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 计算 HTML 解析后的可见字符数（去掉标签，实体算 1 个字符），用于 Telegram 限额判断
export function visibleLength(value) {
  const noTags = String(value || "").replace(/<[^>]+>/g, "");
  return noTags.replace(/&[a-zA-Z#0-9]+;/g, "X").length;
}

function truncateText(value, max) {
  value = String(value || "").trim();
  if (max <= 0) return "";
  if (value.length <= max) return value;
  if (max === 1) return "…";
  return value.slice(0, max - 1).trimEnd() + "…";
}

export function companyAlias(source) {
  const s = String(source || "").toLowerCase();
  for (const [k, alias] of Object.entries(COMPANY_ALIAS)) {
    if (s.includes(k)) return alias;
  }
  return source;
}

function beijingNow() {
  // 把当前 UTC 时刻 +8h，其 UTC 字段即北京时间日历值
  return new Date(Date.now() + 8 * 3600 * 1000);
}

function withTrailingPadding(text, limit) {
  if (REPORT_TRAILING_BLANK_LINES <= 0) return text;
  const padding = "\n".repeat(REPORT_TRAILING_BLANK_LINES) + "​";
  if (visibleLength(text + padding) <= limit) return text + padding;
  return text;
}

export function buildReportMessages(groups, mode) {
  const now = beijingNow();
  const label = mode === "morning" ? "早报" : "晚报";
  const emoji = mode === "morning" ? "🌅" : "🌃";
  const heading = `#News\n${emoji}${label}【${now.getUTCMonth() + 1}.${now.getUTCDate()}】`;

  const entries = [];
  for (let i = 0; i < groups.length; i++) {
    const [source, items] = groups[i];
    if (!items || !items.length) continue;
    const art = items[0];
    const company = esc(truncateText(companyAlias(source), 50));
    const titleText = art.title || "未命名文章";
    const summaryText = art.summary || "";
    const link = escAttr(art.link || "");
    const num = REPORT_NUMBER_EMOJI[i] || `${i + 1}.`;
    // 公司名作为超链接（指向文章），其后为文章标题（纯文本、不截断、不加链接）
    const titleLine = link
      ? `${num} <a href="${link}"><b>${company}</b></a> ${esc(titleText)}`
      : `${num} <b>${company}</b> ${esc(titleText)}`;
    // 摘要（译文、≤150字、纯文本、不链接）另起一行
    const entry = summaryText
      ? `${titleLine}\n${esc(truncateText(summaryText, SUMMARY_MAX_LENGTH))}`
      : titleLine;
    entries.push({ source, entry });
  }

  const messages = [];
  let currentLimit = CAPTION_LIMIT;
  let currentLines = [heading, ""];
  let currentItems = 0;

  for (const { source, entry } of entries) {
    const candidate = [...currentLines, entry, ""].join("\n");
    if (visibleLength(candidate) > currentLimit && (currentItems || currentLimit === CAPTION_LIMIT)) {
      if (currentItems || messages.length === 0) {
        messages.push(withTrailingPadding(currentLines.join("\n").trim(), currentLimit));
      }
      currentLimit = MAX_MESSAGE_LENGTH;
      currentLines = [`${heading}\n（续）`, ""];
      currentItems = 0;
    }
    const cand2 = [...currentLines, entry, ""].join("\n");
    if (visibleLength(cand2) > currentLimit) {
      throw new Error(`报告单条内容超出 Telegram 限制：${source}`);
    }
    currentLines = [...currentLines, entry, ""];
    currentItems += 1;
  }

  if (currentItems || messages.length === 0) {
    messages.push(withTrailingPadding(currentLines.join("\n").trim(), currentLimit));
  }
  return messages;
}

// 兼容旧调用：返回首条消息
export function buildReportCaption(groups, mode) {
  return buildReportMessages(groups, mode)[0];
}
