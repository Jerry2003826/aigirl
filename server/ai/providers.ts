import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { AiSettings } from "@shared/schema";

// Function Calling Schema for structured chat responses
const CHAT_RESPONSE_FUNCTION = {
  name: "generate_chat_response",
  description: "生成符合微信聊天风格的分句回复，模拟一句我一句的自然聊天节奏",
  parameters: {
    type: "object",
    properties: {
      phrases: {
        type: "array",
        description: "2-4个简短自然的中文短句，每句话简洁有力，总共不超过50字",
        items: { 
          type: "string",
          description: "一个简短的中文句子，不使用标点符号"
        },
        minItems: 2,
        maxItems: 4
      }
    },
    required: ["phrases"]
  }
};

// AI Provider interface
export interface AIProvider {
  generateResponse(params: GenerateParams): Promise<string>;
  generateResponseStream(params: GenerateParams): Promise<AsyncIterable<any>>;
}

export interface GenerateParams {
  model: string;
  systemPrompt: string;
  messages: ConversationMessage[];
  maxTokens?: number;
  imageData?: ImageData;
  ragContext?: string; // RAG retrieved documents context
  searchEnabled?: boolean; // Enable Google Search grounding
  useFunctionCalling?: boolean; // Use Function Calling for structured output
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ImageData {
  base64: string;
  mimeType: string;
}

// Google Gemini Provider (using Replit AI Integrations - gemini-2.5-pro default)
export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI | null = null;
  private isConfigured: boolean = false;

  constructor(customApiKey?: string | null) {
    // SECURITY: ONLY use user-provided custom API key
    // NO fallback to Replit AI Integrations or any built-in keys
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    if (customApiKey) {
      // User provided custom API key - use official Google AI API
      apiKey = customApiKey;
      baseUrl = "https://generativelanguage.googleapis.com/v1beta";
      console.log("✅ Using user's custom Google AI API key");
    } else {
      // NO FALLBACK - User must provide their own API key
      console.error("❌ CRITICAL: No custom API key provided. User MUST configure their own API key in settings.");
      console.error("   Go to Settings → AI Configuration → Enter your Google AI API key");
      this.isConfigured = false;
      return;
    }

    // Initialize client
    try {
      this.client = new GoogleGenAI({
        apiKey,
        httpOptions: {
          apiVersion: "",
          baseUrl,
        },
      });
      this.isConfigured = true;
      console.log("✅ Google AI client initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Gemini client:", error);
      this.isConfigured = false;
    }
  }

  async generateResponse(params: GenerateParams): Promise<string> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥。");
    }

    const { model, systemPrompt, messages, maxTokens = 8192, imageData, ragContext, searchEnabled, useFunctionCalling = false } = params;

    // Build contents array for Gemini (convert conversation history)
    const contents = [];

    // Add conversation history with proper role mapping
    for (const msg of messages) {
      const parts: any[] = [{ text: msg.content }];
      contents.push({
        role: msg.role === "user" ? "user" : "model", // Gemini uses 'model' instead of 'assistant'
        parts,
      });
    }

    // CRITICAL FIX: Gemini API requires the last message to be from 'user'
    // Remove any trailing 'model' messages
    while (contents.length > 0 && contents[contents.length - 1].role === "model") {
      contents.pop();
    }

    // Ensure at least one user message remains after pruning
    if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
      // No valid user message found - this can happen if conversation starts with persona
      // Fall back to using the triggering message text
      const lastUserContent = messages.filter(m => m.role === "user").pop();
      if (!lastUserContent) {
        throw new Error("No user messages in conversation history");
      }
      
      // Handle image messages or empty content - use placeholder
      const textContent = lastUserContent.content && lastUserContent.content.trim().length > 0
        ? lastUserContent.content
        : "[User sent an image]";
      
      // Reset contents to just the last user message
      contents.length = 0;
      contents.push({
        role: "user",
        parts: [{ text: textContent }]
      });
    }

    // Add RAG context to the last user message if provided
    if (ragContext && contents.length > 0) {
      const lastUserMsg = contents[contents.length - 1];
      if (lastUserMsg.role === "user") {
        // Prepend RAG context to user's question
        const originalText = lastUserMsg.parts[0].text;
        lastUserMsg.parts[0].text = `【本地知识库内容】：
${ragContext}

【用户问题】：
${originalText}`;
      }
    }

    // Add image to last user message if provided
    if (imageData && contents.length > 0) {
      const lastUserMsg = contents[contents.length - 1];
      if (lastUserMsg.role === "user") {
        lastUserMsg.parts.push({
          inlineData: {
            mimeType: imageData.mimeType,
            data: imageData.base64,
          },
        });
      }
    }

    // Build config with optional Google Search grounding and/or Function Calling
    const config: any = {
      systemInstruction: systemPrompt, // System instruction in config
      maxOutputTokens: maxTokens,
    };

    // Build tools array (can include both Function Calling and Google Search)
    const tools: any[] = [];
    
    // Add Function Calling for structured chat responses
    if (useFunctionCalling) {
      tools.push({
        functionDeclarations: [CHAT_RESPONSE_FUNCTION]
      });
      config.toolConfig = {
        functionCallingConfig: {
          mode: "ANY" // Force function call
        }
      };
      console.log('[Gemini API] Function Calling enabled for structured chat response');
    }
    
    // Add Google Search tool if enabled (can coexist with Function Calling)
    if (searchEnabled) {
      tools.push({
        googleSearch: {}, // Enable Google Search grounding
      });
      console.log('[Gemini API] Google Search grounding enabled');
    }
    
    // Only set tools if we have any
    if (tools.length > 0) {
      config.tools = tools;
    }

    try {
      console.log('[Gemini API] Calling generateContent with:', {
        model: model || "gemini-2.5-pro",
        contentsLength: contents.length,
        systemPromptLength: systemPrompt.length,
        maxTokens,
        useFunctionCalling,
      });
      
      const response = await this.client.models.generateContent({
        model: model || "gemini-2.5-pro", // Default to gemini-2.5-pro
        contents,
        config,
      });

      // Log full response for debugging
      console.log('[Gemini API] Response object keys:', Object.keys(response));
      
      // Handle Function Calling response
      if (useFunctionCalling && response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        console.log('[Gemini API] Function Calling candidate:', JSON.stringify(candidate, null, 2));
        
        // Extract function call from candidate
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              const functionCall = part.functionCall;
              console.log('[Gemini API] Function call detected:', functionCall.name);
              console.log('[Gemini API] Function args:', JSON.stringify(functionCall.args, null, 2));
              
              if (functionCall.name === 'generate_chat_response' && functionCall.args?.phrases) {
                const phrases = functionCall.args.phrases;
                if (Array.isArray(phrases) && phrases.length > 0) {
                  // Join phrases with backslash separator
                  const result = phrases.join('\\');
                  console.log('[Gemini API] Function Calling result:', result);
                  return result;
                } else {
                  console.warn('[Gemini API] Invalid phrases array:', phrases);
                }
              }
            }
          }
        }
        
        console.warn('[Gemini API] Function Calling expected but no valid function call found, falling back to text');
      }
      
      // Fallback to regular text response
      console.log('[Gemini API] response.text value:', JSON.stringify(response.text));
      console.log('[Gemini API] response.text length:', response.text?.length || 0);
      
      // Check if response has candidates (for non-function-calling mode)
      if (response.candidates && response.candidates.length > 0) {
        console.log('[Gemini API] candidates[0]:', JSON.stringify(response.candidates[0], null, 2));
      }

      const text = response.text || "";
      console.log('[Gemini API] Final returned text:', text ? `"${text}" (${text.length} chars)` : '(empty)');
      
      return text;
    } catch (error: any) {
      console.error("Gemini API error:", error);
      console.error("Error details:", {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        response: error.response,
      });
      throw new Error(`Gemini generation failed: ${error.message}`);
    }
  }

  async generateResponseStream(params: GenerateParams): Promise<AsyncIterable<any>> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥。");
    }

    const { model, systemPrompt, messages, maxTokens = 8192, imageData, ragContext, searchEnabled } = params;

    // Build contents array
    const contents = [];

    for (const msg of messages) {
      const parts: any[] = [{ text: msg.content }];
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts,
      });
    }

    // Add RAG context to the last user message if provided
    if (ragContext && contents.length > 0) {
      const lastUserMsg = contents[contents.length - 1];
      if (lastUserMsg.role === "user") {
        // Prepend RAG context to user's question
        const originalText = lastUserMsg.parts[0].text;
        lastUserMsg.parts[0].text = `【本地知识库内容】：
${ragContext}

【用户问题】：
${originalText}`;
      }
    }

    // Add image to last user message if provided
    if (imageData && contents.length > 0) {
      const lastUserMsg = contents[contents.length - 1];
      if (lastUserMsg.role === "user") {
        lastUserMsg.parts.push({
          inlineData: {
            mimeType: imageData.mimeType,
            data: imageData.base64,
          },
        });
      }
    }

    // Build config with optional Google Search grounding
    const config: any = {
      systemInstruction: systemPrompt, // System instruction in config
      maxOutputTokens: maxTokens,
    };

    // Add Google Search tool if enabled
    if (searchEnabled) {
      config.tools = [{
        googleSearch: {}, // Enable Google Search grounding
      }];
    }

    try {
      const stream = await this.client.models.generateContentStream({
        model: model || "gemini-2.5-pro",
        contents,
        config,
      });

      return stream;
    } catch (error: any) {
      console.error("Gemini stream error:", error);
      throw new Error(`Gemini stream failed: ${error.message}`);
    }
  }

  /**
   * Generate embedding for a single text using Gemini Embeddings API
   * Model: text-embedding-004 (768 dimensions)
   */
  async embedText(text: string): Promise<number[]> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥。");
    }

    try {
      // Gemini Embeddings API expects 'contents' array with Content objects
      const result = await this.client.models.embedContent({
        model: "text-embedding-004",
        contents: [{
          role: "user",
          parts: [{ text }]
        }]
      });

      // Extract values from first embedding in the embeddings array
      if (!result.embeddings || result.embeddings.length === 0) {
        console.warn("[Gemini Embeddings] No embeddings returned for text:", text.substring(0, 50));
        throw new Error("No embeddings returned from API");
      }
      
      const embedding = result.embeddings[0]?.values || [];
      
      if (embedding.length === 0) {
        console.warn("[Gemini Embeddings] Empty embedding values for text:", text.substring(0, 50));
        throw new Error("Empty embedding values returned from API");
      }
      
      console.log(`[Gemini Embeddings] Successfully generated embedding with ${embedding.length} dimensions`);
      return embedding;
    } catch (error: any) {
      console.error("[Gemini Embeddings] Error:", error?.message || error);
      throw new Error(`Gemini embeddings failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥。");
    }

    try {
      const embeddings = await Promise.all(
        texts.map(text => this.embedText(text))
      );
      return embeddings;
    } catch (error: any) {
      console.error("Gemini batch embeddings error:", error);
      throw new Error(`Gemini batch embeddings failed: ${error.message}`);
    }
  }
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

// OpenAI Provider (using Replit AI Integrations)
export class OpenAIProvider implements AIProvider {
  private client: OpenAI | null = null;
  private isConfigured: boolean = false;

  constructor(customApiKey?: string | null) {
    // SECURITY: ONLY use user-provided custom API key
    // NO fallback to Replit AI Integrations or any built-in keys
    let apiKey: string | undefined;
    let baseURL: string | undefined;

    if (customApiKey) {
      // User provided custom API key - use official OpenAI API
      apiKey = customApiKey;
      baseURL = "https://api.openai.com/v1";
      console.log("✅ Using user's custom OpenAI API key");
    } else {
      // NO FALLBACK - User must provide their own API key
      console.error("❌ CRITICAL: No custom API key provided. User MUST configure their own API key in settings.");
      console.error("   Go to Settings → AI Configuration → Enter your OpenAI API key");
      this.isConfigured = false;
      return;
    }

    // Initialize client
    try {
      this.client = new OpenAI({
        baseURL,
        apiKey,
      });
      this.isConfigured = true;
      console.log("✅ OpenAI client initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize OpenAI client:", error);
      this.isConfigured = false;
    }
  }

  async generateResponse(params: GenerateParams): Promise<string> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥。");
    }

    const { model, systemPrompt, messages, maxTokens = 8192, imageData } = params;

    // Build OpenAI messages
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    // Add conversation history
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isLastUserMessage = i === messages.length - 1 && msg.role === "user";
      
      if (imageData && isLastUserMessage) {
        // Attach image only to the last user message
        openaiMessages.push({
          role: "user",
          content: [
            { type: "text", text: msg.content },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageData.mimeType};base64,${imageData.base64}`,
              },
            },
          ],
        });
      } else {
        openaiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    try {
      const response = await this.client.chat.completions.create({
        model: model || "gpt-4o",
        messages: openaiMessages,
        max_completion_tokens: maxTokens,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error: any) {
      console.error("OpenAI API error:", error);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }

  async generateResponseStream(params: GenerateParams): Promise<AsyncIterable<any>> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥。");
    }

    const { model, systemPrompt, messages, maxTokens = 8192, imageData } = params;

    // Build OpenAI messages
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isLastUserMessage = i === messages.length - 1 && msg.role === "user";
      
      if (imageData && isLastUserMessage) {
        // Attach image only to the last user message
        openaiMessages.push({
          role: "user",
          content: [
            { type: "text", text: msg.content },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageData.mimeType};base64,${imageData.base64}`,
              },
            },
          ],
        });
      } else {
        openaiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    try {
      const stream = await this.client.chat.completions.create({
        model: model || "gpt-4o",
        messages: openaiMessages,
        max_completion_tokens: maxTokens,
        stream: true,
      });

      return stream;
    } catch (error: any) {
      console.error("OpenAI stream error:", error);
      throw new Error(`OpenAI stream failed: ${error.message}`);
    }
  }
}

// Factory function to get the appropriate AI provider
export function getAIProvider(settings?: AiSettings): AIProvider {
  const provider = settings?.provider || "google"; // Default to Google Gemini
  const customApiKey = settings?.customApiKey;

  if (provider === "google") {
    return new GeminiProvider(customApiKey);
  } else if (provider === "openai") {
    return new OpenAIProvider(customApiKey);
  } else {
    // Fallback to Google Gemini
    return new GeminiProvider(customApiKey);
  }
}

// Get model name from user settings only (no persona-specific models)
export function getModelName(settings?: AiSettings): string {
  // Priority: user settings model > default
  if (settings?.model) {
    return settings.model;
  }
  // Default to gemini-2.5-pro
  return "gemini-2.5-pro";
}
