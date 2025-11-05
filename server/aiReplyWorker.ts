import { storage } from './storage';
import { generateAIResponse } from './aiService';
import { broadcastNewMessage } from './websocket';

const MAX_RETRIES = 3;
const POLL_INTERVAL = 3000; // 3 seconds
const PROCESSING_LOCK = new Set<string>(); // In-memory lock to prevent duplicate processing

let isRunning = false;

/**
 * Background worker that processes AI reply jobs
 * Polls database for pending jobs and generates AI responses
 */
export async function startAIReplyWorker() {
  if (isRunning) {
    console.log('[AI Worker] Already running');
    return;
  }
  
  isRunning = true;
  console.log('[AI Worker] Started - polling every', POLL_INTERVAL, 'ms');
  
  // Start the polling loop
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
      console.error('[AI Worker] Error in job processing loop:', error);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

async function processNextJob() {
  // Get next pending job
  const job = await storage.getNextPendingJob();
  
  if (!job) {
    // No pending jobs
    return;
  }
  
  // Check if already processing (prevent duplicates)
  if (PROCESSING_LOCK.has(job.id)) {
    return;
  }
  
  // Acquire lock
  PROCESSING_LOCK.add(job.id);
  
  try {
    console.log(`[AI Worker] Processing job ${job.id} for conversation ${job.conversationId}`);
    
    // Mark as processing
    await storage.updateJobStatus(job.id, 'processing');
    
    // Increment attempts
    await storage.incrementJobAttempts(job.id);
    
    // Get conversation details
    const conversation = await storage.getConversation(job.conversationId);
    if (!conversation) {
      await storage.updateJobStatus(job.id, 'failed', 'Conversation not found');
      return;
    }
    
    // Get user message
    const userMessage = await storage.getMessage(job.userMessageId);
    if (!userMessage) {
      await storage.updateJobStatus(job.id, 'failed', 'User message not found');
      return;
    }
    
    // Determine which AI persona should respond
    let respondingPersonaId: string;
    
    if (conversation.isGroup) {
      // For group chats, select persona based on conversation context
      const participants = await storage.getConversationParticipants(conversation.id);
      // Strict validation: personaId must be non-empty string
      const validParticipants = participants.filter(p => 
        typeof p.personaId === 'string' && p.personaId.trim().length > 0
      );
      
      if (validParticipants.length === 0) {
        await storage.updateJobStatus(job.id, 'failed', 'No valid personas in group conversation');
        return;
      }
      
      // Simple round-robin or random selection
      // TODO: Could use aiService.selectPersonaForGroup for smart selection
      respondingPersonaId = validParticipants[Math.floor(Math.random() * validParticipants.length)].personaId;
    } else {
      // For 1-on-1 chats, use the single participant
      const participants = await storage.getConversationParticipants(conversation.id);
      // Strict validation: personaId must be non-empty string
      const personaParticipant = participants.find(p => 
        typeof p.personaId === 'string' && p.personaId.trim().length > 0
      );
      
      if (!personaParticipant || !personaParticipant.personaId) {
        await storage.updateJobStatus(job.id, 'failed', 'No valid persona in 1-on-1 conversation');
        return;
      }
      
      respondingPersonaId = personaParticipant.personaId;
    }
    
    // Generate AI response
    console.log(`[AI Worker] Generating AI response from persona ${respondingPersonaId}`);
    
    const aiResponse = await generateAIResponse({
      conversationId: conversation.id,
      personaId: respondingPersonaId,
      userMessage: userMessage.content || '[User sent an image]',
    });
    
    // Get persona info for message broadcast
    const persona = await storage.getPersona(respondingPersonaId);
    if (!persona) {
      await storage.updateJobStatus(job.id, 'failed', 'Persona not found');
      return;
    }
    
    // Split AI response by backslash (\) only - this is the intentional delimiter
    // Do NOT split by forward slash (/) as that would break URLs and other content
    const messageParts = aiResponse
      .split('\\')  // Split by backslash only
      .map(part => part.trim())  // Trim whitespace
      .filter(part => part.length > 0);  // Remove empty parts
    
    // Save and broadcast AI messages with 2-3 second random delay between each
    const aiMessages = [];
    if (messageParts.length === 0) {
      // No parts after splitting - check if original response is empty
      const trimmedResponse = aiResponse.trim();
      if (trimmedResponse.length > 0) {
        // Save original response only if it's not empty
        const aiMessage = await storage.createMessage({
          conversationId: conversation.id,
          senderId: respondingPersonaId,
          senderType: "ai",
          content: aiResponse,
          isRead: false,
          status: "sent",
        });
        
        // Add persona info for broadcast
        const messageWithPersona = {
          ...aiMessage,
          personaName: persona.name,
          personaAvatar: persona.avatarUrl
        };
        
        aiMessages.push(aiMessage);
        broadcastNewMessage(conversation.id, messageWithPersona);
      }
    } else {
      // Save and broadcast each part with 2-3 second random delay
      for (let i = 0; i < messageParts.length; i++) {
        if (i > 0) {
          // Wait 2-3 seconds randomly before saving and sending next message
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        }
        
        const aiMessage = await storage.createMessage({
          conversationId: conversation.id,
          senderId: respondingPersonaId,
          senderType: "ai",
          content: messageParts[i],
          isRead: false,
          status: "sent",
        });
        
        // Add persona info for broadcast
        const messageWithPersona = {
          ...aiMessage,
          personaName: persona.name,
          personaAvatar: persona.avatarUrl
        };
        
        aiMessages.push(aiMessage);
        broadcastNewMessage(conversation.id, messageWithPersona);
      }
    }
    
    console.log(`[AI Worker] Successfully generated ${aiMessages.length} AI messages`);
    
    // Mark job as completed
    await storage.updateJobStatus(job.id, 'completed');
    
  } catch (error: any) {
    console.error(`[AI Worker] Error processing job ${job.id}:`, error);
    
    // Check if we should retry
    const currentAttempts = job.attempts + 1;
    
    if (currentAttempts >= MAX_RETRIES) {
      // Max retries reached, mark as failed
      await storage.updateJobStatus(
        job.id, 
        'failed', 
        `Failed after ${MAX_RETRIES} attempts: ${error.message || error}`
      );
      console.error(`[AI Worker] Job ${job.id} failed after ${MAX_RETRIES} attempts`);
    } else {
      // Reset to pending for retry
      await storage.updateJobStatus(job.id, 'pending');
      console.log(`[AI Worker] Job ${job.id} will be retried (attempt ${currentAttempts}/${MAX_RETRIES})`);
    }
  } finally {
    // Release lock
    PROCESSING_LOCK.delete(job.id);
  }
}
