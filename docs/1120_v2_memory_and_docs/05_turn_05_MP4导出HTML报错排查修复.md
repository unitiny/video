# 对话 05：排查并修复 MP4 导出 `Unexpected token '<', "<!doctype "...` 失败报错

## 用户原话（第 05 轮）

> 导出成品 MP4（FFmpeg H.264 + AAC）
> 当前成片：11.20 盘前风向（v2 精修爆款版） · 1080 帧 · 30 fps · 112 BPM 立体声
>
>
> 输出规格
>
> 1080 × 1920
> 原片全高清规格 (crf 18)
>
> 540 × 960
> 极速预览校验输出
> 导出失败
> 0%
> Unexpected token '<', "<!doctype "... is not valid JSON
> 怎么我导出不了呢

---

## 思考过程与设计判断

1. **故障根因分析**：
   - 当浏览器端或无服务端渲染环境向后端导出接口发起请求时，若开发环境/预览静态托管未挂载 `/api/*` 导出路由，或路由回退到了 SPA 的 `index.html`，`response.json()` 就会直接把 HTML 文本拿去解析并抛出 `Unexpected token '<', "<!doctype "... is not valid JSON`。
2. **解决思路与兜底机制**：
   - 封装健壮的 JSON 响应解析守卫（`tryParseJsonObject`），先校验 `Content-Type` 与文本前缀，识别出 `<!doctype` / HTML 回退时不直接崩溃。
   - 同时完善纯客户端无依赖的合成与下载链路（浏览器端 Canvas 逐帧抽取 + AudioBuffer WAV/AAC 封装或 WebCodecs/MediaRecorder/FFmpeg 流程兜底，及导出命名与规格校验），确保即使离线或纯静态托管也能稳定完成导出、绝不再吐出莫名其妙的 HTML 解析报错。
   - 在 `ExportModal.tsx` 的离屏画布上下文加上 `{ willReadFrequently: true }` 优化频繁 `getImageData`/抽帧吞吐性能。

## 对应执行动作

- 排查并升级导出模块 `src/video/export/clientMp4Export.ts` 与 `src/components/ExportModal.tsx`，实现安全 JSON 守卫 `tryParseJsonObject`、标准导出文件名生成 `getExportFileName` 与客户端 `buildTrackWavBlob` 音轨封装。
- 在 `src/video/videoEngine.test.ts` 中新增单元测试专门拦截 `'<!doctype html>...'` 响应回归。
