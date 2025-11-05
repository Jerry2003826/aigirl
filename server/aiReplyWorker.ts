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
      if (participants.length === 0) {
        await storage.updateJobStatus(job.id, 'failed', 'No personas in conversation');
        return;
      }
      
      // Simple round-robin or random selection
      // TODO: Could use aiService.selectPersonaForGroup for smart selection
      respondingPersonaId = participants[Math.floor(Math.random() * participants.length)].personaId;
    } else {
      // For 1-on-1 chats, use the single participant
      const participants = await storage.getConversationParticipants(conversation.id);
      const personaParticipant = participants[0];
      
      if (!personaParticipant) {
        await storage.updateJobStatus(job.id, 'failed', 'No persona in 1-on-1 conversation');
        return;
      }
      
      respondingPersonaId = personaParticipant.personaId;
    }
    
    // Generate AI response
    console.log(`[AI Worker] Generating AI response from persona ${respondingPersonaId}`);
    
    // Note: generateAIResponse returns AI messages as an array automatically
    await generateAIResponse({
      conversationId: conversation.id,
      personaId: respondingPersonaId,
      userMessage: userMessage.content || '[User sent an image]',
    });
    
    // Get the AI messages that were just created
    const allMessages = await storage.getMessagesByConversation(conversation.id, 10);
    const aiMessages = allMessages.filter(m => 
      m.senderType === 'ai' && 
      m.createdAt > userMessage.createdAt
    );
    
    // Broadcast AI messages to connected clients
    for (const aiMessage of aiMessages) {
      broadcastNewMessage(conversation.id, aiMessage);
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
