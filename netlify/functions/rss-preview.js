// 预览入口：可在浏览器/命令行用 URL 调用，便于不登录后台也能预览将要推送的内容。
//   https://<你的站点>/.netlify/functions/rss-preview?mode=morning
//   https://<你的站点>/.netlify/functions/rss-preview?mode=evening
// 若设置了环境变量 PREVIEW_KEY，则必须带 &key=xxx 才能访问（防止被随意调用）。
// 注意：本函数只读取、不发送、不写缓存。真正推送请用 rss-report 的定时或 Run now。

import { detectMode, previewReport, runReport } from "./_lib/runner.js";
import { buildCover } from "./_lib/image.js";

export const config = {
  path: "/rss-preview",
};

export default async (req) => {
  const url = new URL(req.url);
  const required = process.env.PREVIEW_KEY;
  if (required && url.searchParams.get("key") !== required) {
    return new Response("403 Forbidden", { status: 403 });
  }
  const mode = url.searchParams.get("mode") || detectMode();

  // ?cover=1 直接返回生成的封面图，便于预览字体/版式
  if (url.searchParams.get("cover") === "1") {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    const label = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
    const buf = await buildCover(mode, label, process.env);
    return new Response(buf, {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  }

  // ?send=1 时真实推送（等价于后台 Run now），同样受 PREVIEW_KEY 保护
  // 加 &reset=1 可先清空去重缓存，强制完整重发一期（测试用）
  if (url.searchParams.get("send") === "1") {
    if (url.searchParams.get("reset") === "1") {
      const { clearCache } = await import("./_lib/store.js");
      await clearCache();
    }
    const res = await runReport(mode, process.env);
    return Response.json(res);
  }

  const res = await previewReport(mode, process.env);
  return Response.json(res);
};
