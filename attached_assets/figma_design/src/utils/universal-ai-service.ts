// 通用AI服务 - 支持多家API提供商
import { AIConfig, Message } from '../App';
import { generateText as geminiGenerateText } from './gemini-service';
import { getActualModel } from './get-actual-model';

export interface UniversalMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
}

/**
 * 通用AI文本生成函数
 * 根据config.provider自动路由到对应的API
 */
export async function universalGenerateText(
  messages: UniversalMessage[],
  config: AIConfig,
  systemPrompt?: string
): Promise<string> {
  const { provider } = config;

  console.log(`🤖 [UniversalAI] 使用提供商: ${provider}`);

  switch (provider) {
    case 'gemini':
      return await callGeminiAPI(messages, config, systemPrompt);
    
    case 'openai':
      return await callOpenAIAPI(messages, config, systemPrompt);
    
    case 'anthropic':
      return await callAnthropicAPI(messages, config, systemPrompt);
    
    case 'custom':
      return await callCustomAPI(messages, config, systemPrompt);
    
    default:
      throw new Error(`不支持的提供商: ${provider}`);
  }
}

/**
 * Gemini API调用
 */
async function callGeminiAPI(
  messages: UniversalMessage[],
  config: AIConfig,
  systemPrompt?: string
): Promise<string> {
  if (!config.geminiApiKey) {
    throw new Error('请先配置Gemini API Key');
  }

  const actualModel = getActualModel(config);
  console.log(`🌟 [Gemini] 使用模型: ${actualModel}`);

  // 转换消息格式为Gemini格式
  const formattedMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: msg.imageUrl 
      ? [
          { text: msg.content },
          { 
            inline_data: {
              mime_type: 'image/jpeg',
              data: msg.imageUrl.split(',')[1] // Base64部分
            }
          }
        ]
      : [{ text: msg.content }]
  }));

  // 如果有systemPrompt，添加到第一条消息
  if (systemPrompt) {
    formattedMessages.unshift({
      role: 'user',
      parts: [{ text: systemPrompt }]
    });
    formattedMessages.splice(1, 0, {
      role: 'model',
      parts: [{ text: '好的，我明白了。' }]
    });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${config.geminiApiKey}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: formattedMessages,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API错误: ${error}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

/**
 * OpenAI API调用
 */
async function callOpenAIAPI(
  messages: UniversalMessage[],
  config: AIConfig,
  systemPrompt?: string
): Promise<string> {
  if (!config.openaiApiKey) {
    throw new Error('请先配置OpenAI API Key');
  }

  const actualModel = getActualModel(config);
  console.log(`🤖 [OpenAI] 使用模型: ${actualModel}`);

  // 转换消息格式为OpenAI格式
  const formattedMessages: any[] = [];

  if (systemPrompt) {
    formattedMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  for (const msg of messages) {
    if (msg.imageUrl && config.supportsVision) {
      // 支持图片的模型
      formattedMessages.push({
        role: msg.role,
        content: [
          { type: 'text', text: msg.content },
          { 
            type: 'image_url',
            image_url: { url: msg.imageUrl }
          }
        ]
      });
    } else {
      formattedMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  const apiUrl = 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: actualModel,
      messages: formattedMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API错误: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Anthropic (Claude) API调用
 */
async function callAnthropicAPI(
  messages: UniversalMessage[],
  config: AIConfig,
  systemPrompt?: string
): Promise<string> {
  if (!config.anthropicApiKey) {
    throw new Error('请先配置Anthropic API Key');
  }

  const actualModel = getActualModel(config);
  console.log(`🧠 [Anthropic] 使用模型: ${actualModel}`);

  // 转换消息格式为Anthropic格式
  const formattedMessages: any[] = [];

  for (const msg of messages) {
    if (msg.imageUrl && config.supportsVision) {
      // Claude支持图片
      formattedMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: msg.imageUrl.split(',')[1] // Base64部分
            }
          },
          {
            type: 'text',
            text: msg.content
          }
        ]
      });
    } else {
      formattedMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      });
    }
  }

  const apiUrl = 'https://api.anthropic.com/v1/messages';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: actualModel,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt || '',
      messages: formattedMessages,
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API错误: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * 自定义API调用（兼容OpenAI格式）
 */
async function callCustomAPI(
  messages: UniversalMessage[],
  config: AIConfig,
  systemPrompt?: string
): Promise<string> {
  if (!config.customApiUrl) {
    throw new Error('请先配置自定义API URL');
  }

  const actualModel = getActualModel(config);
  console.log(`⚙️ [CustomAPI] 使用模型: ${actualModel}`);
  console.log(`⚙️ [CustomAPI] API URL: ${config.customApiUrl}`);

  // 使用OpenAI兼容格式
  const formattedMessages: any[] = [];

  if (systemPrompt) {
    formattedMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  for (const msg of messages) {
    if (msg.imageUrl && config.supportsVision) {
      formattedMessages.push({
        role: msg.role,
        content: [
          { type: 'text', text: msg.content },
          { 
            type: 'image_url',
            image_url: { url: msg.imageUrl }
          }
        ]
      });
    } else {
      formattedMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 如果有API Key，添加到headers
  if (config.customApiKey) {
    headers['Authorization'] = `Bearer ${config.customApiKey}`;
  }

  const response = await fetch(config.customApiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: actualModel,
      messages: formattedMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`自定义API错误: ${error}`);
  }

  const data = await response.json();
  
  // 尝试多种可能的响应格式
  if (data.choices && data.choices[0] && data.choices[0].message) {
    // OpenAI格式
    return data.choices[0].message.content;
  } else if (data.response) {
    // Ollama格式
    return data.response;
  } else if (data.message && data.message.content) {
    // 其他格式
    return data.message.content;
  } else if (typeof data === 'string') {
    // 纯文本响应
    return data;
  } else {
    throw new Error('无法解析API响应格式');
  }
}

/**
 * 辅助函数：将App的Message格式转换为UniversalMessage格式
 */
export function convertToUniversalMessages(messages: Message[]): UniversalMessage[] {
  return messages.map(msg => ({
    role: msg.role === 'ai' ? 'assistant' : 'user',
    content: msg.content,
    imageUrl: msg.imageUrl
  }));
}
