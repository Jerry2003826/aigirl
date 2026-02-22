/**
 * Split AI response into message parts for natural conversation flow.
 * Uses double newline (paragraph break) only - never split by / or \ to avoid breaking URLs, dates, paths.
 */
export function splitAiResponse(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
