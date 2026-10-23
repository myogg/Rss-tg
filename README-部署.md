# Rss-tg · Netlify 版部署与维护指南

把「AI 早报/晚报」Telegram 推送机器人部署到 **Netlify Scheduled Functions**，
解决 GitHub Actions 定时整点排队延迟/丢弃、fork 默认禁用定时、时间漂移等问题。

> 核心结论：Netlify Scheduled Functions **免费默认开启、UTC 准点触发、无 GitHub 那种漂移**。
> 唯一硬约束是**定时函数 30 秒执行上限**——本实现已通过「抓取与封面并行 + 并发翻译 + 只译标题」把耗时压在 ~25s 内。

当前线上站点：`https://rss-tg-bot.netlify.app`（独立站点，仓库 `myogg/Rss-tg`）。

---

## 一、它现在做什么

- 每天 **北京时间 10:03（早报）/ 17:03（晚报）** 自动抓取 **24 个** AI/科技 RSS 源
- 用 **DeepSeek** 仅把**标题**译成中文；摘要保留 RSS 原文（未配 key 则标题英文原文照发）
- 用 **Bing 每日壁纸**作封面，叠印「**北方的博客 早报** / **北方的博客 晚报**」（同一行、同字号）
- 消息格式：**实序号 `1️⃣`–`🔟` + 公司名（超链接指向文章）+ 文章标题（纯文本，已译中文）；第 11 条为空心 `⑪`（Unicode 无实心 11 keycap）**
- **每版固定取前 11 家**，其余丢弃；首条作封面 caption，装不下自动续篇（纯文本，≤4096）
- 用 **Netlify Blobs** 做去重缓存（30 天滚动），避免重复推送

---

## 二、目录结构

```
rss-tg-netlify/
├── netlify.toml                      # 独立站点部署配置 + 定时 cron
├── package.json                      # 依赖 @napi-rs/canvas、@netlify/blobs
├── public/index.html                 # 占位静态页（避免把源码当静态站发布）
├── feeds_report.txt                  # 源列表参考（实际源在 _lib/config.js）
├── netlify/functions/
│   ├── rss-report.js                 # 【定时入口】schedule 触发，自动判定早/晚报
│   ├── rss-preview.js                # 【预览/手动发/封面图】URL 调用，详见第六节
│   ├── rss-run.js                    # 【手动真实发送】URL 调用，?mode=&key=
│   └── _lib/
│       ├── config.js                 # 源列表 FEEDS / 别名 / 常量 / 定时 cron
│       ├── parse.js                  # 零依赖纯 JS RSS/Atom 解析（替代 fast-xml-parser）
│       ├── rss.js                    # 抓取 + 并发翻译(仅标题) + 按源分组
│       ├── translate.js              # DeepSeek 翻译
│       ├── report.js                 # 消息构建（1024/4096 截断 + 续篇 + 序号）
│       ├── store.js                  # Netlify Blobs 去重缓存（本地无 Blobs 时回退内存）
│       ├── telegram.js               # sendPhoto / sendMessage
│       ├── runner.js                 # 推送/预览共享逻辑
│       ├── image.js                  # 动态 Bing 封面 + 「北方的博客」叠印
│       ├── fonts.js                  # 中文字体 base64 内联（勿手改）
│       └── fonts/
│           ├── CoverBold.otf         # 封面标题字（Noto Sans CJK SC 子集）
│           └── CoverRegular.otf      # 封面日期字（同字体子集）
├── assets/                           # 【已弃用】静态报头图，现改动态 Bing 封面
├── scripts/
│   ├── verify.mjs                    # 本地验证（拉真实 RSS 构建消息，不发送）
│   └── gen-covers.mjs                # 【已弃用】早期 base64 报头图生成脚本
└── preview/                          # 线上封面截图（预览用，可删）
```

> 注：早期版本用 `assets/*.jpg` + `covers.js` 的**静态报头图**，现已改为 `image.js` **动态生成 Bing 封面**，`assets/` 与 `scripts/gen-covers.mjs` 不再使用，可保留也可删除。

---

## 三、部署方式

### 方式 A：作为独立站点部署（当前线上即此方式）

1. 把本仓库（`rss-tg-netlify/`）作为新站点连接（或拖拽）到 Netlify。
2. 后台配置环境变量（见第四节）。
3. 部署后 `netlify.toml` 里的 `[functions."rss-report"] schedule` 会自动注册定时任务。

> 用 **Netlify CLI** 部署（本仓库即如此）：
> ```bash
> NETLIFY_AUTH_TOKEN=<你的PAT> npx netlify-cli deploy --prod --skip-functions-cache \
>   --site <站点ID> --message "说明"
> ```
> `--skip-functions-cache` 关键：修改函数代码后必须加它，否则线上可能复用旧函数包、改动不生效。

### 方式 B：并入已有站点（如 myogg 博客）

1. 把 `netlify/functions/` 整个目录复制到目标站点仓库根目录。
2. 在目标站点装依赖：`npm install @napi-rs/canvas @netlify/blobs`。
3. 配置环境变量（作用域 Functions）。
4. 把本仓库 `netlify.toml` 中的 `[functions."rss-report"] schedule = "3 2,9 * * *"` 合并进目标站点的 `netlify.toml`。
5. 推送，定时任务自动注册（出现在后台 **Functions** 页，带 Scheduled 徽章）。

---

## 四、环境变量

位置：**Site settings → Environment variables**。建议勾 **Contains secret values**；
**Scopes** 选 **Specific scopes → Functions**；**Values** 选 **Same value for all deploy contexts**（只填一次）。

| 变量名 | 必填 | 说明 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | BotFather 拿到的 bot token |
| `TELEGRAM_CHANNEL_ID` | ✅ | 目标频道/群组 ID（`@频道名` 或纯数字 `-100xxxx`） |
| `DEEPSEEK_API_KEY` | ⬜ | DeepSeek key；**不填则标题英文原文照发，摘要保留 RSS 原文，不翻译** |
| `PREVIEW_KEY` | ⬜ | 给 `/rss-preview` 与 `/rss-run` 加访问密码；不填则任何人可触发 |
| `COVER_FETCH_TIMEOUT` | ⬜ | 封面图抓取超时（毫秒，默认 8000）；超时则封面退化为纯渐变兜底 |

> 改完环境变量后，若改动未生效，用上面的 CLI 命令重新 `deploy --prod` 注入一次即可。

---

## 五、定时说明

- 触发表达式写在 `netlify.toml` 的 `[functions."rss-report"]` 下：`schedule = "3 2,9 * * *"`（**UTC**）。
  - UTC `02:03` ≈ 北京 `10:03` → 早报
  - UTC `09:03` ≈ 北京 `17:03` → 晚报
- 早/晚报由**触发时刻的北京时间**自动判定（`<14 点` 早报，否则晚报），无需额外配置。
- 改时间：直接改 `schedule`。例：北京 09:00 → UTC 01:00 → `"0 1 * * *"`；北京 18:00 → UTC 10:00 → `"0 10 * * *"`。
- Netlify cron 为 **UTC**，且**夏令时不会自动换算**，需手动按季节偏移 1 小时。

---

## 六、手动触发与预览（URL 接口）

所有接口都部署在 `https://rss-tg-bot.netlify.app`（换成你的站点域名同理）。
设有 `PREVIEW_KEY` 时，每个接口都必须带 `&key=<你的密码>`。

| 接口 | 作用 | 示例 |
|---|---|---|
| `/rss-preview` | 只读预览，返回将要推送的消息 JSON（不发送、不写缓存） | `?mode=evening&key=xxx` |
| `/rss-preview?cover=1` | 直接返回生成的封面 PNG（看字体/版式） | `?cover=1&mode=morning&key=xxx` |
| `/rss-preview?send=1` | **真实推送一期**（等价于后台 Run now） | `?send=1&mode=evening&key=xxx` |
| `/rss-preview?send=1&reset=1` | 先清空去重缓存再推送（测试用，强制完整一期） | `?send=1&reset=1&mode=evening&key=xxx` |
| `/rss-run` | 手动真实发送（与上面 `?send=1` 等价，独立路由） | `?mode=morning&key=xxx` |

- `mode` 取值 `morning` / `evening`；不带则按当前北京时间自动判定。
- `?reset=1` 会清空去重缓存，**已推过的内容会再次推送**，仅用于测试。

后台也能触发：`Functions` 页找到 `rss-report` → **Run now**（或 CLI `netlify functions:invoke rss-report`）。

---

## 七、本地验证与测试

```bash
# 1) 安装依赖
npm install

# 2) 本地验证（拉真实 RSS、构建消息、断言长度/续篇，不发送、不写缓存）
npm run verify                 # 早报
npm run verify evening         # 晚报
DEEPSEEK_API_KEY=xxx npm run verify   # 顺便测真实翻译

# 3) 本地起 Netlify Dev 调试函数
npx netlify dev
#   - 预览：http://localhost:8888/.netlify/functions/rss-preview?mode=morning
#   - 封面：http://localhost:8888/.netlify/functions/rss-preview?cover=1&mode=morning
#   - 手动触发定时函数：npx netlify functions:invoke rss-report  可传 {"mode":"evening"}
```

> 线上预览（部署后）：`https://<你的站点>/.netlify/functions/rss-preview?mode=morning`
> 若设置了 `PREVIEW_KEY`：加 `&key=你的密码`。

---

## 八、30 秒时限与性能

定时函数硬上限 **30 秒**。本实现耗时构成（最坏情况，已实测约 25s）：

| 阶段 | 估算 | 优化手段 |
|---|---|---|
| 抓取 24 个 RSS（并行） | ~8–15s | 并行 `Promise.all`，单源 12s 超时 |
| 翻译（仅标题，并发 20） | ~6s | 无 key 时整体跳过；调用失败自动回退英文原文 |
| 生成 Bing 封面（与抓取并行） | ~2s | 封面抓取与 RSS 抓取**并行**启动；超时退化为纯渐变 |
| 推送 Telegram | ~3s | 封面 Buffer 直传，消息间隔 400ms |

- 每版固定取 `REPORT_MAX_ITEMS = 11` 家（靠前源优先，见 `config.js`）。
- 超过 1024 字符的封面 caption 自动拆成续篇纯文本消息（每条 ≤4096）。

---

## 九、常见维护操作

| 想改什么 | 改哪里 |
|---|---|
| 增删 RSS 源 / 调整顺序 | `netlify/functions/_lib/config.js` 的 `FEEDS` 数组（靠前的源优先展示） |
| 源的显示名（如「谷歌」） | `config.js` 的 `COMPANY_ALIAS` / `DOMAIN_ALIAS` |
| 每版条数（默认 8） | `config.js` 的 `REPORT_MAX_ITEMS` |
| 标题长度 | 不截断（文章标题一般较短，单条消息上限 4096 字符足够） |
| 推送时间 | `netlify.toml` 的 `schedule` |
| 封面标题文字「北方的博客」 | `netlify/functions/_lib/image.js` 的 `compose()` |
| 翻译模型 / 提示词 | `config.js` 的 `DEEPSEEK_MODEL` / `TRANSLATE_PROMPT` |

> 任何函数代码改动后，都需重新部署（CLI 加 `--skip-functions-cache`，或推送连接仓库）才会生效。

---

## 十、故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 定时任务没出现 | 确认已部署到**生产**（非 Preview）；Functions 页看 Scheduled 徽章与下次执行时间 |
| 预览/手动发 403 | 设了 `PREVIEW_KEY` 但没带 `&key=`，或 key 不符 |
| 没收到推送、日志「无新动态」 | 各源当天无更新或已被缓存去重，属正常静默跳过 |
| 推送失败 | 去重缓存只在成功后才写入，下个周期自动重试 |
| 翻译没生效 | 没配 `DEEPSEEK_API_KEY`，或 DeepSeek 限流（自动回退英文原文） |
| 封面无字 / 中文空白 | 字体 `fonts.js` base64 缺失；函数会正常出图但无文字 |
| 封面图不显示 | Bing 抓取超时且兜底渐变也失败，函数回退为纯文本首条发送 |
| 改动后线上没变 | 部署时复用了旧函数包，用 `--skip-functions-cache` 重新部署 |

---

## 十一、与 GitHub Actions 版对比

| 痛点 | GitHub Actions | Netlify Scheduled |
|---|---|---|
| 整点排队延迟/丢弃 | 踩过 | 无，准点触发 |
| fork 默认禁用定时 | 踩过 | 无，默认开启 |
| 时间漂移 4.5–5h | 踩过 | 无，cron 即 UTC 时间 |
| 免费 | 免费 | 免费（仅占极少 credits） |
| 运行时 | 分钟级冷启动 | 秒级 |
