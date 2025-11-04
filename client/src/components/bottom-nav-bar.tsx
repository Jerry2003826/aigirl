import { useLocation } from "wouter";
import { MessageCircle, Users, Camera, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type BottomNavBarProps = {
  onChatClick?: () => void;
};

export function BottomNavBar({ onChatClick }: BottomNavBarProps) {
  const [location, setLocation] = useLocation();

  const navItems = [
    { title: "聊天", path: "/chat", icon: MessageCircle, testId: "nav-chat", key: "chat" },
    { title: "联系人", path: "/contacts", icon: Users, testId: "nav-contacts", key: "contacts" },
    { title: "动态", path: "/moments", icon: Camera, testId: "nav-moments", key: "moments" },
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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around p-3 max-w-3xl mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.path || (location === "/" && item.path === "/chat");
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => handleNavClick(item)}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-3 rounded-lg flex-1 transition-colors hover-elevate touch-target-sm",
                isActive && "text-primary"
              )}
              data-testid={item.testId}
            >
              <Icon className={cn("h-6 w-6", isActive && "text-primary")} />
              <span className="text-xs font-medium">{item.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
