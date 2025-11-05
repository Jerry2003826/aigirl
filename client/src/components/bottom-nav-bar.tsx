import { useLocation } from "wouter";
import { MessageCircle, Users, Camera, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Moment, User } from "@shared/schema";

type BottomNavBarProps = {
  onChatClick?: () => void;
  hide?: boolean;
};

export function BottomNavBar({ onChatClick, hide = false }: BottomNavBarProps) {
  const [location, setLocation] = useLocation();

  // Fetch current user
  const { data: currentUser } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  // Fetch moments to calculate unread comments count
  const { data: moments = [] } = useQuery<Moment[]>({
    queryKey: ['/api/moments'],
  });

  // Fetch conversations to calculate total unread messages
  const { data: conversations = [] } = useQuery<any[]>({
    queryKey: ['/api/conversations'],
  });

  // Calculate total unread comments for user's own moments
  const totalUnreadComments = moments
    .filter(m => m.authorId === currentUser?.id && m.authorType === 'user')
    .reduce((sum, m) => sum + (m.unreadCommentsCount || 0), 0);

  // Calculate total unread messages across all conversations
  const totalUnreadMessages = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const navItems = [
    { title: "聊天", path: "/chat", icon: MessageCircle, testId: "nav-chat", key: "chat", badge: totalUnreadMessages },
    { title: "联系人", path: "/contacts", icon: Users, testId: "nav-contacts", key: "contacts" },
    { title: "动态", path: "/moments", icon: Camera, testId: "nav-moments", key: "moments", badge: totalUnreadComments },
    { title: "群聊", path: "/groups", icon: UserCircle, testId: "nav-groups", key: "groups" },
  ];

  const handleNavClick = (item: typeof navItems[0]) => {
    if (item.path === "/chat" && onChatClick) {
      // 点击聊天按钮时，先清除选中的对话，再跳转
      onChatClick();
    } else {
      setLocation(item.path);
    }
  };

  if (hide) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex items-center justify-around py-2 px-2 max-w-3xl mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.path || (location === "/" && item.path === "/chat");
          const Icon = item.icon;
          const showBadge = item.badge !== undefined && item.badge > 0;
          
          return (
            <button
              key={item.key}
              onClick={() => handleNavClick(item)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg flex-1 transition-colors hover-elevate relative",
                isActive && "text-primary"
              )}
              data-testid={item.testId}
            >
              <div className="relative">
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                {showBadge && (
                  <div 
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1"
                    data-testid={`badge-${item.key}-unread`}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
