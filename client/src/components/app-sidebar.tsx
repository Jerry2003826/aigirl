import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Users, Camera, UserCircle, Search, Share2, Sun, Moon, Download, BarChart2, Brain, Settings, RotateCcw, Plus, LogOut, Eye, EyeOff, Edit2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import { useImmersiveMode } from "@/components/immersive-mode-provider";
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
import { Label } from "@/components/ui/label";
import { useState, useRef } from "react";

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
  showMobileSidebar?: boolean;
};

export function AppSidebar({ selectedConversationId, onConversationSelect, onNewChat, showMobileSidebar = true }: AppSidebarProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isImmersive, toggleImmersive } = useImmersiveMode();
  const { toast } = useToast();
  
  // Profile edit state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Logout via Replit OIDC - redirects to OIDC logout
      window.location.href = "/api/logout";
    },
    onError: () => {
      toast({
        title: "错误",
        description: "退出登录失败",
        variant: "destructive",
      });
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { username?: string; profileImageUrl?: string }) => {
      return await apiRequest("PATCH", "/api/user/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEditProfileOpen(false);
      toast({
        title: "成功",
        description: "资料已更新",
      });
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "更新资料失败",
        variant: "destructive",
      });
    },
  });

  // Handle avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('上传失败');
      }

      const data = await response.json();
      setProfileImageUrl(data.url);
      toast({
        title: "成功",
        description: "头像已上传",
      });
    } catch (error: any) {
      toast({
        title: "错误",
        description: error.message || "上传头像失败",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Open edit dialog with current user data
  const handleOpenEditProfile = () => {
    setUsername((user as any)?.username || "");
    setProfileImageUrl((user as any)?.profileImageUrl || "");
    setIsEditProfileOpen(true);
  };

  // Submit profile update
  const handleSubmitProfile = () => {
    const updates: { username?: string; profileImageUrl?: string } = {};
    
    if (username && username !== (user as any)?.username) {
      updates.username = username;
    }
    if (profileImageUrl && profileImageUrl !== (user as any)?.profileImageUrl) {
      updates.profileImageUrl = profileImageUrl;
    }

    if (Object.keys(updates).length === 0) {
      setIsEditProfileOpen(false);
      return;
    }

    updateProfileMutation.mutate(updates);
  };

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

  const userProfileImage = (user as any)?.profileImageUrl;
  const userName = (user as any)?.username;
  const userEmail = (user as any)?.email;

  return (
    <Sidebar 
      collapsible="none"
      className={cn(
        "border-r-0 w-full md:w-[var(--sidebar-width)]",
        // Desktop: always show. Mobile: only show when showMobileSidebar is true
        "md:!block",
        !showMobileSidebar && "hidden md:block"
      )}>
      <SidebarHeader className="border-b border-sidebar-border p-4 h-auto md:h-[200px]">
        {/* User Info Section - Clickable */}
        <button
          onClick={handleOpenEditProfile}
          className="flex items-center justify-between mb-4 w-full hover-elevate rounded-lg p-2 -m-2 transition-colors"
          data-testid="button-edit-profile"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-11 w-11">
                <AvatarImage src={userProfileImage || undefined} />
                <AvatarFallback className="bg-primary/20 text-primary text-base">
                  {userName?.substring(0, 2).toUpperCase() || "我"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <Edit2 className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>
            <div className="flex-1 overflow-hidden text-left">
              <p className="font-semibold text-base truncate" data-testid="text-user-name">
                {userName || "我"}
              </p>
              <p className="text-sm text-muted-foreground truncate" data-testid="text-user-id">
                {userEmail || "2054634601@qq..."}
              </p>
            </div>
          </div>
        </button>

        {/* Icon Toolbar */}
        <div className="flex items-center gap-2 mb-4">
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-10 w-10 touch-target-sm" 
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-10 w-10 touch-target-sm"
            onClick={toggleImmersive}
            data-testid="button-immersive-toggle"
            title={isImmersive ? "退出沉浸模式" : "进入沉浸模式"}
          >
            {isImmersive ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </Button>
          {!isImmersive && (
            <>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-10 w-10 touch-target-sm"
                onClick={() => setLocation("/personas")}
                data-testid="button-personas"
              >
                <Users className="h-5 w-5" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-10 w-10 touch-target-sm"
                onClick={handleRefresh}
                data-testid="button-refresh"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-10 w-10 touch-target-sm"
                onClick={() => setLocation("/settings")}
                data-testid="button-settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-10 w-10 touch-target-sm"
                data-testid="button-user-menu"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>退出登录</DialogTitle>
                <DialogDescription>
                  确认要退出当前账户吗？
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {}}
                  data-testid="button-cancel-logout"
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  data-testid="button-logout"
                >
                  {logoutMutation.isPending ? "退出中..." : "确认退出"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="搜索"
            className="pl-10 bg-sidebar-accent border-0 h-11 text-base"
            data-testid="input-search"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="p-0 overflow-hidden h-auto md:h-[calc(100vh-280px)]">
        <ScrollArea className="h-full w-full">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="mb-4 h-16 w-16 text-muted-foreground" />
              <p className="mb-2 text-base font-semibold" data-testid="text-no-conversations">暂无消息</p>
              <p className="text-sm text-muted-foreground">
                点击下方按钮创建AI女友
              </p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "relative w-full rounded-lg transition-colors hover-elevate group",
                    selectedConversationId === conversation.id && "bg-sidebar-accent"
                  )}
                >
                  <button
                    onClick={() => {
                      onConversationSelect(conversation.id);
                      setLocation("/chat");
                    }}
                    className="w-full p-3 text-left"
                    data-testid={`button-conversation-${conversation.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-14 w-14">
                          <AvatarImage src={conversation.personas?.[0]?.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-base">
                            {conversation.title?.substring(0, 2).toUpperCase() || "AI"}
                          </AvatarFallback>
                        </Avatar>
                        {(conversation.unreadCount ?? 0) > 0 && (
                          <div 
                            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-semibold rounded-full border-2 border-sidebar shadow-sm transition-all duration-200 animate-in fade-in zoom-in-50"
                            data-testid={`badge-unread-${conversation.id}`}
                          >
                            {(conversation.unreadCount ?? 0) > 99 ? '99+' : (conversation.unreadCount ?? 0)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between mb-1">
                          <p className={cn(
                            "truncate text-base",
                            conversation.unreadCount && conversation.unreadCount > 0 ? "font-semibold" : "font-medium"
                          )} data-testid={`text-conversation-title-${conversation.id}`}>
                            {conversation.title || conversation.personas?.[0]?.name || "新聊天"}
                          </p>
                          {conversation.lastMessageAt && (
                            <span className="text-sm text-muted-foreground ml-2 shrink-0">
                              {format(new Date(conversation.lastMessageAt), "HH:mm")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <p className={cn(
                            "truncate text-sm",
                            conversation.unreadCount && conversation.unreadCount > 0 
                              ? "text-foreground font-medium" 
                              : "text-muted-foreground"
                          )} data-testid={`text-last-message-${conversation.id}`}>
                            {conversation.lastMessage 
                              ? `${conversation.lastMessage.senderType === 'ai' ? '' : '我: '}${conversation.lastMessage.content || '[图片]'}`
                              : '暂无消息'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SidebarContent>

      {/* Page Navigation - Desktop Only */}
      <SidebarFooter className="border-t border-sidebar-border px-3 py-2 pb-[env(safe-area-inset-bottom)] hidden md:block h-[80px]">
        <div className="grid grid-cols-4 gap-2">
          <Button
            variant="ghost"
            className={cn(
              "flex flex-col items-center gap-1 py-3 h-auto",
              location === "/chat" && "bg-sidebar-accent"
            )}
            onClick={() => setLocation("/chat")}
            data-testid="nav-chat"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs">聊天</span>
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "flex flex-col items-center gap-1 py-3 h-auto",
              location === "/contacts" && "bg-sidebar-accent"
            )}
            onClick={() => setLocation("/contacts")}
            data-testid="nav-contacts"
          >
            <Users className="h-5 w-5" />
            <span className="text-xs">联系人</span>
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "flex flex-col items-center gap-1 py-3 h-auto",
              location === "/moments" && "bg-sidebar-accent"
            )}
            onClick={() => setLocation("/moments")}
            data-testid="nav-moments"
          >
            <Camera className="h-5 w-5" />
            <span className="text-xs">动态</span>
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "flex flex-col items-center gap-1 py-3 h-auto",
              location === "/groups" && "bg-sidebar-accent"
            )}
            onClick={() => setLocation("/groups")}
            data-testid="nav-groups"
          >
            <UserCircle className="h-5 w-5" />
            <span className="text-xs">群聊</span>
          </Button>
        </div>
      </SidebarFooter>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑资料</DialogTitle>
            <DialogDescription>
              修改你的昵称和头像
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profileImageUrl || userProfileImage || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                    {username?.substring(0, 2).toUpperCase() || userName?.substring(0, 2).toUpperCase() || "我"}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate active-elevate-2"
                  disabled={uploadingAvatar}
                  data-testid="button-upload-avatar"
                >
                  <Upload className="h-4 w-4" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              {uploadingAvatar && (
                <p className="text-sm text-muted-foreground">上传中...</p>
              )}
            </div>

            {/* Username Input */}
            <div className="space-y-2">
              <Label htmlFor="username">昵称</Label>
              <Input
                id="username"
                placeholder="输入昵称"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-edit-username"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsEditProfileOpen(false)}
              data-testid="button-cancel-edit"
            >
              取消
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmitProfile}
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
