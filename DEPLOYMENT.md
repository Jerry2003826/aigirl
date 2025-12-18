# 部署指南 - WhatsApp 式前后端分离架构

本项目已完全脱离 Replit，采用 **前端静态站点 + 后端 API/WebSocket** 的部署方式（类似 WhatsApp Web）。

你现在可以通过 `config/app.config.json`（以及可选的 `config/app.config.local.json` 覆盖文件）来修改部署所需的关键变量，而不需要去改源码里的 `process.env.*`。

## 1) 创建配置文件

把示例复制一份：

- 复制 `config/app.config.example.json` -> `config/app.config.json`
- 如需本机/某台服务器专用覆盖，再创建 `config/app.config.local.json`（会覆盖同名字段）

注意：`config/app.config.json` 和 `config/app.config.local.json` 已加入 `.gitignore`，不会被提交（适合放密钥）。

## 2) 你最常需要改的字段

- **数据库**
  - `database.databaseUrl`：Postgres 连接串（同时也会提供给 drizzle-kit）

- **Session / 登录 Cookie**
  - `session.sessionSecret`：必须改成随机长字符串
  - `session.cookieSecure`：
    - 生产环境 **HTTPS**：建议 `true`
    - 纯 HTTP / 本地调试：设为 `false`，否则会出现“能打开页面但一直未登录”
  - `session.cookieSameSite`：默认 `lax`
  - `session.cookieDomain`：一般留空即可（同域部署）

- **邮件（Resend）**
  - `email.resendApiKey`
  - `email.from`

- **AI Key（任选其一即可让 AI 在线）**
  - `ai.googleAiApiKey`（传统方式）
  - 或 `ai.integrations.geminiApiKey` / `ai.integrations.geminiBaseUrl`
  - 或 OpenAI integrations

- **对象存储**
  - `objectStorage.mode`：
    - `disabled`：默认（使用本地磁盘 `public/uploads/`）
    - `s3`：使用 S3 兼容存储（推荐生产环境）
    - `replit`：仅当你仍运行在 Replit 并有 sidecar 时可用（已废弃）

- **S3 存储配置**（当 `objectStorage.mode` 为 `s3` 时）
  - `s3.endpoint`：S3 端点（如 `https://s3.amazonaws.com` 或 MinIO 的 `http://localhost:9000`）
  - `s3.region`：区域（如 `us-east-1`）
  - `s3.bucket`：存储桶名称
  - `s3.accessKeyId`：访问密钥 ID
  - `s3.secretAccessKey`：访问密钥
  - `s3.publicBaseUrl`：可选，CDN 或自定义域名（如 `https://cdn.example.com`）
  - `s3.forcePathStyle`：MinIO 等兼容服务需设为 `true`
  - `s3.publicBucket`：存储桶是否为公开（`true` 时直接返回公网 URL，否则生成 presigned URL）

## 3) 构建与运行

### 开发模式（前端热更新 + 后端 API）

```bash
npm ci
npm run dev
```

访问 `http://localhost:5000`（前端由 Vite dev server 提供，后端 API 在 `/api/*` 和 `/ws`）

### 生产模式（前后端分离）

**步骤 1：构建前端和后端**

```bash
npm ci
npm run build
```

这会生成：
- 前端静态文件：`dist-web/`（由 Nginx/Caddy 托管）
- 后端服务：`dist/index.js`（Node.js 运行）

**步骤 2：启动后端服务**

```bash
NODE_ENV=production node dist/index.js
```

后端默认监听 `server.port`（示例是 5000），只提供：
- `/api/*` - REST API
- `/ws` - WebSocket 连接
- `/uploads/*` - 本地上传文件（如果使用本地存储）

**步骤 3：配置反向代理**

前端静态文件由反向代理（Nginx/Caddy）托管，同时代理后端 API/WebSocket。

参考配置：
- **Nginx**：见 `nginx/example.conf`
- **Caddy**：见 `caddy/Caddyfile.example`

关键配置点：
- 前端静态：`root` 指向 `dist-web/`
- API 路由：`/api/*` -> `http://127.0.0.1:5000`
- WebSocket：`/ws` -> `http://127.0.0.1:5000`（必须支持 Upgrade）
- 本地上传：`/uploads/*` -> `public/uploads/`（如果使用本地存储）

## 4) 反向代理配置示例

### Nginx

见 `nginx/example.conf`，主要配置：

```nginx
# 前端静态
root /path/to/project/dist-web;

# API 代理
location /api/ {
    proxy_pass http://127.0.0.1:5000;
    # ... 标准 proxy 配置
}

# WebSocket 代理
location /ws {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### Caddy

见 `caddy/Caddyfile.example`，Caddy 会自动处理 HTTPS 和 WebSocket 升级。

## 5) S3 存储配置示例

### AWS S3

```json
{
  "objectStorage": {
    "mode": "s3"
  },
  "s3": {
    "endpoint": "https://s3.amazonaws.com",
    "region": "us-east-1",
    "bucket": "your-bucket-name",
    "accessKeyId": "AKIA...",
    "secretAccessKey": "xxx",
    "publicBaseUrl": "https://your-bucket.s3.us-east-1.amazonaws.com",
    "forcePathStyle": false,
    "publicBucket": false
  }
}
```

### MinIO（自建 S3 兼容）

```json
{
  "objectStorage": {
    "mode": "s3"
  },
  "s3": {
    "endpoint": "http://localhost:9000",
    "region": "us-east-1",
    "bucket": "uploads",
    "accessKeyId": "minioadmin",
    "secretAccessKey": "minioadmin",
    "publicBaseUrl": "http://localhost:9000/uploads",
    "forcePathStyle": true,
    "publicBucket": true
  }
}
```

### 阿里云 OSS / 腾讯云 COS

只需修改 `endpoint` 和 `region` 为对应云服务商的地址即可。

## 6) 常见问题

- **登录不了/刷新后变未登录**：99% 是 `cookieSecure=true` 但你没走 HTTPS。本地开发时设为 `false`。
- **对象存储接口 501**：检查 `objectStorage.mode` 是否设置为 `s3`，并确保 S3 配置完整。
- **WebSocket 连接失败**：确保反向代理支持 WebSocket Upgrade（见配置示例）。
- **前端路由 404**：确保反向代理配置了 SPA fallback（`try_files` 或 `file_server` + `handle`）。
- **图片上传失败**：检查 S3 配置是否正确，或使用本地存储（`objectStorage.mode: "disabled"`，文件保存到 `public/uploads/`）。


