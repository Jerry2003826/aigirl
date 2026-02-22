# L5 发布检查清单

## 发布前

- [ ] 所有 Phase 0-7 修复已合并
- [ ] `npm run check` 通过
- [ ] `npm run test` 通过
- [ ] `npm run build` 成功
- [ ] 环境变量已配置（RESEND_API_KEY, SESSION_SECRET, DATABASE_URL）
- [ ] 可选：ENCRYPTION_KEY 用于 API 密钥加密

## 灰度发布

1. 部署到 staging 环境
2. 验证：注册、登录、验证码、AI 对话、朋友圈、语音
3. 生产分批放量

## 发布后监控

- 错误率
- 消息推送成功率
- AI 响应时延

## 回滚

保留上一版本构建产物，支持快速回滚。
