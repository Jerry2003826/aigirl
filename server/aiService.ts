import OpenAI from "openai";
import { storage } from "./storage";
import type { AiPersona, Message } from "@shared/schema";

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
  
  try {
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-5",
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
  
  try {
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    const stream = await openai.chat.completions.create({
      model: "gpt-5",
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
