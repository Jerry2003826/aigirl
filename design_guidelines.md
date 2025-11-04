# Design Guidelines: AI Companion Chat Application

## Design Approach

**Selected Approach:** Design System with Messaging App References

This is a utility-focused communication application where efficiency, familiarity, and clarity are paramount. We'll draw inspiration from established messaging platforms (WeChat, Telegram, Discord) while incorporating warmth appropriate for AI companionship.

**Core Design Principles:**
1. **Familiarity First** - Use established messaging patterns users already understand
2. **Conversation-Centric** - Everything serves the goal of seamless chatting
3. **Scannable Hierarchy** - Clear visual distinction between different message types and senders
4. **Responsive Efficiency** - Fast, lightweight interface that works across devices

---

## Typography

**Primary Font:** System font stack (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto) for optimal readability and native feel

**Hierarchy:**
- **App Title/Headers:** 24px, semibold (600)
- **Screen Titles:** 20px, semibold (600)
- **AI Character Names:** 16px, medium (500)
- **Message Text:** 15px, regular (400)
- **Timestamps/Meta:** 13px, regular (400)
- **Small Labels:** 12px, medium (500)

**Line Height:** 1.5 for message content, 1.3 for UI elements

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 3, 4, 6, 8, 12** for consistent rhythm
- `p-2, p-3, p-4` - Small spacing (buttons, compact lists)
- `p-6, p-8` - Medium spacing (cards, sections)  
- `p-12` - Large spacing (page margins on desktop)
- `gap-2, gap-3, gap-4` - Consistent gaps in flex/grid layouts

**Layout Structure:**

**Mobile (default):**
- Full-width single column
- Bottom navigation bar (h-16)
- Top header bar (h-14)
- Chat area fills remaining space

**Desktop (lg: breakpoint):**
- Three-column layout: Sidebar (w-72) + Chat List (w-80) + Main Chat Area (flex-1)
- Max container width: max-w-screen-2xl
- Persistent side panels, no overlays

**Key Measurements:**
- Avatar sizes: 10 (small), 12 (medium), 16 (large) Tailwind units
- Message bubbles: max-w-sm to max-w-md
- Chat input: h-12 to h-auto (grows with text)

---

## Component Library

### Navigation & Structure

**Primary Navigation (Mobile Bottom Bar / Desktop Sidebar):**
- Icon + label combination
- Active state: filled icon, accent indicator
- Sections: Chats, Characters, Moments, Profile
- Desktop sidebar includes user profile card at top

**Chat List:**
- Conversation item: Avatar (left) + Name/Preview (center) + Time/Badge (right)
- Height: h-16 to h-20
- Unread indicator: Small badge with count
- Active conversation: subtle background highlight
- Swipe actions on mobile (archive, delete)

**Top Header:**
- Character/Group name (truncate)
- Status indicator if applicable
- Right actions: info, search, settings icons
- Back button on mobile

### Chat Interface

**Message Bubbles:**
- User messages: align right, rounded-2xl, distinct treatment
- AI messages: align left, rounded-2xl, different treatment
- Max width: max-w-md on desktop, max-w-[85%] on mobile
- Padding: px-4 py-3
- Consecutive messages from same sender: reduced top spacing (space-y-1)

**Message Features:**
- Avatar only on first message in sequence (for AI)
- Timestamp on hover/long-press, displayed with opacity-60
- Typing indicator: animated dots, h-12
- System messages: centered, small, muted

**Message Input:**
- Sticky bottom position
- Rounded text input with px-4 py-3
- Send button (icon only) on right
- Attachment button on left
- Auto-expanding up to 5 rows

**Group Chat Specifics:**
- Small avatar + name prefix for each AI message
- Different bubble styling per AI character (subtle variations)
- Turn indicators to show speaking order

### Character Management

**Character Cards:**
- Large avatar (w-20 h-20 or larger)
- Name, tagline/personality snippet
- Stats: message count, created date
- Edit/Delete actions
- Grid layout: grid-cols-2 on mobile, grid-cols-3 on tablet, grid-cols-4 on desktop

**Character Creation/Edit Form:**
- Large avatar upload area (centered, w-32 h-32)
- Form fields with clear labels
- Text area for personality/backstory (min-h-32)
- Save button: prominent, full-width on mobile

**Character Profile View:**
- Hero section: large avatar + name + bio
- Tabs: About, Memories, Settings
- Conversation starter suggestions

### Moments/Feed (if implemented)

**Feed Layout:**
- Single column, max-w-2xl centered
- Post card: rounded-lg, p-4 to p-6
- Avatar + name + timestamp header
- Content area (text + images grid if applicable)
- Interaction bar: like, comment counts + actions

**Post Creation:**
- Modal or full-screen overlay
- Text area (min-h-40)
- Image upload grid (grid-cols-3)
- Post button: top-right on mobile, bottom-right on desktop

### Forms & Inputs

**Text Inputs:**
- Border: border-2 for focus states, border for default
- Rounded: rounded-lg
- Height: h-12 for single-line
- Padding: px-4 py-3

**Buttons:**
- Primary action: rounded-lg, px-6 py-3, medium (500) font weight
- Secondary: outlined or ghost variant
- Icon buttons: w-10 h-10, rounded-full

**Authentication Screens:**
- Centered form on desktop (max-w-md)
- Full-screen on mobile with top padding
- Logo at top (h-12 to h-16)
- Social login buttons: full-width with icon + text
- Divider with "or" text

### Overlays & Modals

**Character Info Sheet:**
- Slides from right on desktop, bottom sheet on mobile
- Close button: top-right
- Scrollable content area

**Confirmation Dialogs:**
- Centered overlay (max-w-sm)
- Rounded-xl
- Title, message, action buttons
- Destructive actions in red/warning treatment

---

## Images

**Profile/Character Avatars:**
- Required throughout the app
- Circular (rounded-full)
- Sizes: 40px (chat list), 48px (message bubbles), 128px (profiles)
- Default placeholder: gradient or icon if no image uploaded

**Moments/Feed Images:**
- Support for 1-9 images per post
- Grid layout for multiple images (grid-cols-2 or grid-cols-3)
- Square aspect ratio (aspect-square) with object-cover
- Lightbox/fullscreen view on click

**Welcome/Empty States:**
- Centered illustrations (w-48 h-48 or larger)
- Used when: no chats, no characters, empty moments feed
- Below illustration: heading + description text

**No Large Hero Image** - This is a utility app, not a marketing site. Focus is on functional screens.

---

## Interaction Patterns

**Real-time Updates:**
- New messages appear with subtle fade-in
- Typing indicators animate smoothly
- Unread badges update instantly
- Online/offline status with small indicator dot

**Touch Targets:**
- Minimum 44px (h-11) for all interactive elements
- Adequate spacing between touch targets (gap-2 minimum)

**Loading States:**
- Message sending: optimistic UI with pending indicator
- Failed messages: retry button inline
- Skeleton screens for chat list and message loading
- Spinner for full-page loads

**Transitions:**
- Screen transitions: slide on mobile, instant on desktop
- Modal appearances: fade + scale
- Keep animations subtle and fast (150-200ms)

---

## Accessibility

- Minimum contrast ratio: 4.5:1 for text
- Focus states: visible outline on all interactive elements (ring-2)
- Semantic HTML: proper heading hierarchy, button vs link usage
- ARIA labels for icon-only buttons
- Keyboard navigation: tab order, enter/escape shortcuts
- Screen reader announcements for new messages

---

## Responsive Behavior

**Mobile-First Breakpoints:**
- **Base (mobile):** Single column, bottom nav, full-screen views
- **md (768px):** Tablet - introduce split views for some screens
- **lg (1024px):** Desktop - three-column layout, persistent panels
- **xl (1280px+):** Wider max-width, more comfortable spacing

**Key Responsive Changes:**
- Navigation: Bottom bar → Sidebar
- Chat list: Overlay → Persistent column
- Message bubbles: 85% width → Fixed max-width
- Forms: Full-width → Centered cards