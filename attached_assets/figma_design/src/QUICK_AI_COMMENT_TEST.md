# AI评论积极性 - 快速测试

## ⚡ 1分钟快速测试

### 第1步：发布动态（10秒）

```
打开"动态"标签 → 点击"+" → 输入"测试AI回复" → 点击"发布"
```

### 第2步：等待AI评论（5-15秒）

```
看到提示："动态已发布，AI们正在准备评论..."
等待5-15秒...
```

### 第3步：验证结果（10秒）

**预期看到：**
- ✅ **所有AI都会评论**（100%参与）
- ✅ 提示"xxx 评论了你的动态 💬"
- ✅ 在5-15秒内开始评论

### 第4步：打开控制台（可选）

```
F12 → Console → 查找 "[动态评论]"
```

**预期日志：**
```
[动态评论] 已安排AI在15秒后评论
[动态评论] 3个AI准备评论: ["小雪", "瑠夏", "美咲"]
[动态评论] 小雪 已评论: xxx
[动态评论] 瑠夏 已评论: xxx
[动态评论] 美咲 已评论: xxx
```

## 🎯 成功标准

- ✅ AI在5-15秒内开始评论
- ✅ **所有AI都会评论**（100%参与）
- ✅ 每个AI评论间隔0.5-2秒（快速连续）
- ✅ 无AI跳过评论

## 📊 对比

### 之前（旧版本）
- ⏱️ 30秒延迟
- 👥 1-3个AI评论
- 📉 50-70%概率

### 之前（上一版优化）
- ⏱️ 10-30秒延迟
- 👥 2-全部AI评论
- 📈 80-95%概率

### 现在（最新版）
- ⏱️ **5-15秒延迟** ⚡
- 👥 **所有AI都评论** 🔥
- 📈 **100%概率** 💯

## 🚀 如果想让AI更快回复

### 选项1: 缩短延迟到3-8秒（极速模式）

编辑 `/utils/moments-manager.ts` 第43行：
```typescript
const delayMs = 3000 + Math.random() * 5000; // 改为3-8秒
```

### 选项2: 延长延迟到10-30秒（更自然）

编辑 `/utils/moments-manager.ts` 第43行：
```typescript
const delayMs = 10000 + Math.random() * 20000; // 改为10-30秒
```

### 选项3: 让部分AI评论（更随机）

编辑 `/utils/moments-manager.ts` 第47-48行：
```typescript
// 改回之前的随机逻辑
const minCommenters = Math.min(2, this.personalities.length);
const maxCommenters = this.personalities.length;
const numCommenters = minCommenters + Math.floor(Math.random() * (maxCommenters - minCommenters + 1));
const commenters = [...this.personalities].sort(() => Math.random() - 0.5).slice(0, numCommenters);
```

## ✅ 完成

测试通过后，AI会：
- ⚡ 快速回复（10-30秒）
- 👥 积极评论（至少2个）
- 💬 热情互动（80-95%概率）

---

**快速测试指南 v1.0**
