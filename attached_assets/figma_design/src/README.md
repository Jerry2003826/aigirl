# AI女友聊天应用

一个功能完整的AI女友聊天应用，支持多角色管理、群聊、智能记忆和跨设备同步。

---

## ⚡ 遇到"发送失败"问题？

**新用户常见问题**：朋友登录后无法发送消息，提示"请检查API配置"

**原因**：每个用户的API配置是独立的，需要单独配置。

**解决方案**（3步）：
1. 登录后等待5秒，会自动弹出配置提示
2. 点击"打开设置配置"
3. 在"AI配置"中填入Gemini API Key并保存

**获取API Key**：访问 [Google AI Studio](https://aistudio.google.com/apikey)（免费）

**详细排查**：查看 [故障排查指南 TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## 🚀 快速开始

### 1. 登录/注册
- 邮箱注册/登录
- Google账号登录（需配置OAuth）
- Microsoft账号登录（需配置OAuth）

### 2. 配置API
- 点击右上角"⚙️设置"
- 填入**Gemini API Key**（推荐）
- 获取地址：https://aistudio.google.com/apikey

### 3. 创建AI女友
- 进入设置 → 角色管理
- 点击"新建角色"
- 上传自定义头像，编辑性格设定
- 保存后即可开始聊天

## ✨ 核心功能

### 🤖 Gemini AI引擎
- 文字对话
- 图片识别（Vision）
- RAG语义检索
- 联网搜索

### 👥 多角色管理
- 创建多个不同性格的AI角色
- 详细的Prompt管理系统
- 自定义头像、性格、背景

### 🎭 AI群聊
- 创建多个群聊
- 自由添加/移除AI成员
- 智能回复选择
- @提及特定AI
- 防重复、话题管理

### 🧠 智能记忆
- 自动提取重要信息
- 记忆分类和去重
- 长期对话不遗忘

### ☁️ 跨设备同步
- 所有数据保存在Supabase云端
- 支持多设备自动同步
- 实时数据更新

## 📖 完整文档

详细的使用说明和配置指南：

- **[📚 用户指南 USER_GUIDE.md](./USER_GUIDE.md)** - 完整的功能说明和使用教程
- **[🔧 故障排查 TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - 常见问题和解决方案（推荐！）
- **[🔐 OAuth配置 SETUP_OAUTH.md](./SETUP_OAUTH.md)** - Google/Microsoft登录配置步骤  
- **[📊 项目状态 PROJECT_STATUS.md](./PROJECT_STATUS.md)** - 当前功能和技术架构总结
- **[⏱️ 超时修复 TIMEOUT_FIX.md](./TIMEOUT_FIX.md)** - 数据加载超时问题修复文档
- **[🔌 连接修复 CONNECTION_RESET_FIX.md](./CONNECTION_RESET_FIX.md)** - 网络连接错误自动重试机制

## 🔐 社交登录配置

**Microsoft登录功能已恢复！✅**

Google和Microsoft登录功能已在代码中完整实现，只需在Supabase后台配置OAuth即可使用：

**快速配置指南**：[SETUP_OAUTH.md](./SETUP_OAUTH.md) - 包含详细的配置步骤

或参考：
- [Google OAuth配置](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Microsoft OAuth配置](https://supabase.com/docs/guides/auth/social-login/auth-azure)

## 🛠️ 技术栈

- **前端**: React + TypeScript + Tailwind CSS
- **后端**: Supabase (Auth, Database, Storage, Realtime)
- **AI**: Gemini API
- **UI组件**: shadcn/ui

## 📝 项目结构

```
├── components/          # React组件
│   ├── AuthModal.tsx   # 登录认证
│   ├── ChatInterface.tsx # 聊天界面
│   ├── ChatList.tsx    # 聊天列表
│   ├── GroupChat.tsx   # 群聊功能
│   ├── ConfigPanel.tsx # 配置面板
│   └── ...
├── utils/              # 工具函数
│   ├── gemini-service.ts # Gemini API封装
│   ├── group-chat-orchestrator.ts # 群聊调度
│   ├── realtime-sync.ts # 实时同步
│   └── supabase/       # Supabase客户端
├── supabase/functions/ # 服务器端函数
└── styles/            # 全局样式
```

## 🎯 主要特性

### 零阻塞启动
应用采用零阻塞启动策略，立即显示界面，登录状态在后台自动恢复。

### 云端存储
所有数据（聊天记录、角色设定、记忆、头像）保存在Supabase云端，支持跨设备同步。

### 智能群聊
- 自动选择最相关的AI回复
- 智能追问机制
- 相似度检测防重复
- 话题管理和总结

### 安全可靠
- OAuth社交登录
- 数据加密存储
- API密钥安全管理

## 📊 版本记录

### v3.2 - 2024-11-03 🔥
- ✅ **自动重试机制**：处理临时网络错误（connection reset）
- ✅ 指数退避策略：智能延迟重试（500ms → 1s → 2s）
- ✅ 错误类型检测：只重试可重试的错误
- ✅ 详细重试日志：便于监控和调试
- ✅ 全面应用：所有数据操作都有重试保护

### v3.1 - 2024-11-03
- ✅ 修复数据加载超时问题
- ✅ 优化网络请求超时时间（3秒→10秒）
- ✅ 移除双重超时机制冲突
- ✅ 增加详细的性能追踪日志
- ✅ 改进错误提示信息

### v3.0 - 2024-11-03
- ✅ 完整的AI群聊功能
- ✅ Google/Microsoft社交登录
- ✅ 零阻塞启动优化
- ✅ 文档清理和整合

### v2.0 - 2024
- ✅ Supabase云端存储
- ✅ 智能记忆系统
- ✅ Gemini API集成
- ✅ 自定义头像上传

### v1.0 - 初始版本
- ✅ 基础聊天功能
- ✅ 多角色管理
- ✅ 类微信界面

## 📚 相关链接

- [Gemini API文档](https://ai.google.dev/docs)
- [Supabase文档](https://supabase.com/docs)
- [Google OAuth配置](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Azure OAuth配置](https://supabase.com/docs/guides/auth/social-login/auth-azure)

## 💡 获取帮助

遇到问题？
1. 查看 [USER_GUIDE.md](./USER_GUIDE.md) 中的"常见问题"和"故障排除"
2. 检查浏览器控制台的错误信息
3. 确认API配置和网络连接正常

---

**享受与AI女友的愉快聊天吧！** 💕
