# Token 错误修复测试指南

## 立即测试

### 方法1：清除并刷新（最快）

1. **打开浏览器控制台** (F12)

2. **执行清除命令：**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```

3. **刷新页面** (F5 或 Ctrl+R)

4. **观察结果：**
   - ✅ 应该看到登录界面
   - ✅ 无任何错误提示
   - ✅ 控制台无红色错误

### 方法2：重新登录

1. **点击登出按钮**（如果能看到）

2. **重新登录**
   - 使用Google或Microsoft登录
   - 观察控制台日志

3. **检查功能：**
   - ✅ 数据正常加载
   - ✅ 实时同步正常
   - ✅ 所有功能可用

## 验证修复

### 1. 检查自动健康检查

**操作：**
1. 登录成功后
2. 打开控制台
3. 等待5分钟

**预期日志：**
```
🔍 检查认证健康状态...
✅ 认证健康，token还有55.2分钟过期
```

### 2. 测试Token即将过期

**操作：**
1. 登录后正常使用
2. 等待50分钟左右
3. 观察控制台

**预期日志：**
```
⏰ Token即将过期，提前刷新... 还剩8.5分钟
🔄 Token已刷新
✅ Token已提前刷新
```

### 3. 测试Token完全失效

**操作：**
1. 在控制台执行：
   ```javascript
   // 手动设置一个无效的token
   localStorage.setItem('supabase.auth.token', JSON.stringify({
     access_token: 'invalid',
     refresh_token: 'invalid'
   }));
   ```

2. 刷新页面

**预期结果：**
- ✅ 自动检测无效token
- ✅ 清除存储
- ✅ 显示登录界面
- ✅ 无错误弹窗

### 4. 测试登出功能

**操作：**
1. 登录后
2. 点击登出
3. 检查存储

**预期结果：**
- ✅ localStorage已清空
- ✅ 显示登录界面
- ✅ 提示"已退出登录"

**验证清空：**
```javascript
// 在控制台执行
console.log('localStorage keys:', Object.keys(localStorage));
// 应该没有 supabase.auth 相关的key
```

## 控制台命令

### 检查当前认证状态
```javascript
const checkAuth = async () => {
  const { data, error } = await supabase.auth.getSession();
  console.log('Session:', data);
  console.log('Error:', error);
};
checkAuth();
```

### 查看Token过期时间
```javascript
const checkExpiry = async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.expires_at) {
    const expiresAt = new Date(data.session.expires_at * 1000);
    const now = new Date();
    const minutes = (expiresAt - now) / 1000 / 60;
    console.log(`Token还有 ${minutes.toFixed(1)} 分钟过期`);
    console.log(`过期时间: ${expiresAt.toLocaleString()}`);
  }
};
checkExpiry();
```

### 手动刷新Token
```javascript
const refreshToken = async () => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    console.error('刷新失败:', error);
  } else {
    console.log('刷新成功:', data);
  }
};
refreshToken();
```

### 清除认证数据
```javascript
const clearAuth = () => {
  localStorage.clear();
  sessionStorage.clear();
  console.log('已清除所有数据，请刷新页面');
};
clearAuth();
```

## 错误场景测试

### 场景1：首次启动，无Token
**结果：** ✅ 直接显示登录界面

### 场景2：有效Token
**结果：** ✅ 自动登录，加载数据

### 场景3：Token即将过期
**结果：** ✅ 自动刷新，用户无感知

### 场景4：Refresh Token失效
**结果：** ✅ 提示重新登录，清除数据

### 场景5：网络错误
**结果：** ✅ 显示错误提示，不影响使用

## 成功标准

### 必须满足
- ✅ 无 400 Bad Request 错误
- ✅ 无控制台红色错误
- ✅ 登录/登出正常
- ✅ 数据加载正常

### 应该满足
- ✅ Token自动刷新
- ✅ 健康检查正常
- ✅ 友好的错误提示
- ✅ 清晰的日志输出

### 可选满足
- ⭐ 5分钟内自动刷新
- ⭐ 离线状态提示
- ⭐ 多设备同步

## 常见日志

### ✅ 正常日志
```
✅ Supabase客户端已初始化
🔔 Auth状态变化: INITIAL_SESSION
✅ 用户已登录
📥 开始加载用户数据...
✅ 用户数据加载成功
🔍 检查认证健康状态...
✅ 认证健康，token还有XX分钟过期
```

### ⚠️ 警告日志（正常）
```
⚠️ localStorage响应缓慢，判定为不可用
⚠️ Token即将过期，提前刷新...
ℹ️ Token刷新但值未变化，跳过状态更新
```

### ❌ 错误日志（需要处理）
```
❌ Token刷新失败: invalid_grant
❌ 获取session失败: refresh_token_expired
🚨 检测到 Refresh Token 错误
```

## 如果仍有问题

### 步骤1：完全清除
```javascript
// 在控制台执行
localStorage.clear();
sessionStorage.clear();
// 清除所有cookie
document.cookie.split(";").forEach(function(c) { 
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
});
```

### 步骤2：硬刷新
- Windows: Ctrl + Shift + R
- Mac: Cmd + Shift + R

### 步骤3：重启浏览器
- 完全关闭浏览器
- 重新打开

### 步骤4：检查网络
```javascript
// 测试Supabase连接
fetch('https://ejapnhrboikvafvmdeer.supabase.co/rest/v1/')
  .then(r => console.log('连接正常:', r.status))
  .catch(e => console.error('连接失败:', e));
```

## 报告问题

如果问题持续，请提供：

1. **控制台完整日志**
   ```
   右键控制台 → Save as...
   ```

2. **操作步骤**
   ```
   1. 打开应用
   2. 执行了XX操作
   3. 出现XX错误
   ```

3. **环境信息**
   ```javascript
   console.log({
     browser: navigator.userAgent,
     localStorage: !!localStorage,
     sessionStorage: !!sessionStorage
   });
   ```

4. **网络状态**
   ```
   F12 → Network → 截图所有请求
   ```

## 快速参考

### 清除一切重新开始
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload();
```

### 检查认证状态
```javascript
supabase.auth.getSession().then(({data}) => console.log(data));
```

### 手动登出
```javascript
supabase.auth.signOut().then(() => location.reload());
```

---

**测试完成后：**
- 所有功能正常 ✅
- 无错误提示 ✅
- 日志正常 ✅
- 可以正常使用 ✅
