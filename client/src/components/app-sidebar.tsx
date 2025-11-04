import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Users, Camera, UserCircle, Search, Share2, Sun, Moon, Download, BarChart2, Brain, Settings, RotateCcw, Plus, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Conversation = {
  id: string;
  title: string | null;
  isGroup: boolean;
  lastMessageAt: Date | null;
  unreadCount?: number;
  lastMessage?: {
    content: string;
    senderType: string;
    createdAt: Date;
  } | null;
  personas?: { name: string; avatarUrl: string | null }[];
};

type AppSidebarProps = {
  selectedConversationId: string | null;
  onConversationSelect: (id: string) => void;
  onNewChat: () => void;
};

export function AppSidebar({ selectedConversationId, onConversationSelect, onNewChat }: AppSidebarProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: () => {
      toast({
        title: "错误",
        description: "退出登录失败",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast({
      title: "已刷新",
      description: "数据已同步",
    });
  };

  const navItems = [
    { title: "聊天", path: "/chat", icon: MessageCircle, testId: "nav-chat", key: "chat" },
    { title: "联系人", path: "/contacts", icon: Users, testId: "nav-contacts", key: "contacts" },
    { title: "动态", path: "/moments", icon: Camera, testId: "nav-moments", key: "moments" },
    { title: "群聊", path: "/groups", icon: UserCircle, testId: "nav-groups", key: "groups" },
  ];

  const currentNav = navItems.find(item => location === item.path) || navItems[0];

  const userProfileImage = (user as any)?.profileImage;
  const userName = (user as any)?.username;
  const userEmail = (user as any)?.email;

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        {/* User Info Section */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={userProfileImage || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary">
                {userName?.substring(0, 2).toUpperCase() || "我"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="font-medium text-sm truncate" data-testid="text-user-name">
                我
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-user-id">
                {userEmail || "2054634601@qq..."}
              </p>
            </div>
          </div>
        </div>

        {/* Icon Toolbar */}
        <div className="flex items-center gap-1 mb-4">
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8" 
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={() => setLocation("/personas")}
            data-testid="button-personas"
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={handleRefresh}
            data-testid="button-refresh"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={() => setLocation("/settings")}
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8"
                data-testid="button-user-menu"
              >
                <UserCircle className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>账户管理</DialogTitle>
                <DialogDescription>
                  账户设置和退出登录
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setLocation("/personas")}
                  data-testid="button-manage-personas"
                >
                  <Users className="mr-2 h-4 w-4" />
                  角色管理
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  data-testid="button-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {logoutMutation.isPending ? "退出中..." : "退出登录"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索"
            className="pl-9 bg-sidebar-accent border-0"
            data-testid="input-search"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="p-0">
        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 text-sm font-medium" data-testid="text-no-conversations">暂无消息</p>
              <p className="text-xs text-muted-foreground">
                点击下方按钮创建AI女友
              </p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    onConversationSelect(conversation.id);
                    setLocation("/chat");
                  }}
                  className={cn(
                    "w-full rounded-lg p-3 text-left transition-colors hover-elevate",
                    selectedConversationId === conversation.id && "bg-sidebar-accent"
                  )}
                  data-testid={`button-conversation-${conversation.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={conversation.personas?.[0]?.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {conversation.title?.substring(0, 2).toUpperCase() || "AI"}
                        </AvatarFallback>
                      </Avatar>
                      {conversation.unreadCount && conversation.unreadCount > 0 && (
                        <Badge 
                          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center bg-primary text-primary-foreground text-xs"
                          data-testid={`badge-unread-${conversation.id}`}
                        >
                          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <p className={cn(
                          "truncate text-sm",
                          conversation.unreadCount && conversation.unreadCount > 0 ? "font-semibold" : "font-medium"
                        )} data-testid={`text-conversation-title-${conversation.id}`}>
                          {conversation.title || conversation.personas?.[0]?.name || "新聊天"}
                        </p>
                        {conversation.lastMessageAt && (
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {format(new Date(conversation.lastMessageAt), "HH:mm")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <p className={cn(
                          "truncate text-xs",
                          conversation.unreadCount && conversation.unreadCount > 0 
                            ? "text-foreground font-medium" 
                            : "text-muted-foreground"
                        )} data-testid={`text-last-message-${conversation.id}`}>
                          {conversation.lastMessage 
                            ? `${conversation.lastMessage.senderType === 'ai' ? '' : '我: '}${conversation.lastMessage.content}`
                            : '暂无消息'}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="p-0 border-t border-sidebar-border">
        {/* Bottom Navigation */}
        <div className="flex items-center justify-around p-2 border-b border-sidebar-border">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setLocation(item.path)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg flex-1 transition-colors hover-elevate",
                  isActive && "text-primary"
                )}
                data-testid={item.testId}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className="text-xs">{item.title}</span>
              </button>
            );
          })}
        </div>

        {/* CTA Button */}
        <div className="p-3">
          <Button
            onClick={onNewChat}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            data-testid="button-create-ai-girlfriend"
          >
            <Plus className="h-4 w-4 mr-2" />
            创建新AI女友
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
