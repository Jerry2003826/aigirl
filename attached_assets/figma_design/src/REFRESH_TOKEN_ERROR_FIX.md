# Refresh Token 错误修复指南

## 错误信息
```
POST https://ejapnhrboikvafvmdeer.supabase.co/auth/v1/token?grant_type=refresh_token 400 (Bad Request)
```

## 错误原因

这个错误通常由以下原因引起：

1. **Refresh Token 过期**
   - Supabase的refresh token有效期默认为7天
   - 如果超过7天未登录，token会失效

2. **Token 被撤销**
   - 用户在其他设备登出
   - 管理员撤销了token
   - 数据库中的token记录被清除

3. **网络问题**
   - 临时网络中断
   - Supabase服务暂时不可用

4. **配置问题**
   - Supabase项目配置错误
   - OAuth提供商配置问题

## 快速解决方案

### 方案1：重新登录（推荐）

最简单的方法就是退出后重新登录：

1. 清除浏览器存储：
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```

2. 刷新页面

3. 使用Google或Microsoft重新登录

### 方案2：自动刷新处理

应用已经内置了token刷新机制，但如果失败会自动要求重新登录。

### 方案3：检查Supabase配置

1. 访问Supabase控制台
2. 检查Authentication设置
3. 确认OAuth提供商配置正确
4. 检查JWT设置

## 预防措施

### 1. 定期使用应用
- Refresh token会在每次使用时更新
- 建议至少每周登录一次

### 2. 不要手动清除存储
- 避免随意清除localStorage
- 使用应用内的退出功能

### 3. 多设备登录
- 在一个设备登出会使其他设备的token失效
- 建议使用单一设备或及时重新登录

## 代码中的处理

应用已在以下位置处理token刷新：

### utils/supabase/client.ts
```typescript
// Supabase会自动刷新token
// 如果刷新失败，会触发SIGNED_OUT事件
```

### App.tsx
```typescript
// 监听认证状态变化
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    // 处理状态变化
  }
});
```

## 调试步骤

1. **打开浏览器控制台**
   - 查看完整的错误信息
   - 检查网络请求详情

2. **检查存储状态**
   ```javascript
   // 在控制台执行
   console.log('Access Token:', localStorage.getItem('supabase.auth.token'));
   ```

3. **查看认证状态**
   ```javascript
   // 在控制台执行
   const { data, error } = await supabase.auth.getSession();
   console.log('Session:', data);
   console.log('Error:', error);
   ```

4. **强制刷新Token**
   ```javascript
   // 在控制台执行
   const { data, error } = await supabase.auth.refreshSession();
   console.log('Refresh result:', data, error);
   ```

## 长期解决方案

### 增强Token管理

可以在代码中添加更主动的token刷新：

```typescript
// 在App.tsx中添加
useEffect(() => {
  // 每30分钟检查一次token
  const interval = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Token有效期通常是1小时
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000 / 60;
      
      // 如果还有不到10分钟就过期，主动刷新
      if (minutesUntilExpiry < 10) {
        await supabase.auth.refreshSession();
      }
    }
  }, 30 * 60 * 1000); // 30分钟
  
  return () => clearInterval(interval);
}, []);
```

### 优雅降级

添加更好的错误提示：

```typescript
// 在认证错误时显示友好提示
if (error?.message?.includes('refresh_token')) {
  toast.error('登录已过期，请重新登录', {
    duration: 5000,
    action: {
      label: '重新登录',
      onClick: () => {
        localStorage.clear();
        window.location.reload();
      }
    }
  });
}
```

## 常见问题

### Q: 为什么每次打开应用都要登录？
A: 可能是浏览器设置清除了cookie/storage，或者使用了隐私模式。

### Q: Token多久会过期？
A: 
- Access Token: 1小时
- Refresh Token: 7天（可在Supabase配置）

### Q: 可以延长token有效期吗？
A: 可以在Supabase控制台的Authentication → Settings中调整。

### Q: 多设备登录会有问题吗？
A: 不会，但在一个设备登出会使其他设备的token失效。

## 总结

对于当前遇到的错误：

1. **立即解决**：清除浏览器存储并重新登录
2. **预防**：定期使用应用，避免超过7天不登录
3. **监控**：注意控制台的认证相关错误

如果问题持续存在，请检查：
- 网络连接
- Supabase服务状态
- OAuth提供商配置
- 浏览器设置（cookie/storage策略）
