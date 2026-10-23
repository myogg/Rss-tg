// 定时入口：Netlify Scheduled Function
// 北京时间 10:03 / 17:03（UTC 02:03 / 09:03）各触发一次，由触发时刻自动判定早报/晚报。
// 手动触发（Functions 页面 Run now / netlify functions:invoke）可在请求体传
//   {"mode":"morning"|"evening","dry":true}  做指定模式预览。

import { detectMode, runReport, previewReport } from "./_lib/runner.js";

// 定时（schedule）写在 netlify.toml 的 [functions."rss-report"] 中，
// 这里不再内联，避免两处定义冲突。
export default async (req) => {
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const env = process.env;
  const mode = body.mode || detectMode();

  if (body.dry) {
    const res = await previewReport(mode, env);
    return Response.json(res);
  }

  const res = await runReport(mode, env);
  return Response.json(res);
};
