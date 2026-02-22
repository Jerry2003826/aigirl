# L5 多实例改造后续步骤

当前 WebSocket 连接、AI Reply Worker 锁、activeCalls 等存储在进程内存中，多实例部署时无法共享。

## 改造项

1. **Redis 连接映射**：将 `userConnections`、`conversationConnections` 迁移到 Redis
2. **分布式锁**：AI Reply Worker 的 `PROCESSING_LOCK` 改用 Redis SET NX
3. **Pub/Sub**：WebSocket 事件通过 Redis Pub/Sub 跨实例广播

## 依赖

- Redis 实例
- `ioredis` 或 `redis` 包

## 实施顺序

1. 引入 Redis 客户端
2. 实现 RedisConnectionStore 替代内存 Map
3. 实现 Redis 分布式锁
4. WebSocket 订阅 Redis 频道，发布事件时 publish
