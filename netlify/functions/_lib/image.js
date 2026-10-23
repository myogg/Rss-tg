import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

// 字体以 base64 内联（Noto Sans CJK SC 子集，仅含封面用字），
// 保证随函数包一起部署，不依赖磁盘上的 .otf 文件与运行环境的系统字体。
import { COVER_BOLD_B64, COVER_REG_B64, FAMILY_BOLD, FAMILY_REG } from "./fonts.js";

let fontReady = false;
try {
  const kb = GlobalFonts.register(Buffer.from(COVER_BOLD_B64, "base64"), FAMILY_BOLD);
  const kr = GlobalFonts.register(Buffer.from(COVER_REG_B64, "base64"), FAMILY_REG);
  fontReady = Boolean(kb && kr);
  console.log(`[font] 注册结果 bold=${Boolean(kb)} reg=${Boolean(kr)} 族=${GlobalFonts.families.map(f => f.family).filter(n => /^Cover/.test(n)).join(",")}`);
} catch (e) {
  console.error(`[font] 注册失败: ${e.message}`);
  fontReady = false;
}
if (!fontReady) {
  // 磁盘兜底（本地调试/极端情况）：文件在则注册
  try {
    const { fileURLToPath } = await import("url");
    const base = new URL("./fonts/", import.meta.url);
    GlobalFonts.registerFromPath(fileURLToPath(new URL("CoverBold.otf", base)), FAMILY_BOLD);
    GlobalFonts.registerFromPath(fileURLToPath(new URL("CoverRegular.otf", base)), FAMILY_REG);
  } catch (e2) {
    console.error(`[font] 磁盘兜底失败: ${e2.message}`);
  }
}

const COVER_W = 1280;
const COVER_H = 720;

function coverSeed(mode, dateStr) {
  const tag = mode === "morning" ? "morning" : "evening";
  const d = String(dateStr).replace(/[^0-9]/g, "");
  return `yb-${tag}-${d}`;
}

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// 主源：Bing 每日壁纸（高质量、可商用）。idx=0 今日，idx=1 昨日，保证早晚不同
async function fetchBing(idx, timeoutMs) {
  const api = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=${idx}&n=2`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(api, { signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) return null;
    const j = await r.json();
    const img = j.images && j.images[0];
    if (!img || !img.url) return null;
    const url = img.url.startsWith("http") ? img.url : "https://www.bing.com" + img.url;
    return await fetchWithTimeout(url, timeoutMs);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// 备源：Picsum 随机精美照片（按 seed 当天稳定）
async function fetchPicsum(seed, timeoutMs) {
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${COVER_W}/${COVER_H}`;
  return fetchWithTimeout(url, timeoutMs);
}

function drawGradient(ctx, mode) {
  const g = ctx.createLinearGradient(0, 0, 0, COVER_H);
  if (mode === "morning") {
    g.addColorStop(0, "#ff9966");
    g.addColorStop(1, "#ffd194");
  } else {
    g.addColorStop(0, "#243949");
    g.addColorStop(1, "#517fa4");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
}

const CN_WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseYmd(s) {
  const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

// 2026.10.23 -> 2026年10月23日 周五
function toCnDate(s) {
  const p = parseYmd(s);
  if (!p) return String(s);
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${p.y}年${p.m}月${p.d}日 ${CN_WEEK[wd]}`;
}

// 2026.10.23 -> October 2026
function toEnMonth(s) {
  const p = parseYmd(s);
  return p ? `${EN_MONTHS[p.m - 1]} ${p.y}` : "";
}

async function compose(photoBuf, mode, displayDate) {
  const canvas = createCanvas(COVER_W, COVER_H);
  const ctx = canvas.getContext("2d");

  if (photoBuf) {
    try {
      const img = await loadImage(photoBuf);
      const scale = Math.max(COVER_W / img.width, COVER_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (COVER_W - w) / 2, (COVER_H - h) / 2, w, h);
    } catch (e) {
      console.error(`[compose] 绘图失败，降级纯渐变: ${e.message}`);
      drawGradient(ctx, mode);
    }
  } else {
    drawGradient(ctx, mode);
  }

  // 左侧柔光渐层：确保深色文字在任意壁纸上都清晰（呼应参考图的明亮晨光感）
  const wash = ctx.createLinearGradient(0, 0, COVER_W * 0.82, COVER_H);
  wash.addColorStop(0, "rgba(255,255,255,0.84)");
  wash.addColorStop(0.4, "rgba(255,255,255,0.5)");
  wash.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, COVER_W, COVER_H);

  const INK = "#1b1b1f";
  const X = 80;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // 主标题：北方的博客 + 早报/晚报，同行、同字号、同粗，一排显示
  ctx.fillStyle = INK;
  ctx.font = `96px ${FAMILY_BOLD}`;
  const titleLine = "北方的博客 " + (mode === "morning" ? "早报" : "晚报");
  ctx.fillText(titleLine, X, 330);

  // 中文日期 + 星期
  ctx.fillStyle = "rgba(27,27,31,0.9)";
  ctx.font = `34px ${FAMILY_REG}`;
  ctx.fillText(toCnDate(displayDate), X, 556);

  // 英文月份
  ctx.fillStyle = "rgba(27,27,31,0.78)";
  ctx.font = `32px ${FAMILY_REG}`;
  ctx.fillText(toEnMonth(displayDate), X, 614);

  return canvas.toBuffer("image/png");
}

// 生成当日封面（PNG Buffer）。任何环节失败都降级，保证始终有图可发。
export async function buildCover(mode, displayDate, env = {}) {
  const timeout = Number(env.COVER_FETCH_TIMEOUT) || 12000;
  const idx = mode === "morning" ? 0 : 1;
  let photo = await fetchBing(idx, timeout);
  if (!photo) photo = await fetchPicsum(coverSeed(mode, displayDate), timeout);
  try {
    return await compose(photo, mode, displayDate);
  } catch (e) {
    console.error(`[cover] 合成异常: ${e.message}`);
    if (photo) return photo; // 合成崩了就发原图
    const canvas = createCanvas(COVER_W, COVER_H);
    const ctx = canvas.getContext("2d");
    drawGradient(ctx, mode);
    return canvas.toBuffer("image/png");
  }
}
