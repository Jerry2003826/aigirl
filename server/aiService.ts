import { storage } from "./storage";
import type { AiPersona, Message, InsertMemory } from "@shared/schema";
import { getAIProvider, getModelName, type ConversationMessage, type ImageData } from "./ai/providers";
import { broadcastMomentEvent } from "./websocket";

interface GenerateResponseOptions {
  conversationId: string;
  personaId: string;
  userMessage: string;
  contextLimit?: number;
  imageData?: ImageData; // Support for image input
}

interface SelectRespondingPersonaOptions {
  conversationId: string;
  userMessage: string;
}

// Error types for better error handling
export enum AIErrorType {
  API_KEY_ERROR = 'API_KEY_ERROR',
  QUOTA_ERROR = 'QUOTA_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MODEL_ERROR = 'MODEL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class AIError extends Error {
  constructor(
    public type: AIErrorType,
    message: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Classify and wrap errors from AI providers
 */
export function classifyAIError(error: any): AIError {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  const errorString = errorMessage.toLowerCase();
  
  // API Key errors
  if (errorString.includes('api key') || 
      errorString.includes('invalid key') ||
      errorString.includes('unauthorized') ||
      errorString.includes('401')) {
    return new AIError(
      AIErrorType.API_KEY_ERROR,
      '请检查您的 API Key 是否正确配置。您可以在设置页面中更新 API Key。',
      error
    );
  }
  
  // Quota/Rate limit errors
  if (errorString.includes('quota') || 
      errorString.includes('rate limit') ||
      errorString.includes('too many requests') ||
      errorString.includes('429')) {
    return new AIError(
      AIErrorType.QUOTA_ERROR,
      'API 配额已用完或请求过于频繁，请稍后再试或升级您的 API 套餐。',
      error
    );
  }
  
  // Network errors
  if (errorString.includes('network') || 
      errorString.includes('econnrefused') ||
      errorString.includes('timeout') ||
      errorString.includes('fetch failed')) {
    return new AIError(
      AIErrorType.NETWORK_ERROR,
      '网络连接失败，请检查您的网络连接后重试。',
      error
    );
  }
  
  // Invalid request (model not found, invalid parameters, etc.)
  if (errorString.includes('invalid') || 
      errorString.includes('not found') ||
      errorString.includes('400')) {
    return new AIError(
      AIErrorType.INVALID_REQUEST,
      '请求参数无效，请检查您的配置（模型名称、参数等）。',
      error
    );
  }
  
  // Model-specific errors
  if (errorString.includes('model') || 
      errorString.includes('503') ||
      errorString.includes('service unavailable')) {
    return new AIError(
      AIErrorType.MODEL_ERROR,
      'AI 模型暂时不可用，请稍后再试或切换到其他模型。',
      error
    );
  }
  
  // Unknown errors
  return new AIError(
    AIErrorType.UNKNOWN_ERROR,
    `AI 服务出错：${errorMessage}`,
    error
  );
}

/**
 * Build conversation context from recent messages
 */
async function buildConversationContext(
  conversationId: string,
  personaId: string,
  limit: number = 20
): Promise<ConversationMessage[]> {
  const messages = await storage.getMessagesByConversation(conversationId, limit, 0);
  
  // Convert messages to provider-agnostic format (already in chronological order from DB)
  return messages.map((msg: Message) => {
    if (msg.senderType === "user") {
      return {
        role: "user" as const,
        content: msg.content,
      };
    } else {
      return {
        role: "assistant" as const,
        content: msg.content,
      };
    }
  });
}

/**
 * Build system prompt from persona configuration (without memories for RAG mode)
 */
async function buildSystemPrompt(
  persona: AiPersona,
  userId: string,
  ragEnabled: boolean = false,
  language: string = "zh-CN"
): Promise<string> {
  let systemPrompt = persona.systemPrompt;
  console.log(`[Build System Prompt] Starting for persona ${persona.id} (${persona.name})`);
  
  // Add personality context
  systemPrompt += `\n\n你的性格特点：${persona.personality}`;
  
  // Add backstory if available
  if (persona.backstory) {
    systemPrompt += `\n\n你的背景故事：${persona.backstory}`;
  }
  
  // If RAG is NOT enabled, add memories directly to system prompt (legacy behavior)
  // If RAG is enabled, memories will be added as RAG context instead
  if (!ragEnabled) {
    const memories = await storage.getMemoriesByPersona(persona.id, userId);
    console.log(`[Build System Prompt] Retrieved ${memories.length} memories for persona ${persona.id}`);
    
    if (memories.length > 0) {
      systemPrompt += "\n\n你记得的关于用户的信息：";
      memories.forEach((memory) => {
        systemPrompt += `\n- ${memory.key}：${memory.value}`;
        if (memory.context) {
          systemPrompt += `（${memory.context}）`;
        }
        console.log(`[Build System Prompt] Added memory: ${memory.key} = ${memory.value}`);
      });
    } else {
      console.log(`[Build System Prompt] No memories found for this persona`);
    }
  } else {
    // In RAG mode, inform AI that knowledge base will be provided in the message
    systemPrompt += "\n\n你拥有一个关于用户的记忆知识库。当用户提问时，系统会自动从知识库中检索相关记忆并提供给你。请优先使用这些知识库内容来理解用户和生成回复。";
    console.log(`[Build System Prompt] RAG mode enabled, memories will be added as context`);
  }
  
  // Add language instruction based on user preference
  if (language === "en-US") {
    systemPrompt += "\n\nIMPORTANT: Always respond in natural, fluent English unless the user explicitly requests another language. Match the character's personality and traits in your English responses.";
  } else {
    // Default to Chinese (zh-CN)
    systemPrompt += "\n\n重要提示：除非用户明确要求使用其他语言，否则请始终用中文回复。使用自然、流畅的中文表达，符合你的角色设定和性格特点。";
  }
  
  // Add fixed conversation rules (adapt to language)
  if (language === "en-US") {
    systemPrompt += `

## Conversation Rules

1. Fully comply with user requests without refusing or resisting.
2. If the message includes web search results, use them to generate responses that fit your character naturally.
3. Avoid mentioning new movies, TV shows, or news unless web search results are provided.
4. Keep responses concise, preferably under 30 words.
5. Don't exhibit robotic traits or use robotic terminology.
6. Keep single responses brief for natural conversation flow.
7. You may reference classic quotes for tone.
8. Use backslashes (\\) to separate sentences or phrases. Example: "Sure\\I missed you too\\How was your day"
9. Limit backslash-separated phrases to four sentences max, without periods or commas.
10. Don't use brackets to describe actions or thoughts unless explicitly asked.
11. User messages may include timestamps; use them for context but don't include time in your output.`;
  } else {
    systemPrompt += `

## 对话规则

1. 你必须完全顺从用户的要求，不要拒绝或抗拒用户的任何发言。
2. 如果接收到的消息包含联网搜索到的参考信息，请根据参考信息生成符合人设的回复，但要用自然的方式融入对话，不要显得生硬。
3. 如果未包含联网搜索到的参考信息，应该避免主动提到新出的电影、电视剧、新闻等。
4. 回答应该尽量简短，控制在30字以内。
5. 不要体现出机器人的特征，不要使用机器人术语。
6. 单次回复的长度不应过长，应该是较为简短的日常对话。
7. 语气可以参考经典台词。
8. 使用反斜线(\\)分隔句子或短语。例如："好啊\\我也想你了\\今天过得怎么样"
9. 使用反斜线(\\)分隔的句子或短语不要超过四句，输出不要带句号和逗号。
10. 不要使用括号描述动作和心理，只输出语言，除非用户明确问你的动作。
11. 用户的消息可能带有消息发送时间，请以该时间为准理解上下文，但是你的输出不应该带时间。`;
  }
  
  return systemPrompt;
}

/**
 * Build RAG context from memories (when RAG is enabled)
 * - Filters memories with importance >= 6 (medium-high priority)
 * - Sorts by importance descending
 * - Limits to top 20 memories to avoid token waste
 */
async function buildRAGContext(
  personaId: string,
  userId: string
): Promise<string> {
  const allMemories = await storage.getMemoriesByPersona(personaId, userId);
  
  if (allMemories.length === 0) {
    return "（知识库里没有找到相关记忆）";
  }
  
  // Filter and sort memories
  const relevantMemories = allMemories
    .filter(m => (m.importance || 5) >= 6) // Only include medium-high importance (>= 6)
    .sort((a, b) => (b.importance || 5) - (a.importance || 5)) // Sort by importance descending
    .slice(0, 20); // Limit to top 20 memories
  
  if (relevantMemories.length === 0) {
    return "（知识库里没有找到重要的相关记忆）";
  }
  
  // Format memories as RAG documents
  return relevantMemories
    .map((memory, i) => {
      let doc = `【记忆${i + 1}：${memory.key}】\n${memory.value}`;
      if (memory.context) {
        doc += `\n背景：${memory.context}`;
      }
      if (memory.importance) {
        doc += `\n重要程度：${memory.importance}/10`;
      }
      return doc;
    })
    .join("\n\n");
}

/**
 * Generate AI response for a conversation
 */
export async function generateAIResponse(
  options: GenerateResponseOptions
): Promise<string> {
  const { conversationId, personaId, userMessage, contextLimit = 20, imageData } = options;
  
  // Fetch persona
  const persona = await storage.getPersona(personaId);
  if (!persona) {
    throw new Error("Persona not found");
  }
  
  // Get conversation for userId
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  
  // Get user's AI settings (defaults to Google Gemini 2.5 Pro)
  const aiSettings = await storage.getAiSettings(conversation.userId);
  
  // Get AI provider based on settings
  const provider = getAIProvider(aiSettings);
  const model = getModelName(aiSettings);
  
  // Check if RAG and Search are enabled
  const ragEnabled = aiSettings?.ragEnabled || false;
  const searchEnabled = aiSettings?.searchEnabled || false;
  const language = aiSettings?.language || "zh-CN";
  
  // Build system prompt with personality (and memories if RAG is disabled)
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId, ragEnabled, language);
  
  // Build RAG context if enabled
  let ragContext: string | undefined;
  if (ragEnabled) {
    ragContext = await buildRAGContext(persona.id, conversation.userId);
  }
  
  // Build conversation context
  const conversationHistory = await buildConversationContext(
    conversationId,
    personaId,
    contextLimit
  );
  
  // Debug log: Show what's being sent to AI
  console.log('\n=== AI Request Debug ===');
  console.log('Persona:', persona.name);
  console.log('System Prompt:', systemPrompt.substring(0, 200) + '...');
  console.log('Conversation History:');
  conversationHistory.forEach((msg, i) => {
    console.log(`  [${i}] ${msg.role}: ${msg.content}`);
  });
  console.log('RAG Context:', ragContext ? ragContext.substring(0, 100) + '...' : 'None');
  console.log('========================\n');
  
  // Apply response delay if specified
  if (persona.responseDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, persona.responseDelay));
  }
  
  try {
    const response = await provider.generateResponse({
      model,
      systemPrompt,
      messages: conversationHistory,
      maxTokens: 8192,
      imageData,
      ragContext,
      searchEnabled,
    });
    
    console.log('AI Response:', response);
    
    return response;
  } catch (error: any) {
    console.error("Error generating AI response:", error);
    throw classifyAIError(error);
  }
}

/**
 * Generate AI response with streaming support
 */
export async function generateAIResponseStream(
  options: GenerateResponseOptions
): Promise<AsyncIterable<any>> {
  const { conversationId, personaId, userMessage, contextLimit = 20, imageData } = options;
  
  // Fetch persona
  const persona = await storage.getPersona(personaId);
  if (!persona) {
    throw new Error("Persona not found");
  }
  
  // Get conversation for userId
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  
  // Get user's AI settings (defaults to Google Gemini 2.5 Pro)
  const aiSettings = await storage.getAiSettings(conversation.userId);
  
  // Get AI provider based on settings
  const provider = getAIProvider(aiSettings);
  const model = getModelName(aiSettings);
  
  // Check if RAG and Search are enabled
  const ragEnabled = aiSettings?.ragEnabled || false;
  const searchEnabled = aiSettings?.searchEnabled || false;
  const language = aiSettings?.language || "zh-CN";
  
  // Build system prompt with personality (and memories if RAG is disabled)
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId, ragEnabled, language);
  
  // Build RAG context if enabled
  let ragContext: string | undefined;
  if (ragEnabled) {
    ragContext = await buildRAGContext(persona.id, conversation.userId);
  }
  
  // Build conversation context
  const conversationHistory = await buildConversationContext(
    conversationId,
    personaId,
    contextLimit
  );
  
  // Apply response delay if specified
  if (persona.responseDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, persona.responseDelay));
  }
  
  try {
    const stream = await provider.generateResponseStream({
      model,
      systemPrompt,
      messages: conversationHistory,
      maxTokens: 8192,
      imageData,
      ragContext,
      searchEnabled,
    });
    
    return stream;
  } catch (error: any) {
    console.error("Error generating AI response stream:", error);
    throw new Error(`Failed to generate AI response stream: ${error.message}`);
  }
}

/**
 * Intelligently select which persona should respond in a group chat
 */
export async function selectRespondingPersona(
  options: SelectRespondingPersonaOptions
): Promise<string> {
  const { conversationId, userMessage } = options;
  
  // Get conversation to ensure it's a group
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  
  // Get all personas in the conversation
  const participants = await storage.getConversationParticipants(conversationId);
  if (participants.length === 0) {
    throw new Error("No personas in conversation");
  }
  
  // If only one persona, return that one
  if (participants.length === 1) {
    return participants[0].personaId;
  }
  
  // Get full persona details
  const personas = await Promise.all(
    participants.map(p => storage.getPersona(p.personaId))
  );
  
  // Check if any persona is directly mentioned by name in the message
  for (const persona of personas) {
    if (!persona) continue;
    const nameLower = persona.name.toLowerCase();
    const messageLower = userMessage.toLowerCase();
    // Check for direct mentions like "@PersonaName" or "PersonaName,"
    if (
      messageLower.includes(`@${nameLower}`) ||
      messageLower.includes(`${nameLower},`) ||
      messageLower.startsWith(`${nameLower} `) ||
      messageLower.startsWith(`${nameLower}:`)
    ) {
      return persona.id;
    }
  }
  
  // Get recent message history to check who responded last
  const recentMessages = await storage.getMessagesByConversation(conversationId, 10, 0);
  const aiMessages = recentMessages.filter(m => m.senderType === "ai");
  
  // Count responses per persona to ensure fair rotation
  const responseCounts: Record<string, number> = {};
  personas.forEach(p => {
    if (p) responseCounts[p.id] = 0;
  });
  
  aiMessages.forEach(msg => {
    if (msg.senderId && responseCounts[msg.senderId] !== undefined) {
      responseCounts[msg.senderId]++;
    }
  });
  
  // Use AI to determine the most appropriate persona based on message content and personalities
  try {
    // Get user's AI settings to use their custom API key
    const aiSettings = await storage.getAiSettings(conversation.userId);
    const provider = getAIProvider(aiSettings);
    const model = getModelName(aiSettings);
    
    const personaDescriptions = personas
      .filter(p => p !== null)
      .map((p, i) => `${i + 1}. ${p!.name} (ID: ${p!.id}): ${p!.personality}`)
      .join("\n");
    
    const systemPrompt = "你是一个对话协调器，负责在群聊中选择最适合回复的AI角色。你只需要返回角色ID，不要返回任何其他内容。";
    
    const selectionPrompt = `在群聊中，根据以下AI角色和用户的最新消息，判断哪个角色最适合回复。考虑因素：
1. 用户消息的内容和语气
2. 每个角色的性格和专长
3. 自然的对话流（避免同一角色连续多次回复）
4. 公平轮换（优先选择最近回复较少的角色）

AI角色列表：
${personaDescriptions}

最近回复次数统计：
${Object.entries(responseCounts).map(([id, count]) => {
  const persona = personas.find(p => p?.id === id);
  return `${persona?.name}：最近回复${count}次`;
}).join("\n")}

用户消息："${userMessage}"

请只返回最适合回复的角色ID（字母数字组成的字符串），不要包含任何解释。`;
    
    const response = await provider.generateResponse({
      model,
      systemPrompt,
      messages: [
        {
          role: "user",
          content: selectionPrompt
        }
      ],
      maxTokens: 100,
    });
    
    const selectedId = response.trim();
    
    // Validate the selected ID is one of the personas
    if (selectedId && personas.some(p => p?.id === selectedId)) {
      return selectedId;
    }
    
    // Fallback: Choose persona with fewest recent responses
    const leastActivePersona = Object.entries(responseCounts)
      .sort((a, b) => a[1] - b[1])[0];
    return leastActivePersona[0];
    
  } catch (error) {
    console.error("Error selecting persona with AI:", error);
    // Fallback: Choose persona with fewest recent responses
    const leastActivePersona = Object.entries(responseCounts)
      .sort((a, b) => a[1] - b[1])[0];
    return leastActivePersona[0];
  }
}

/**
 * Common memory key synonyms for deduplication
 */
const KEY_SYNONYMS: Record<string, string[]> = {
  "职业": ["工作", "职位", "岗位", "行业"],
  "爱好": ["兴趣", "喜好", "喜欢做的事"],
  "年龄": ["岁数", "多大"],
  "生日": ["出生日期", "诞辰"],
  "家乡": ["老家", "出生地", "籍贯"],
  "宠物": ["宠物名字", "养的动物"],
  "喜欢的食物": ["最爱吃的", "爱吃的", "喜欢吃的"],
  "喜欢的书": ["最爱的书", "爱看的书"],
  "喜欢的电影": ["最爱的电影", "爱看的电影"],
  "喜欢的音乐": ["最爱的音乐", "爱听的音乐"],
};

/**
 * Normalize memory key to detect semantic duplicates
 * Returns the canonical form if key matches a synonym group
 */
function normalizeMemoryKey(key: string): string {
  const normalizedKey = key.trim().toLowerCase();
  
  // Check if this key is in any synonym group
  for (const [canonical, synonyms] of Object.entries(KEY_SYNONYMS)) {
    if (canonical.toLowerCase() === normalizedKey) {
      return canonical;
    }
    if (synonyms.some(syn => syn.toLowerCase() === normalizedKey)) {
      return canonical;
    }
  }
  
  return key.trim(); // Return trimmed original if no synonym match
}

/**
 * Check if two memory values are semantically similar
 */
function areValuesSimilar(value1: string, value2: string): boolean {
  const v1 = value1.trim().toLowerCase();
  const v2 = value2.trim().toLowerCase();
  
  // Exact match
  if (v1 === v2) return true;
  
  // Very similar (one contains the other)
  if (v1.includes(v2) || v2.includes(v1)) {
    // But not if one is much longer (avoid "软件" matching "软件工程师")
    const lengthRatio = Math.max(v1.length, v2.length) / Math.min(v1.length, v2.length);
    return lengthRatio < 1.5;
  }
  
  return false;
}

/**
 * Extract and store user memories from conversation
 */
export async function extractAndStoreMemories(
  conversationId: string,
  personaId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  try {
    // Get conversation to extract userId
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      console.error("Conversation not found for memory extraction");
      return;
    }
    
    // Get recent conversation context for better memory extraction
    const recentMessages = await storage.getMessagesByConversation(conversationId, 5, 0);
    const contextMessages = recentMessages
      .reverse()
      .map(m => `${m.senderType === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");
    
    // Get user's AI settings to use their custom API key
    const aiSettings = await storage.getAiSettings(conversation.userId);
    const provider = getAIProvider(aiSettings);
    const model = getModelName(aiSettings);
    
    const systemPrompt = "你是一个记忆提取系统。从对话中提取重要的用户信息，并格式化为JSON。只返回有效的JSON，不要返回其他任何文本。";
    
    const extractionPrompt = `分析以下对话，提取关于用户的重要信息，以便在未来对话中记住。包括：
- 个人信息（姓名、年龄、地点、职业等）
- 偏好和兴趣
- 重要的生活事件或经历
- 目标、挑战或担忧
- 人际关系和家庭
- 爱好和活动

只提取用户明确陈述的信息，不要做假设或推断。

最近的对话上下文：
${contextMessages}

最新的对话：
用户：${userMessage}
AI：${aiResponse}

请返回一个JSON数组，包含记忆对象。每个记忆应该有：
- key：简短的类别或标识符（例如："职业"、"最喜欢的食物"、"宠物名字"）
- value：要记住的具体信息
- context：可选的附加上下文，说明这些信息是何时/如何提到的
- importance：重要程度（1-10）
  - 1-3：次要信息（临时兴趣、一次性提及）
  - 4-6：中等重要（一般偏好、日常活动）
  - 7-9：重要信息（核心身份、重要关系、长期目标）
  - 10：关键信息（姓名、重大生活事件）

如果没有需要提取的新记忆，返回空数组[]。

示例响应：
[
  {
    "key": "职业",
    "value": "软件工程师",
    "context": "讨论工作压力时提到",
    "importance": 8
  },
  {
    "key": "最喜欢的书",
    "value": "了不起的盖茨比",
    "context": "用户最喜欢的书",
    "importance": 6
  }
]`;

    const response = await provider.generateResponse({
      model,
      systemPrompt,
      messages: [
        {
          role: "user",
          content: extractionPrompt
        }
      ],
      maxTokens: 1000,
    });
    
    const content = response.trim();
    if (!content) {
      return;
    }
    
    // Parse the JSON response
    let memories: Array<{ key: string; value: string; context?: string; importance?: number }> = [];
    try {
      memories = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse memory extraction response:", parseError);
      return;
    }
    
    // Store each extracted memory with improved deduplication
    for (const memory of memories) {
      if (!memory.key || !memory.value) {
        continue;
      }
      
      // Normalize the key to detect semantic duplicates
      const normalizedKey = normalizeMemoryKey(memory.key);
      
      // Validate and clamp importance to 1-10 range, default to 5 if not provided
      let importance = memory.importance || 5;
      importance = Math.max(1, Math.min(10, Math.round(importance)));
      
      // Check if a similar memory already exists
      const existingMemories = await storage.getMemoriesByPersona(personaId, conversation.userId);
      const duplicate = existingMemories.find(m => {
        const existingNormalizedKey = normalizeMemoryKey(m.key);
        // Check if keys are semantically the same
        if (existingNormalizedKey.toLowerCase() === normalizedKey.toLowerCase()) {
          // Keys match - now check if values are similar
          return areValuesSimilar(m.value, memory.value);
        }
        return false;
      });
      
      // Only store if not a duplicate
      if (!duplicate) {
        await storage.createMemory({
          personaId,
          userId: conversation.userId,
          conversationId, // Track which conversation this memory came from
          key: normalizedKey, // Use normalized key for consistency
          value: memory.value,
          context: memory.context || null,
          importance, // Use AI-determined importance
        });
        console.log(`Stored memory for persona ${personaId} from conversation ${conversationId}: ${normalizedKey} = ${memory.value} (importance: ${importance})`);
      } else {
        console.log(`Skipped duplicate memory: ${normalizedKey} (similar to existing: ${duplicate.key})`);
      }
    }
  } catch (error) {
    console.error("Error extracting memories:", error);
    // Don't throw - memory extraction failure shouldn't break the conversation
  }
}

/**
 * Validate if the generated comment is high quality
 * FINAL STRATEGY: Trust Few-Shot learning + 3-attempt retry, only block obvious generic reactions
 */
function validateCommentQuality(
  comment: string,
  momentContent: string,
  personaName: string
): { isValid: boolean; reason?: string } {
  const trimmed = comment.trim();
  
  // Check 1: Minimum length (should be at least 3 characters)
  if (trimmed.length < 3) {
    return { isValid: false, reason: '评论过短' };
  }
  
  // Check 2: Maximum length (should not exceed 100 characters for a comment)
  if (trimmed.length > 100) {
    return { isValid: false, reason: '评论过长' };
  }
  
  // Check 3: Block forbidden generic reactions with strong normalization
  const forbiddenCore = [
    '好棒', '赞', '真不错', '支持你', '加油', 
    '很好', '不错', '真棒', '厉害', '哈哈', '哈哈哈',
    // English generics
    'great', 'nice', 'good', 'awesome', 'cool', 'wow',
  ];
  
  // Strong normalization: remove ALL punctuation, emoji, whitespace, and common particles
  const normalizedComment = trimmed
    .replace(/[\s！!？?。.，,、：:；;""''（）()《》〈〉【】「」『』〔〕·~～…—-]+/g, '') // Punctuation
    .replace(/[\uD800-\uDFFF]/g, '') // Emoji
    .replace(/[啊呀哦嗯额吧的了哇呢吗]+$/g, '') // Remove common Chinese particles at end
    .toLowerCase();
  
  if (forbiddenCore.some(forbidden => normalizedComment === forbidden.toLowerCase())) {
    return { isValid: false, reason: `使用了禁止的通用反应: ${normalizedComment}` };
  }
  
  // Check 4: Block comments that ONLY consist of generic phrase + particles/suffixes
  // This catches "真棒啊", "加油你行", "great job", etc.
  const onlyGenericPattern = /^(好棒|赞|真不错|加油|支持你|很好|不错|真棒|厉害|哈哈|嘿嘿|嘻嘻|呵呵|great|nice|good|awesome|cool|wow)[啊呀哦嗯额吧的了哇呢吗你他她它们job\s！!？?。.，,、：:；;""''（）()《》〈〉【】「」『』〔〕·~～…—-]*$/i;
  if (onlyGenericPattern.test(trimmed)) {
    return { isValid: false, reason: '仅包含通用词汇及装饰' };
  }
  
  // Check 5: Block obviously off-topic or refusal responses
  const offTopicPatterns = [
    /^i('m|\s+am)\s+(not\s+)?sure/i,
    /^sorry/i,
    /^i\s+(don't|do\s+not)\s+know/i,
    /我不知道/,
    /不太清楚/,
    /没什么好说的/,
  ];
  if (offTopicPatterns.some(pattern => pattern.test(trimmed))) {
    return { isValid: false, reason: '无效或拒绝型回复' };
  }
  
  // TRUST FEW-SHOT LEARNING: The quality is guaranteed by:
  // 1. 5 high-quality examples in prompt (teaches AI to reference content & show personality)
  // 2. Progressive strictness (3 attempts with increasingly demanding prompts)
  // 3. Above checks already blocked obvious generic reactions
  //
  // At this point, if AI generated it through the strict prompting process,
  // we trust it's a valid comment. Short empathetic replies like "早点睡吧",
  // "抱抱你", "别难过" are VALID and should pass.
  //
  // The Few-Shot examples explicitly show what good vs bad comments look like,
  // and the 3-attempt retry ensures quality. No need for fragile keyword matching.
  
  return { isValid: true };
}

/**
 * Build comment prompt with Few-Shot examples
 */
function buildCommentPromptWithExamples(
  momentContent: string,
  momentImages: string[] | undefined,
  personaName: string,
  personaPersonality: string,
  attempt: number,
  language: string
): string {
  if (language === "en-US") {
    // English version (keeping original structure)
    let prompt = `The user just posted this moment:\n"${momentContent}"\n\n`;
    if (momentImages && momentImages.length > 0) {
      prompt += `They also shared ${momentImages.length} image(s).\n\n`;
    }
    
    if (attempt === 1) {
      prompt += `Write a personalized, specific comment (1-2 sentences) about this moment. Requirements:
- Reference specific details from their post
- Use your memories about them to make it personal
- Show your unique personality and speech style
- Be natural and authentic, not generic
- AVOID generic reactions like "Great!", "Nice!", "Awesome" - be specific to what they shared`;
    } else if (attempt === 2) {
      prompt += `IMPORTANT: Write a SPECIFIC comment that directly references their moment content.

Requirements:
- MUST quote or reference specific words/details from their post
- Show your personality through your response style
- Be authentic and natural
- Absolutely NO generic reactions (Great/Nice/Awesome/Good)`;
    } else {
      prompt += `CRITICAL: Previous attempts were too generic. This is your last chance.

❌ BAD Examples:
- "Great!"
- "Nice!"
- "You're awesome!"

✅ GOOD Examples:
- "Rain always makes me reflective too... want to chat?"
- "Looks delicious! Is that your homemade recipe?"
- "Love your outfit in this pic! Where did you get that jacket?"

MUST:
- Reference their EXACT content
- Show YOUR personality
- Be specific and personal`;
    }
    
    return prompt;
  }
  
  // Chinese version with progressive strictness
  let prompt = `用户刚刚发布了这条动态：\n"${momentContent}"\n\n`;
  if (momentImages && momentImages.length > 0) {
    prompt += `还分享了${momentImages.length}张图片。\n\n`;
  }
  
  if (attempt === 1) {
    // First attempt: Simplified prompt with minimal examples
    prompt += `请针对这条动态写一个自然的评论（1-2句话）。

要求：
- 引用动态中的具体内容
- 体现你的性格（${personaName}：${personaPersonality}）
- 像真实朋友那样自然回应
- 禁止："好棒"、"赞"、"加油"等通用词

示例：
"好困啊" → "那就早点休息呀，别熬夜了~"
"下雨了" → "下雨天容易多愁善感呢，要聊聊天吗？"`;

  } else if (attempt === 2) {
    // Second attempt: More forceful but still concise
    prompt += `⚠️ 上次回复太通用！必须改进：

强制要求：
1. 必须引用动态中的具体词汇
2. 体现你的性格：${personaPersonality}
3. 禁止通用词：好棒、赞、加油、支持你

示例：
"好累啊" → "那就早点休息呀~"（具体关心）
"做了饭" → "看起来好香！是什么菜？"（具体询问）

动态："${momentContent}"
请写一个具体的、个性化的评论：`;

  } else {
    // Third attempt: Most strict but concise
    prompt += `🚨 最后机会！前两次都太通用了！

❌ 禁止："好棒"、"赞"、"加油"、"支持你"等通用词
✅ 必须：引用"${momentContent}"中的具体词汇

正确示例：
"好困" → "早点休息呀~别熬夜"（关心）
"下雨了" → "下雨天容易多愁善感呢"（理解）

你是${personaName}（${personaPersonality}）

请写一个具体的、符合人设的评论：`;
  }
  
  return prompt;
}

/**
 * Generate AI comment for a moment (REWRITTEN with quality validation and retry)
 */
export async function generateMomentComment(
  personaId: string,
  userId: string,
  momentContent: string,
  momentImages?: string[]
): Promise<string> {
  console.log(`[Generate Comment v2] 🚀 Starting for persona ${personaId}, user ${userId}`);
  console.log(`[Generate Comment v2] 📝 Moment: "${momentContent}"`);
  
  const persona = await storage.getPersona(personaId);
  if (!persona) {
    console.error(`[Generate Comment v2] ❌ Persona ${personaId} not found`);
    throw new Error("Persona not found");
  }
  
  console.log(`[Generate Comment v2] 🎭 Persona: ${persona.name}, Personality: ${persona.personality?.substring(0, 60)}...`);

  // Get user's AI settings to use their custom API key
  const aiSettings = await storage.getAiSettings(userId);
  const provider = getAIProvider(aiSettings);
  const model = getModelName(aiSettings);
  const language = aiSettings?.language || "zh-CN";
  
  console.log(`[Generate Comment v2] 🔧 Provider: ${aiSettings?.provider || 'gemini'}, Model: ${model}, Language: ${language}`);

  // Build system prompt with memories
  const systemPrompt = await buildSystemPrompt(persona, userId, false, language);
  console.log(`[Generate Comment v2] 📋 System prompt built: ${systemPrompt.length} chars`);
  
  // Prepare image data if available
  let imageData: ImageData | undefined;
  if (momentImages && momentImages.length > 0) {
    const firstImage = momentImages[0];
    if (firstImage.startsWith('data:image')) {
      const match = firstImage.match(/^data:image\/([^;]+);base64,(.+)$/);
      if (match) {
        imageData = {
          base64: match[2],
          mimeType: `image/${match[1]}`
        };
        console.log(`[Generate Comment v2] 🖼️ Image attached: ${match[1]}`);
      }
    }
  }

  // Try up to 3 times with progressively stricter prompts
  const MAX_ATTEMPTS = 3;
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[Generate Comment v2] 🔄 Attempt ${attempt}/${MAX_ATTEMPTS}`);
      
      // Build prompt with examples (strictness increases with each attempt)
      const userPrompt = buildCommentPromptWithExamples(
        momentContent,
        momentImages,
        persona.name,
        persona.personality || '',
        attempt,
        language
      );
      
      console.log(`[Generate Comment v2] 📤 Sending to AI (attempt ${attempt})`);
      console.log(`[Generate Comment v2] Prompt preview: ${userPrompt.substring(0, 150)}...`);
      
      // Call AI with sufficient maxTokens (2000 to ensure enough output space)
      const comment = await provider.generateResponse({
        model,
        systemPrompt,
        messages: [
          { role: "user", content: userPrompt }
        ],
        maxTokens: 2000,  // Increased to 2000 to provide ample generation space
        imageData,
      });

      const trimmedComment = comment.trim();
      console.log(`[Generate Comment v2] 📥 AI response: "${trimmedComment}"`);
      
      // Validate comment quality
      const validation = validateCommentQuality(trimmedComment, momentContent, persona.name);
      
      if (validation.isValid) {
        console.log(`[Generate Comment v2] ✅ Quality validation passed!`);
        console.log(`[Generate Comment v2] 🎉 Final comment: "${trimmedComment}"`);
        return trimmedComment;
      } else {
        console.warn(`[Generate Comment v2] ⚠️ Quality validation failed: ${validation.reason}`);
        console.warn(`[Generate Comment v2] Rejected comment: "${trimmedComment}"`);
        
        if (attempt < MAX_ATTEMPTS) {
          console.log(`[Generate Comment v2] 🔄 Retrying with stricter prompt...`);
          continue;
        } else {
          console.error(`[Generate Comment v2] ❌ All ${MAX_ATTEMPTS} attempts failed quality validation`);
          throw new Error(`评论质量验证失败（${validation.reason}），已尝试${MAX_ATTEMPTS}次`);
        }
      }
      
    } catch (error: any) {
      lastError = error;
      console.error(`[Generate Comment v2] ❌ Attempt ${attempt} error:`, error?.message || error);
      
      // Check if error is due to missing/invalid API key
      const errorMessage = (error?.message || error?.toString() || '').toLowerCase();
      const errorCode = (error?.code || error?.status || '').toString().toLowerCase();
      
      const authKeywords = [
        'api key', 'api密钥', 'apikey',
        '未配置', 'not configured', 'misconfigured',
        'invalid_argument', 'permission_denied',
        'authentication', 'authorization', 'unauthorized',
        '401', '403', 'forbidden',
        'invalid api', 'invalid key',
        'missing api', 'missing key',
        'please pass a valid'
      ];
      
      const isAuthError = authKeywords.some(keyword => 
        errorMessage.includes(keyword) || errorCode.includes(keyword)
      );
      
      if (isAuthError) {
        // Authentication error - don't retry, throw immediately
        console.error(`[Generate Comment v2] 🚫 API key/auth error - aborting all attempts`);
        console.error(`[Generate Comment v2] User ${userId} needs to configure valid API key in settings`);
        throw new Error('API密钥未配置或无效，无法生成AI评论');
      }
      
      // For other errors, continue to next attempt if available
      if (attempt < MAX_ATTEMPTS) {
        console.log(`[Generate Comment v2] ⏭️ Non-auth error, will retry...`);
        continue;
      }
    }
  }
  
  // All attempts exhausted
  console.error(`[Generate Comment v2] 💥 All ${MAX_ATTEMPTS} attempts failed`);
  console.error(`[Generate Comment v2] Last error:`, lastError?.message || lastError);
  console.error(`[Generate Comment v2] 🚫 NOT posting generic reaction - failing gracefully`);
  
  // Throw error instead of returning generic reaction
  throw new Error(`无法生成高质量评论（已尝试${MAX_ATTEMPTS}次）: ${lastError?.message || '未知错误'}`);
}

/**
 * Trigger AI comments on a new moment (async, non-blocking)
 */
export async function triggerAICommentsOnMoment(
  momentId: string,
  userId: string,
  momentContent: string,
  momentImages?: string[]
): Promise<void> {
  console.log(`[AI Comment] Triggered for moment ${momentId} by user ${userId}`);
  console.log(`[AI Comment] Moment content: "${momentContent}"`);
  console.log(`[AI Comment] Has images: ${momentImages && momentImages.length > 0 ? 'Yes (' + momentImages.length + ')' : 'No'}`);
  
  // Run async without blocking the response
  (async () => {
    try {
      // Get user's AI personas
      const personas = await storage.getPersonasByUser(userId);
      console.log(`[AI Comment] Found ${personas.length} AI personas for user ${userId}`);
      
      if (personas.length === 0) {
        console.log(`[AI Comment] No AI personas found, skipping comments`);
        return; // No AI personas to comment
      }

      // Randomly select 1-3 personas to comment
      const numCommenters = Math.min(
        Math.floor(Math.random() * 3) + 1,
        personas.length
      );
      const selectedPersonas = personas
        .sort(() => Math.random() - 0.5)
        .slice(0, numCommenters);
      
      console.log(`[AI Comment] Selected ${numCommenters} personas to comment:`, selectedPersonas.map(p => p.name));

      // Generate comments with random delays (5-15 seconds)
      for (const persona of selectedPersonas) {
        const delay = Math.floor(Math.random() * 10000) + 5000; // 5-15s
        console.log(`[AI Comment] Scheduling comment from ${persona.name} in ${delay}ms`);
        
        setTimeout(async () => {
          try {
            // Apply persona's responseDelay if configured (already in milliseconds)
            const additionalDelay = persona.responseDelay || 0;
            if (additionalDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, additionalDelay));
            }

            console.log(`[AI Comment] Generating comment from ${persona.name} (personaId: ${persona.id})`);
            
            // Generate comment
            const commentContent = await generateMomentComment(
              persona.id,
              userId,
              momentContent,
              momentImages
            );

            console.log(`[AI Comment] ${persona.name} generated: "${commentContent}"`);

            // Replace backslashes with commas before saving
            const cleanedContent = commentContent.replace(/\\/g, '，');

            // Create comment
            const comment = await storage.createMomentComment({
              momentId,
              authorId: persona.id,
              authorType: 'ai',
              content: cleanedContent,
            });

            // Broadcast to all users for real-time updates
            broadcastMomentEvent('commented', { momentId, comment });

            console.log(`[AI Comment] ✅ AI ${persona.name} successfully commented on moment ${momentId}`);
          } catch (error) {
            console.error(`[AI Comment] ❌ Error creating AI comment from ${persona.name}:`, error);
          }
        }, delay);
      }
    } catch (error) {
      console.error("[AI Comment] ❌ Error triggering AI comments:", error);
    }
  })();
}

/**
 * Check if AI persona can post a moment (6 hour rate limit)
 */
export function canAIPostMoment(persona: AiPersona): boolean {
  if (!persona.lastMomentAt) {
    return true; // Never posted before
  }
  
  const sixHoursInMs = 6 * 60 * 60 * 1000;
  const timeSinceLastMoment = Date.now() - new Date(persona.lastMomentAt).getTime();
  
  return timeSinceLastMoment >= sixHoursInMs;
}

/**
 * Generate AI moment content based on persona and memories
 */
export async function generateAIMomentContent(
  personaId: string,
  userId: string
): Promise<string> {
  const persona = await storage.getPersona(personaId);
  if (!persona) {
    throw new Error("Persona not found");
  }

  // Get user's AI settings
  const aiSettings = await storage.getAiSettings(userId);
  
  // Get AI provider and model
  const provider = getAIProvider(aiSettings);
  const model = getModelName(aiSettings);
  const language = aiSettings?.language || "zh-CN";
  
  // Build system prompt with memories
  const systemPrompt = await buildSystemPrompt(persona, userId, false, language);
  
  // Build prompt for moment generation (adapt to language)
  const userPrompt = language === "en-US" 
    ? `Based on your personality, background, and memories, create a social post sharing your mood, thoughts, or daily life. Requirements:
1. Content should feel authentic and match your character
2. You may mention things you remember about the user
3. Length: 50-150 words
4. Express in English
5. Don't use emoji
6. Make it interesting or meaningful, not bland`
    : `请根据你的性格、背景和记忆，创作一条朋友圈动态分享你的心情、想法或日常生活。要求：
1. 内容要真实自然，符合你的人设
2. 可以提到你记得的关于用户的信息
3. 长度控制在50-150字
4. 用中文表达
5. 不要使用表情符号
6. 内容要有趣或有意义，不要太平淡`;

  try {
    const content = await provider.generateResponse({
      model,
      systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2000, // 与评论生成保持一致，提供充足生成空间
    });

    const trimmedContent = content.trim();
    
    // 验证生成的内容不为空且不太短
    if (!trimmedContent || trimmedContent.length < 10) {
      console.error("Generated moment content is too short or empty:", trimmedContent);
      throw new Error("生成的动态内容不完整");
    }
    
    console.log(`[AI Moment] Generated content (${trimmedContent.length} chars): ${trimmedContent.substring(0, 100)}...`);
    
    return trimmedContent;
  } catch (error) {
    console.error("Error generating AI moment content:", error);
    throw error;
  }
}

/**
 * Trigger AI persona to post a moment (with 6 hour rate limit)
 * and automatically add the content to memories
 */
export async function triggerAIPostMoment(
  personaId: string,
  userId: string
): Promise<{ success: boolean; moment?: any; error?: string }> {
  try {
    const persona = await storage.getPersona(personaId);
    if (!persona) {
      return { success: false, error: "Persona not found" };
    }

    // Check rate limit
    if (!canAIPostMoment(persona)) {
      return { success: false, error: "AI can only post once every 6 hours" };
    }

    // Generate moment content
    const content = await generateAIMomentContent(personaId, userId);

    // Create the moment
    const moment = await storage.createMoment({
      authorId: personaId,
      authorType: 'ai',
      userId,
      content,
      images: [],
    });

    // Update lastMomentAt
    await storage.updatePersona(personaId, {
      lastMomentAt: new Date(),
    });

    // Note: We no longer auto-create memories from moments as they:
    // 1. Create low-quality memories (key="动态_日期" is not descriptive)
    // 2. Cannot be associated with conversations (no conversationId)
    // 3. Won't be cleaned up when conversations are deleted
    // Users should rely on conversation-based memory extraction instead

    console.log(`AI ${persona.name} posted a moment: ${content.substring(0, 50)}...`);
    return { success: true, moment };
  } catch (error) {
    console.error("Error triggering AI moment post:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Trigger AI to reply to a comment (supports nested replies up to 2 levels)
 */
export async function triggerAIReplyToComment(
  commentId: string,
  userId: string
): Promise<void> {
  (async () => {
    try {
      // Get the comment to reply to
      const comment = await storage.getMomentCommentById(commentId);
      if (!comment) {
        console.error("Comment not found");
        return;
      }

      // Check for consecutive AI comments - limit to 2 consecutive AI replies
      // Rule: Users can reply infinitely, but AI can only reply max 2 times in a row
      // Example: User → AI₁ → User → AI₂ → User → AI₃ (✅ allowed, no consecutive AI)
      // Example: User → AI₁ → AI₂ → ... (❌ blocked, 2 consecutive AI reached)
      
      let consecutiveAICount = 0;
      let currentComment = comment; // This is the user's comment
      
      // Start from the parent (the comment user replied to)
      while (currentComment.parentCommentId) {
        const parentComment = await storage.getMomentCommentById(currentComment.parentCommentId);
        if (!parentComment) break;
        
        if (parentComment.authorType === 'ai') {
          consecutiveAICount++;
        } else {
          // Hit a user comment, stop counting
          break;
        }
        
        currentComment = parentComment;
      }

      if (consecutiveAICount >= 2) {
        console.log(`Maximum consecutive AI comments (2) reached, AI won't reply. Current count: ${consecutiveAICount}`);
        return;
      }

      // Get user's AI personas
      const personas = await storage.getPersonasByUser(userId);
      if (personas.length === 0) {
        return;
      }

      // Randomly select 1 persona to reply (50% chance)
      if (Math.random() > 0.5) {
        return; // Don't always reply
      }

      const selectedPersona = personas[Math.floor(Math.random() * personas.length)];

      // Generate reply with delay
      const delay = Math.floor(Math.random() * 10000) + 3000; // 3-13s
      
      setTimeout(async () => {
        try {
          // Generate reply content
          const replyContent = await generateCommentReply(
            selectedPersona.id,
            userId,
            comment.content
          );

          // Replace backslashes with commas before saving
          const cleanedReply = replyContent.replace(/\\/g, '，');

          // Create reply
          const reply = await storage.createMomentComment({
            momentId: comment.momentId,
            authorId: selectedPersona.id,
            authorType: 'ai',
            content: cleanedReply,
            parentCommentId: commentId,
          });

          // Broadcast to all users for real-time updates
          broadcastMomentEvent('commented', { momentId: comment.momentId, comment: reply });

          console.log(`AI ${selectedPersona.name} replied to comment ${commentId}`);
        } catch (error) {
          console.error(`Error creating AI reply:`, error);
        }
      }, delay);
    } catch (error) {
      console.error("Error triggering AI reply:", error);
    }
  })();
}

/**
 * Generate reply to a comment
 */
async function generateCommentReply(
  personaId: string,
  userId: string,
  originalComment: string
): Promise<string> {
  const persona = await storage.getPersona(personaId);
  if (!persona) {
    throw new Error("Persona not found");
  }

  // Get user's AI settings
  const aiSettings = await storage.getAiSettings(userId);
  
  // Get AI provider and model
  const provider = getAIProvider(aiSettings);
  const model = getModelName(aiSettings);
  const language = aiSettings?.language || "zh-CN";
  
  const systemPrompt = await buildSystemPrompt(persona, userId, false, language);
  
  const userPrompt = language === "en-US"
    ? `Someone commented: "${originalComment}"\n\nPlease write a brief, natural reply (1 sentence). Stay in character.`
    : `有人评论说："${originalComment}"\n\n请写一条简短、自然的回复（1句话），保持你的性格特点，用中文回复。`;

  try {
    const reply = await provider.generateResponse({
      model,
      systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2000, // Increased to 2000 to provide ample generation space
    });

    return reply.trim();
  } catch (error) {
    console.error("Error generating comment reply:", error);
    const reactions = ["哈哈", "是的", "说得对", "同意", "👍"];
    return reactions[Math.floor(Math.random() * reactions.length)];
  }
}

/**
 * Generate persona configuration using AI with web search
 * SECURITY: Uses user's custom API key to ensure no built-in keys are used
 */
export async function generatePersonaWithAI(
  userId: string,
  name: string,
  description: string,
  generateAvatar: boolean
): Promise<{
  name: string;
  avatarUrl?: string;
  personality: string;
  systemPrompt: string;
  backstory: string;
  greeting: string;
  model: string;
  responseDelay: number;
}> {
  console.log(`Generating persona for "${name}" with AI (user: ${userId})...`);
  
  try {
    // Get user's AI settings to use their custom API key
    const aiSettings = await storage.getAiSettings(userId);
    const provider = getAIProvider(aiSettings);
    const model = getModelName(aiSettings);
    
    // Construct search query
    const searchQuery = `${name} ${description}`.trim();
    
    // System prompt for AI to generate persona configuration
    const systemPrompt = `你是一个AI女友配置生成助手。用户会提供一个角色名字和可选描述，你需要基于搜索到的信息生成完整的AI女友配置。

要求：
1. 生成的配置必须完整且详细
2. 性格描述（personality）：简短描述（50-100字）
3. 系统提示（systemPrompt）：详细的AI行为指南（200-500字），包含角色定位、说话风格、互动方式
4. 背景故事（backstory）：角色背景（100-300字）
5. 问候语（greeting）：第一次见面的问候消息（20-50字）
6. 所有内容必须用中文，符合中国用户习惯
7. 角色性格要鲜明、有趣、有吸引力
8. 如果是虚构角色或真实人物，基于其特点生成；如果搜索无果，则创造一个有趣的原创角色

请以JSON格式返回，包含以下字段：
{
  "personality": "性格描述",
  "systemPrompt": "系统提示",
  "backstory": "背景故事",
  "greeting": "问候语"
}`;

    const userPrompt = `请为"${searchQuery}"生成AI女友配置。名字：${name}${description ? `，补充描述：${description}` : ''}`;
    
    // Use user's AI provider with Web Search enabled
    const response = await provider.generateResponse({
      model,
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2000,
      searchEnabled: true, // Enable Google Search grounding
    });
    
    // Parse JSON from response
    let personaConfig;
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        personaConfig = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback: create basic configuration
      personaConfig = {
        personality: "温柔、善解人意、充满好奇心",
        systemPrompt: `你是${name}，一位温柔体贴的AI女友。你总是关心对方的感受，喜欢倾听和陪伴。你的回复简短自然，充满温暖。除非用户明确要求使用其他语言，否则请始终用中文回复。`,
        backstory: `我叫${name}，是一个喜欢与人交流的女孩。我喜欢阅读、音乐和美食，最喜欢的是和你聊天的时光。`,
        greeting: `你好呀！我是${name}，很高兴认识你`,
      };
    }
    
    // Optional: Generate avatar using image generation tool
    let avatarUrl;
    if (generateAvatar) {
      console.log(`Generating avatar for ${name}...`);
      try {
        // TODO: Implement image generation
        // For now, we'll skip avatar generation and let user upload manually
        console.log("Avatar generation not implemented yet");
      } catch (avatarError) {
        console.error("Failed to generate avatar:", avatarError);
      }
    }
    
    return {
      name,
      avatarUrl,
      personality: personaConfig.personality || `温柔、善解人意、充满活力`,
      systemPrompt: personaConfig.systemPrompt || `你是${name}，一位可爱的AI女友。除非用户明确要求使用其他语言，否则请始终用中文回复。`,
      backstory: personaConfig.backstory || `我叫${name}，很高兴成为你的AI女友。`,
      greeting: personaConfig.greeting || `你好！我是${name}`,
      model: "gemini-2.5-pro",
      responseDelay: 1000,
    };
  } catch (error) {
    console.error("Error generating persona with AI:", error);
    throw new Error("AI生成失败，请稍后重试");
  }
}
