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
