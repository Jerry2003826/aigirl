import { storage } from './storage';
import { generateAIResponse, ImageData, extractAndStoreMemories, selectMultipleRespondingPersonas } from './aiService';
import { broadcastNewMessage } from './websocket';

const MAX_RETRIES = 3;
const POLL_INTERVAL = 3000; // 3 seconds
const PROCESSING_LOCK = new Set<string>(); // In-memory lock to prevent duplicate processing

// Track conversations where AI interaction is in progress
// Prevents duplicate AI-to-AI triggers from racing
export const AI_INTERACTION_LOCK = new Set<string>();

/**
 * Parse data URL to extract mimeType and base64 data
 * @param dataUrl - Data URL string (e.g., "data:image/png;base64,iVBORw0KGgo...")
 * @returns ImageData object or undefined if invalid
 */
function parseDataUrl(dataUrl: string): ImageData | undefined {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return undefined;
  }
  
  try {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return undefined;
    }
    
    return {
      mimeType: matches[1],
      base64: matches[2],
    };
  } catch (error) {
    console.error('[AI Worker] Error parsing data URL:', error);
    return undefined;
  }
}

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
    
    // Record messageCount before creating AI messages (for extraction trigger)
    const messageCountBefore = conversation.messageCount || 0;
    
    // Get user message
    const userMessage = await storage.getMessage(job.userMessageId);
    if (!userMessage) {
      await storage.updateJobStatus(job.id, 'failed', 'User message not found');
      return;
    }
    
    // Determine which AI persona(s) should respond
    let respondingPersonaIds: string[];
    
    // Check if this message mentions a specific AI
    if (userMessage.mentionedPersonaId) {
      console.log(`[AI Worker] Message mentions specific AI: ${userMessage.mentionedPersonaId}`);
      
      // Verify the mentioned persona exists in the conversation
      const participants = await storage.getConversationParticipants(conversation.id);
      const mentionedParticipant = participants.find(p => p.personaId === userMessage.mentionedPersonaId);
      
      if (mentionedParticipant) {
        // Only let the mentioned AI respond
        respondingPersonaIds = [userMessage.mentionedPersonaId];
        console.log('[AI Worker] Using mentioned AI for response');
      } else {
        console.warn(`[AI Worker] Mentioned AI ${userMessage.mentionedPersonaId} not in conversation, falling back to normal selection`);
        // Mentioned AI not in conversation, fall through to normal selection
        respondingPersonaIds = [];
      }
    } else {
      respondingPersonaIds = [];
    }
    
    // If no mention or mentioned AI not found, use normal selection logic
    if (respondingPersonaIds.length === 0) {
      if (conversation.isGroup) {
        // For group chats, use intelligent multi-AI selection
        console.log('[AI Worker] Group chat detected, using multi-AI selection');
        try {
          respondingPersonaIds = await selectMultipleRespondingPersonas({
            conversationId: conversation.id,
            userMessage: userMessage.content || '[User sent an image]',
          });
          console.log(`[AI Worker] Selected ${respondingPersonaIds.length} AI(s) to respond`);
        } catch (selectionError: any) {
          console.error('[AI Worker] Failed to select multiple personas, falling back to single selection:', selectionError);
          // Fallback: select one persona randomly
          const participants = await storage.getConversationParticipants(conversation.id);
          const validParticipants = participants.filter(p => 
            typeof p.personaId === 'string' && p.personaId.trim().length > 0
          );
          
          if (validParticipants.length === 0) {
            await storage.updateJobStatus(job.id, 'failed', 'No valid personas in group conversation');
            return;
          }
          
          respondingPersonaIds = [validParticipants[Math.floor(Math.random() * validParticipants.length)].personaId];
        }
      } else {
        // For 1-on-1 chats, use the single participant
        const participants = await storage.getConversationParticipants(conversation.id);
        const personaParticipant = participants.find(p => 
          typeof p.personaId === 'string' && p.personaId.trim().length > 0
        );
        
        if (!personaParticipant || !personaParticipant.personaId) {
          await storage.updateJobStatus(job.id, 'failed', 'No valid persona in 1-on-1 conversation');
          return;
        }
        
        respondingPersonaIds = [personaParticipant.personaId];
      }
    }
    
    // Guard: Ensure we have at least one persona to respond
    if (respondingPersonaIds.length === 0) {
      await storage.updateJobStatus(job.id, 'failed', 'No personas selected to respond');
      console.error('[AI Worker] No personas selected to respond, failing job');
      return;
    }
    
    console.log(`[AI Worker] Selected ${respondingPersonaIds.length} persona(s) to respond`);
    
    // Parse image data if present (once, for all AIs)
    let imageData: ImageData | undefined;
    if (userMessage.imageData) {
      imageData = parseDataUrl(userMessage.imageData);
      if (imageData) {
        console.log(`[AI Worker] Image detected: ${imageData.mimeType}`);
      }
    }
    
    // Generate AI responses from all selected personas
    console.log(`[AI Worker] Generating responses from ${respondingPersonaIds.length} persona(s)`);
    const allAiMessages = [];
    
    for (let personaIndex = 0; personaIndex < respondingPersonaIds.length; personaIndex++) {
      const respondingPersonaId = respondingPersonaIds[personaIndex];
      
      // Add delay between different AI responses (except for the first one)
      if (personaIndex > 0) {
        // Wait 2-3 seconds before next AI starts responding
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
      }
      
      console.log(`[AI Worker] [${personaIndex + 1}/${respondingPersonaIds.length}] Generating response from persona ${respondingPersonaId}`);
      
      // Generate AI response with enhanced error logging
      let aiResponse: string;
      try {
        console.log(`[AI Worker] Calling generateAIResponse with:`, {
          conversationId: conversation.id,
          personaId: respondingPersonaId,
          userMessagePreview: (userMessage.content || '[User sent an image]').substring(0, 50),
          hasImage: !!imageData
        });
        
        aiResponse = await generateAIResponse({
          conversationId: conversation.id,
          personaId: respondingPersonaId,
          userMessage: userMessage.content || '[User sent an image]',
          imageData,
        });
        
        console.log(`[AI Worker] AI response generated successfully, length: ${aiResponse.length} chars`);
      } catch (aiError: any) {
        console.error(`[AI Worker] ❌ FAILED to generate AI response from persona ${respondingPersonaId}:`, {
          errorMessage: aiError.message,
          errorStack: aiError.stack,
          conversationId: conversation.id,
          personaId: respondingPersonaId,
          jobId: job.id
        });
        
        // Continue to next persona instead of failing the entire job
        continue;
      }
      
      // Get persona info for message broadcast
      const persona = await storage.getPersona(respondingPersonaId);
      if (!persona) {
        console.error(`[AI Worker] Persona ${respondingPersonaId} not found, skipping`);
        continue;
      }
      
      // Split AI response by backslash (\) only - this is the intentional delimiter
      const messageParts = aiResponse
        .split('\\')  // Split by backslash only
        .map(part => part.trim())  // Trim whitespace
        .filter(part => part.length > 0);  // Remove empty parts
      
      // Save and broadcast AI messages with 2-3 second random delay between each part
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
          
          allAiMessages.push(aiMessage);
          broadcastNewMessage(conversation.id, messageWithPersona);
        }
      } else {
        // Save and broadcast each part with 2-3 second random delay
        for (let i = 0; i < messageParts.length; i++) {
          if (i > 0) {
            // Wait 2-3 seconds randomly before saving and sending next message part
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
          
          allAiMessages.push(aiMessage);
          broadcastNewMessage(conversation.id, messageWithPersona);
        }
      }
      
      console.log(`[AI Worker] [${personaIndex + 1}/${respondingPersonaIds.length}] Successfully generated messages from ${persona.name}`);
    }
    
    console.log(`[AI Worker] Successfully generated ${allAiMessages.length} AI messages from ${respondingPersonaIds.length} persona(s)`);
    
    // Trigger AI-to-AI interaction (async, don't wait)
    if (conversation.isGroup && allAiMessages.length > 0) {
      // Get the last AI who responded to potentially trigger interaction
      const lastRespondingPersonaId = respondingPersonaIds[respondingPersonaIds.length - 1];
      
      // Don't await - let it run in background
      import('./aiService').then(({ triggerAIInteraction }) => {
        triggerAIInteraction(conversation.id, lastRespondingPersonaId).catch(err => {
          console.error('[AI Worker] AI interaction trigger failed:', err);
        });
      });
    }
    
    // Check if we should trigger memory extraction (every 10 messages)
    // Check if we crossed a multiple of 10 during this turn
    const updatedConversation = await storage.getConversation(conversation.id);
    const messageCountAfter = updatedConversation?.messageCount || 0;
    
    // Detect if we crossed a multiple of 10 (e.g., from 8 to 11 crosses 10)
    const crossedMultipleOf10 = Math.floor(messageCountAfter / 10) > Math.floor(messageCountBefore / 10);
    
    if (crossedMultipleOf10 && allAiMessages.length > 0) {
      console.log(`[AI Worker] Crossed multiple of 10 (${messageCountBefore} -> ${messageCountAfter}), triggering memory extraction`);
      
      // Extract memories from the first (primary) AI's responses only
      // This ensures we only extract from the most relevant AI
      const primaryPersonaId = respondingPersonaIds[0];
      const primaryPersonaMessages = allAiMessages.filter(msg => msg.senderId === primaryPersonaId);
      
      if (primaryPersonaMessages.length > 0) {
        // Combine all messages from primary persona
        const combinedResponse = primaryPersonaMessages.map(m => m.content).join(' ');
        
        // Extract and store memories from this conversation turn
        try {
          await extractAndStoreMemories(
            conversation.id,
            primaryPersonaId,
            userMessage.content || '[User sent an image]',
            combinedResponse
          );
          console.log(`[AI Worker] Memory extraction completed for conversation ${conversation.id}`);
        } catch (error) {
          console.error(`[AI Worker] Memory extraction failed:`, error);
          // Don't fail the job if memory extraction fails
        }
      }
    } else {
      console.log(`[AI Worker] No extraction needed (${messageCountBefore} -> ${messageCountAfter}, next extraction at ${Math.ceil(messageCountAfter / 10) * 10})`);
    }
    
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
