# 香蕉中转 API

为 dianmeng无限画布提供 Nano Banana / Banana Pro 图片生成、单图编辑和多图融合。

- 支持 `/images/generations` 与 `/images/edits`
- 支持直接返回 `data[0].url` / `b64_json`
- 支持先返回任务 `id`，再自动轮询 `/{id}` 的异步格式
- 可在应用设置中修改 Key、Base URL、模型、尺寸及超时

当前中转站推荐 Base URL：`http://ai.maxagent.top/v1`。
