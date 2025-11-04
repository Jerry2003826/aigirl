# 社交登录配置指南

## 当前状态 ✅

应用已完全实现Google和Microsoft社交登录功能，包括完整的PKCE流程和自动token交换。代码已就绪，只需在Supabase后台完成OAuth配置即可使用。

### 技术实现
- ✅ OAuth重定向配置（`redirectTo: window.location.origin`）
- ✅ PKCE授权码流程
- ✅ 自动检测回调中的`code`参数
- ✅ 调用`exchangeCodeForSession`完成token交换
- ✅ 自动清理URL参数（`?code=xxx`）
- ✅ 与`onAuthStateChange`无缝集成

## 配置步骤

### 🔵 Google登录配置

1. **创建Google OAuth凭据**
   - 访问 [Google Cloud Console](https://console.cloud.google.com)
   - 创建新项目或选择现有项目
   - 启用Google+ API
   - 转到"凭据" → "创建凭据" → "OAuth 2.0 客户端ID"
   - 应用类型选择"Web应用"
   - 授权的重定向URI添加：`https://[你的项目ID].supabase.co/auth/v1/callback`
   - 获取Client ID和Client Secret

2. **在Supabase中配置**
   - 登录 [Supabase Dashboard](https://supabase.com/dashboard)
   - 选择你的项目
   - 进入 **Authentication** > **Providers**
   - 找到并启用 **Google**
   - 填入Client ID和Client Secret
   - 保存设置

3. **测试**
   - 在应用登录页点击Google图标
   - 完成Google授权流程
   - 自动跳转回应用并登录成功

详细文档：[Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)

---

### 🟦 Microsoft登录配置

1. **在Azure Portal创建应用**
   - 访问 [Azure Portal](https://portal.azure.com)
   - 进入"Azure Active Directory" → "应用注册"
   - 点击"新注册"
   - 填写应用名称（如"AI女友聊天应用"）
   - 支持的账户类型选择"任何组织目录中的账户和个人Microsoft账户"
   - 重定向URI选择"Web"，填入：`https://[你的项目ID].supabase.co/auth/v1/callback`
   - 点击"注册"

2. **获取凭据**
   - 在应用概述页面，复制"应用程序(客户端)ID"（Client ID）
   - 进入"证书和密码" → "新客户端密码"
   - 添加描述，选择过期时间
   - 复制生成的密码值（Client Secret）
   - ⚠️ 注意：密码值只显示一次，请立即保存

3. **在Supabase中配置**
   - 登录 [Supabase Dashboard](https://supabase.com/dashboard)
   - 选择你的项目
   - 进入 **Authentication** > **Providers**
   - 找到并启用 **Azure (Microsoft)**
   - 填入Client ID（应用程序ID）
   - 填入Client Secret（客户端密码）
   - 保存设置

4. **测试**
   - 在应用登录页点击Microsoft图标
   - 完成Microsoft授权流程
   - 自动跳转回应用并登录成功

详细文档：[Supabase Azure OAuth](https://supabase.com/docs/guides/auth/social-login/auth-azure)

---

## 技术实现说明

### 前端实现（已完成）✅

**AuthModal.tsx** 中已实现：
```typescript
const handleSocialLogin = async (provider: 'google' | 'azure') => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as any,
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
      scopes: provider === 'azure' ? 'email' : undefined,
    }
  });
}
```

- Google使用`google` provider
- Microsoft使用`azure` provider（这是Supabase的标准命名）

### OAuth流程

1. 用户点击社交登录按钮
2. 前端调用`signInWithOAuth()`
3. 浏览器重定向到OAuth提供商授权页面
4. 用户授权后，重定向回应用（带有token参数）
5. `onAuthStateChange`事件监听器自动捕获登录
6. 应用加载用户数据并完成登录

### 回调处理（已完成）✅

**App.tsx** 中已实现完整的PKCE OAuth回调处理：
```typescript
// 自动检测并处理OAuth回调
const handleOAuthCallback = async () => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  
  if (!code) return;
  
  // 用授权码换取session（PKCE流程最后一步）
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  
  if (!error) {
    // 清理URL，去掉?code=...
    window.history.replaceState({}, document.title, window.location.pathname);
    // onAuthStateChange会自动收到SIGNED_IN事件
  }
};

handleOAuthCallback();

// 监听认证状态变化
supabase.auth.onAuthStateChange(async (event, session) => {
  if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
    // 自动登录并加载数据
  }
});
```

**流程说明**：
1. 用户点击Google/Microsoft登录
2. 跳转到OAuth提供商授权
3. 授权后重定向回应用，URL带有`?code=xxx`
4. `handleOAuthCallback`检测到code参数
5. 调用`exchangeCodeForSession`完成token交换
6. `onAuthStateChange`触发，完成登录
7. URL自动清理，变为干净的`http://localhost:3000/`

---

## 常见问题

### Q: 点击社交登录按钮没反应？
**A**: 检查浏览器控制台是否有错误。最常见的原因是：
- Supabase后台未启用对应provider
- Client ID/Secret配置错误
- 重定向URI配置不匹配

### Q: 授权后无法跳转回应用？
**A**: 检查：
- OAuth应用中的重定向URI是否正确（必须完全匹配）
- Supabase项目ID是否正确
- 浏览器是否阻止了弹窗/重定向

### Q: 显示"未配置"错误？
**A**: 这表示Supabase后台还没有启用该provider，请按照上述步骤完成配置。

### Q: 登录后URL显示`?code=xxx`但没有自动登录？
**A**: 这个问题已经解决！应用现在会自动检测`code`参数并完成登录。如果仍然有问题：
- 打开浏览器控制台查看是否有错误
- 确认Supabase配置正确
- 尝试清除浏览器缓存后重试

### Q: Google/Microsoft登录和邮箱登录是同一个账号吗？
**A**: 不是。即使使用相同的邮箱地址，社交登录和邮箱注册是两个独立的账号。

### Q: 可以关联社交账号和邮箱账号吗？
**A**: 目前暂不支持账号关联。建议选择一种登录方式并坚持使用。

### Q: 控制台显示"exchangeCodeForSession失败"？
**A**: 可能的原因：
- OAuth配置不正确（检查Client ID/Secret）
- 重定向URI不匹配
- Code已过期（OAuth code只能使用一次，且有时间限制）
- 网络问题导致请求失败

---

## 🧪 测试OAuth登录

配置完成后，按以下步骤测试：

### 测试步骤
1. **打开浏览器控制台**（F12 或 Cmd+Option+I）
2. **点击Google/Microsoft登录按钮**
3. **观察控制台输出**，应该看到：
   ```
   🔐 开始 google 登录...
   ✅ google 登录重定向成功
   ```
4. **完成OAuth授权**（在Google/Microsoft页面）
5. **回到应用后观察控制台**，应该看到：
   ```
   🔐 检测到OAuth回调，code: xxxxxx...
   🔄 正在用授权码换取session...
   ✅ 成功换取session: { userId: '...', email: '...' }
   ✅ OAuth登录完成，等待onAuthStateChange事件触发数据加载
   ```
6. **检查URL**，应该是干净的`http://localhost:3000/`（没有`?code=xxx`）
7. **验证登录状态**，应该能看到用户邮箱和头像

### 预期结果 ✅
- URL干净无参数
- 显示用户信息
- 可以正常聊天
- 数据同步到云端

### 失败迹象 ❌
- URL仍显示`?code=xxx`且无法登录
- 控制台显示错误信息
- 页面一直处于加载状态

如果测试失败，请检查上述"常见问题"章节。

---

## 安全提示

1. **保护密钥**：Client Secret是敏感信息，不要泄露或提交到代码仓库
2. **定期轮换**：建议定期更新Client Secret
3. **HTTPS要求**：生产环境必须使用HTTPS
4. **域名白名单**：在OAuth应用中只添加信任的重定向URI

---

## 下一步

配置完成后：
1. 清除浏览器缓存
2. 刷新应用页面
3. 点击社交登录按钮测试
4. 检查是否能正常登录并加载数据

---

**配置文档最后更新**: 2024-11-03
