# 密钥轮换指南 (L5 安全)

## Resend API Key

旧密钥已从源码中移除。若曾泄露，请立即轮换：

1. 登录 [Resend Dashboard](https://resend.com/api-keys)
2. 撤销/删除旧密钥 `re_GgJnqapL_*`
3. 创建新 API Key
4. 将新密钥写入 `config/env` 或环境变量 `RESEND_API_KEY`
5. 重启服务

## Git 历史清理

若密钥曾提交到 Git，需重写历史以彻底移除：

```bash
# 使用 gitleaks 检测泄露
gitleaks detect --source . --verbose

# 使用 BFG 或 git filter-repo 重写历史（需备份后执行）
# 详见 .gitleaks.toml 与项目文档
```

**协作注意：** 历史重写后，所有协作者需执行 `git fetch --all && git reset --hard origin/l5-full-repair` 重新同步。
