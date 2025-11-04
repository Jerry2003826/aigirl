// Gemini API 服务 - Embedding + 联网检索 + Vision
// 注意：所有API调用都要求手动传入模型参数，无默认值
import { Message, Memory } from '../App';

const GEMINI_EMBED_API = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';

// 构建Gemini API URL（支持动态模型）
function getGeminiGenerateAPI(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export interface EmbeddingResult {
  values: number[];
}

export interface RAGDocument {
  id: string;
  text: string;
  timestamp: number;
  role?: string;
  isMemory?: boolean;
  importance?: 'low' | 'medium' | 'high';
}

export interface RAGMatch {
  score: number;
  id: string;
  text: string;
  timestamp: number;
  isMemory?: boolean;
  importance?: 'low' | 'medium' | 'high';
}

// 余弦相似度计算
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 生成文本向量
export async function embedText(
  text: string,
  apiKey: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const response = await fetch(`${GEMINI_EMBED_API}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: {
        parts: [{ text }]
      },
      taskType,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Embedding API 错误: ${error}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

// 批量生成向量
export async function embedBatch(
  texts: string[],
  apiKey: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[][]> {
  const embeddings = await Promise.all(
    texts.map(text => embedText(text, apiKey, taskType))
  );
  return embeddings;
}

// 构建RAG上下文（从聊天历史和自定义记忆中检索）
export async function buildRAGContext(
  question: string,
  messages: Message[],
  apiKey: string,
  topK: number = 5,
  memories: Memory[] = []
): Promise<{ matches: RAGMatch[]; contextText: string }> {
  if (messages.length === 0 && memories.length === 0) {
    return { matches: [], contextText: '' };
  }

  const docs: RAGDocument[] = [];

  // 添加聊天历史
  messages.forEach((msg, idx) => {
    docs.push({
      id: `msg-${idx}`,
      text: msg.content,
      timestamp: msg.timestamp,
      role: msg.role,
    });
  });

  // 添加自定义记忆（根据重要性加权）
  memories.forEach((mem, idx) => {
    // 重要性权重：high=3, medium=2, low=1
    const importanceBoost = { high: 3, medium: 2, low: 1 }[mem.importance];
    
    // 为高重要性记忆添加多次以提高检索概率
    for (let i = 0; i < importanceBoost; i++) {
      docs.push({
        id: `memory-${idx}-${i}`,
        text: `[重要记忆] ${mem.content}`,
        timestamp: mem.timestamp,
        role: 'assistant',
        isMemory: true,
        importance: mem.importance,
      });
    }
  });

  if (docs.length === 0) {
    return { matches: [], contextText: '' };
  }

  // 生成文档向量
  const docVectors = await embedBatch(
    docs.map(d => d.text),
    apiKey,
    'RETRIEVAL_DOCUMENT'
  );

  // 生成查询向量
  const qVec = await embedText(question, apiKey, 'RETRIEVAL_QUERY');

  // 计算相似度并排序
  const scored = docVectors
    .map((v, i) => ({ i, score: cosine(qVec, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 2); // 先取更多结果

  // 去重（记忆可能有重复）
  const seen = new Set<string>();
  const uniqueMatches: RAGMatch[] = [];
  
  for (const { i, score } of scored) {
    const doc = docs[i];
    const key = doc.text;
    
    if (!seen.has(key) && uniqueMatches.length < topK) {
      seen.add(key);
      uniqueMatches.push({
        score,
        id: doc.id,
        text: doc.text,
        timestamp: doc.timestamp,
        isMemory: doc.isMemory,
        importance: doc.importance,
      });
    }
  }

  // 拼接上下文文本
  const contextText = uniqueMatches
    .map((m, idx) => {
      const date = new Date(m.timestamp).toLocaleString('zh-CN');
      const type = m.isMemory ? '记忆' : '历史';
      const importance = m.importance ? `[${m.importance}]` : '';
      return `[${type}#${idx + 1}]${importance} 相似度=${m.score.toFixed(3)} 时间=${date}\n${m.text}`;
    })
    .join('\n\n');

  return { matches: uniqueMatches, contextText };
}

// 使用Gemini生成内容（支持联网搜索）
// 注意：model参数必须手动传入，无默认值
export async function generateWithGrounding(
  prompt: string,
  apiKey: string,
  model: string,
  enableWebSearch: boolean = false
): Promise<{
  text: string;
  webSearchQueries?: string[];
  groundingSources?: Array<{ title?: string; uri?: string }>;
}> {
  const requestBody: any = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2000,
    }
  };

  // 启用联网搜索
  if (enableWebSearch) {
    requestBody.tools = [
      {
        googleSearch: {}
      }
    ];
  }

  const response = await fetch(`${getGeminiGenerateAPI(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Generate API 错误: ${error}`);
  }

  const data = await response.json();
  
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || '';
  
  // 提取grounding信息
  const meta = candidate?.groundingMetadata;
  const result: any = { text };

  if (meta) {
    if (meta.webSearchQueries?.length) {
      result.webSearchQueries = meta.webSearchQueries;
    }
    
    const chunks = meta.groundingChunks ?? [];
    if (chunks.length) {
      result.groundingSources = chunks.map((c: any) => ({
        title: c.web?.title,
        uri: c.web?.uri,
      })).filter((s: any) => s.uri);
    }
  }

  return result;
}

// 支持Vision的Gemini生成（带图片）
// 注意：model参数必须手动传入，无默认值
export async function generateWithVision(
  prompt: string,
  imageBase64: string,
  apiKey: string,
  model: string
): Promise<{ text: string }> {
  // 提取base64数据（去掉data:image/...;base64,前缀）
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeType = imageBase64.match(/data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2000,
    }
  };

  const response = await fetch(`${getGeminiGenerateAPI(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Vision API 错误: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return { text };
}

// 标准文本生成（无RAG无搜索）
// 注意：model参数必须手动传入，无默认值
export async function generateText(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  model: string
): Promise<{ text: string }> {
  // 转换消息格式为Gemini格式
  const contents = messages
    .filter(msg => msg.role !== 'system')
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

  // 如果有system消息，将其作为第一条用户消息
  const systemMsg = messages.find(msg => msg.role === 'system');
  if (systemMsg) {
    contents.unshift({
      role: 'user',
      parts: [{ text: systemMsg.content }]
    });
    // 添加一个简单的model响应以保持对话流
    contents.splice(1, 0, {
      role: 'model',
      parts: [{ text: '明白了，我会严格按照这个设定来回复。' }]
    });
  }

  const requestBody = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    }
  };

  const response = await fetch(`${getGeminiGenerateAPI(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API 错误: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return { text };
}

// 组合RAG + 联网搜索的完整流程
// 注意：model参数必须手动传入，无默认值
export async function generateWithRAGAndSearch(
  question: string,
  messages: Message[],
  personalityPrompt: string,
  apiKey: string,
  enableRAG: boolean,
  enableWebSearch: boolean,
  memories: Memory[],
  model: string
): Promise<{
  text: string;
  ragMatches?: RAGMatch[];
  webSearchQueries?: string[];
  groundingSources?: Array<{ title?: string; uri?: string }>;
}> {
  let contextText = '';
  let ragMatches: RAGMatch[] | undefined;

  // RAG检索（包含聊天历史和自定义记忆）
  if (enableRAG && (messages.length > 0 || memories.length > 0)) {
    const ragResult = await buildRAGContext(question, messages, apiKey, 5, memories);
    contextText = ragResult.contextText;
    ragMatches = ragResult.matches;
  }

  // 构建完整提示词
  const fullPrompt = `${personalityPrompt}

${contextText ? `【参考历史对话和记忆】\n${contextText}\n` : ''}
【用户问题】
${question}

${enableWebSearch ? '要求：若使用联网信息，请自然融入回答中，保持角色人设。' : ''}`;

  // 生成回答
  const result = await generateWithGrounding(fullPrompt, apiKey, model, enableWebSearch);

  return {
    ...result,
    ragMatches,
  };
}

// 分析对话并提取记忆
// 注意：model参数必须手动传入，无默认值
export async function extractMemoriesFromConversation(
  recentMessages: Message[],
  apiKey: string,
  model: string
): Promise<{
  memories: Array<{
    content: string;
    memoryType: 'short-term' | 'long-term';
    importance: 'low' | 'medium' | 'high';
    tags: string[];
  }>;
}> {
  if (recentMessages.length < 2) {
    return { memories: [] };
  }

  // 构建对话历史
  const conversationText = recentMessages
    .slice(-10) // 只分析最近10条消息
    .map((msg, idx) => `${msg.role === 'user' ? '用户' : 'AI'}：${msg.content}`)
    .join('\n');

  const prompt = `你是一个记忆分析专家。请分析以下对话，提取值得记住的重要信息。

对话历史：
${conversationText}

请分析并提取记忆，返回JSON格式：
{
  "memories": [
    {
      "content": "记忆内容（简洁描述，50字以内）",
      "memoryType": "short-term或long-term",
      "importance": "low、medium或high",
      "tags": ["标签1", "标签2"],
      "reason": "为什么要记住这个"
    }
  ]
}

【核心记忆分类标准】

1. **长时记忆（long-term）** - 永久保存，绝不遗忘：
   ✅ 关键个人信息：生日、职业、家庭、住址
   ✅ 重要喜好和习惯：饮食偏好、兴趣爱好、生活习惯
   ✅ 重大事件和约定：纪念日、重要承诺、人生转折点
   ✅ 核心关系定位：我们的关系、ta对我的称呼、特殊约定
   ✅ 深层情感表达：爱的表白、痛苦回忆、重要感悟
   ✅ 价值观和信念：人生观、禁忌话题、道德底线

2. **短时记忆（short-term）** - 临时记录，可自动清理：
   📝 临时计划：今晚吃什么、明天去哪玩
   📝 当前状态：现在的心情、今天发生的事
   📝 日常琐事：天气、路况、小抱怨
   📝 上下文线索：刚才聊到的话题、正在讨论的内容
   📝 临时性信息：今天穿什么、刚看了什么电影

3. **重要性级别**：
   ⭐ high：关键信息，深刻影响关系（优先提取为长时记忆）
   ⚡ medium：值得记住的信息（需根据内容判断类型）
   💡 low：一般性参考信息（多为短时记忆）

【提取原则】
✓ 优先提取长时记忆，它们是关系的基石
✓ 短时记忆用于理解当前对话上下文
✓ 只提取真正有价值的内容，避免冗余
✓ 如果对话无重要信息，返回空数组
✓ 每条记忆简洁明确，便于后续检索
✓ 必须返回有效的JSON格式`;

  try {
    const response = await fetch(`${getGeminiGenerateAPI(model)}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.3, // 较低温度保证稳定输出
          maxOutputTokens: 1000,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Memory extraction API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return { memories: [] };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // 提取JSON内容
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        memories: (parsed.memories || []).map((m: any) => ({
          content: m.content,
          memoryType: m.memoryType === 'long-term' ? 'long-term' : 'short-term',
          importance: ['low', 'medium', 'high'].includes(m.importance) ? m.importance : 'medium',
          tags: Array.isArray(m.tags) ? m.tags : [],
        }))
      };
    }

    return { memories: [] };
  } catch (error) {
    console.error('Error extracting memories:', error);
    return { memories: [] };
  }
}
