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
  private client: GoogleGenAI | null = null;
  private isConfigured: boolean = false;

  constructor(customApiKey?: string | null) {
    // Priority: customApiKey > Replit AI Integrations
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    if (customApiKey) {
      // User provided custom API key - use official Google AI API
      apiKey = customApiKey;
      baseUrl = "https://generativelanguage.googleapis.com/v1beta";
      console.log("Using custom Google AI API key");
    } else {
      // Fallback to Replit AI Integrations
      baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
      apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      
      if (!baseUrl || !apiKey) {
        console.error("❌ CRITICAL: No API key available. User MUST provide custom API key in settings.");
        this.isConfigured = false;
        return;
      }
      console.log("Using Replit AI Integrations (Gemini)");
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
    } catch (error) {
      console.error("Failed to initialize Gemini client:", error);
      this.isConfigured = false;
    }
  }

  async generateResponse(params: GenerateParams): Promise<string> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥，或联系管理员配置Replit AI集成。");
    }

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
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥，或联系管理员配置Replit AI集成。");
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
}

// OpenAI Provider (using Replit AI Integrations)
export class OpenAIProvider implements AIProvider {
  private client: OpenAI | null = null;
  private isConfigured: boolean = false;

  constructor(customApiKey?: string | null) {
    // Priority: customApiKey > Replit AI Integrations
    let apiKey: string | undefined;
    let baseURL: string | undefined;

    if (customApiKey) {
      // User provided custom API key - use official OpenAI API
      apiKey = customApiKey;
      baseURL = "https://api.openai.com/v1";
      console.log("Using custom OpenAI API key");
    } else {
      // Fallback to Replit AI Integrations
      baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

      if (!baseURL || !apiKey) {
        console.error("❌ CRITICAL: No API key available. User MUST provide custom API key in settings.");
        this.isConfigured = false;
        return;
      }
      console.log("Using Replit AI Integrations (OpenAI)");
    }

    // Initialize client
    try {
      this.client = new OpenAI({
        baseURL,
        apiKey,
      });
      this.isConfigured = true;
    } catch (error) {
      console.error("Failed to initialize OpenAI client:", error);
      this.isConfigured = false;
    }
  }

  async generateResponse(params: GenerateParams): Promise<string> {
    if (!this.isConfigured || !this.client) {
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥，或联系管理员配置Replit AI集成。");
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
      throw new Error("AI服务未配置。请前往设置页面配置您的API密钥，或联系管理员配置Replit AI集成。");
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
