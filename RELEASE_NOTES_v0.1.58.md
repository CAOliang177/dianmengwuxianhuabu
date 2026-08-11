# dianmeng 无限画布 0.1.58

## Windows 启动修复

0.1.57 的 Windows 安装包遗漏了 Next.js 运行依赖，安装后会提示 `Cannot find module 'next'` 并以 code 1 退出。本版本重新构建完整、自包含的桌面应用目录，修复该启动失败。

## 同时包含

- Seedance 2.5 专用视频编辑模式，编辑请求自动使用 `ratio=adaptive`、`duration=-1`。
- 火山方舟视频总超时默认 1800 秒。
- 三方 GPT/OpenAI 兼容提示词大模型插件，可配置 Base URL、API Key 和模型 ID。
- Seedance 提示词优化与创意 Skill 使用大语言模型推理，不再直接套用本地通用模板。
- 视频提示词提交前立即持久化，保留最近 50 个不同版本；成功视频历史可恢复当次提示词。

## 打包防回归

- 桌面组装阶段强制验证 `next`、`react`、`react-dom` 已进入自包含应用目录，缺失时直接中止打包。
- 桌面冒烟测试在启动前检查上述真实运行依赖，避免再次被开发机上层 `node_modules` 误判为通过。
