# AI Companion Chat Application

## Overview
This project is a WeChat-style AI companion chat application designed for engaging interactions with customizable AI personas. It supports 1-on-1 and group chats, real-time multi-device synchronization, and a social feed ("Moments"). The application aims to provide a highly interactive and personalized AI chat experience with a strong focus on a mobile-first, Chinese-localized user experience. The business vision is to deliver a robust platform for personalized AI interactions, tapping into the growing market for AI companionship and social networking.

## User Preferences
I want the agent to use a creative and engaging communication style. I prefer detailed explanations, especially for complex technical decisions. When proposing changes, please ask for confirmation before implementing major modifications. I value iterative development and clear communication throughout the process. Do not make changes to the folder `Z` or the file `Y`.

## System Architecture
The application is built with a modern web stack: React, TypeScript, Vite, and TailwindCSS for the frontend; Express and TypeScript for the backend; and PostgreSQL with Drizzle ORM for data persistence. Real-time communication is powered by WebSockets, and authentication utilizes Replit OIDC.

**UI/UX Decisions:**
The design is inspired by WeChat, featuring a green primary color palette and a purple accent for the Moments feature. It includes dark mode, typing indicators, loading states, toast notifications, and is optimized for mobile-first responsiveness (iPhone SE baseline) with specific enhancements like touch-friendly targets, optimized chat bubbles, and a global bottom navigation bar. Content on larger screens is centered. Navigation badges provide real-time unread indicators for chats and moments, updating via WebSocket events.

**Technical Implementations:**
- **Authentication:** Replit OIDC, `express-session` with PostgreSQL store, and WebSocket authentication via session cookies.
- **Database Schema:** Core entities include `users`, `ai_personas`, `conversations`, `messages`, `memories`, and `moments`.
- **WebSocket:** Provides real-time message delivery, typing indicators, read status, multi-device synchronization across all features (Moments, Groups, unread counts), and persistent connections with smart reconnection logic.
- **AI Service:** Supports persona-based responses with customizable system prompts, memory integration, and Google Gemini 2.5 Pro (with OpenAI alternatives). AI responses are streamed, enforced to be in Chinese by default, and adhere to specific conversation rules (e.g., conciseness, no robot terminology, time-aware context). Token limits are set to **800 for chat responses** (enforcing 2-4 short sentences via backslash separation) and **10000 for content generation** (memories, moments, comments).
- **RAG (Retrieval-Augmented Generation):** User-configurable feature leveraging AI persona memories with importance ratings as RAG context.
- **Web Search (Google Search Grounding):** User-configurable feature activating Google Gemini's `googleSearch` tool for real-time information.
- **API Rate Limiting:** Implemented for message-sending endpoints.
- **Memory System:** AI-powered extraction of structured memories with importance ratings, semantic deduplication, and RAG optimization (filtering by importance). Supports manual CRUD operations and conversation-associated memory deletion.
- **Moments Feature:** A user-isolated private feed where users see only their own and their AI personas' posts. AI personas autonomously post moments hourly (30% probability, 6-hour cooldown) and comment on user posts, integrating personality and memories. Supports recursive nested comments with depth-aware styling and smart AI reply limits (max 2 consecutive AI replies). AI comment generation uses Few-Shot prompting with tiered strategies and comprehensive validation. Real-time sync for AI-generated comments and unread comment badges.
- **Localization:** Full Chinese localization across all UI, error messages, and AI prompts.
- **Conversation Management:** Includes conversation deletion and smart message sending.
- **User Profile Editing:** Click-to-edit functionality for avatar and nickname.
- **Immersive Mode:** Toggle to hide management interfaces for a pure chat experience.
- **Groups Management:** Dedicated page for group creation and AI member selection.
- **Failed Message Handling:** Displays error indicators and retry options for failed messages (text and image).
- **"一句我一句" Chat Flow:** Implements a strict turn-taking conversation rhythm with input locking, optimistic UI updates, WebSocket-based streaming detection, and error-path state reset.
- **Background AI Auto-Reply System:** Job-based background worker for AI responses when users are offline or in different conversations, using `ai_reply_jobs` table for status tracking, retry mechanisms, and row-level locking.
- **Multi-AI Group Chat System:** Intelligent multi-AI response system for group chats with AI-to-AI interaction:
  - **Intelligent AI Selection:** Uses AI judgment (scoring 0-100) combined with probability filtering (30-50%) to select 1-3 AIs to respond to each user message in group chats
  - **@ Mention Functionality:** Users can @mention specific AIs in group chats to direct questions to them. Features include:
    - **Autocomplete Picker:** Type @ to display a list of all AI members in the group
    - **Smart AI Override:** When a message contains @mention, only the mentioned AI responds (bypasses intelligent selection)
    - **Visual Highlighting:** @mentions are highlighted in messages with adaptive styling for both user and AI bubbles
    - **Fallback Handling:** If mentioned AI is not in the conversation, falls back to normal intelligent selection
  - **Group Chat Context:** AIs are aware of group membership and other participants through enhanced system prompts
  - **Staggered Responses:** Multiple AI responses are sent with 2-3 second delays between each for natural conversation flow
  - **AI-to-AI Interaction:** AIs can respond to each other's messages with 20-30% probability, limited to 3 consecutive AI messages maximum
  - **Concurrency Control:** Lock-based system prevents race conditions in AI interaction triggering
  - **Graceful Degradation:** Robust error handling with proper null checks, empty array validation, and fallback mechanisms
- **Global WebSocket Architecture:** Persistent WebSocket connection maintained across all pages, enabling global message reception and React Query cache updates.
- **Styling and Layout:** Comprehensive fixes for background colors, safe area handling, and conditional padding for mobile navigation.

## External Dependencies
- **Frontend:** React, TypeScript, Vite, TailwindCSS, shadcn/ui, Wouter, TanStack Query v5
- **Backend:** Express, TypeScript, Drizzle ORM
- **Database:** PostgreSQL (via Neon)
- **Real-time:** `ws` library (WebSocket)
- **Authentication:** Replit OIDC Auth, `express-session`
- **AI:** OpenAI API (via Replit AI Integrations), Google Gemini