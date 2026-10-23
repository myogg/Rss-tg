// 配置：源列表、公司别名、各项常量
// 与 Python 版 sync_articles.py 及 CF 版一致；去掉 R2 报头图（改为 base64 内嵌）。

// 早报 / 晚报专用源（国际 AI 大厂 + 科技媒体）。
// 顺序即推送顺序；过多源时按出现先后取前 N 条展示（受 1024/4096 字符上限约束）。
export const FEEDS = [
  // AI 大厂官方（国际）
  "https://openai.com/news/rss.xml",
  "https://deepmind.google/blog/rss.xml",
  "https://blog.google/technology/ai/rss/",
  "https://blog.cloudflare.com/rss",
  "https://vercel.com/atom",
  "https://blogs.microsoft.com/feed/",
  "https://machinelearning.apple.com/rss.xml",
  "https://blogs.nvidia.com/feed/",
  "https://engineering.fb.com/feed/",
  // AI 公司（国内）
  "https://qwenlm.github.io/blog/index.xml",
  // 开发平台 / 云基础设施
  "https://github.blog/feed/",
  "https://aws.amazon.com/blogs/machine-learning/feed/",
  // AI 公司（语音 / 本地大模型）
  "https://elevenlabs.io/blog/rss.xml",
  "https://ollama.com/blog/rss.xml",
  // AI 资讯媒体
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  // 科技公司（非 AI 专属，官方博客 / 工程博客）
  "https://shopify.engineering/blog.atom",
  "https://netflixtechblog.com/feed",
  "https://engineering.atspotify.com/feed/",
  "https://dropbox.tech/feed",
  "https://blog.mozilla.org/feed/",
  // 科技媒体 / 聚合
  "https://www.theverge.com/rss/index.xml",
  "https://arstechnica.com/feed/",
  "https://www.wired.com/feed/rss",
  "https://hnrss.org/frontpage",
];

// 来源名 -> 编号消息里显示的简短公司名（小写匹配 feed title）
export const COMPANY_ALIAS = {
  openai: "OpenAI",
  deepmind: "Google DeepMind",
  google: "谷歌",
  microsoft: "微软",
  apple: "苹果",
  nvidia: "英伟达",
  meta: "Meta",
  github: "GitHub",
  aws: "AWS",
  fb: "Meta",
  cloudflare: "Cloudflare",
  vercel: "Vercel",
  qwen: "通义千问",
  shopify: "Shopify",
  netflix: "Netflix",
  spotify: "Spotify",
  dropbox: "Dropbox",
  mozilla: "Mozilla",
  theverge: "The Verge",
  arstechnica: "Ars Technica",
  wired: "Wired",
  hnrss: "Hacker News",
  techcrunch: "TechCrunch",
};

// 域名 -> 来源名（优先于标题文本匹配，避免 feed 标题叫「Artificial Intelligence」之类导致别名失败）
export const DOMAIN_ALIAS = {
  "openai.com": "OpenAI",
  "deepmind.google": "Google DeepMind",
  "blog.google": "谷歌",
  "blog.cloudflare.com": "Cloudflare",
  "vercel.com": "Vercel",
  "blogs.microsoft.com": "微软",
  "machinelearning.apple.com": "苹果",
  "blogs.nvidia.com": "英伟达",
  "engineering.fb.com": "Meta",
  "qwenlm.github.io": "通义千问",
  "github.blog": "GitHub",
  "aws.amazon.com": "AWS",
  "elevenlabs.io": "ElevenLabs",
  "ollama.com": "Ollama",
  "techcrunch.com": "TechCrunch",
  "shopify.engineering": "Shopify",
  "netflixtechblog.com": "Netflix",
  "engineering.atspotify.com": "Spotify",
  "dropbox.tech": "Dropbox",
  "blog.mozilla.org": "Mozilla",
  "theverge.com": "The Verge",
  "arstechnica.com": "Ars Technica",
  "wired.com": "Wired",
  "hnrss.org": "Hacker News",
};

// 编号序号 emoji（1~10 实心 keycap；11~20 空心 circled，正常每版≤8条用不到）
export const REPORT_NUMBER_EMOJI = [
  "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
];

// 各项限制
export const CAPTION_LIMIT = 1024;          // Telegram 图片 caption 上限
export const MAX_MESSAGE_LENGTH = 4096;     // Telegram 文本消息上限
export const REPORT_TRAILING_BLANK_LINES = 2; // 末尾留白：避免最后一行与时间戳贴太近
export const SUMMARY_MAX_LENGTH = 150;      // 摘要截断长度（单条放不下时自动续篇）
export const REPORT_MAX_ITEMS = 8;           // 每版固定推送的条目数（取前 N 家，其余丢弃）
export const KEEP_DAYS = 30;                // 缓存保留天数
export const PREFER_TODAY = true;           // 优先推送当天（北京时间）发布的内容
export const REQUEST_TIMEOUT = 12000;        // 单次抓取超时（毫秒）
export const TRANSLATE_TIMEOUT = 15000;      // 单次翻译超时（毫秒）
export const MAX_ARTICLES_PER_FEED = 5;     // 每个源每次最多取几条
export const SCAN_DEPTH = 20;                // 每个源最多扫描多少条 entry
export const MAX_ARTICLES_PER_RUN = 20;     // 单次运行最多取几条（单条消息有 Telegram 上限，超出部分在消息构建时截断丢弃）

// 并发翻译批大小（适配 Netlify 定时函数 30s 上限）：每批并发翻译的条目数。
// 只翻译标题（摘要不展示，无需翻译），60 条 => 3 批并行，整体控制在 ~6s 内。
export const TRANSLATE_BATCH = 20;

// 抓取时声明的 UA（老实报身份，微软博客对伪装浏览器 UA 直接 403）
export const USER_AGENT =
  "Mozilla/5.0 (compatible; RssTgBot/1.0; +https://github.com/myogg/Rss-tg)";

// DeepSeek 翻译（未配置 DEEPSEEK_API_KEY 时英文原文照发）
export const DEEPSEEK_API_BASE = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-chat";
export const TRANSLATE_PROMPT =
  "你是科技资讯翻译。把用户给的英文标题译成简洁、地道的简体中文。" +
  "要求：1) 品牌名、公司名、产品名、模型名（如 OpenAI、Gemini、Qwen、NVIDIA）保持英文原样，不要音译或意译；" +
  "2) 只输出译文，不要解释、不要加引号；" +
  "3) 保持原意，不要扩写或删减。";

// 报头图频道名兜底（取不到 Telegram 频道真实标题时使用）
export const DEFAULT_CHANNEL_TITLE = "AI 每日速递";

// 定时 cron（UTC）：北京 10:03 / 17:03 => UTC 02:03 / 09:03
export const SCHEDULE_CRON = "3 2,9 * * *";
