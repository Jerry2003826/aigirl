# AI 伴侣 (AI Companion)

基于大语言模型的 AI 伴侣聊天应用，支持多角色对话、语音对讲、3D 头像、朋友圈与群组功能。采用 React + Express 全栈架构，通过 L5 级安全与代码质量审计。

## 功能特性

- **多角色对话**：创建多个 AI 人设，支持性格、背景、系统提示自定义
- **AI 语音对讲**：WebSocket 实时语音，MiniMax TTS/ASR，支持 3D VRM 头像口型同步
- **朋友圈（Moments）**：AI 自动发动态、点赞、评论，用户与 AI 互动
- **群组聊天**：多 AI 角色群聊，自动选择回复角色
- **记忆系统**：AI 记忆关键信息，支持 RAG 检索
- **对象存储**：支持 S3 兼容存储（含 MinIO）与 Replit 侧车

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18, TypeScript, Vite, TanStack Query, Radix UI, Tailwind CSS, Three.js, @pixiv/three-vrm |
| 后端 | Express, TypeScript, Drizzle ORM, Passport, WebSocket |
| 数据库 | PostgreSQL |
| AI | Google Gemini / OpenAI（可切换） |
| 语音 | MiniMax TTS/ASR |
| 存储 | AWS S3 / Google Cloud Storage / 本地文件 |

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL
- （可选）Resend 账号（邮件验证码）、MiniMax API（语音）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/Jerry2003826/aigirl.git
cd aigirl

# 安装依赖
npm install

# 配置环境变量（见下方）
cp config/env.example config/env.local
# 编辑 config/env.local，至少配置 DATABASE_URL、SESSION_SECRET

# 数据库迁移
npm run db:push

# 开发模式
npm run dev
```

访问 `http://localhost:5000`。

### 必需环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `SESSION_SECRET` | 会话加密密钥 |
| `RESEND_API_KEY` | Resend 邮件 API 密钥（注册/重置密码必需） |
| `GOOGLE_AI_API_KEY` | Gemini API 密钥（或 `AI_INTEGRATIONS_GEMINI_API_KEY`） |
| `MINIMAX_API_KEY` | MiniMax 语音 API（语音功能） |

完整配置见 `config/env.example` 与 `config/app.config.example.json`。

## 配置说明

- **敏感配置不提交**：`config/env.local`、`config/app.config.json`、`config/app.config.local.json` 已加入 `.gitignore`
- **配置优先级**：默认 → `app.config.json` → 环境变量 → `app.config.local.json`
- **API 密钥加密**：设置 `ENCRYPTION_KEY`（≥32 字符）可加密存储用户自定义 API 密钥

## 部署

### Railway / Nixpacks

- **Build**：`npm run build`（前端输出 `dist-web/`，后端 `dist/`）
- **Start**：`npm run start`
- **环境变量**：至少配置 `PORT`、`DATABASE_URL`、`SESSION_SECRET`、`RESEND_API_KEY`、`GOOGLE_AI_API_KEY`

### 自托管

```bash
npm run build
NODE_ENV=production node dist/index.js
```

可设置 `SERVE_STATIC=false` 由 Nginx/Caddy 单独托管前端静态资源。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（Vite HMR + 后端） |
| `npm run build` | 生产构建 |
| `npm run start` | 生产启动 |
| `npm run check` | TypeScript 类型检查 |
| `npm run test` | 运行测试 |
| `npm run db:push` | Drizzle 数据库迁移 |
| `npm run secret-scan` | 密钥泄露扫描（需 gitleaks） |

## 项目结构

```
├── client/src/          # React 前端
│   ├── components/      # UI 组件
│   ├── pages/           # 页面
│   ├── hooks/           # 自定义 Hooks
│   └── lib/             # 工具与 API 封装
├── server/              # Express 后端
│   ├── routes/          # 按域拆分路由
│   ├── ai/              # AI 提供商抽象
│   ├── voice/           # 语音 WebSocket 与流
│   └── utils/           # 工具函数
├── shared/              # 共享 Schema（Drizzle + Zod）
├── config/              # 配置文件
├── migrations/          # 数据库迁移
└── docs/                # 文档
```

## 安全与质量（L5）

本项目已通过 L5 级代码审查与修复，包括：

- 无硬编码密钥，启动时强校验必需环境变量
- 验证码哈希存储、常量时间比较
- API 密钥可选加密存储
- 敏感端点限流（认证、上传、消息）
- Git 历史已清理泄露密钥
- CI 门禁：类型检查、构建、测试、密钥扫描

详见 `docs/L5_BASELINE.md`、`docs/SECRET_ROTATION.md`、`docs/L5_RELEASE_CHECKLIST.md`。

## 许可证

MIT
