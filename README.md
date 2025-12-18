# AIAssistantCompanion

本仓库为 `AIAssistantCompanion` 项目源码。

## 开发

- 安装依赖：`npm install`
- 启动开发：`npm run dev`

## 配置说明

- **不要提交密钥**：`config/app.config.json`、`config/env.local` 已在 `.gitignore` 中忽略
- 可参考：`config/app.config.example.json`、`config/env.example`

## 在 Railway 部署

- Build：`npm run build`（默认即可，前后端都会打包：前端到 `dist-web/`，后端到 `dist/`）
- Start：`npm run start`（启动后端并默认服务 `dist-web/` 静态文件）
- 环境变量（最少需要）：
  - `PORT`（Railway 自动注入）
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - 语音/AI：`MINIMAX_API_KEY`（ASR/TTS），`GOOGLE_AI_API_KEY`（Gemini LLM）；可选 `AI_TTS_VOICE_ID`、`AI_TTS_SAMPLE_RATE`
  - 可选：`RESEND_API_KEY`、`RESEND_FROM`、`AI_INTEGRATIONS_OPENAI_API_KEY`、`AI_INTEGRATIONS_GEMINI_API_KEY` 等
- 如不想让后端托管静态文件，设置 `SERVE_STATIC=false`，改由其他静态站点/反代提供前端。

## AI 语音通话 + 3D 头像

- 新增 WebSocket `/ws/voice-ai`：前端可发起 AI 语音对讲，文本经 Minimax TTS 回传音频。
- 前端增加 “AI 语音” 按钮：浏览器授权麦克风后即可使用（若语音识别不可用，可手动输入文本）。
- 3D 头像：支持上传 VRM/GLB 作为角色形象，通话时根据 TTS 音量做基础口型同步。
- 上传限制可通过前端环境变量（如 `VITE_VRM_MAX_SIZE_MB`）按需扩展。


