import OpenAI from "openai";
import { storage } from "./storage";
import type { AiPersona, Message, InsertMemory } from "@shared/schema";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access
// without requiring your own OpenAI API key. Charges are billed to your Replit credits.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface GenerateResponseOptions {
  conversationId: string;
  personaId: string;
  userMessage: string;
  contextLimit?: number;
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
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  const messages = await storage.getMessagesByConversation(conversationId, limit, 0);
  
  // Convert messages to OpenAI format (reverse to chronological order)
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
  systemPrompt += `\n\nYour personality: ${persona.personality}`;
  
  // Add backstory if available
  if (persona.backstory) {
    systemPrompt += `\n\nYour backstory: ${persona.backstory}`;
  }
  
  // Fetch and add relevant memories
  const memories = await storage.getMemoriesByPersona(persona.id, userId);
  if (memories.length > 0) {
    systemPrompt += "\n\nThings you remember about the user:";
    memories.forEach((memory) => {
      systemPrompt += `\n- ${memory.key}: ${memory.value}`;
      if (memory.context) {
        systemPrompt += ` (${memory.context})`;
      }
    });
  }
  
  return systemPrompt;
}

/**
 * Generate AI response for a conversation
 */
export async function generateAIResponse(
  options: GenerateResponseOptions
): Promise<string> {
  const { conversationId, personaId, userMessage, contextLimit = 20 } = options;
  
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
  
  // Build system prompt with personality and memories
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId);
  
  // Build conversation context
  const conversationHistory = await buildConversationContext(
    conversationId,
    personaId,
    contextLimit
  );
  
  // Prepare messages for OpenAI (conversationHistory already includes latest user message)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...conversationHistory,
  ];
  
  // Apply response delay if specified
  if (persona.responseDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, persona.responseDelay));
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: persona.model || "gpt-4o",
      messages,
      max_completion_tokens: 8192,
    });
    
    return response.choices[0]?.message?.content || "";
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
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const { conversationId, personaId, userMessage, contextLimit = 20 } = options;
  
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
  
  // Build system prompt with personality and memories
  const systemPrompt = await buildSystemPrompt(persona, conversation.userId);
  
  // Build conversation context
  const conversationHistory = await buildConversationContext(
    conversationId,
    personaId,
    contextLimit
  );
  
  // Prepare messages for OpenAI (conversationHistory already includes latest user message)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...conversationHistory,
  ];
  
  // Apply response delay if specified
  if (persona.responseDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, persona.responseDelay));
  }
  
  try {
    const stream = await openai.chat.completions.create({
      model: persona.model || "gpt-4o",
      messages,
      max_completion_tokens: 8192,
      stream: true,
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
    
    const selectionPrompt = `Given the following AI personas in a group chat and the user's latest message, determine which persona would be most appropriate to respond. Consider:
1. The content and tone of the user's message
2. Each persona's personality and expertise
3. Natural conversation flow (avoid having the same persona respond multiple times in a row)
4. Fair rotation (prefer personas who have responded less recently)

Personas:
${personaDescriptions}

Recent response counts:
${Object.entries(responseCounts).map(([id, count]) => {
  const persona = personas.find(p => p?.id === id);
  return `${persona?.name}: ${count} recent responses`;
}).join("\n")}

User's message: "${userMessage}"

Respond with ONLY the persona ID (the alphanumeric string) of the most appropriate persona to respond. Do not include any explanation.`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a conversation moderator that selects the most appropriate AI persona to respond in a group chat. Always respond with ONLY the persona ID, nothing else."
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
    
    const extractionPrompt = `Analyze the following conversation and extract any important information about the user that should be remembered for future conversations. This includes:
- Personal details (name, age, location, occupation, etc.)
- Preferences and interests
- Important life events or experiences
- Goals, challenges, or concerns
- Relationships and family
- Hobbies and activities

Only extract information that is clearly stated by the user. Do not make assumptions or inferences.

Recent conversation context:
${contextMessages}

Latest exchange:
User: ${userMessage}
AI: ${aiResponse}

Respond with a JSON array of memory objects. Each memory should have:
- key: A brief category or identifier (e.g., "occupation", "favorite_food", "pet_name")
- value: The specific information to remember
- context: Optional additional context about when/how this was mentioned

If no new memories should be extracted, respond with an empty array [].

Example response:
[
  {
    "key": "occupation",
    "value": "software engineer",
    "context": "mentioned while discussing work stress"
  },
  {
    "key": "favorite_book",
    "value": "The Great Gatsby",
    "context": "user's all-time favorite"
  }
]`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a memory extraction system. Extract important user information from conversations and format them as JSON. Always respond with valid JSON only, no additional text."
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
  let userPrompt = `The user just posted this moment:\n"${momentContent}"`;
  
  if (momentImages && momentImages.length > 0) {
    userPrompt += `\n\nThey also shared ${momentImages.length} image(s).`;
  }
  
  userPrompt += `\n\nWrite a friendly, natural comment (1-2 sentences) responding to their post. Be authentic to your personality. Use Chinese if appropriate.`;

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
