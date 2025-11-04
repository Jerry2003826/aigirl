# 超时问题修复文档

## 问题描述
应用启动时出现 `loadUserDataFromCloud超时` 错误，导致数据加载失败。

## 问题原因
1. **双重超时机制冲突**：
   - App.tsx 中有一个 8 秒的外层超时限制
   - utils/data-sync.ts 中的 `loadDataFromCloud` 有一个 3 秒的内层超时限制
   - 这两个超时机制相互冲突，导致提前触发超时错误

2. **超时时间过短**：
   - 3 秒的网络请求超时对于大数据量来说太短
   - `loadUserDataFromCloud` 函数包含大量数据处理逻辑（迁移、清理、修复等），需要更多时间

## 修复方案

### 1. 移除外层超时限制 (App.tsx)
**修改位置**：App.tsx 第 556-561 行

**修改前**：
```typescript
await Promise.race([
  loadUserDataFromCloud(session.access_token),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('loadUserDataFromCloud超时')), 8000)
  )
]);
```

**修改后**：
```typescript
// ⚠️ 移除外层超时限制，让 loadUserDataFromCloud 内部的逻辑处理超时
// 这避免了双重超时机制导致的问题
await loadUserDataFromCloud(session.access_token);
```

### 2. 增加网络请求超时时间 (utils/data-sync.ts)
**修改位置**：utils/data-sync.ts 第 381-391 行

**修改前**：
```typescript
const response = await Promise.race([
  fetch(`${API_BASE_URL}/data/load`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${validToken}`
    }
  }),
  new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('请求超时')), 3000)
  )
]);
```

**修改后**：
```typescript
// 增加超时时间从 3 秒到 10 秒，避免数据量大时超时
const response = await Promise.race([
  fetch(`${API_BASE_URL}/data/load`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${validToken}`
    }
  }),
  new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('网络请求超时（10秒）')), 10000)
  )
]);
```

### 3. 增强调试日志 (App.tsx)
在 `loadUserDataFromCloud` 函数中增加详细的计时日志，帮助追踪性能瓶颈：

```typescript
const startTime = Date.now();

console.log('⏱️ [步骤1/5] 开始调用 loadDataFromCloud...');
const result = await loadDataFromCloud(token);
console.log(`⏱️ [步骤1/5] loadDataFromCloud 完成，耗时 ${Date.now() - startTime}ms`);

console.log(`⏱️ [步骤2/5] 开始数据迁移检查... (已耗时 ${Date.now() - startTime}ms)`);
// ... 数据迁移代码
console.log(`⏱️ [步骤2/5] 数据迁移完成 (已耗时 ${Date.now() - startTime}ms)`);

// ... 其他步骤类似
```

### 4. 改进错误提示
**修改前**：
```typescript
// 不显示错误提示，用户已经有默认数据可用
console.log('ℹ️ 将继续使用默认数据');
```

**修改后**：
```typescript
// 显示友好的错误提示
toast.error('数据加载失败，将使用默认数据', { duration: 3000 });
console.log('ℹ️ 将继续使用默认数据');
```

## 技术细节

### 超时机制工作原理
- `Promise.race()` 会返回第一个完成（resolve 或 reject）的 Promise
- 当设置多层超时时，最短的超时会先触发，导致整个操作失败
- 应该只在最底层（网络请求层）设置超时，上层让其自然完成

### 性能优化
1. **快速模式**：首次加载时使用 `fastMode=true` 跳过 token 验证，减少延迟
2. **分步日志**：详细记录每个步骤的耗时，便于定位性能瓶颈
3. **合理超时**：10 秒的超时时间足够处理大部分正常情况

## 预期效果
1. ✅ 数据加载不再超时
2. ✅ 大数据量加载正常工作
3. ✅ 保持合理的超时保护（10秒）
4. ✅ 更好的错误提示和调试信息
5. ✅ 更准确的性能追踪

## 测试建议
1. 测试正常登录流程
2. 测试大数据量加载（多个AI角色、大量聊天记录）
3. 测试网络慢的情况
4. 测试网络断开的情况
5. 检查控制台日志，确认各步骤耗时

## 相关文件
- `/App.tsx` - 主应用文件，处理数据加载逻辑
- `/utils/data-sync.ts` - 数据同步工具，处理云端通信
