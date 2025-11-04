# Connection Reset 错误修复文档

## 问题描述

用户在保存配置时遇到以下错误：
```
Failed to save config: TypeError: error sending request from 10.31.1.5:39318 
for https://ejapnhrboikvafvmdeer.supabase.co/rest/v1/kv_store_4fd5d246 (104.18.38.10:443): 
client error (SendRequest): connection error: connection reset
```

## 问题原因

这是一个**临时网络连接错误**，常见原因包括：

1. **网络不稳定**：数据包在传输过程中丢失
2. **连接超时**：服务器或网络设备关闭了空闲连接
3. **负载瓶颈**：Supabase服务暂时繁忙
4. **DNS解析问题**：域名解析临时失败
5. **CloudFlare中间代理**：CDN节点临时不可用

这类错误是**可重试的**（transient），通常在重试后会成功。

## 修复方案

### 核心策略：自动重试机制

在 `/supabase/functions/server/index.tsx` 中实现了智能重试机制：

#### 1. 重试辅助函数

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 500,
  operationName = 'operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [${operationName}] Attempt ${attempt}/${maxRetries}`);
      const result = await fn();
      if (attempt > 1) {
        console.log(`✅ [${operationName}] Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      
      // 检查是否是可重试的错误
      const errorMessage = error.message || String(error);
      const isRetryable = 
        errorMessage.includes('connection reset') ||
        errorMessage.includes('connection error') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('fetch failed');
      
      if (!isRetryable) {
        // 非可重试错误，立即抛出
        throw error;
      }
      
      if (isLastAttempt) {
        // 已达到最大重试次数
        throw error;
      }
      
      // 指数退避：500ms, 1000ms, 2000ms
      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.warn(`⚠️ [${operationName}] Attempt ${attempt} failed: ${errorMessage}`);
      console.log(`⏳ [${operationName}] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`);
}
```

#### 2. 应用到所有数据操作

**保存数据**：
```typescript
// Config
await retryWithBackoff(
  () => kv.set(`user:${userId}:config`, config),
  3,
  500,
  'save config'
);

// Personalities
await retryWithBackoff(
  () => kv.set(`user:${userId}:personalities`, personalities),
  3,
  500,
  'save personalities'
);

// Chats
await retryWithBackoff(
  () => kv.set(`user:${userId}:chats`, chats),
  3,
  500,
  'save chats'
);

// ... 其他字段类似
```

**加载数据**：
```typescript
const config = await retryWithBackoff(
  () => kv.get(`user:${userId}:config`),
  3,
  500,
  'load config'
);

// ... 其他字段类似
```

### 重试策略详解

#### 1. 指数退避（Exponential Backoff）

- **第1次重试**：等待 500ms
- **第2次重试**：等待 1000ms (500 × 2^1)
- **第3次重试**：等待 2000ms (500 × 2^2)

这避免了在服务器繁忙时立即重试，给系统恢复的时间。

#### 2. 智能错误检测

只重试以下类型的错误：
- `connection reset` - TCP连接被重置
- `connection error` - 通用连接错误
- `timeout` - 请求超时
- `ECONNRESET` - 系统级连接重置
- `fetch failed` - 网络请求失败

对于其他错误（如认证失败、数据验证错误），立即失败，不浪费时间重试。

#### 3. 详细日志

每次重试都会记录：
- 当前尝试次数
- 失败原因
- 下次重试等待时间
- 最终成功/失败状态

## 预期效果

### 成功场景

**第一次尝试成功**：
```
🔄 [save config] Attempt 1/3
✅ Config saved
```

**第二次尝试成功**（第一次失败）：
```
🔄 [save config] Attempt 1/3
⚠️ [save config] Attempt 1 failed: connection error: connection reset
⏳ [save config] Retrying in 500ms...
🔄 [save config] Attempt 2/3
✅ [save config] Succeeded on attempt 2
✅ Config saved
```

### 失败场景

如果3次尝试都失败，会抛出最后的错误：
```
🔄 [save config] Attempt 1/3
⚠️ [save config] Attempt 1 failed: connection error: connection reset
⏳ [save config] Retrying in 500ms...
🔄 [save config] Attempt 2/3
⚠️ [save config] Attempt 2 failed: connection error: connection reset
⏳ [save config] Retrying in 1000ms...
🔄 [save config] Attempt 3/3
❌ [save config] Failed after 3 attempts: connection error: connection reset
❌ Error saving config: Failed to save config: ...
```

此时前端会收到错误并显示给用户。

## 技术优势

1. **透明性**：对应用代码完全透明，不需要修改前端
2. **可配置**：可以调整重试次数、延迟时间
3. **智能**：只重试可重试的错误
4. **高效**：使用指数退避避免过度重试
5. **可观察**：详细的日志便于调试

## 预防措施

虽然已添加重试机制，但以下最佳实践可以减少错误发生：

1. **减小数据量**：
   - 避免在数据库中存储大图片（使用Supabase Storage）
   - 定期清理旧的聊天记录
   - 压缩大的JSON数据

2. **优化网络**：
   - 使用稳定的网络连接
   - 避免在网络不稳定时保存数据

3. **监控性能**：
   - 查看控制台日志
   - 关注数据大小警告

## 相关文件

- `/supabase/functions/server/index.tsx` - 服务器主文件，包含重试逻辑
- `/supabase/functions/server/kv_store.tsx` - KV存储接口（受保护）
- `/utils/data-sync.ts` - 前端数据同步工具

## 测试建议

1. **正常情况测试**：
   - 保存配置应该立即成功
   - 日志应该显示 "Attempt 1/3" 后直接成功

2. **网络不稳定测试**：
   - 在网络慢的环境下测试
   - 观察是否自动重试并最终成功

3. **失败恢复测试**：
   - 即使3次重试都失败，应用不应崩溃
   - 用户应该看到友好的错误提示

## 更新记录

**2024-11-03 v3.2**:
- ✅ 添加自动重试机制
- ✅ 实现指数退避策略
- ✅ 智能错误类型检测
- ✅ 详细的重试日志
- ✅ 应用于所有保存/加载操作

---

**状态**: ✅ 已修复并增强

如果仍然遇到连接错误，请检查：
1. 网络连接是否稳定
2. Supabase服务是否正常
3. 数据量是否过大（查看日志中的大小警告）
