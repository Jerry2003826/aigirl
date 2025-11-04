# Token 刷新和 401 错误修复 (第二版)

## 问题描述

用户报告在使用应用时遇到 401 Unauthorized 错误：

```
GET https://ejapnhrboikvafvmdeer.supabase.co/functions/v1/make-server-4fd5d246/data/load 401 (Unauthorized)
📦 Response JSON: {code: 401, message: 'Invalid JWT'}
❌ 加载数据失败: {status: 401, ...}
⚠️ 后台同步失败，将在下次重试: 加载失败 (HTTP 401)
```

## 根本原因分析

1. **RealtimeSyncManager 使用过期的 token**
   - `RealtimeSyncManager` 在初始化时保存了 `accessToken`
   - 当 token 过期后，后台同步仍然使用这个过期的 token
   - 导致 401 Unauthorized 错误

2. **Token 刷新策略不够积极**
   - 原来只在 token 将在 5 分钟内过期时才刷新
   - 但有些 token 可能在更短时间内过期
   - 需要更积极的刷新策略

3. **错误格式不一致**
   - 服务器返回的错误格式：`{error: '...', details: '...'}`
   - Supabase 返回的错误格式：`{code: 401, message: '...'}`
   - 前端只处理了第一种格式

## 修复方案

### 1. 改进 RealtimeSyncManager 的 token 管理

**文件**: `/utils/realtime-sync.ts`

#### 修改 1: performSync 方法自动获取最新 token

在每次同步前，从 Supabase 获取最新的 session 和 token：

```typescript
private async performSync(source: 'realtime' | 'polling' | 'manual') {
  // ... 防重复检查 ...
  
  // 🔑 在每次同步前，获取最新的 access token
  let currentAccessToken = this.accessToken;
  
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (!sessionError && session?.access_token) {
      currentAccessToken = session.access_token;
      
      // 如果 token 已更新，也更新保存的 token
      if (currentAccessToken !== this.accessToken) {
        console.log('🔑 Token 已更新，使用最新的 token 进行同步');
        this.accessToken = currentAccessToken;
      }
    }
  } catch (sessionException) {
    console.warn('⚠️ 获取 session 时发生异常:', sessionException.message);
  }
  
  const result = await loadDataFromCloud(currentAccessToken);
  
  // 检查是否是认证错误
  const isAuthError = result.error && 
    (result.error.includes('401') || 
     result.error.includes('Unauthorized') || 
     result.error.includes('Invalid JWT') ||
     result.error.includes('登录已过期'));
  
  if (isAuthError) {
    console.error('🔐 Token 认证失败，需要重新登录:', result.error);
    // 停止后台同步，避免重复的 401 错误
    if (source !== 'manual') {
      console.log('⏹️ 停止后台同步，等待用户重新登录');
      this.stop();
    }
  }
}
```

#### 修改 2: 添加 updateAccessToken 方法

允许外部更新保存的 token：

```typescript
updateAccessToken(newToken: string) {
  if (newToken && newToken !== this.accessToken) {
    console.log('🔑 更新 RealtimeSyncManager 的 access token');
    this.accessToken = newToken;
  }
}
```

### 2. 改进 token 刷新策略

**文件**: `/utils/data-sync.ts`

#### 修改 1: 更积极的刷新策略

将刷新时间从 5 分钟改为 10 分钟：

```typescript
// 🔑 修改策略：如果 token 已过期或即将过期（10分钟内），立即刷新
const needsRefresh = expiresAt > 0 && expiresAt < now + 600; // 10分钟内过期

if (needsRefresh) {
  const isExpired = expiresAt <= now;
  console.log(`🔄 Token${isExpired ? '已过期' : '即将过期（10分钟内）'}，刷新中...`);
  
  // ... 刷新逻辑 ...
  
  // 如果 token 已经过期且刷新失败，不能继续使用
  if (isExpired) {
    console.error('❌ Token已过期且刷新失败，无法继续');
    return null;
  }
}
```

#### 修改 2: 移除快速模式

移除 `fastMode` 参数，总是检查和刷新 token：

```typescript
// 之前：
const validToken = await getValidAccessToken(accessToken, true);

// 现在：
const validToken = await getValidAccessToken(accessToken);
```

### 3. 统一错误格式处理

**文件**: `/utils/data-sync.ts`

支持两种错误响应格式：

```typescript
if (!response.ok) {
  // 支持两种错误格式：
  // 1. {error: '...', details: '...'}  (我们的服务器格式)
  // 2. {code: 401, message: '...'}     (Supabase格式)
  const errorMessage = result.error || result.message || result.details || '加载失败';
  
  console.error('❌ 加载数据失败:', {
    status: response.status,
    error: result.error,
    message: result.message,
    code: result.code,
    details: result.details
  });
  
  return { success: false, error: `${errorMessage} (HTTP ${response.status})` };
}
```

### 4. 同步 App.tsx 中的 token 更新

**文件**: `/App.tsx`

当 `accessToken` 更新时，同步更新 `RealtimeSyncManager`：

```typescript
// 🔑 当 accessToken 更新时，同步更新 RealtimeSyncManager 中的 token
useEffect(() => {
  if (realtimeSync && accessToken && isAuthenticated) {
    realtimeSync.updateAccessToken(accessToken);
  }
}, [accessToken, realtimeSync, isAuthenticated]);
```

## 测试步骤

1. **测试正常登录和数据同步**
   - 登录应用
   - 等待数据加载完成
   - 验证没有 401 错误

2. **测试 token 自动刷新**
   - 登录并等待一段时间
   - 观察控制台日志，确认 token 在即将过期时自动刷新
   - 验证刷新后同步继续正常工作

3. **测试 token 过期后的行为**
   - 模拟 token 过期（可以修改 token 验证逻辑）
   - 验证应用能够检测到 token 过期
   - 验证后台同步会停止，避免重复 401 错误

4. **测试长时间运行**
   - 保持应用打开数小时
   - 验证后台同步持续正常工作
   - 验证没有积累的 401 错误

## 预期效果

1. ✅ Token 在即将过期时自动刷新（10分钟阈值）
2. ✅ 后台同步使用最新的有效 token
3. ✅ 当 token 过期时，停止后台同步避免重复错误
4. ✅ 支持多种错误响应格式
5. ✅ 用户体验流畅，无需手动重新登录（除非 refresh token 过期）

## 相关文件

- `/utils/realtime-sync.ts` - 实时同步管理器
- `/utils/data-sync.ts` - 数据同步和 token 管理
- `/App.tsx` - 主应用组件
- `/supabase/functions/server/index.tsx` - 服务器端验证

## 技术细节

### Token 生命周期

1. **初始登录**: 获取 access_token 和 refresh_token
2. **Token 使用**: 每次请求携带 access_token
3. **Token 刷新**: 
   - 条件：token 将在 10 分钟内过期
   - 方法：调用 `supabase.auth.refreshSession()`
   - 结果：获得新的 access_token 和 refresh_token
4. **Token 过期**: 如果 refresh_token 也过期，用户需要重新登录

### 多层防护

1. **应用层**: `getValidAccessToken` 主动检查和刷新
2. **同步层**: `performSync` 每次同步前获取最新 token
3. **React层**: 监听 `accessToken` 变化，更新 `RealtimeSyncManager`
4. **错误处理**: 检测 401 错误，停止后台同步

## 修复日期

2025-01-03
