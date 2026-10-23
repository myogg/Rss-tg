// 纯 JS RSS / Atom 解析（零依赖，替代 fast-xml-parser）
// 用正则切分 item/entry 块并抽取字段，兼容 CDATA、HTML 实体、RSS/Atom 混合写法。
// 设计目标：在 Node / Deno / Netlify Functions 任意运行时都能跑，不依赖任何第三方包。

// ---------- 实体解码 ----------
function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(parseInt(n, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // 最后处理，避免二次解码
}

function safeCodePoint(cp) {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

function cleanText(s) {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

// ---------- 标签抽取 ----------
// 取出 <tag ...>...</tag> 的全部内容（非贪婪）
function getTagContents(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

// 取出标签上某属性的值（首处）
function getAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "i");
  const m = block.match(re);
  if (!m) return null;
  const am = m[1].match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i"));
  return am ? am[1] : null;
}

// 取出所有 <tag ...> 的开标签属性串
function getOpenTags(block, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

function attrValue(openTag, attr) {
  const am = openTag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i"));
  return am ? am[1] : null;
}

// ---------- 链接解析（RSS <link>url</link> 与 Atom <link href> 并存）----------
function extractLinks(block) {
  const links = [];
  // RSS: <link>url</link>
  for (const c of getTagContents(block, "link")) {
    const t = cleanText(c);
    if (t.startsWith("http")) links.push({ href: t, rel: null });
  }
  // Atom: <link href="..." rel="alternate|self|..."/>
  for (const open of getOpenTags(block, "link")) {
    const href = attrValue(open, "href");
    if (href && href.startsWith("http")) {
      links.push({ href, rel: (attrValue(open, "rel") || "").toLowerCase() });
    }
  }
  return links;
}

function articleLink(block) {
  const links = extractLinks(block);
  if (!links.length) return "";
  const alt = links.find((l) => l.rel === "alternate") || links.find((l) => l.rel === "self");
  return (alt || links[0]).href;
}

// ---------- 配图解析 ----------
const BAD_IMAGE_RE =
  /(favicon|sprite|avatar|gravatar|emoji|emoticon|smiley|smilie|sticker|spacer|blank\.|placeholder|loading|default[-_]?img|no[-_]?image|pixel|beacon|1x1|transparent|\/(icon|icons|logo|logos|badge|badges|button|buttons|arrow|arrows)\/|[-_](icon|logo|badge|arrow)\b|\/static\/(img|images)\/(icon|logo)|wechat|weixin|qrcode|qr[-_]?code|erweima|share[-_]?(icon|img)|social[-_]?(icon|img)|wordpress[-_]?logo|cms[-_]?logo)/i;

function isImageUrl(url) {
  return /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(url);
}

function toInt(v) {
  if (v == null) return null;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function isBadImage(url) {
  if (!url || !url.startsWith("http")) return true;
  if (BAD_IMAGE_RE.test(url)) return true;
  const dims = url.match(/\/(\d{2,4})x(\d{2,4})\//);
  if (dims) {
    const w = parseInt(dims[1], 10);
    const h = parseInt(dims[2], 10);
    if (w < 300 && h < 300) return true;
  }
  if (/\.gif(\?|$)/i.test(url)) return true;
  if (/\.svg(\?|$)/i.test(url)) return true;
  return false;
}

function imagesFromHtml(html) {
  const out = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html || ""))) {
    const tag = m[0];
    for (const a of ["src", "data-src", "data-original", "data-lazy-src"]) {
      const am = tag.match(new RegExp(`${a}\\s*=\\s*["']([^"']+)["']`, "i"));
      if (am && am[1].startsWith("http")) {
        out.push(am[1]);
        break;
      }
    }
  }
  return out;
}

function extractImage(block, logo) {
  // 1) media:content url
  for (const open of getOpenTags(block, "media:content")) {
    const u = attrValue(open, "url");
    if (u && u.startsWith("http") && !isBadImage(u)) return u;
  }
  // 2) enclosure（图片型）
  const encUrl = getAttr(block, "enclosure", "url");
  const encType = (getAttr(block, "enclosure", "type") || "").toLowerCase();
  if (encUrl && (encType.includes("image") || isImageUrl(encUrl)) && !isBadImage(encUrl)) return encUrl;
  // 3) HTML 正文里的图
  const htmlParts = [
    ...getTagContents(block, "content:encoded"),
    ...getTagContents(block, "content"),
    ...getTagContents(block, "description"),
    ...getTagContents(block, "summary"),
  ];
  for (const html of htmlParts) {
    for (const u of imagesFromHtml(html)) {
      if (u.startsWith("http") && !isBadImage(u)) return u;
    }
  }
  // 4) 频道 logo 兜底
  if (logo && logo.startsWith("http") && !isBadImage(logo)) return logo;
  return null;
}

// ---------- 时间解析 ----------
function parseEntryTime(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ---------- 单条目抽取 ----------
function extractItems(channelBlock, logo) {
  const blocks = [...getBlocks(channelBlock, "item"), ...getBlocks(channelBlock, "entry")];
  return blocks.map((b) => ({
    title: cleanText([...getTagContents(b, "title")][0] || ""),
    link: articleLink(b),
    pubDate: cleanText(
      [...getTagContents(b, "pubDate")][0] ||
        [...getTagContents(b, "published")][0] ||
        [...getTagContents(b, "updated")][0] ||
        [...getTagContents(b, "dc:date")][0] ||
        ""
    ),
    summary: cleanText(
      [...getTagContents(b, "description")][0] || [...getTagContents(b, "summary")][0] || ""
    ),
    content: cleanText(
      [...getTagContents(b, "content:encoded")][0] || [...getTagContents(b, "content")][0] || ""
    ),
    image: extractImage(b, logo),
  }));
}

// 取出所有 <tag ...>...</tag> 块（非贪婪）
function getBlocks(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}

// ---------- 对外：解析整个 feed ----------
// 返回 { title, logo, items: [{title, link, pubDate, summary, content}] }
export function parseFeed(xml) {
  if (!xml || typeof xml !== "string") return { title: "", logo: "", items: [] };

  // 优先从 <channel>/<feed> 容器内取标题与 logo
  const channelBlock = getBlocks(xml, "channel")[0] || getBlocks(xml, "feed")[0] || xml;

  const title = cleanText(
    [...getTagContents(channelBlock, "title")][0] ||
      [...getTagContents(xml, "title")][0] ||
      ""
  );

  let logo = "";
  // RSS: <image><url>...</url></image> 或 <image url="..."/>
  const imgBlock = getBlocks(channelBlock, "image")[0];
  if (imgBlock) {
    logo = cleanText([...getTagContents(imgBlock, "url")][0] || getAttr(imgBlock, "image", "url") || "");
  }
  // Atom: <logo> 或 <icon>
  if (!logo) logo = cleanText([...getTagContents(channelBlock, "logo")][0] || "");
  if (!logo) logo = cleanText([...getTagContents(channelBlock, "icon")][0] || "");

  const items = extractItems(channelBlock, logo);
  return { title, logo, items };
}

export { parseEntryTime, extractImage, cleanText };
