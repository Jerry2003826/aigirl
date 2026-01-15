import { storage } from './storage';
import { generateAIResponse, ImageData, extractAndStoreMemories, selectMultipleRespondingPersonas } from './aiService';
import { broadcastNewMessage } from './websocket';

const MAX_RETRIES = 3;
const POLL_INTERVAL = 500; // 500ms - very fast polling for quick response
const PROCESSING_LOCK = new Set<string>();

export const AI_INTERACTION_LOCK = new Set<string>();

function parseDataUrl(dataUrl: string): ImageData | undefined {
  if (!dataUrl || !dataUrl.startsWith('data:')) return undefined;
  try {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return undefined;
    return { mimeType: matches[1], base64: matches[2] };
  } catch { return undefined; }
}

let isRunning = false;

export async function startAIReplyWorker() {
  if (isRunning) return;
  isRunning = true;
  console.log('[AI Worker] Started - polling every', POLL_INTERVAL, 'ms');
  processJobsLoop();
}

export function stopAIReplyWorker() {
  isRunning = false;
  console.log('[AI Worker] Stopped');
}

async function processJobsLoop() {
  while (isRunning) {
    try {
      await processNextJob();
    } catch (error) {
      console.error('[AI Worker] Error:', error);
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

async function processNextJob() {
  const job = await storage.getNextPendingJob();
  if (!job || PROCESSING_LOCK.has(job.id)) return;
  
  PROCESSING_LOCK.add(job.id);
  
  try {
    console.log(`[AI Worker] Processing job ${job.id}`);
    await storage.updateJobStatus(job.id, 'processing');
    await storage.incrementJobAttempts(job.id);
    
    const conversation = await storage.getConversation(job.conversationId);
    if (!conversation) {
      await storage.updateJobStatus(job.id, 'failed', 'Conversation not found');
      return;
    }
    
    const messageCountBefore = (conversation.messageCount || 0) - 1;
    
    const userMessage = await storage.getMessage(job.userMessageId);
    if (!userMessage) {
      await storage.updateJobStatus(job.id, 'failed', 'User message not found');
      return;
    }
    
    // Determine responding personas
    let respondingPersonaIds: string[] = [];
    
    if (userMessage.mentionedPersonaId) {
      const participants = await storage.getConversationParticipants(conversation.id);
      if (participants.some(p => p.personaId === userMessage.mentionedPersonaId)) {
        respondingPersonaIds = [userMessage.mentionedPersonaId];
      }
    }
    
    if (respondingPersonaIds.length === 0) {
      if (conversation.isGroup) {
        try {
          respondingPersonaIds = await selectMultipleRespondingPersonas({
            conversationId: conversation.id,
            userMessage: userMessage.content || '[Image]',
          });
        } catch {
          const participants = await storage.getConversationParticipants(conversation.id);
          const valid = participants.filter(p => p.personaId?.trim());
          if (valid.length > 0) {
            respondingPersonaIds = [valid[Math.floor(Math.random() * valid.length)].personaId];
          }
        }
      } else {
        const participants = await storage.getConversationParticipants(conversation.id);
        const persona = participants.find(p => p.personaId?.trim());
        if (persona) respondingPersonaIds = [persona.personaId];
      }
    }
    
    if (respondingPersonaIds.length === 0) {
      await storage.updateJobStatus(job.id, 'failed', 'No personas');
      return;
    }
    
    const imageData = userMessage.imageData ? parseDataUrl(userMessage.imageData) : undefined;
    const allAiMessages: any[] = [];
    
    let lastErrorMessage: string | null = null;

    for (let pIdx = 0; pIdx < respondingPersonaIds.length; pIdx++) {
      const personaId = respondingPersonaIds[pIdx];
      
      // Delay between different AI personas (not the first one)
      if (pIdx > 0) {
        await new Promise(r => setTimeout(r, 1500));
      }
      
      let aiResponse: string;
      try {
        aiResponse = await generateAIResponse({
          conversationId: conversation.id,
          personaId,
          userMessage: userMessage.content || '[Image]',
          imageData,
        });
      } catch (err: any) {
        console.error(`[AI Worker] Failed to generate response:`, err.message);
        lastErrorMessage = err?.message || "AI response failed";
        continue;
      }
      
      const persona = await storage.getPersona(personaId);
      if (!persona) continue;
      
      // Split by backslash delimiter
      const parts = aiResponse.split('\\').map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length === 0) continue;
      
      // Message delay from persona settings (default 1000ms = 1 second)
      const delayMs = persona.responseDelay > 0 ? persona.responseDelay : 1000;
      
      console.log(`[AI Worker] Sending ${parts.length} messages with ${delayMs}ms delay`);
      
      // Process each message: SAVE → BROADCAST → WAIT
      for (let i = 0; i < parts.length; i++) {
        // 1. Save to database
        const msg = await storage.createMessage({
          conversationId: conversation.id,
          senderId: personaId,
          senderType: "ai",
          content: parts[i],
          isRead: false,
          status: "sent",
        });
        allAiMessages.push(msg);
        
        // 2. Broadcast immediately after save
        const msgWithPersona = {
          ...msg,
          personaName: persona.name,
          personaAvatar: persona.avatarUrl
        };
        console.log(`[AI Worker] Broadcasting message ${i + 1}/${parts.length}: "${parts[i].substring(0, 30)}..."`);
        broadcastNewMessage(conversation.id, msgWithPersona);
        
        // 3. Wait before next message (not after last one)
        if (i < parts.length - 1) {
          console.log(`[AI Worker] Waiting ${delayMs}ms before next message`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }

    if (allAiMessages.length === 0) {
      const personaId = respondingPersonaIds[0];
      if (personaId) {
        const persona = await storage.getPersona(personaId);
        const fallbackContent = lastErrorMessage?.includes("API key")
          ? "AI 回复失败：请先在设置中配置有效的 API Key。"
          : "AI 回复失败，请稍后重试或检查模型配置。";
        const msg = await storage.createMessage({
          conversationId: conversation.id,
          senderId: personaId,
          senderType: "ai",
          content: fallbackContent,
          isRead: false,
          status: "sent",
        });
        broadcastNewMessage(conversation.id, {
          ...msg,
          personaName: persona?.name,
          personaAvatar: persona?.avatarUrl,
        });
      }
      await storage.updateJobStatus(job.id, "failed", lastErrorMessage || "No AI response");
      return;
    }
    
    // Trigger AI-to-AI interaction (background)
    if (conversation.isGroup && allAiMessages.length > 0) {
      const lastPersonaId = respondingPersonaIds[respondingPersonaIds.length - 1];
      import('./aiService').then(({ triggerAIInteraction }) => {
        triggerAIInteraction(conversation.id, lastPersonaId).catch(() => {});
      });
    }
    
    // Memory extraction (every 5 messages)
    const updatedConv = await storage.getConversation(conversation.id);
    const countAfter = updatedConv?.messageCount || 0;
    if (Math.floor(countAfter / 5) > Math.floor(messageCountBefore / 5) && allAiMessages.length > 0) {
      const primaryMessages = allAiMessages.filter(m => m.senderId === respondingPersonaIds[0]);
      if (primaryMessages.length > 0) {
        try {
          await extractAndStoreMemories(
            conversation.id,
            respondingPersonaIds[0],
            userMessage.content || '[Image]',
            primaryMessages.map(m => m.content).join(' ')
          );
        } catch {}
      }
    }
    
    await storage.updateJobStatus(job.id, 'completed');
    console.log(`[AI Worker] Job ${job.id} completed - ${allAiMessages.length} messages sent`);
    
  } catch (error: any) {
    console.error(`[AI Worker] Job ${job.id} error:`, error);
    const attempts = job.attempts + 1;
    if (attempts >= MAX_RETRIES) {
      await storage.updateJobStatus(job.id, 'failed', error.message);
    } else {
      await storage.updateJobStatus(job.id, 'pending');
    }
  } finally {
    PROCESSING_LOCK.delete(job.id);
  }
}
