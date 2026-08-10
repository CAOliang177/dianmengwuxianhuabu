# 火山方舟 Seedance

这是 dianmeng 无限画布内置的火山方舟官方 API 插件，使用 Ark 的内容生成任务接口。

## 配置

在应用设置中填写 `ARK_API_KEY`。默认地址为 `https://ark.cn-beijing.volces.com/api/v3`，默认模型为 `doubao-seedance-2-5-260628`（Seedance 2.5）。比例、时长和节点里选择的清晰度会作为请求 JSON 的顶层 `ratio`、`duration`、`resolution` 发送，不再拼接到提示词末尾；设置中的 `VOLCENGINE_VIDEO_RESOLUTION` 只作为旧画布或未选择时的后备默认值。

## 素材库

火山方舟的 Seedance 2.5、Seedance 2.0 与 Seedance 2.0 Fast 节点上方都有“选择素材”，可打开素材库分组和素材列表。要浏览私有素材，需要在设置里填写火山账号的 `VOLCENGINE_ACCESS_KEY_ID` 与 `VOLCENGINE_SECRET_ACCESS_KEY`；只配置 `ARK_API_KEY` 仍可生成视频，但不能读取私有素材列表。也可以把 `asset://asset-...` 粘贴到节点数据中，多个 ID 用逗号或换行分隔。默认按图片引用发送；视频或音频素材可写成 `video:asset://asset-...` 或 `audio:asset://asset-...`。画布中连接的本地图片仍会作为普通参考图发送。

素材库 OpenAPI 只能列出当前账号可通过接口查询的素材组。AK/SK 会保存在这台电脑的本地设置中，请使用仅授予素材库读取权限的子账号密钥，不要填写主账号高权限密钥；安装包不会携带你的任何密钥。

## 提示词优化

视频节点中的“Seedance 2.5 提示词优化”是本地工具，不会上传提示词。它按官方建议整理“主体与事件 → 场景与环境 → 视觉风格 → 镜头与剪辑 → 声音设计 → 生成约束”，并保留原始创意；素材引用会提示使用 `@图片1`、`@视频1`、`@音频1` 明确职责。

## 官方文档

- [Seedance 2.5 使用教程](https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2607688?lang=zh)
- [Seedance 2.5 提示词指南](https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2607689?lang=zh)
- [火山方舟视频生成 API](https://console.volcengine.com/ark/region:cn-beijing/docs/82379/1544106?lang=zh)
- [私域素材库说明](https://www.volcengine.com/docs/82379/2315856?lang=zh)
