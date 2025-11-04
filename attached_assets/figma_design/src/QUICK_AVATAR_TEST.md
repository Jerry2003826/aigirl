# 头像和AI回复快速测试

## 🚀 立即测试（5分钟）

### 测试1: 头像上传 (2分钟)

1. **创建新AI**
   ```
   点击 "创建新AI女友" → 进入编辑页面
   ```

2. **上传头像**
   ```
   点击 "上传头像" → 选择图片 → 等待提示
   ```

3. **检查显示**
   ```
   ✅ 编辑页面有头像？
   ✅ 角色列表有头像？
   ✅ 提示"头像已保存"？
   ```

4. **刷新测试**
   ```
   按F5刷新 → 头像还在？
   ```

**预期：** 所有步骤都显示 ✅

### 测试2: AI回复限制 (3分钟)

1. **发布动态**
   ```
   打开动态 → 点击"+" → 输入文字 → 发布
   ```

2. **等待AI评论**
   ```
   等待10-30秒 → AI会评论
   ```

3. **观察AI互动**
   ```
   等待更长时间 → 观察AI之间的回复
   ```

4. **检查控制台**
   ```
   F12打开控制台 → 查找 "[AI互动限制]"
   ```

**预期日志：**
```
[AI互动] 小雪 回复了 瑠夏 的回复 (第1次)
[AI互动] 小雪 回复了 美咲 的回复 (第2次)
[AI互动限制] 小雪 已经回复了2次，达到上限，不再回复
```

## ⚡ 快速修复

### 头像不显示？

```javascript
// 在控制台执行
localStorage.clear();
location.reload();
// 然后重新登录
```

### AI无限回复？

```javascript
// 在控制台执行
location.reload();
// 清除缓存重新加载
```

## 📊 成功标准

### 头像功能
- ✅ 上传成功
- ✅ 立即显示
- ✅ 刷新保留
- ✅ 角色列表显示
- ✅ 聊天界面显示

### AI回复限制
- ✅ 每个AI最多回复2次
- ✅ 控制台显示限制日志
- ✅ 不会无限回复

## 🔍 调试信息

### 查看头像数据

```javascript
// 在控制台执行
const personalities = JSON.parse(localStorage.getItem('personalities') || '[]');
personalities.forEach(p => {
  console.log(p.name, ':', {
    hasAvatar: !!p.avatarUrl,
    avatarSize: p.avatarUrl?.length,
    isValid: p.avatarUrl?.startsWith('data:image/')
  });
});
```

### 查看AI回复数据

```javascript
// 在控制台执行
const moments = JSON.parse(localStorage.getItem('moments') || '[]');
moments.forEach(m => {
  console.log('动态:', m.content);
  m.comments?.forEach(c => {
    console.log('  评论:', c.content, 'by', c.authorId);
    c.replies?.forEach(r => {
      console.log('    回复:', r.content, 'by', r.authorId);
    });
  });
});
```

## ✅ 完成检查

测试完成后，确认：

- [ ] 头像可以上传
- [ ] 头像正常显示
- [ ] 头像持久保存
- [ ] AI回复有限制
- [ ] 控制台无错误

---

**如果所有项都是 ✅，那么修复成功！**
