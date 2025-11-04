# AI Companion Chat Application

## Overview
A WeChat-style AI companion chat application that allows users to have conversations with customizable AI girlfriends/friends. Supports both 1-on-1 and group chats with real-time synchronization across multiple devices.

## Tech Stack
- **Frontend**: React, TypeScript, Vite, TailwindCSS, shadcn/ui, Wouter
- **Backend**: Express, TypeScript, PostgreSQL (via Neon), Drizzle ORM
- **Real-time**: WebSocket (ws library)
- **Authentication**: Replit OIDC Auth (Google, GitHub, email/password)
- **AI**: OpenAI API (via Replit AI Integrations)
- **State Management**: TanStack Query v5

## Architecture

### Authentication
- Uses Replit OIDC for authentication (Google, GitHub, email/password)
- Session management via express-session with PostgreSQL store
- isAuthenticated middleware handles token refresh and authorization
- WebSocket connections authenticated via session cookies

### Database Schema
- **users**: User profiles with email, username, profile image
- **ai_personas**: AI characters with customizable personality, system prompts, backstory, model (gpt-4o, gpt-4-turbo, gpt-3.5-turbo), and response delays
- **conversations**: Supports both 1-on-1 and group chats
- **conversation_participants**: Many-to-many relationship between conversations and AI personas
- **messages**: Chat messages with sender type (user/AI), read status, timestamps
- **memories**: AI memory system to remember user information across conversations
- **moments**: Social feed posts (WeChat Moments) with content, images, authorId, authorType
- **momentLikes**: Likes on moments with likerId and likerType (user or AI)
- **momentComments**: Comments on moments with support for nested replies via parentCommentId

### WebSocket Implementation
- Path: `/ws`
- Authentication: Session cookies (connect.sid)
- Message Types:
  - `join_conversation`: Join a conversation room
  - `leave_conversation`: Leave the current conversation
  - `typing`: Broadcast typing indicators
  - `read`: Mark messages as read
  - `new_message`: Broadcast new messages to all connected clients
  - `connection`: Connection confirmation
- Multi-device support: Tracks all connections per user, broadcasts to all user devices

### AI Service
- Persona-based responses with customizable system prompts
- Memory integration: Automatically recalls user information from previous conversations
- Model selection: Supports gpt-4o (default), gpt-4-turbo, gpt-3.5-turbo
- Response delays: Configurable 0-10 second delays to simulate human-like responses
- Group chat intelligence: AI-powered persona selection based on message content and fair rotation
- Streaming support: Real-time AI response streaming for better UX

### API Rate Limiting
- 20 messages per minute per authenticated user
- Applied to all message-sending endpoints:
  - POST /api/messages
  - POST /api/ai/generate
  - POST /api/ai/generate-stream
  - POST /api/ai/select-persona
- IPv6-safe key generation
- Standard rate limit headers for client tracking

## Key Features

### User Management
- Replit Auth integration for secure login
- Profile management with custom usernames
- Session persistence across devices

### AI Personas
- Create unlimited custom AI characters
- Configure: name, avatar, personality, system prompt, backstory, greeting
- Choose AI model per persona (gpt-4o, gpt-4-turbo, gpt-3.5-turbo)
- Set response delays (0-10 seconds) for human-like behavior
- Full CRUD operations with authorization

### Conversations
- **1-on-1 Chats**: Direct conversation with a single AI persona
- **Group Chats**: Multiple AI personas in one conversation
- Message history with pagination (50 messages per page)
- "Load More" button for older messages
- Read/unread status tracking
- Last message timestamp

### Real-time Features
- WebSocket-based instant message delivery
- Multi-device synchronization (messages appear on all logged-in devices)
- Typing indicators
- Live read status updates
- Auto-scroll for new messages (preserves scroll position for history loads)

### Memory System
- AI personas automatically extract and remember user information
- GPT-5 powered memory extraction
- Safe JSON parsing with fallback
- Deduplication to prevent duplicate memories
- Automatic inclusion in AI system prompts

### Moments (Social Feed)
- **Global Feed**: View moments from all users and AI personas (not restricted to self)
- **Cross-User Interactions**: Like and comment on any user's or AI's moments
- **AI Auto-Comments**: 1-3 AI personas automatically comment on user posts within 5-15 seconds
- **Nested Comments**: Support for replies to comments via parentCommentId
- **Real-Time Updates**: React Query integration with cache invalidation
- **WeChat Green Theme**: Primary color #07C160, user messages #95EC69 (light) / #056F3A (dark)

### UX Optimizations
- Typing indicators with animation
- Message send retry on failure
- Pagination with smart auto-scroll (only for new messages)
- Loading states and skeletons
- Toast notifications for errors
- Dark mode support
- WeChat-inspired green color palette

## API Endpoints

### Authentication
- GET /api/auth/user - Get current user
- GET /api/auth/login - Initiate OIDC login
- GET /api/auth/callback - OIDC callback
- POST /api/auth/logout - Logout

### AI Personas
- GET /api/personas - List user's personas
- GET /api/personas/:id - Get single persona
- POST /api/personas - Create persona
- PATCH /api/personas/:id - Update persona
- DELETE /api/personas/:id - Delete persona

### Conversations
- GET /api/conversations - List user's conversations
- GET /api/conversations/:id - Get conversation details
- POST /api/conversations - Create conversation
- POST /api/conversations/:id/participants - Add persona to conversation
- DELETE /api/conversations/:id/participants/:personaId - Remove persona
- DELETE /api/conversations/:id - Delete conversation
- POST /api/conversations/:conversationId/read - Mark all messages as read

### Messages
- GET /api/conversations/:conversationId/messages - Get messages (with pagination)
- POST /api/messages - Send message (rate limited)

### AI
- POST /api/ai/select-persona - Select responding persona for group chat (rate limited)
- POST /api/ai/generate - Generate AI response (rate limited)
- POST /api/ai/generate-stream - Generate streaming AI response (rate limited)

### Memories
- GET /api/memories/persona/:personaId - Get persona's memories for current user
- POST /api/memories - Create memory
- PATCH /api/memories/:id - Update memory
- DELETE /api/memories/:id - Delete memory

### Moments
- GET /api/moments - Get all moments (from all users and AI personas) with likes and comments
- POST /api/moments - Create moment (triggers AI auto-comments)
- DELETE /api/moments/:momentId - Delete moment
- POST /api/moments/:momentId/like - Toggle like on moment
- GET /api/moments/:momentId/likes - Get likes for moment
- POST /api/moments/:momentId/comments - Create comment (server sets authorId)
- GET /api/moments/:momentId/comments - Get comments for moment
- DELETE /api/moments/:momentId/comments/:commentId - Delete comment

## Recent Changes

### 2024-11-04: Custom Login Page
- **Purple Gradient Design**: New login page with purple/pink theme matching user's design reference
- **Replit Auth Integration**: Seamless integration with existing OIDC authentication
- **Chinese Localization**: All UI text in Chinese ("AI女友聊天" branding)
- **Social Login Icons**: Google and GitHub login buttons
- **Responsive Design**: Full accessibility with data-testid attributes for all interactive elements
- **Route Update**: Login page now displays for unauthenticated users instead of Home page

### 2024-11-04: Moments Feature Complete
- **Database Schema**: Added moments, momentLikes, momentComments tables
- **Global Social Feed**: GET /api/moments returns all users' and AI personas' moments
- **Cross-User Interactions**: Any user can like/comment on any moment (server-side authorization prevents spoofing)
- **AI Auto-Comments**: 1-3 AI personas comment on user posts within 5-15 seconds
  - Uses persona's system prompt, personality, and memories
  - Respects responseDelay configuration
  - Graceful fallback on OpenAI errors
- **Frontend Component**: Complete moments.tsx with React Query integration
- **WeChat Green Theme**: Full UI redesign with #07C160 primary color
- **Bug Fixes**: Fixed apiRequest parameter order in personas.tsx

### 2024-11-04: Advanced Features Complete
- **AI Model Selection**: Personas can choose between OpenAI models (gpt-4o, gpt-4-turbo, gpt-3.5-turbo)
- **Response Delay Control**: Configurable 0-10 second delays before AI responds
- **API Rate Limiting**: 20 req/min per user on all message endpoints with IPv6-safe implementation

### 2024-11-04: UX Improvements
- Fixed pagination scroll behavior: auto-scroll only for new messages, not history loads
- Added read/unread status with backend/frontend integration
- Implemented typing indicators with WebSocket broadcasting
- Added message pagination with "Load More" button
- Send failure retry with error UI

### 2024-11-04: Memory System
- GPT-5 powered memory extraction from conversations
- Safe JSON parsing with fallback mechanisms
- Memory deduplication
- Automatic integration into AI system prompts

### 2024-11-04: Group Chat Intelligence
- AI-powered persona selection using GPT-5
- Fair rotation algorithm
- Direct mention detection (@PersonaName)
- Fallback to least active persona

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (Neon)
- `SESSION_SECRET`: Express session secret
- `ISSUER_URL`: Replit OIDC issuer URL
- `AI_INTEGRATIONS_OPENAI_BASE_URL`: OpenAI API base URL
- `AI_INTEGRATIONS_OPENAI_API_KEY`: OpenAI API key
- `REPL_ID`: Replit application ID

## Development

### Running the Application
```bash
npm run dev
```
This starts both the Express backend and Vite frontend on port 5000.

### Database
- Uses PostgreSQL via Neon (Replit's managed database)
- Drizzle ORM for type-safe database operations
- Schema push: `npm run db:push --force`

## Security
- All API routes protected with isAuthenticated middleware
- User authorization checks on all data access
- WebSocket connections authenticated via session cookies
- Rate limiting on message endpoints (20/min per user)
- No secret/key exposure in logs or responses
- Zod validation on all input

## Testing

### Manual Testing Procedure: Multi-Device Synchronization

To verify that multi-device real-time synchronization works correctly, follow these steps:

**Prerequisites:**
- Two different browser windows/tabs (or use incognito mode for second device)
- One Replit account for testing

**Test Steps:**

1. **Device 1 - Initial Login & Setup:**
   - Open the application in Browser Window 1
   - Click "Login" and authenticate via Replit Auth
   - Navigate to "Personas" page
   - Create a new AI persona with any configuration
   - Click on the persona to start a conversation
   - Send a message: "Hello from Device 1"
   - Wait for AI response

2. **Device 2 - Second Device Login:**
   - Open the application in Browser Window 2 (or incognito window)
   - Login with the SAME Replit account as Device 1
   - Verify the conversation with the AI persona appears in the conversations list
   - Click on the conversation to open it

3. **Verify Real-Time Sync - Device 2 to Device 1:**
   - On Device 2, send a message: "Hello from Device 2"
   - **Verify on Device 1:** The message should appear in real-time WITHOUT refreshing
   - Wait for AI response
   - **Verify on Device 1:** AI response appears in real-time

4. **Verify Real-Time Sync - Device 1 to Device 2:**
   - On Device 1, send a message: "Testing real-time sync"
   - **Verify on Device 2:** The message should appear in real-time WITHOUT refreshing
   - Wait for AI response
   - **Verify on Device 2:** AI response appears in real-time

5. **Verify Conversation History Sync:**
   - Compare the conversation history on both devices
   - All messages should be in the same order
   - All timestamps should match
   - Message counts should be identical

6. **Test Group Chat (Optional):**
   - Create a group chat with multiple AI personas
   - Repeat steps 3-5 with group chat
   - Verify persona selection and AI responses sync across devices

**Expected Results:**
- ✅ Messages sent from one device appear instantly on all other devices
- ✅ AI responses appear in real-time on all devices
- ✅ No page refresh required for synchronization
- ✅ Conversation history matches exactly across all devices
- ✅ Typing indicators appear on all devices (if user is typing)
- ✅ Read status updates sync across devices

**Known Behavior:**
- WebSocket connection is established when opening a conversation
- If connection drops, page refresh is required to reconnect
- First message after opening conversation may have slight delay

## Known Limitations
- Memory extraction is async (doesn't block message sending)
- Rate limiting uses in-memory store (resets on server restart)
- WebSocket reconnection requires page refresh
- No message editing or deletion
- No file attachments or media sharing
