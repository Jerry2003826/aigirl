import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { AiSettings } from "@shared/schema";

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
  private client: GoogleGenAI;

  constructor() {
    // Validate required environment variables
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    
    if (!baseUrl || !apiKey) {
      throw new Error("Gemini AI Integrations not configured. Missing AI_INTEGRATIONS_GEMINI_BASE_URL or AI_INTEGRATIONS_GEMINI_API_KEY");
    }

    // This uses Replit AI Integrations - no API key needed, billed to credits
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "",
        baseUrl,
      },
    });
  }

  async generateResponse(params: GenerateParams): Promise<string> {
    const { model, systemPrompt, messages, maxTokens = 8192, imageData, ragContext, searchEnabled } = params;

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
      const response = await this.client.models.generateContent({
        model: model || "gemini-2.5-pro", // Default to gemini-2.5-pro
        contents,
        config,
      });

      return response.text || "";
    } catch (error: any) {
      console.error("Gemini API error:", error);
      throw new Error(`Gemini generation failed: ${error.message}`);
    }
  }

  async generateResponseStream(params: GenerateParams): Promise<AsyncIterable<any>> {
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
}

// OpenAI Provider (using Replit AI Integrations)
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    // This uses Replit AI Integrations for OpenAI
    this.client = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });
  }

  async generateResponse(params: GenerateParams): Promise<string> {
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

  if (provider === "google") {
    return new GeminiProvider();
  } else if (provider === "openai") {
    return new OpenAIProvider();
  } else {
    // Fallback to Google Gemini
    return new GeminiProvider();
  }
}

// Get model name from settings or persona
export function getModelName(settings?: AiSettings, personaModel?: string): string {
  // Priority: persona model > settings model > default
  if (personaModel) {
    return personaModel;
  }
  if (settings?.model) {
    return settings.model;
  }
  // Default to gemini-2.5-pro
  return "gemini-2.5-pro";
}
