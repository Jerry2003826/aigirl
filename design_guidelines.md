# AI Companion Chat App Design Guidelines

## Design Principles & References
**Core Pattern:** Design System with Messaging References (WeChat navigation + Telegram density + Discord community + Replika intimacy)

**Principles:** Intimate Familiarity • Conversation Sanctuary • Adaptive Atmosphere • Personality Through Subtlety • Effortless Efficiency

---

## Typography

**Font Stack:** System fonts (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial)

**Scale:**
- App Branding: 28px/bold (700)
- Screen Headers: 22px/semibold (600)
- Character Names: 17px/semibold (600)
- Message Content: 16px/regular (400)
- Metadata: 13px/medium (500)
- Timestamps/Labels: 12px/regular (400)
- Micro-copy: 11px/medium (500)

**Line Heights:** 1.6 (messages), 1.4 (UI), 1.3 (headers)  
**Dark Mode:** +0.01em letter-spacing for timestamps/labels

---

## Layout & Spacing

**Tailwind Units:** 2, 3, 4, 6, 8, 12, 16
- p-2/3: Compact (badges, small buttons)
- p-4/6: Standard (cards, inputs)
- p-8/12: Sections (panels, modals)
- p-16: Heroes, onboarding
- gap-3/4: Lists/grids breathing room
- space-y-6/8: Major section rhythm

**Mobile (Base):**
- Single column + bottom nav (h-16)
- Top bar (h-14), content fills vertical space
- FAB: bottom-right, above nav

**Desktop (lg: 1024px+):**
- Triple-pane: Nav sidebar (w-20/w-64) + List (w-80) + Content (flex-1)
- Max container: max-w-screen-2xl mx-auto
- 1px borders, no shadows

**Grids:**
- Character cards: cols-1 (mobile), cols-2 (md), cols-3 (lg), cols-4 (xl)
- Images: cols-2/3, gap-2

---

## Components

### Navigation
**Mobile:** Bottom bar, 4-5 icons, h-16  
**Desktop:** Collapsible sidebar (icon/icon+label)  
**Active:** rounded-full pill background  
**Badges:** w-5 h-5, top-right corner

**Header Bar (h-14, px-4):**
- Chat: Avatar + name (left), actions (right)
- Lists: Title (left), filter/search/add (right)
- Back button on mobile drill-downs

### Chat List
**Items (h-18, py-3):**
- Avatar (w-12 h-12) + Name/Preview + Time/Badge
- Preview: 2-line truncate, opacity-70
- Pinned: Sticky top with separator
- Swipe: Archive/Delete (80px each)

### Messages
**Bubbles:**
- User: Right, rounded-3xl (rounded-tl-md first in sequence)
- AI: Left, rounded-3xl (rounded-tr-md first in sequence)
- Max-width: max-w-md (desktop), max-w-[80%] (mobile)
- Padding: px-4 py-3 (px-5 py-4 longer messages)
- Spacing: space-y-1 (same sender), space-y-6 (sender change)

**Metadata:** Timestamp on hover/long-press, opacity-60, absolute below bubble  
**Reactions:** Row below, max-h-8, gap-1  
**Typing:** 3 pulsing dots, 1.4s duration, 0.2s stagger

**Input Composer (sticky bottom, backdrop-blur-lg, px-4 py-3):**
- Text area: min-h-[44px], max-h-[120px], rounded-full
- Border-2 on focus
- Buttons (w-10 h-10): Attachment, Emoji, Send
- Placeholder: "Message [Character Name]..."

**Group Chat:**
- Avatar w-8 h-8 inline with AI name
- Turn order: vertical line connecting messages
- Multi-select: Left-side checkboxes

### Character Cards

**Grid Card (rounded-2xl, p-6, aspect-[3/4]):**
- Avatar: w-20 h-20, rounded-full, centered top
- Name: 17px semibold, truncate
- Tagline: 13px, opacity-70, line-clamp-2
- Stats: Bottom, small icons + numbers
- Actions: Floating on hover, top-right

**Detail View:**
- Hero: h-64, gradient, avatar w-32 h-32 centered
- Name + bio: max-w-md centered
- Tabs: About/Memories/Chat Settings (sticky)
- Conversation starters: rounded-full pills, px-6 py-3, 2-col grid

**Creation/Edit:**
- Mobile: Full-screen modal, Desktop: max-w-2xl overlay
- Avatar: w-40 h-40 circular with camera overlay
- Sections: Name (h-12), Personality (select), Bio (min-h-32), Traits (tags)
- Actions: Sticky bottom on mobile

### Moments/Feed

**Layout:** Single column, max-w-2xl mx-auto, p-4

**Post Card (rounded-xl, p-6, space-y-4):**
- Header: Avatar (w-11 h-11) + name + timestamp
- Content: 16px, preserve breaks, max 500 chars
- Media: 1 image (aspect-video), 2-4 (cols-2), 5+ (cols-3)
- Interactions: Like/Comment/Share, gap-6
- Comments: First 2 + "View all X" link

**Composer:**
- Mobile: Full-screen, Desktop: max-w-lg modal
- Text: min-h-40, auto-expand
- Images: Grid (max 9) with remove
- Post button: Top-right, disabled until content

### Forms & Buttons

**Inputs:**
- Text: h-12, rounded-lg, px-4, border-2 on focus
- Textarea: min-h-32, rounded-xl, p-4
- Select: h-12, rounded-lg, chevron right
- Toggle: w-11 h-6, rounded-full

**Buttons:**
- Primary: rounded-xl, h-12, px-8, medium (500)
- Secondary: Outlined, same dimensions
- Text: h-10, px-4
- Icon: w-10 h-10 (w-11 h-11 primary), rounded-full
- FAB: w-14 h-14, fixed bottom-20/6 right-4/6

**Auth Screens:**
- Logo: h-16, mb-12, centered
- Form: max-w-md mx-auto (desktop), p-6 (mobile)
- Social: h-12, rounded-xl, brand icons
- Divider: "or continue with email"
- Stack: space-y-4

### Overlays

**Bottom Sheet (Mobile):**
- rounded-t-3xl, max-h-90vh
- Drag handle: w-12 h-1, rounded-full

**Modal (Desktop):**
- backdrop-blur-md, centered
- rounded-2xl: max-w-md/2xl/4xl
- Close: w-8 h-8, top-right

**Toast:**
- Bottom-center (mobile), top-right (desktop)
- rounded-xl, px-6 py-4, min-w-[280px]
- Icon + message + dismiss, 4s auto-dismiss

---

## Images

**Avatar Sizes:** w-8 (inline), w-12 (lists), w-20 (cards), w-32 (profiles), w-40 (creation)  
**Style:** rounded-full, gradient + initials placeholder

**Onboarding Hero:** h-screen, centered w-64 h-64 illustration, backdrop-blur-md CTA

**Empty States:** w-48 h-48 illustration, 22px heading, 16px description, action button

**Feed Images:** 1-9 per post, aspect-square, object-cover, gap-2, lightbox on click

---

## Light/Dark Modes

**Elevation:**
- Light: Subtle shadows
- Dark: Layered surfaces, borders (no shadows)

**Bubbles:**
- Light: Crisp contrast
- Dark: Softer distinction

**Borders:**
- Light: opacity-20
- Dark: opacity-10

**Avatars:** Border in dark mode (opacity-10)

**Transition:** transition-colors duration-200, persist preference

---

## Animation & Interaction

**Subtle Motion (Essential Only):**
- Message send: 150ms fade-in
- Typing: 1.4s pulsing dots
- Nav: 200ms slide (mobile), instant (desktop)
- Modals: 200ms fade + scale(0.95→1)
- Toasts: 300ms slide-in

**Feedback:**
- Button: 100ms scale(0.97) active
- List tap: 150ms background flash
- Long-press: scale(1.02) after 600ms

**Loading:**
- Skeletons: Pulsing placeholders
- Spinners: w-5 h-5 (buttons), w-8 h-8 (sections)
- Optimistic UI: Show immediately, pending indicator

---

## Responsive Breakpoints

**Base (0-767px):** Single column, bottom nav, full-screen modals  
**md (768-1023px):** Split views, larger type  
**lg (1024px+):** Triple-pane, hover states, keyboard shortcuts  
**xl (1280px+):** Increased max-widths

**Touch vs Pointer:**
- Mobile: 44px targets, swipe gestures
- Desktop: 36px minimum, hover, right-click menus

**Adaptive:** Bottom bar→Sidebar, Full-screen→Centered, Overlay→Persistent, 80% width→max-w-md

---

## Accessibility

- **Contrast:** 4.5:1 text, 3:1 UI components
- **Focus:** 2px ring all interactive elements
- **Keyboard:** Full navigation, logical tab order
- **Screen readers:** Semantic HTML, ARIA labels, live regions for messages
- **Motion:** Respect prefers-reduced-motion
- **Scaling:** Functional to 200% zoom