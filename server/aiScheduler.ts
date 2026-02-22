/**
 * AI Auto-posting Scheduler
 * Periodically checks all AI personas and posts moments autonomously
 */

import { storage } from "./storage";
import { triggerAIPostMoment, canAIPostMoment } from "./aiService";

// Check interval: every hour
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if user has valid Gemini API key configured
 */
async function hasValidGeminiKey(userId: string): Promise<boolean> {
  try {
    const settings = await storage.getAiSettings(userId);
    
    // Check if user has custom API key configured
    if (settings?.customApiKey) {
      return true;
    }
    
    // Check if AI Integrations (Gemini) are configured
    const hasGeminiIntegration = !!(
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY && 
      process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
    );
    
    // Check legacy/standalone Google API key
    const hasGoogleKey = !!process.env.GOOGLE_AI_API_KEY;
    
    // Global key is available if ANY source is configured
    const hasGlobalKey = hasGeminiIntegration || hasGoogleKey;
    return hasGlobalKey;
  } catch (error) {
    console.error(`[AI Scheduler] Error checking API key for user ${userId}:`, error);
    return false;
  }
}

/**
 * Check all AI personas and trigger moment posts for eligible ones
 */
async function checkAndPostMoments() {
  console.log("[AI Scheduler] Checking AI personas for autonomous moment posting...");
  
  try {
    // Get all users to check their AI personas
    const users = await storage.getAllUsers();
    
    for (const user of users) {
      // Check if user has valid Gemini API key before posting
      const hasApiKey = await hasValidGeminiKey(user.id);
      if (!hasApiKey) {
        console.log(`[AI Scheduler] User ${user.id} has no valid Gemini API key, skipping moment posting`);
        continue;
      }
      
      // Get this user's AI personas
      const personas = await storage.getPersonasByUser(user.id);
      
      for (const persona of personas) {
        // Check if this persona can post (6-hour limit)
        if (canAIPostMoment(persona)) {
          // Random chance (30%) to post this hour
          // This creates natural variation in posting times
          const shouldPost = Math.random() < 0.3;
          
          if (shouldPost) {
            console.log(`[AI Scheduler] ${persona.name} will post a moment now`);
            
            // Trigger autonomous moment post
            const result = await triggerAIPostMoment(persona.id, user.id);
            
            if (result.success) {
              console.log(`[AI Scheduler] ✅ ${persona.name} posted: ${result.moment?.content?.substring(0, 50)}...`);
            } else {
              console.log(`[AI Scheduler] ❌ ${persona.name} failed to post: ${result.error}`);
            }
          } else {
            console.log(`[AI Scheduler] ${persona.name} is eligible but randomly skipped this hour`);
          }
        } else {
          const lastMoment = persona.lastMomentAt ? new Date(persona.lastMomentAt) : null;
          if (lastMoment) {
            const hoursAgo = Math.floor((Date.now() - lastMoment.getTime()) / (60 * 60 * 1000));
            console.log(`[AI Scheduler] ${persona.name} posted ${hoursAgo}h ago, waiting for 6h cooldown`);
          }
        }
      }
    }
    
    console.log("[AI Scheduler] Check completed");
  } catch (error) {
    console.error("[AI Scheduler] Error checking personas:", error);
  }
}

/**
 * Start the AI auto-posting scheduler
 */
export function startAIScheduler() {
  console.log("[AI Scheduler] Starting autonomous moment posting (checks every hour)");
  
  // Run initial check after 5 minutes (to let server settle)
  setTimeout(() => {
    checkAndPostMoments();
  }, 5 * 60 * 1000);
  
  // Then run every hour
  setInterval(() => {
    checkAndPostMoments();
  }, CHECK_INTERVAL_MS);
}
