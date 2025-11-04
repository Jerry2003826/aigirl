# 多提供商API配置指南

## 🎯 新功能

现在支持使用多家AI提供商的模型，不再局限于Gemini！

### 支持的提供商

✅ **Google Gemini** (推荐，免费额度充足)
✅ **OpenAI** (GPT-4, GPT-3.5)
✅ **Anthropic** (Claude 3.5)
✅ **自定义API** (Ollama, 国产模型等)

---

## 📋 快速配置

### 1. 打开配置面板

```
点击右上角"⚙️" → 进入配置
```

### 2. 选择提供商

在"API提供商"卡片中，从下拉菜单选择：

- 🌟 Google Gemini（推荐）
- 🤖 OpenAI (GPT-4, GPT-3.5)
- 🧠 Anthropic (Claude)
- ⚙️ 自定义API

### 3. 配置API Key

根据选择的提供商，输入对应的API Key。

### 4. 选择模型

根据提供商，选择合适的模型。

### 5. 保存配置

点击"保存"按钮。

---

## 🌟 Google Gemini 配置

### 优势
- ✅ 免费额度充足
- ✅ 支持图片识别
- ✅ 支持RAG检索
- ✅ 支持联网搜索
- ✅ 无需信用卡

### 配置步骤

1. **获取API Key**
   - 访问：https://aistudio.google.com/apikey
   - 点击"Create API Key"
   - 复制API Key

2. **配置**
   ```
   提供商：Google Gemini
   API Key：AIza... (粘贴您的Key)
   模型：gemini-2.5-pro (推荐)
   ```

3. **可选模型**
   - `gemini-2.5-pro` - 最新最强（推荐）
   - `gemini-2.0-flash-exp` - 快速响应
   - `gemini-1.5-pro` - 稳定版本
   - `gemini-1.5-flash` - 轻量快速
   - `自定义模型` - 输入其他Gemini模型名

---

## 🤖 OpenAI 配置

### 优势
- ✅ GPT-4性能强大
- ✅ 生态成熟
- ✅ 支持多种模型

### 配置步骤

1. **获取API Key**
   - 访问：https://platform.openai.com/api-keys
   - 点击"Create new secret key"
   - 复制API Key（以sk-开头）

2. **配置**
   ```
   提供商：OpenAI
   API Key：sk-... (粘贴您的Key)
   模型：gpt-4-turbo (推荐)
   ```

3. **可选模型**
   - `gpt-4-turbo` - 最新GPT-4（推荐）
   - `gpt-4` - GPT-4标准版
   - `gpt-4-vision-preview` - 支持图片识别
   - `gpt-3.5-turbo` - 快速且经济
   - `自定义模型` - 输入其他OpenAI模型名

### 注意事项
- ⚠️ 需要信用卡绑定
- ⚠️ 按使用量计费
- 💰 参考价格：GPT-4约$0.03/1K tokens

---

## 🧠 Anthropic (Claude) 配置

### 优势
- ✅ Claude 3.5非常强大
- ✅ 长上下文支持
- ✅ 安全性高

### 配置步骤

1. **获取API Key**
   - 访问：https://console.anthropic.com/settings/keys
   - 点击"Create Key"
   - 复制API Key（以sk-ant-开头）

2. **配置**
   ```
   提供商：Anthropic
   API Key：sk-ant-... (粘贴您的Key)
   模型：claude-3-5-sonnet-20241022 (推荐)
   ```

3. **可选模型**
   - `claude-3-5-sonnet-20241022` - 最新版本（推荐）
   - `claude-3-opus-20240229` - 最强大
   - `claude-3-sonnet-20240229` - 平衡性能
   - `claude-3-haiku-20240307` - 快速响应
   - `自定义模型` - 输入其他Claude模型名

### 注意事项
- ⚠️ 需要申请访问权限
- ⚠️ 按使用量计费
- 💰 参考价格：Claude 3.5约$0.003-0.015/1K tokens

---

## ⚙️ 自定义API 配置

### 支持的场景
- ✅ Ollama本地模型
- ✅ 国产大模型（通义千问、文心一言、智谱等）
- ✅ 自建模型服务
- ✅ 任何兼容OpenAI格式的API

### 配置步骤

1. **配置API URL**
   ```
   提供商：自定义API
   API URL：https://api.example.com/v1/chat/completions
   ```

2. **配置API Key（可选）**
   ```
   API Key：如果API需要认证，填写Key
   ```

3. **配置模型名**
   ```
   模型名称：直接输入模型名称
   例如：llama2, qwen-plus, chatglm等
   ```

### 示例：使用Ollama本地模型

```
提供商：自定义API
API URL：http://localhost:11434/api/chat
模型名称：llama2
API Key：（留空）
```

### 示例：使用通义千问

```
提供商：自定义API
API URL：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
模型名称：qwen-plus
API Key：sk-xxx（您的通义千问API Key）
```

### 示例：使用智谱AI

```
提供商：自定义API
API URL：https://open.bigmodel.cn/api/paas/v4/chat/completions
模型名称：glm-4
API Key：xxx（您的智谱API Key）
```

---

## 🎛️ 模型参数配置

### Temperature (温度)
- **范围：** 0.0 - 2.0
- **推荐值：** 0.8
- **说明：**
  - 低温度（0.3-0.5）：回复更稳定、一致
  - 中温度（0.7-0.9）：平衡创造性和稳定性（推荐）
  - 高温度（1.0-2.0）：回复更有创意、多样

### Max Tokens (最大输出长度)
- **范围：** 100 - 4096
- **推荐值：** 2000
- **说明：**
  - 控制AI单次回复的最大字数
  - 更长的token数会消耗更多配额

### 模型支持图片识别 (Vision)
- **说明：** 勾选后，AI可以识别和理解图片内容
- **支持的模型：**
  - Gemini：所有gemini-1.5和2.x版本
  - OpenAI：gpt-4-vision-preview
  - Claude：所有claude-3.x版本

---

## 📊 提供商对比

| 提供商 | 免费额度 | 性能 | 图片识别 | 联网搜索 | RAG | 价格 |
|--------|---------|------|---------|---------|-----|------|
| **Gemini** | ✅ 充足 | ⭐⭐⭐⭐ | ✅ | ✅ | ✅ | 免费 |
| **OpenAI** | ❌ 无 | ⭐⭐⭐⭐⭐ | ✅ | ❌ | ❌ | $$$ |
| **Claude** | ❌ 无 | ⭐⭐⭐⭐⭐ | ✅ | ❌ | ❌ | $$ |
| **自定义** | 看具体API | 不定 | 看具体API | ❌ | ❌ | 不定 |

---

## 🔧 常见问题

### Q1: 如何切换提供商？

**答：** 
1. 进入配置面板
2. 在"API提供商"下拉菜单中选择新的提供商
3. 输入对应的API Key
4. 选择模型
5. 点击"保存"

### Q2: 可以同时配置多个提供商吗？

**答：** 可以！您可以预先配置多个提供商的API Key，随时切换使用。系统只会调用当前选择的提供商。

### Q3: 自定义API不工作怎么办？

**答：** 
1. 确认API URL格式正确
2. 确认API兼容OpenAI格式
3. 检查API Key是否正确
4. 查看浏览器控制台的错误信息

### Q4: Gemini的免费额度有限制吗？

**答：** 
- 每分钟：15次请求
- 每天：1500次请求
- 对于日常使用完全足够

### Q5: 哪个提供商最推荐？

**答：** 
- **预算有限/测试阶段：** Gemini（免费）
- **追求最佳性能：** GPT-4 Turbo或Claude 3.5
- **隐私/本地部署：** Ollama自建模型

---

## 🚀 最佳实践

### 1. 新手推荐配置

```
提供商：Google Gemini
模型：gemini-2.5-pro
Temperature：0.8
Max Tokens：2000
支持图片：✅
```

**原因：** 免费、强大、功能全面

### 2. 追求最佳体验

```
提供商：OpenAI
模型：gpt-4-turbo
Temperature：0.8
Max Tokens：2000
支持图片：✅
```

**原因：** 性能最强，但需付费

### 3. 隐私优先

```
提供商：自定义API
API URL：http://localhost:11434/api/chat
模型：llama2
Temperature：0.8
Max Tokens：2000
```

**原因：** 完全本地运行，数据不上传

---

## 📝 配置示例

### 配置1：Gemini免费版

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-pro",
  "geminiApiKey": "AIzaXXXXXXXX",
  "temperature": 0.8,
  "maxTokens": 2000,
  "supportsVision": true,
  "enableWebSearch": false,
  "enableRAG": false
}
```

### 配置2：OpenAI付费版

```json
{
  "provider": "openai",
  "model": "gpt-4-turbo",
  "openaiApiKey": "sk-XXXXXXXX",
  "temperature": 0.8,
  "maxTokens": 2000,
  "supportsVision": true
}
```

### 配置3：Claude高级版

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "anthropicApiKey": "sk-ant-XXXXXXXX",
  "temperature": 0.8,
  "maxTokens": 2000,
  "supportsVision": true
}
```

### 配置4：Ollama本地

```json
{
  "provider": "custom",
  "model": "llama2",
  "customApiUrl": "http://localhost:11434/api/chat",
  "customApiKey": "",
  "temperature": 0.8,
  "maxTokens": 2000,
  "supportsVision": false
}
```

---

## ✅ 配置完成检查

配置完成后，请检查：

- [ ] 选择了提供商
- [ ] 输入了正确的API Key
- [ ] 选择了模型
- [ ] 参数设置合理（Temperature 0.8, MaxTokens 2000）
- [ ] 点击了"保存"按钮
- [ ] 看到"配置已保存"提示

---

## 🎉 开始使用

配置完成后：

1. 返回聊天界面
2. 选择一个AI角色
3. 开始对话
4. 系统会自动使用您配置的提供商和模型

---

## 📞 技术支持

如果遇到问题：

1. 查看浏览器控制台（F12）的错误信息
2. 确认API Key是否有效
3. 确认网络连接正常
4. 查看本文档的"常见问题"部分

---

**更新时间：** 2025-11-04
**版本：** v3.0.0
**状态：** ✅ 已完成
