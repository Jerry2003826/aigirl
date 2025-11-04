import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Send, MessageCircle, Loader2, ImagePlus, X, MoreVertical, Brain, MessageSquare, UserCircle, Trash2, ArrowLeft, Search, FileText, Image as ImageIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

type Conversation = {
  id: string;
  title: string | null;
  isGroup: boolean;
  lastMessageAt: Date | null;
  personas?: { id: string; name: string; avatarUrl: string | null }[];
};

type Message = {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderType: "user" | "ai";
  content: string;
  isRead: boolean;
  status: string;
  createdAt: Date;
  personaName?: string;
  personaAvatar?: string | null;
};

type Persona = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

interface ChatProps {
  selectedConversationId: string | null;
  onConversationDeleted?: () => void;
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
}

export default function Chat({ selectedConversationId, onConversationDeleted, onBackToList, showMobileSidebar = true }: ChatProps) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [messageInput, setMessageInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messageLimit, setMessageLimit] = useState(50);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyMessageType, setHistoryMessageType] = useState<"all" | "text" | "image">("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: aiStatus } = useQuery<{ isOnline: boolean; providers: { openai: boolean; google: boolean } }>({
    queryKey: ["/api/ai/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedConversationId, messageLimit],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages?limit=${messageLimit}&offset=0`
      );
      if (!response.ok) throw new Error("获取消息失败");
      return response.json();
    },
    enabled: !!selectedConversationId,
  });

  // Separate query for chat history dialog - fetch ALL messages
  const { data: allMessages = [], isLoading: allMessagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages/all", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages?limit=9999&offset=0`
      );
      if (!response.ok) throw new Error("获取历史消息失败");
      return response.json();
    },
    enabled: !!selectedConversationId && showHistoryDialog,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (conversationId: string) =>
      apiRequest("POST", `/api/conversations/${conversationId}/read`, {}),
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "文件类型无效",
        description: "请选择图片文件",
        variant: "destructive",
      });
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "文件过大",
        description: "图片必须小于5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImageData(base64);
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageData(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId: string) =>
      apiRequest("DELETE", `/api/conversations/${conversationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({
        title: "成功",
        description: "对话已删除",
      });
      // Clear the selected conversation
      if (onConversationDeleted) {
        onConversationDeleted();
      }
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "删除对话失败",
        variant: "destructive",
      });
    },
  });

  const deletePersonaMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/personas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({
        title: "成功",
        description: "AI女友已成功删除",
      });
      // Clear the selected conversation and navigate to chat
      if (onConversationDeleted) {
        onConversationDeleted();
      }
      setLocation("/chat");
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "删除AI女友失败",
        variant: "destructive",
      });
    },
  });

  const handleDeleteConversation = () => {
    if (!selectedConversation) return;
    if (confirm("确定要删除这个对话吗？所有消息将被永久删除。")) {
      deleteConversationMutation.mutate(selectedConversation.id);
    }
  };

  const handleDeletePersona = () => {
    if (!selectedConversation?.personas?.[0]) return;
    const personaName = selectedConversation.personas[0].name;
    if (confirm(`确定要删除 ${personaName} 吗？这将删除所有相关的聊天记录和记忆。`)) {
      deletePersonaMutation.mutate(selectedConversation.personas[0].id);
    }
  };

  const handleViewMemories = () => {
    if (!selectedConversation?.personas?.[0]) return;
    // Navigate to contact detail page which shows memories
    setLocation(`/contacts/${selectedConversation.personas[0].id}`);
  };

  const handleViewChatHistory = () => {
    // Open the history dialog
    setShowHistoryDialog(true);
    setHistorySearchQuery("");
    setHistoryMessageType("all");
  };

  // Helper function to check if a message contains an image
  const isImageMessage = (message: Message) => {
    return message.content.startsWith("data:image") || message.content === "[Image]" || message.content.includes("[Image]");
  };

  // Filter all messages based on search and type
  const filteredHistoryMessages = allMessages.filter((message) => {
    // Filter by search query
    const matchesSearch = !historySearchQuery || 
      message.content.toLowerCase().includes(historySearchQuery.toLowerCase());
    
    // Filter by message type
    let matchesType = true;
    
    if (historyMessageType === "text") {
      matchesType = !isImageMessage(message);
    } else if (historyMessageType === "image") {
      matchesType = isImageMessage(message);
    }
    
    return matchesSearch && matchesType;
  });

  // Count messages by type for tabs
  const textMessagesCount = allMessages.filter(m => !isImageMessage(m)).length;
  const imageMessagesCount = allMessages.filter(m => isImageMessage(m)).length;

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content, imageData }: { 
      conversationId: string; 
      content: string;
      imageData?: string | null;
    }) => {
      // Send user message (with optional image)
      return apiRequest("POST", "/api/messages", {
        conversationId,
        content: content || (imageData ? "[Image]" : ""),
        senderType: "user",
        imageData: imageData || undefined,
      });
    },
    onSuccess: async (_, { conversationId, content }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setMessageInput("");
      handleRemoveImage();
      
      // Get conversation participants to find AI persona
      const conversation = conversations.find(c => c.id === conversationId);
      if (!conversation) return;

      try {
        // Determine which persona should respond
        let respondingPersonaId: string;
        
        if (conversation.isGroup) {
          // For group chats, use intelligent rotation
          setIsTyping(true);
          const selectionResult: any = await apiRequest("POST", "/api/ai/select-persona", {
            conversationId,
            userMessage: content || "[User sent an image]",
          });
          respondingPersonaId = selectionResult.personaId;
        } else {
          // For 1-on-1 chats, use the single participant
          const participants = await queryClient.fetchQuery({
            queryKey: ["/api/conversations/participants", conversationId],
            queryFn: async () => {
              const response = await fetch(`/api/conversations/${conversationId}/participants`);
              if (!response.ok) throw new Error("获取参与者失败");
              return response.json();
            },
          });
          
          const personaParticipant = participants[0];
          if (!personaParticipant) return;
          respondingPersonaId = personaParticipant.personaId;
        }

        // Trigger AI response
        setIsTyping(true);
        await apiRequest("POST", "/api/ai/generate", {
          conversationId,
          personaId: respondingPersonaId,
          content: content || "[User sent an image, please analyze it]",
        });
        setIsTyping(false);
        queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      } catch (error) {
        setIsTyping(false);
        console.error("生成AI回复时出错:", error);
      }
    },
    onError: (error: any, variables) => {
      setFailedMessageId(variables.conversationId);
      toast({
        title: "错误",
        description: error.message || "发送消息失败",
        variant: "destructive",
      });
    },
  });

  const retryLastMessage = () => {
    if (failedMessageId && messageInput.trim()) {
      setFailedMessageId(null);
      handleSendMessage();
    }
  };

  const handleSendMessage = () => {
    if (!selectedConversationId) return;
    if (!messageInput.trim() && !imageData) return;
    
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      content: messageInput.trim(),
      imageData,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-scroll only for new messages, not when loading more history
  useEffect(() => {
    // Only scroll if we got new messages (not loading older ones)
    if (!isLoadingMore && messages.length > prevMessagesLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessagesLengthRef.current = messages.length;
    setIsLoadingMore(false);
  }, [messages]);

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedConversationId && messages.length > 0) {
      const hasUnreadMessages = messages.some(m => !m.isRead && m.senderType === "ai");
      if (hasUnreadMessages) {
        markAsReadMutation.mutate(selectedConversationId);
      }
    }
  }, [selectedConversationId, messages]);

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  return (
    <div className={cn(
      "flex h-full flex-col",
      // Mobile: only show chat when sidebar is hidden
      "md:flex",
      showMobileSidebar && "hidden md:flex"
    )}>
      {selectedConversation ? (
        <>
          {/* Chat Header */}
          <div className="flex items-center gap-3 border-b p-4 bg-sidebar justify-between">
            {/* Back Button (Mobile Only) */}
            {onBackToList && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 md:hidden"
                onClick={onBackToList}
                data-testid="button-back-to-list"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={selectedConversation.personas?.[0]?.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedConversation.title?.substring(0, 2).toUpperCase() || "AI"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate" data-testid="text-chat-header-title">
                  {selectedConversation.title || selectedConversation.personas?.[0]?.name || "Chat"}
                </h3>
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    isTyping 
                      ? "bg-blue-500" 
                      : aiStatus?.isOnline 
                        ? "bg-green-500" 
                        : "bg-gray-400"
                  )} data-testid="status-indicator"></div>
                  <p className="text-sm text-muted-foreground" data-testid="text-status">
                    {isTyping ? "正在输入中..." : aiStatus?.isOnline ? "在线" : "离线"}
                  </p>
                </div>
              </div>
            </div>

            {/* Menu Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  data-testid="button-chat-menu"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {!selectedConversation.isGroup && selectedConversation.personas?.[0] && (
                  <>
                    <DropdownMenuItem
                      onClick={handleViewMemories}
                      data-testid="menu-view-memories"
                    >
                      <Brain className="mr-2 h-4 w-4" />
                      查看记忆
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={handleViewChatHistory}
                  data-testid="menu-view-history"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  查看聊天记录
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDeleteConversation}
                  className="text-destructive focus:text-destructive"
                  data-testid="menu-delete-conversation"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除对话
                </DropdownMenuItem>
                {!selectedConversation.isGroup && selectedConversation.personas?.[0] && (
                  <DropdownMenuItem
                    onClick={handleDeletePersona}
                    className="text-destructive focus:text-destructive"
                    data-testid="menu-delete-persona"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除AI女友
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden relative">
              <div className="h-full overflow-y-auto p-4" ref={scrollViewportRef}>
              {/* Load More Button */}
              {!messagesLoading && messages.length >= messageLimit && (
                <div className="flex justify-center mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsLoadingMore(true);
                      setMessageLimit(prev => prev + 50);
                    }}
                    data-testid="button-load-more"
                  >
                    加载更多消息
                  </Button>
                </div>
              )}
              
              {messagesLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <MessageCircle className="mb-4 h-16 w-16 text-muted-foreground" />
                  <p className="text-lg font-medium" data-testid="text-no-messages">开始对话</p>
                  <p className="text-sm text-muted-foreground">
                    发送消息开始聊天
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => {
                    const isUser = message.senderType === "user";
                    const showAvatar = !isUser && (index === 0 || messages[index - 1].senderType !== "ai");

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          isUser ? "justify-end" : "justify-start"
                        )}
                        data-testid={`message-${message.id}`}
                      >
                        {!isUser && showAvatar && (
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={message.personaAvatar || undefined} />
                            <AvatarFallback className="bg-primary/10 text-sm text-primary">
                              AI
                            </AvatarFallback>
                          </Avatar>
                        )}
                        {!isUser && !showAvatar && <div className="w-10" />}

                        <div
                          className={cn(
                            "max-w-[75%] md:max-w-md lg:max-w-lg rounded-3xl px-4 py-3",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-base leading-relaxed" data-testid={`text-message-content-${message.id}`}>
                            {message.content}
                          </p>
                          <p className={cn(
                            "mt-1.5 text-sm opacity-70",
                            isUser ? "text-primary-foreground" : "text-muted-foreground"
                          )}>
                            {format(new Date(message.createdAt), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex gap-3 justify-start" data-testid="typing-indicator">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-sm text-primary">
                          AI
                        </AvatarFallback>
                      </Avatar>
                      <div className="max-w-[75%] md:max-w-md lg:max-w-lg rounded-3xl px-4 py-3 bg-muted rounded-bl-md">
                        <div className="flex gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
              </div>
            </div>

            {/* Message Input */}
            <div className="border-t bg-background px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {failedMessageId === selectedConversationId && (
                <div className="mb-2 flex items-center gap-2 text-sm text-destructive">
                  <span>Message failed to send</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={retryLastMessage}
                    data-testid="button-retry-message"
                  >
                    Retry
                  </Button>
                </div>
              )}
              
              {/* Image Preview */}
              {imagePreview && (
                <div className="mb-2 relative inline-block">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="max-w-xs max-h-40 rounded-lg border"
                    data-testid="image-preview"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={handleRemoveImage}
                    data-testid="button-remove-image"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              <div className="flex gap-2.5 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  data-testid="input-file-hidden"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-image"
                >
                  <ImagePlus className="h-5 w-5" />
                </Button>
                <Textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="输入消息..."
                  rows={1}
                  className="min-h-[40px] max-h-[100px] resize-none text-base leading-relaxed"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={(!messageInput.trim() && !imageData) || sendMessageMutation.isPending}
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full bg-primary hover:bg-primary/90"
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <MessageCircle className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <p className="text-lg font-medium" data-testid="text-no-conversation-selected">
              选择一个对话
            </p>
            <p className="text-sm text-muted-foreground">
              从列表中选择一个对话开始聊天
            </p>
          </div>
        </div>
      )}

      {/* Chat History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>聊天记录</DialogTitle>
            <DialogDescription>
              查看所有历史消息，支持搜索和筛选
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索聊天内容..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-history-search"
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <Tabs value={historyMessageType} onValueChange={(v) => setHistoryMessageType(v as "all" | "text" | "image")}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" data-testid="tab-all-messages">
                  全部 ({allMessages.length})
                </TabsTrigger>
                <TabsTrigger value="text" data-testid="tab-text-messages">
                  <FileText className="h-4 w-4 mr-1" />
                  文字 ({textMessagesCount})
                </TabsTrigger>
                <TabsTrigger value="image" data-testid="tab-image-messages">
                  <ImageIcon className="h-4 w-4 mr-1" />
                  图片 ({imageMessagesCount})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={historyMessageType} className="flex-1 min-h-0 mt-4">
                <ScrollArea className="h-[calc(80vh-280px)]">
                  {allMessagesLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    </div>
                  ) : filteredHistoryMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <MessageCircle className="mb-4 h-16 w-16 text-muted-foreground" />
                      <p className="text-lg font-medium">没有找到消息</p>
                      <p className="text-sm text-muted-foreground">
                        {historySearchQuery ? "尝试其他搜索词" : "暂无消息记录"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 pr-4">
                      {filteredHistoryMessages.map((message) => {
                        const isUser = message.senderType === "user";
                        const isImage = isImageMessage(message);

                        return (
                          <div
                            key={message.id}
                            className={cn(
                              "flex gap-3",
                              isUser ? "justify-end" : "justify-start"
                            )}
                            data-testid={`history-message-${message.id}`}
                          >
                            {!isUser && (
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={message.personaAvatar || undefined} />
                                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                                  AI
                                </AvatarFallback>
                              </Avatar>
                            )}

                            <div className="flex flex-col gap-1 max-w-[70%]">
                              <div
                                className={cn(
                                  "rounded-2xl px-3 py-2",
                                  isUser
                                    ? "bg-primary text-primary-foreground rounded-br-md"
                                    : "bg-muted rounded-bl-md"
                                )}
                              >
                                {isImage ? (
                                  message.content.startsWith("data:image") ? (
                                    <img
                                      src={message.content}
                                      alt="Sent image"
                                      className="max-w-full rounded-lg"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2 text-sm">
                                      <ImageIcon className="h-4 w-4" />
                                      <span>图片消息</span>
                                    </div>
                                  )
                                ) : (
                                  <p className="text-sm whitespace-pre-wrap break-words">
                                    {message.content}
                                  </p>
                                )}
                              </div>
                              <div className={cn(
                                "text-xs text-muted-foreground px-1",
                                isUser ? "text-right" : "text-left"
                              )}>
                                {format(new Date(message.createdAt), "yyyy-MM-dd HH:mm")}
                              </div>
                            </div>

                            {isUser && (
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                                  我
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
