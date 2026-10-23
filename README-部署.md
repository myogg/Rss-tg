# Rss-tg · Netlify 版部署指南

把「AI 每日早报/晚报」Telegram 推送机器人从 GitHub Actions 迁移到 **Netlify Scheduled Functions**，
解决 GitHub 定时整点排队延迟/丢弃、fork 默认禁用定时、时间漂移等问题。

> 核心结论：Netlify Scheduled Functions **免费默认开启、UTC 准点触发、不再有 GitHub 那种漂移**。
> 唯一硬约束是**定时函数 30 秒执行上限**——本实现已通过「并发翻译 + 只译标题 + 报头图内嵌」把耗时压在 ~25s 内。

---

## 一、它能做什么

- 每天 **北京时间 10:03（早报）/ 17:03（晚报）** 自动抓取 24 个 AI/科技 RSS 源
- 用 **DeepSeek** 把标题译成中文（未配 key 则英文原文照发）
- 生成带编号（1️⃣~⑳）的 Telegram 消息，**先发一张报头图（caption），超出 1024 字符自动拆续篇**
- 用 **Netlify Blobs** 做去重缓存（30 天滚动），避免重复推送

---

## 二、目录结构

```
rss-tg-netlify/
├── netlify.toml                      # 独立站点部署用（并入已有站点通常不需要）
├── package.json                      # 依赖 @netlify/blobs
├── feeds_report.txt                  # 源列表（参考，实际源在 _lib/config.js）
├── assets/                           # 两张报头图（改图后需重新生成 base64）
│   ├── report_cover_morning.jpg
│   └── report_cover_evening.jpg
├── netlify/functions/
│   ├── rss-report.js                 # 【定时入口】schedule 触发，自动判定早/晚报
│   ├── rss-preview.js                # 【预览入口】URL 调用，只读不发送
│   └── _lib/
│       ├── config.js                 # 源列表 / 别名 / 常量 / 定时 cron
│       ├── parse.js                  # 零依赖 RSS/Atom 解析（替代 fast-xml-parser）
│       ├── rss.js                    # 抓取 + 并发翻译 + 按源分组
│       ├── translate.js              # DeepSeek 翻译
│       ├── report.js                 # 消息构建（1024/4096 截断 + 末尾零宽留白）
│       ├── store.js                  # Netlify Blobs 去重缓存（本地无 Blobs 时回退内存）
│       ├── telegram.js               # sendPhoto / sendMessage
│       ├── runner.js                 # 推送/预览共享逻辑
│       └── covers.js                 # 自动生成：报头图 base64 内嵌（勿手改）
└── scripts/
    ├── gen-covers.mjs                # 重新生成 covers.js
    └── verify.mjs                    # 本地验证（拉真实 RSS 构建消息，不发送）
```

---

## 三、部署方式（两种）

### 方式 A：并入已有站点（如 myogg 博客）——推荐，最省事

1. 把 `netlify/functions/` 整个目录复制到你的站点仓库根目录（若你的站点已自定义 `functions` 目录，放到那个目录）。
2. 在站点仓库安装依赖：
   ```bash
   npm install @netlify/blobs
   ```
3. 配置环境变量（见第四节），**作用域选 Functions**。
4. 推送，Netlify 检测到 `rss-report.js` 的 `config.schedule` 即自动注册定时任务。
   - 不影响你博客的构建/部署；定时任务会出现在后台 **Functions** 页面（带 Scheduled 徽章）。

### 方式 B：作为独立站点部署

1. 把本仓库（`rss-tg-netlify/`）作为新站点连接/拖拽到 Netlify。
2. 在站点后台配置环境变量（见第四节）。
3. 部署后定时任务自动生效。

> 若用 **Netlify CLI** 本地部署：`npm install -g netlify-cli` → `netlify login` → `netlify deploy --prod`（部署前先 `netlify link`）。

---

## 四、环境变量（Site settings → Environment variables，作用域 Functions）

| 变量名 | 必填 | 说明 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram BotFather 拿到的 bot token |
| `TELEGRAM_CHANNEL_ID` | ✅ | 目标频道 ID（如 `@your_channel` 或纯数字 `-100xxxx`） |
| `DEEPSEEK_API_KEY` | ⬜ | DeepSeek API key；**不填则英文原文照发，不翻译** |
| `PREVIEW_KEY` | ⬜ | 给 `/rss-preview` 预览接口加访问密码；不填则任何人可访问预览 |

> 报头图里的频道名是固定图片，文字消息的 `【日期】` 由代码按北京时间生成，所以图片无需随日期更新。

---

## 五、定时说明

- 触发表达式在 `netlify/functions/_lib/config.js` 的 `SCHEDULE_CRON`，默认 `"3 2,9 * * *"`（**UTC**）。
  - UTC `02:03` ≈ 北京 `10:03` → 早报
  - UTC `09:03` ≈ 北京 `17:03` → 晚报
- 早/晚报由**触发时刻的北京时间**自动判定（`<14 点` 早报，否则晚报），无需额外配置。
- 想改时间：直接改 `SCHEDULE_CRON`。例：北京 09:00 → UTC 01:00 → `"0 1 * * *"`；北京 18:00 → UTC 10:00 → `"0 10 * * *"`。
- Netlify cron 为 **UTC**，且**夏令时不会自动换算**，需要手动按季节偏移 1 小时。

---

## 六、本地预览与测试

```bash
# 1) 安装依赖
npm install

# 2) 本地验证（拉真实 RSS、构建消息、断言长度/留白，不发送、不写缓存）
npm run verify                 # 早报
npm run verify evening         # 晚报
DEEPSEEK_API_KEY=xxx npm run verify   # 顺便测真实翻译

# 3) 重新生成报头图（assets/ 换了图后执行）
npm run gen:covers

# 4) 本地起 Netlify Dev 调试函数
npx netlify dev
# 然后：
#   - 预览：浏览器打开 http://localhost:8888/.netlify/functions/rss-preview?mode=morning
#   - 手动触发定时函数一次：npx netlify functions:invoke rss-report
#       可传 JSON 体：{"mode":"evening","dry":true}
```

> 线上预览（部署后）：`https://<你的站点>/.netlify/functions/rss-preview?mode=morning`
> 若设置了 `PREVIEW_KEY`：加 `&key=你的密码`。

---

## 七、30 秒时限与性能

定时函数硬上限 **30 秒**。本实现的耗时构成（最坏情况，已实测约 25s）：

| 阶段 | 估算 | 优化手段 |
|---|---|---|
| 抓取 24 个 RSS（并行） | ~8–15s | 并行 `Promise.all`，单源 12s 超时 + 3 次重试 |
| 翻译（仅标题，并发 20） | ~6s | 只译标题（摘要不展示，省一半调用）；无 key 时跳过 |
| 推送 Telegram | ~3s | 报头图 base64 内嵌免额外请求；消息间隔 400ms |

- 单期最多推送 `MAX_ARTICLES_PER_RUN = 60` 条（防刷屏 + 控时）。
- 各源**轮询选取**：每个源先各取 1 条，再取第 2 条……保证 24 个源全覆盖，不会饿死后半部分源。
- 超过 1024 字符的 caption 自动拆成「（续）」纯文本消息（每条 ≤4096）。

---

## 八、故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 定时任务没出现 | 确认 `rss-report.js` 已部署到**生产**（非 Preview）；Functions 页面看 Scheduled 徽章与下次执行时间 |
| 预览 403 | 设置了 `PREVIEW_KEY` 但没带 `&key=`；或 key 不符 |
| 没收到推送但日志显示「无新动态」 | 各源当天无更新或已被缓存去重，属正常静默跳过 |
| 推送失败未写缓存 | 下个周期自动重试（去重缓存只在成功后才写入） |
| 翻译没生效 | 没配置 `DEEPSEEK_API_KEY`，或 DeepSeek 限流（自动回退英文原文） |
| 报头图不显示 | `covers.js` 未生成或图片路径错；函数会回退为纯文本首条发送 |

---

## 九、与 GitHub Actions 版对比

| 痛点 | GitHub Actions | Netlify Scheduled |
|---|---|---|
| 整点排队延迟/丢弃 | 踩过 | 无，准点触发 |
| fork 默认禁用定时 | 踩过 | 无，默认开启 |
| 时间漂移 4.5–5h | 踩过 | 无，cron 即 UTC 时间 |
| 免费 | 免费 | 免费（仅占极少 credits） |
| 运行时 | 分钟级冷启动 | 秒级 |
