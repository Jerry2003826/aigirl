import type { ConversationMessage, ImageData } from "./providers";

type OpenAIMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIMessageContentPart[];
};

export type OpenAIChatCompletionRequest = {
  model?: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
};

export type ParsedOpenAIChatRequest = {
  model?: string;
  messages: OpenAIChatMessage[];
  stream: boolean;
  maxTokens?: number;
};

const DEFAULT_IMAGE_PLACEHOLDER = "[User sent an image]";

const isOpenAIContentPartArray = (
  content: OpenAIChatMessage["content"],
): content is OpenAIMessageContentPart[] => Array.isArray(content);

const parseImageDataUrl = (url: string): ImageData | undefined => {
  if (!url.startsWith("data:")) {
    return undefined;
  }

  const match = url.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return undefined;
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
};

const coerceOpenAIContent = (
  content: OpenAIChatMessage["content"],
): { text: string; imageData?: ImageData } => {
  if (typeof content === "string") {
    return { text: content };
  }

  if (!isOpenAIContentPartArray(content)) {
    return { text: "" };
  }

  const textParts: string[] = [];
  let imageData: ImageData | undefined;

  for (const part of content) {
    if (part.type === "text") {
      if (part.text?.length) {
        textParts.push(part.text);
      }
    } else if (part.type === "image_url" && !imageData) {
      imageData = parseImageDataUrl(part.image_url.url);
    }
  }

  return {
    text: textParts.join("\n").trim(),
    imageData,
  };
};

export const parseOpenAIChatRequest = (
  body: unknown,
): ParsedOpenAIChatRequest => {
  const request = body as OpenAIChatCompletionRequest;
  if (!request?.messages || !Array.isArray(request.messages)) {
    throw new Error("Invalid OpenAI request: messages is required");
  }

  const maxTokens =
    typeof request.max_completion_tokens === "number"
      ? request.max_completion_tokens
      : typeof request.max_tokens === "number"
        ? request.max_tokens
        : undefined;

  return {
    model: request.model,
    messages: request.messages,
    stream: Boolean(request.stream),
    maxTokens,
  };
};

export const buildConversationFromOpenAI = (
  messages: OpenAIChatMessage[],
): {
  systemPrompt: string;
  conversationMessages: ConversationMessage[];
  imageData?: ImageData;
} => {
  const systemPrompts: string[] = [];
  const conversationMessages: ConversationMessage[] = [];
  let imageData: ImageData | undefined;

  for (const message of messages) {
    const { text, imageData: messageImage } = coerceOpenAIContent(
      message.content,
    );

    if (message.role === "system") {
      if (text) {
        systemPrompts.push(text);
      }
      continue;
    }

    if (message.role === "user" || message.role === "assistant") {
      const role = message.role;
      const content =
        text || (messageImage ? DEFAULT_IMAGE_PLACEHOLDER : "");

      if (content) {
        conversationMessages.push({
          role,
          content,
        });
      }

      if (message.role === "user" && messageImage) {
        imageData = messageImage;
      }
    }
  }

  return {
    systemPrompt: systemPrompts.join("\n"),
    conversationMessages,
    imageData,
  };
};

export const getOpenAIStreamText = (chunk: any): string => {
  if (!chunk) {
    return "";
  }

  if (typeof chunk?.text === "string") {
    return chunk.text;
  }

  const openAiDelta = chunk?.choices?.[0]?.delta?.content;
  if (typeof openAiDelta === "string") {
    return openAiDelta;
  }

  const geminiParts = chunk?.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiParts)) {
    return geminiParts
      .map((part: { text?: string }) => part.text || "")
      .join("");
  }

  return "";
};
