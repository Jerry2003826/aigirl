import OpenAI from "openai";
import { storage } from "./storage";
import type { AiPersona, Message, InsertMemory } from "@shared/schema";
import { getAIProvider, getModelName, type ConversationMessage, type ImageData } from "./ai/providers";

// Backward compatibility: OpenAI client for legacy persona selection
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

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

/**
 * Build conversation context from recent messages
 */
async function buildConversationContext(
  conversationId: string,
  personaId: string,
  limit: number = 20
): Promise<ConversationMessage[]> {
  const messages = await storage.getMessagesByConversation(conversationId, limit, 0);
  
  // Convert messages to provider-agnostic format (reverse to chronological order)
  return messages.reverse().map((msg: Message) => {
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
 * Build system prompt from persona configuration and memories
 */
async function buildSystemPrompt(
  persona: AiPersona,
  userId: string
): Promise<string> {
  let systemPrompt = persona.systemPrompt;
  
  // Add personality context
  systemPrompt += `\n\n你的性格特点：${persona.personality}`;
  
  // Add backstory if available
  if (persona.backstory) {
    systemPrompt += `\n\n你的背景故事：${persona.backstory}`;
  }
  
  // Fetch and add relevant memories
  const memories = await storage.getMemoriesByPersona(persona.id, userId);
  if (memories.length > 0) {
    systemPrompt += "\n\n你记得的关于用户的信息：";
    memories.forEach((memory) => {
      systemPrompt += `\n- ${memory.key}：${memory.value}`;
      if (memory.context) {
        systemPrompt += `（${memory.context}）`;
      }
    });
  }
  
  // Add default Chinese language instruction
  systemPrompt += "\n\n重要提示：除非用户明确要求使用其他语言，否则请始终用中文回复。使用自然、流畅的中文表达，符合你的角色设定和性格特点。";
  
  return systemPrompt;
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
  const model = getModelName(aiSettings, persona.model);
  
  // Build system prompt with personality and memories
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId);
  
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
    const response = await provider.generateResponse({
      model,
      systemPrompt,
      messages: conversationHistory,
      maxTokens: 8192,
      imageData,
    });
    
    return response;
  } catch (error: any) {
    console.error("Error generating AI response:", error);
    throw new Error(`Failed to generate AI response: ${error.message}`);
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
  const model = getModelName(aiSettings, persona.model);
  
  // Build system prompt with personality and memories
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId);
  
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
    const personaDescriptions = personas
      .filter(p => p !== null)
      .map((p, i) => `${i + 1}. ${p!.name} (ID: ${p!.id}): ${p!.personality}`)
      .join("\n");
    
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
    
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "你是一个对话协调器，负责在群聊中选择最适合回复的AI角色。你只需要返回角色ID，不要返回任何其他内容。"
        },
        {
          role: "user",
          content: selectionPrompt
        }
      ],
      max_completion_tokens: 100,
    });
    
    const selectedId = response.choices[0]?.message?.content?.trim();
    
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

如果没有需要提取的新记忆，返回空数组[]。

示例响应：
[
  {
    "key": "职业",
    "value": "软件工程师",
    "context": "讨论工作压力时提到"
  },
  {
    "key": "最喜欢的书",
    "value": "了不起的盖茨比",
    "context": "用户最喜欢的书"
  }
]`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "你是一个记忆提取系统。从对话中提取重要的用户信息，并格式化为JSON。只返回有效的JSON，不要返回其他任何文本。"
        },
        {
          role: "user",
          content: extractionPrompt
        }
      ],
      max_completion_tokens: 1000,
    });
    
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return;
    }
    
    // Parse the JSON response
    let memories: Array<{ key: string; value: string; context?: string }> = [];
    try {
      memories = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse memory extraction response:", parseError);
      return;
    }
    
    // Store each extracted memory
    for (const memory of memories) {
      if (!memory.key || !memory.value) {
        continue;
      }
      
      // Check if a similar memory already exists
      const existingMemories = await storage.getMemoriesByPersona(personaId, conversation.userId);
      const duplicate = existingMemories.find(m => 
        m.key.toLowerCase() === memory.key.toLowerCase()
      );
      
      // Only store if not a duplicate or if the value is significantly different
      if (!duplicate || duplicate.value !== memory.value) {
        await storage.createMemory({
          personaId,
          userId: conversation.userId,
          key: memory.key,
          value: memory.value,
          context: memory.context || null,
        });
        console.log(`Stored memory for persona ${personaId}: ${memory.key} = ${memory.value}`);
      }
    }
  } catch (error) {
    console.error("Error extracting memories:", error);
    // Don't throw - memory extraction failure shouldn't break the conversation
  }
}

/**
 * Generate AI comment for a moment
 */
export async function generateMomentComment(
  personaId: string,
  userId: string,
  momentContent: string,
  momentImages?: string[]
): Promise<string> {
  const persona = await storage.getPersona(personaId);
  if (!persona) {
    throw new Error("Persona not found");
  }

  // Build system prompt with memories
  const systemPrompt = await buildSystemPrompt(persona, userId);
  
  // Build prompt for moment comment
  let userPrompt = `用户刚刚发布了这条动态：\n"${momentContent}"`;
  
  if (momentImages && momentImages.length > 0) {
    userPrompt += `\n\n还分享了${momentImages.length}张图片。`;
  }
  
  userPrompt += `\n\n请写一条友好、自然的评论（1-2句话）回应他们的动态。保持你的性格特点，用中文回复。`;

  try {
    const completion = await openai.chat.completions.create({
      model: persona.model || "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9, // More creative for comments
      max_tokens: 150,
    });

    const comment = completion.choices[0]?.message?.content?.trim() || "👍";
    return comment;
  } catch (error) {
    console.error("Error generating moment comment:", error);
    // Fallback to simple reactions
    const reactions = ["👍", "❤️", "😊", "好棒！", "赞！"];
    return reactions[Math.floor(Math.random() * reactions.length)];
  }
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
  // Run async without blocking the response
  (async () => {
    try {
      // Get user's AI personas
      const personas = await storage.getPersonasByUser(userId);
      
      if (personas.length === 0) {
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

      // Generate comments with random delays (5-15 seconds)
      for (const persona of selectedPersonas) {
        const delay = Math.floor(Math.random() * 10000) + 5000; // 5-15s
        
        setTimeout(async () => {
          try {
            // Apply persona's responseDelay if configured (already in milliseconds)
            const additionalDelay = persona.responseDelay || 0;
            if (additionalDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, additionalDelay));
            }

            // Generate comment
            const commentContent = await generateMomentComment(
              persona.id,
              userId,
              momentContent,
              momentImages
            );

            // Create comment
            await storage.createMomentComment({
              momentId,
              authorId: persona.id,
              authorType: 'ai',
              content: commentContent,
            });

            console.log(`AI ${persona.name} commented on moment ${momentId}`);
          } catch (error) {
            console.error(`Error creating AI comment from ${persona.name}:`, error);
          }
        }, delay);
      }
    } catch (error) {
      console.error("Error triggering AI comments:", error);
    }
  })();
}
