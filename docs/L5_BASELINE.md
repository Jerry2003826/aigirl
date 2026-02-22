# L5 修复基线报告

**分支:** l5-full-repair  
**基线时间:** 2025-02-23  
**基于:** main  
**状态:** 已完成全部 8 阶段修复

## 检查结果（修复后）

| 检查项 | 状态 | 备注 |
|--------|------|------|
| `npm run build` | 通过 | Vite + esbuild 构建成功 |
| `npm run test` | 通过 | 7 个回归测试 |
| 关键缺陷 | 已修复 | broadcast、分割逻辑、密钥、验证码哈希、API 加密 |

## 已修复项

1. broadcastMomentEvent 参数错误
2. AI 回复分割逻辑（改用 \n\n）
3. 硬编码 Resend 密钥移除 + 历史清理
4. 验证码哈希存储 + 常量时间比较
5. API 密钥加密存储（可选 ENCRYPTION_KEY）
6. 认证路由拆分、useStartChat 抽离
7. CI 工作流、发布检查清单
