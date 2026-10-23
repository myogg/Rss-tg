// 手动触发入口：?mode=morning|evening 真实推送一期（等价后台 Run now）。
// 受 PREVIEW_KEY 保护：必须带 &key=<PREVIEW_KEY>。
//   https://<站点>/rss-run?mode=evening&key=xxx

import { detectMode, runReport } from "./_lib/runner.js";

export const config = {
  path: "/rss-run",
};

export default async (req) => {
  const url = new URL(req.url);
  const required = process.env.PREVIEW_KEY;
  if (required && url.searchParams.get("key") !== required) {
    return new Response("403 Forbidden", { status: 403 });
  }
  const mode = url.searchParams.get("mode") || detectMode();
  const res = await runReport(mode, process.env);
  return Response.json(res);
};
