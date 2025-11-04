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
 * Build system prompt from persona configuration (without memories for RAG mode)
 */
async function buildSystemPrompt(
  persona: AiPersona,
  userId: string,
  ragEnabled: boolean = false
): Promise<string> {
  let systemPrompt = persona.systemPrompt;
  
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
    if (memories.length > 0) {
      systemPrompt += "\n\n你记得的关于用户的信息：";
      memories.forEach((memory) => {
        systemPrompt += `\n- ${memory.key}：${memory.value}`;
        if (memory.context) {
          systemPrompt += `（${memory.context}）`;
        }
      });
    }
  } else {
    // In RAG mode, inform AI that knowledge base will be provided in the message
    systemPrompt += "\n\n你拥有一个关于用户的记忆知识库。当用户提问时，系统会自动从知识库中检索相关记忆并提供给你。请优先使用这些知识库内容来理解用户和生成回复。";
  }
  
  // Add default Chinese language instruction
  systemPrompt += "\n\n重要提示：除非用户明确要求使用其他语言，否则请始终用中文回复。使用自然、流畅的中文表达，符合你的角色设定和性格特点。";
  
  // Add fixed conversation rules
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
  
  return systemPrompt;
}

/**
 * Build RAG context from memories (when RAG is enabled)
 */
async function buildRAGContext(
  personaId: string,
  userId: string
): Promise<string> {
  const memories = await storage.getMemoriesByPersona(personaId, userId);
  
  if (memories.length === 0) {
    return "（知识库里没有找到相关记忆）";
  }
  
  // Format memories as RAG documents
  return memories
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
  const model = getModelName(aiSettings, persona.model);
  
  // Check if RAG and Search are enabled
  const ragEnabled = aiSettings?.ragEnabled || false;
  const searchEnabled = aiSettings?.searchEnabled || false;
  
  // Build system prompt with personality (and memories if RAG is disabled)
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId, ragEnabled);
  
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
    const response = await provider.generateResponse({
      model,
      systemPrompt,
      messages: conversationHistory,
      maxTokens: 8192,
      imageData,
      ragContext,
      searchEnabled,
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
  
  // Check if RAG and Search are enabled
  const ragEnabled = aiSettings?.ragEnabled || false;
  const searchEnabled = aiSettings?.searchEnabled || false;
  
  // Build system prompt with personality (and memories if RAG is disabled)
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId, ragEnabled);
  
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
  let userPrompt = `用户刚刚发布了这条动态：\n"${momentContent}"\n\n请写一条友好、自然的评论（1-2句话）回应他们的动态。保持你的性格特点，用中文回复。`;

  try {
    // Check if model supports vision and images are provided
    const modelName = persona.model || "gpt-4o"; // Default model
    const isGeminiModel = modelName.includes('gemini');
    const isOpenAIVisionModel = modelName.startsWith('gpt-4');
    const isVisionModel = isOpenAIVisionModel || isGeminiModel;
    
    if (momentImages && momentImages.length > 0 && isVisionModel) {
      // Use vision capability for models that support it
      if (isGeminiModel) {
        // Use Gemini vision
        const parts: any[] = [
          { text: `${systemPrompt}\n\n${userPrompt}` }
        ];
        
        // Add images
        for (const imageUrl of momentImages) {
          if (imageUrl.startsWith('data:image')) {
            // Base64 image
            const match = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: `image/${match[1]}`,
                  data: match[2]
                }
              });
            }
          }
        }
        
        const result = await gemini.generateContent({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 150,
          },
        });
        
        const comment = result.response.text()?.trim() || "好棒！";
        return comment;
      } else {
        // Use OpenAI vision (gpt-4o, gpt-4-turbo, gpt-4o-mini, etc.)
        const content: any[] = [{ type: "text", text: userPrompt }];
        
        for (const imageUrl of momentImages) {
          // OpenAI only accepts absolute URLs or base64 data URLs
          if (imageUrl.startsWith('data:image') || imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            content.push({
              type: "image_url",
              image_url: { url: imageUrl }
            });
          } else {
            console.warn(`Skipping relative image URL for OpenAI vision: ${imageUrl}`);
          }
        }
        
        // Only send images if we have valid ones
        const completion = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: content.length > 1 ? content : userPrompt }
          ],
          temperature: 0.9,
          max_tokens: 150,
        });
        
        const comment = completion.choices[0]?.message?.content?.trim() || "好棒！";
        return comment;
      }
    } else {
      // No images or non-vision model, use text-only
      if (momentImages && momentImages.length > 0) {
        userPrompt = `用户刚刚发布了这条动态：\n"${momentContent}"\n\n还分享了${momentImages.length}张图片。\n\n请写一条友好、自然的评论（1-2句话）回应他们的动态。保持你的性格特点，用中文回复。`;
      }
      
      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 150,
      });

      const comment = completion.choices[0]?.message?.content?.trim() || "好棒！";
      return comment;
    }
  } catch (error) {
    console.error("Error generating moment comment:", error);
    // Fallback to simple reactions (no emoji)
    const reactions = ["好棒！", "赞！", "真不错！", "支持你！"];
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
  const model = getModelName(aiSettings, persona.model);
  
  // Build system prompt with memories
  const systemPrompt = await buildSystemPrompt(persona, userId);
  
  // Build prompt for moment generation
  const userPrompt = `请根据你的性格、背景和记忆，创作一条朋友圈动态分享你的心情、想法或日常生活。要求：
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
      maxTokens: 300,
    });

    return content.trim();
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

    // Extract and store memory about this moment
    try {
      const memoryKey = `动态_${new Date().toISOString().split('T')[0]}`;
      const memoryValue = content.length > 100 ? content.substring(0, 100) + '...' : content;
      
      await storage.createMemory({
        personaId,
        userId,
        key: memoryKey,
        value: memoryValue,
        context: '我发布的朋友圈动态',
        importance: 6, // Medium importance
      });
      
      console.log(`Stored memory for AI ${persona.name}'s moment`);
    } catch (memError) {
      console.error("Error storing moment memory:", memError);
      // Don't fail the whole operation if memory fails
    }

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

      // Check nesting level - don't allow more than 2 levels
      let nestingLevel = 1;
      let currentComment = comment;
      while (currentComment.parentCommentId) {
        nestingLevel++;
        const parentComment = await storage.getMomentCommentById(currentComment.parentCommentId);
        if (!parentComment) break;
        currentComment = parentComment;
      }

      if (nestingLevel >= 2) {
        console.log("Maximum nesting level (2) reached, AI won't reply");
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

          // Create reply
          await storage.createMomentComment({
            momentId: comment.momentId,
            authorId: selectedPersona.id,
            authorType: 'ai',
            content: replyContent,
            parentCommentId: commentId,
          });

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
  const model = getModelName(aiSettings, persona.model);
  
  const systemPrompt = await buildSystemPrompt(persona, userId);
  
  const userPrompt = `有人评论说："${originalComment}"\n\n请写一条简短、自然的回复（1句话），保持你的性格特点，用中文回复。`;

  try {
    const reply = await provider.generateResponse({
      model,
      systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
      maxTokens: 100,
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
 */
export async function generatePersonaWithAI(
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
  console.log(`Generating persona for "${name}" with AI...`);
  
  try {
    // Import Google Gemini provider
    const { GoogleAI } = await import("./ai/providers");
    const google = new GoogleAI();
    
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
    
    // Use Google Gemini with Web Search
    const response = await google.generateResponse({
      model: "gemini-2.0-flash-exp",
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2000,
      config: {
        tools: [{
          googleSearch: {},
        }],
      },
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
