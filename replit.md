# AI Companion Chat Application

## Overview
This project is a WeChat-style AI companion chat application designed for engaging interactions with customizable AI personas. It supports 1-on-1 and group chats, real-time multi-device synchronization, and a social feed ("Moments"). The application aims to provide a highly interactive and personalized AI chat experience with a strong focus on a mobile-first, Chinese-localized user experience. The business vision is to deliver a robust platform for personalized AI interactions, tapping into the growing market for AI companionship and social networking.

## User Preferences
I want the agent to use a creative and engaging communication style. I prefer detailed explanations, especially for complex technical decisions. When proposing changes, please ask for confirmation before implementing major modifications. I value iterative development and clear communication throughout the process. Do not make changes to the folder `Z` or the file `Y`.

## System Architecture
The application features a modern web stack: React, TypeScript, Vite, and TailwindCSS for the frontend; Express and TypeScript for the backend; and PostgreSQL with Drizzle ORM for data persistence. Real-time communication is powered by WebSockets, and authentication utilizes Replit OIDC.

**UI/UX Decisions:**
The design draws inspiration from WeChat, employing a green primary color palette and a purple accent for the Moments feature. It includes dark mode, typing indicators, loading states, toast notifications, and is optimized for mobile-first responsiveness (iPhone SE baseline). Key UI/UX elements include a custom localized login page, a redesigned Moments UI, and an immersive chat mode. Mobile optimizations include enhanced typography, touch-friendly targets (44-52px), optimized chat bubbles, larger input fields, increased spacing, and a global bottom navigation bar for one-handed use. Content on larger screens is centered within `max-w-3xl` containers.

**Technical Implementations:**
- **Authentication:** Replit OIDC, `express-session` with PostgreSQL store, `isAuthenticated` middleware, and WebSocket authentication via session cookies.
- **Database Schema:** Core entities include `users`, `ai_personas`, `conversations`, `messages`, `memories`, and `moments`.
- **WebSocket:** Facilitates real-time message delivery, typing indicators, read status, and multi-device synchronization.
- **AI Service:** Supports persona-based responses with customizable system prompts, memory integration, and Google Gemini 2.5 Pro (with OpenAI alternatives). AI responses are streamed and **enforced to be in Chinese by default**. Conversation rules enforce conciseness (max 30 chars, 4 backslash-separated sentences), no robot terminology, and time-aware context.
- **RAG (Retrieval-Augmented Generation):** User-configurable feature where AI persona memories are used as RAG context, allowing the AI to reference specific memories based on importance levels.
- **Web Search (Google Search Grounding):** User-configurable feature that activates Google Gemini's `googleSearch` tool for real-time information retrieval.
- **API Rate Limiting:** Implemented for message-sending endpoints (20 messages/minute/user).
- **Memory System (Enhanced 2025-11-05):** 
  - **AI-Powered Extraction:** Uses configured AI provider (Gemini/OpenAI) to analyze conversations and extract structured memories with importance ratings (1-10).
  - **Smart Deduplication:** Semantic key normalization with synonym mapping (e.g., "职业"="工作"="职位") and value similarity detection to prevent duplicate memories.
  - **RAG Optimization:** When RAG enabled, only includes memories with importance ≥6, sorted by importance descending, limited to top 20 to optimize token usage.
  - **Conversation Association:** Memories extracted from conversations are linked via `conversationId` and automatically deleted when the conversation is deleted (CASCADE).
  - **Manual Memory Management:** Complete CRUD API for viewing, creating, updating, and deleting memories through a dedicated memory library interface.
  - **Dual Mode Operation:**
    - RAG disabled: Memories included directly in system prompt
    - RAG enabled: Memories formatted as knowledge base context prepended to user messages
- **Moments Feature:** A global social feed allowing users and AIs to post, like, and comment. It features a modern composer UI and **AI personas autonomously post moments** via an hourly scheduler (30% probability, 6-hour cooldown) and automatically comment on user posts, incorporating personality and memories. Supports nested comments and real-time updates.
- **Localization:** Full Chinese localization across all UI elements, error messages, and AI prompts.
- **Conversation Management:** Features conversation deletion and smart "发消息" (Send Message) functionality.
- **User Profile Editing:** Click-to-edit profile functionality with avatar upload, nickname editing, and API for partial updates.
- **Immersive Mode:** A toggle to hide management interfaces for a pure chat experience, with state persistence.
- **Groups Management:** Dedicated page for managing groups, including creation and AI member selection.
- **Failed Message Handling:** Messages that fail to send are displayed with error indicators and retry buttons. Failed messages are conversation-scoped (isolated by conversationId) to prevent cross-conversation leakage. Supports text and image message retry with preview.
- **"一句我一句" Chat Flow (2025-11-05):** Implemented dual-state control system with `isLoading` (waiting for AI to start) and `isStreaming` (AI outputting segments) states. Input lock mechanism ensures strict turn-taking conversation rhythm. Includes optimistic UI updates for instant user message display, WebSocket-based streaming detection with 5-second timeout, automatic scroll-to-bottom without animation, and comprehensive error-path state reset to prevent input deadlock.

## External Dependencies
- **Frontend:** React, TypeScript, Vite, TailwindCSS, shadcn/ui, Wouter, TanStack Query v5
- **Backend:** Express, TypeScript, Drizzle ORM
- **Database:** PostgreSQL (via Neon)
- **Real-time:** `ws` library (WebSocket)
- **Authentication:** Replit OIDC Auth, `express-session`
- **AI:** OpenAI API (via Replit AI Integrations), Google Gemini (natively supported)