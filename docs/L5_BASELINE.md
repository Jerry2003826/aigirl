# L5 修复基线报告

**分支:** l5-full-repair  
**基线时间:** 2025-02-23  
**基于:** main

## 检查结果

| 检查项 | 状态 | 备注 |
|--------|------|------|
| `npm run check` (tsc) | 失败 | 21 个 TS 错误（含 broadcastMomentEvent 参数错误） |
| `npm run build` | 通过 | Vite + esbuild 构建成功 |
| 关键缺陷 | 已识别 | aiService broadcast 参数、routes 分割逻辑、emailService 硬编码密钥 |

## 必须先修故障点

1. `server/aiService.ts:1806,2085` - broadcastMomentEvent 参数错误
2. `server/routes.ts` - AI 回复按 `/` 分割破坏 URL
3. `server/emailService.ts:5` - 硬编码 Resend API 密钥
