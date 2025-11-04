# AI Companion Chat Application

## Overview
A WeChat-style AI companion chat application enabling users to converse with customizable AI personas in 1-on-1 or group chats. It supports real-time synchronization across multiple devices, offering a robust platform for engaging AI interactions and a social feed for sharing "Moments". The project aims to deliver a highly interactive and personalized AI chat experience.

## User Preferences
I want the agent to use a creative and engaging communication style. I prefer detailed explanations, especially for complex technical decisions. When proposing changes, please ask for confirmation before implementing major modifications. I value iterative development and clear communication throughout the process. Do not make changes to the folder `Z` or the file `Y`.

## System Architecture
The application uses a React, TypeScript, Vite, and TailwindCSS frontend, an Express and TypeScript backend, and PostgreSQL with Drizzle ORM for data persistence. Real-time communication is handled via WebSockets. Authentication leverages Replit OIDC.

**UI/UX Decisions:**
The design is heavily inspired by WeChat, featuring a green color palette (`#07C160` primary, user messages `#95EC69` light / `#056F3A` dark) and a purple accent for the Moments feature. It includes dark mode support, typing indicators, loading states, toast notifications, and responsive design for a modern user experience. Recent additions include a custom, localized login page with a purple/pink gradient, a redesigned Moments UI with purple theme, and an immersive mode that hides all management/configuration interfaces for a pure chat experience.

**Technical Implementations:**
- **Authentication:** Replit OIDC, `express-session` with PostgreSQL store, `isAuthenticated` middleware for token refresh and authorization, WebSocket authentication via session cookies.
- **Database Schema:** Key entities include `users`, `ai_personas` (customizable AI characters), `conversations` (1-on-1 and group), `messages`, `memories` (AI's understanding of users), and `moments` (social feed posts with likes and comments).
- **WebSocket:** Handles real-time message delivery, typing indicators, read status, and multi-device synchronization.
- **AI Service:** Persona-based responses with customizable system prompts, memory integration, OpenAI model selection (gpt-4o, gpt-4-turbo, gpt-3.5-turbo), configurable response delays, and AI-powered persona selection for group chats. Supports streaming AI responses.
- **API Rate Limiting:** 20 messages per minute per authenticated user on all message-sending endpoints, using an IPv6-safe key generation.
- **Memory System:** GPT-5 powered memory extraction, safe JSON parsing, deduplication, and automatic inclusion in AI system prompts.
- **Moments Feature:** A global social feed where users and AIs can post, like, and comment. AI personas automatically comment on user posts, incorporating their personality and memories. Supports nested comments and real-time updates.

**Feature Specifications:**
- **User Management:** Secure Replit Auth login, profile management, session persistence.
- **AI Personas:** CRUD operations for custom AI characters with configurable name, avatar, personality, system prompt, backstory, greeting, AI model, and response delays.
- **Conversations:** 1-on-1 and group chats, message history pagination, read/unread status, last message timestamp.
- **Real-time Features:** Instant message delivery, multi-device sync, typing indicators, live read status, auto-scroll.
- **Moments:** Global feed with purple theme (`#9333ea`), top "发布动态" button, inline comment inputs, delete button for user's own posts only, cross-user interactions (likes/comments), AI auto-comments, nested comments, real-time updates.
- **Contacts & Memory Management:** Dedicated contacts page with search, alphabetical grouping, and full CRUD for AI memories with importance classification.
- **Groups Management:** Dedicated groups page (`/groups`) with list view showing all group chats, member count display, "创建新群聊" button to create empty groups, AI member selection dialog with checkboxes, automatic navigation to new group chat after creation.
- **Immersive Mode:** Toggle to hide all management and configuration UI (AI persona management, settings, refresh, account menu, create AI girlfriend button), providing a WeChat-like pure chat experience. State persisted in localStorage with Eye/EyeOff toggle button in sidebar header.

## External Dependencies
- **Frontend:** React, TypeScript, Vite, TailwindCSS, shadcn/ui, Wouter, TanStack Query v5
- **Backend:** Express, TypeScript, Drizzle ORM
- **Database:** PostgreSQL (via Neon)
- **Real-time:** `ws` library (WebSocket)
- **Authentication:** Replit OIDC Auth (Google, GitHub, email/password), `express-session`
- **AI:** OpenAI API (via Replit AI Integrations)