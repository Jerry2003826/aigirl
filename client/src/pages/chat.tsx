import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Send, MessageCircle, Loader2, ImagePlus, X, MoreVertical, Brain, MessageSquare, UserCircle, Trash2, ArrowLeft, Search, FileText, Image as ImageIcon } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useConversationSubscription } from "@/hooks/useGlobalWebSocket";
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
  avatarUrl?: string | null;
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
  clientMessageId?: string | null;
  imageData?: string | null;
};

interface ChatProps {
  selectedConversationId: string | null;
  onConversationDeleted?: () => void;
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
  wsRef: React.RefObject<WebSocket | null>;
}

export default function Chat({ selectedConversationId, onConversationDeleted, onBackToList, showMobileSidebar = true, wsRef }: ChatProps) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false); // 等待AI回复
  const [isStreaming, setIsStreaming] = useState(false); // AI正在分段输出
  const [messageLimit, setMessageLimit] = useState(50);
  const [failedMessages, setFailedMessages] = useState<Map<string, { conversationId: string; content: string; imageData?: string | null }>>(new Map());
  const [mentionedPersonaId, setMentionedPersonaId] = useState<string | null>(null); // @提及的AI
  const [showMentionPicker, setShowMentionPicker] = useState(false); // 显示@选择器
  const [mentionCursorPos, setMentionCursorPos] = useState(0); // @符号的位置
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyMessageType, setHistoryMessageType] = useState<"all" | "text" | "image">("all");
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]); // 乐观更新的用户消息
  const [aiMessageCount, setAiMessageCount] = useState(0); // 跟踪AI消息数量用于检测分段完成
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [showEditTitleDialog, setShowEditTitleDialog] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");
  const [replyingAIName, setReplyingAIName] = useState<string | null>(null); // 追踪正在回复的AI名字（仅群聊）
  const [pendingAIMessages, setPendingAIMessages] = useState<Message[]>([]); // 🆕 待显示的AI消息队列（用于平滑显示）
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMarkedConversationRef = useRef<string | null>(null);
  const messageQueueProcessorRef = useRef<NodeJS.Timeout | null>(null); // 🆕 队列处理器定时器
  
  // Use global WebSocket for conversation subscription
  useConversationSubscription(wsRef, selectedConversationId);

  const { data: user } = useQuery<{ id: string; username: string; profileImageUrl: string | null }>({
    queryKey: ["/api/auth/user"],
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  // Independent query for selected conversation details
  const { data: selectedConversationData, isLoading: conversationLoading } = useQuery<Conversation>({
    queryKey: ["/api/conversations", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) throw new Error("No conversation selected");
      const response = await fetch(`/api/conversations/${selectedConversationId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error("Failed to fetch conversation");
      return response.json();
    },
    enabled: !!selectedConversationId,
  });

  const { data: aiStatus } = useQuery<{ isOnline: boolean; providers: { openai: boolean; google: boolean; custom: boolean }; message?: string }>({
    queryKey: ["/api/ai/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: rawMessages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedConversationId, messageLimit],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages?limit=${messageLimit}&offset=0`,
        {
          credentials: 'include',
          cache: 'no-store', // 强制绕过HTTP缓存，确保refetch时获取最新数据
        }
      );
      if (!response.ok) throw new Error("获取消息失败");
      return response.json();
    },
    enabled: !!selectedConversationId,
    staleTime: 0, // 数据立即过期，确保invalidate后会refetch
    refetchOnWindowFocus: false, // 窗口聚焦时不refetch
    refetchOnReconnect: false, // 重新连接时不refetch
    placeholderData: (previousData) => previousData, // 🔧 保留上一次数据，避免UI闪烁
  });

  // Merge server messages with optimistic messages
  // Backend returns DESC (newest first), we need ASC (oldest first) for chat display
  const messages = useMemo(() => {
    console.log('[UI渲染] 🔄 消息合并开始', {
      rawMessagesCount: rawMessages.length,
      optimisticMessagesCount: optimisticMessages.length,
      failedMessagesCount: failedMessages.size,
      rawMessagesPreview: rawMessages.slice(0, 3).map(m => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        senderType: m.senderType,
        content: m.content?.substring(0, 20),
        status: m.status,
      })),
      optimisticMessagesPreview: optimisticMessages.map(m => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        senderType: m.senderType,
        content: m.content?.substring(0, 20),
        status: m.status,
      })),
    });
    
    // Step 1: Reverse rawMessages to get ASC order (oldest first)
    const reversedRaw = [...rawMessages].reverse();
    
    // Step 2: Find clientMessageIds that already exist in rawMessages
    const existingClientMessageIds = new Set(
      reversedRaw.map(m => m.clientMessageId).filter(Boolean)
    );
    
    // Step 3: Filter optimistic messages - exclude those already in rawMessages
    const filteredOptimistic = optimisticMessages.filter(m => {
      // Remove optimistic messages that have been replaced by real messages
      const shouldRemove = m.clientMessageId && existingClientMessageIds.has(m.clientMessageId);
      if (shouldRemove) {
        console.log('[UI渲染] 🔄 过滤已替换的乐观消息', {
          clientMessageId: m.clientMessageId,
          optimisticId: m.id,
        });
      }
      return !shouldRemove;
    });
    
    // Step 4: Append remaining optimistic messages
    const allMsgs = [...reversedRaw, ...filteredOptimistic];
    
    // Step 5: Deduplicate by ID - keep first occurrence (which is the real one)
    const messageMap = new Map<string, Message>();
    for (const msg of allMsgs) {
      if (!messageMap.has(msg.id)) {
        messageMap.set(msg.id, msg);
      }
    }
    
    // Step 6: Return as array - already in ASC order (oldest first, newest last)
    const finalMessages = Array.from(messageMap.values());
    
    console.log('[UI渲染] ✅ 消息合并完成', {
      finalCount: finalMessages.length,
      filteredOptimisticCount: filteredOptimistic.length,
      finalMessagesPreview: finalMessages.slice(-3).map(m => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        senderType: m.senderType,
        content: m.content?.substring(0, 20),
        status: m.status,
      })),
    });
    
    return finalMessages;
  }, [rawMessages, optimisticMessages, failedMessages]);

  // Separate query for chat history dialog - fetch ALL messages
  const { data: allMessages = [], isLoading: allMessagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages/all", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages?limit=9999&offset=0`,
        {
          credentials: 'include',
          cache: 'no-store', // 强制绕过HTTP缓存
        }
      );
      if (!response.ok) throw new Error("获取历史消息失败");
      return response.json();
    },
    enabled: !!selectedConversationId && showHistoryDialog,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (conversationId: string) => {
      console.log('[未读标记] 📤 发送标记已读API请求', { conversationId });
      return apiRequest("POST", `/api/conversations/${conversationId}/read`, {});
    },
    onMutate: async (conversationId) => {
      console.log('[未读标记] 🔄 乐观更新：立即清零未读数', { conversationId });
      
      // OPTIMIZED: 乐观更新 - 立即清零未读数，不等待API响应
      queryClient.setQueryData(
        ["/api/conversations"],
        (old: any[] = []) => {
          const targetConv = old.find(c => c.id === conversationId);
          console.log('[未读标记] 📊 更新前状态', {
            conversationId,
            conversationTitle: targetConv?.title,
            oldUnreadCount: targetConv?.unreadCount,
          });
          
          const newData = old.map(conv => 
            conv.id === conversationId
              ? { ...conv, unreadCount: 0 }
              : conv
          );
          
          const updatedConv = newData.find(c => c.id === conversationId);
          console.log('[未读标记] 📊 更新后状态', {
            conversationId,
            conversationTitle: updatedConv?.title,
            newUnreadCount: updatedConv?.unreadCount,
          });
          
          return newData;
        }
      );
    },
    onSuccess: (data, conversationId) => {
      console.log('[未读标记] ✅ 标记已读成功', { conversationId, response: data });
    },
    onError: (error, conversationId) => {
      console.error('[未读标记] ❌ 标记已读失败', { conversationId, error });
    },
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

  const handleViewMembers = () => {
    setShowMembersDialog(true);
  };

  const handleEditTitle = () => {
    if (!selectedConversation?.isGroup) return;
    setEditingTitle(selectedConversation.title || "");
    setShowEditTitleDialog(true);
  };

  // Update conversation title mutation
  const updateTitleMutation = useMutation({
    mutationFn: async ({ conversationId, title }: { conversationId: string; title: string }) => {
      return apiRequest("PATCH", `/api/conversations/${conversationId}`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversationId] });
      setShowEditTitleDialog(false);
      toast({ title: "✅ 群聊名称已更新" });
    },
    onError: (error: any) => {
      toast({
        title: "❌ 更新失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const handleSaveTitle = () => {
    if (!selectedConversationId || !editingTitle.trim() || updateTitleMutation.isPending) return;
    updateTitleMutation.mutate({
      conversationId: selectedConversationId,
      title: editingTitle.trim(),
    });
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
    mutationFn: async ({ conversationId, content, imageData, clientMessageId, mentionedPersonaId }: { 
      conversationId: string; 
      content: string;
      imageData?: string | null;
      clientMessageId: string;
      mentionedPersonaId?: string;
    }) => {
      // Send user message (with optional image and mention)
      return apiRequest("POST", "/api/messages", {
        conversationId,
        content: content || (imageData ? "[Image]" : ""),
        senderType: "user",
        imageData: imageData || undefined,
        clientMessageId, // Send clientMessageId to server for deduplication
        mentionedPersonaId: mentionedPersonaId || undefined,
      });
    },
    onSuccess: async (data, { conversationId, content, clientMessageId }) => {
      console.log('[API成功] ✅ 消息API调用成功', {
        clientMessageId,
        conversationId,
        responseData: data,
      });
      
      // Remove from failed messages if it was a retry
      setFailedMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(clientMessageId);
        return newMap;
      });
      
      // CRITICAL: 延迟清理乐观消息，等WebSocket收到真实消息后再清理
      // 这避免了消息短暂消失的问题
      // WebSocket会在收到真实消息时通过clientMessageId匹配并替换
      
      console.log('[API成功] 🚫 暂不清理乐观消息，等待WebSocket替换');
      
      // 设置一个延迟清理器，防止WebSocket失败时乐观消息永远存在
      setTimeout(() => {
        setOptimisticMessages(prev => {
          const filtered = prev.filter(m => m.clientMessageId !== clientMessageId);
          if (filtered.length < prev.length) {
            console.log('[API成功] 🧹 延迟清理超时的乐观消息', {
              clientMessageId,
              removedCount: prev.length - filtered.length,
            });
          }
          return filtered;
        });
      }, 2000); // 2秒后清理，给WebSocket足够时间
      
      // IMPORTANT: AI回复现在由后台Worker自动处理
      // POST /api/messages 已自动创建AI reply job，worker会轮询处理
      // 前端只需要设置状态，等待WebSocket广播AI消息
      
      console.log('[API成功] 🔄 更新状态：解锁isLoading，启用isStreaming');
      setIsLoading(false); // 用户消息发送成功，结束等待状态
      setIsStreaming(true); // 等待AI回复（后台worker处理）
      setAiMessageCount(0); // 重置AI消息计数
      
      // WebSocket会收到AI消息并触发streamingTimeout逻辑
      // 无需手动调用AI接口
      console.log('[API成功] ⏳ 等待WebSocket广播真实消息和AI回复');
    },
    onError: (error: any, { clientMessageId, content, imageData, conversationId }) => {
      // 发送失败时解锁输入框
      setIsLoading(false);
      setIsStreaming(false);
      
      // Clear optimistic message and store as failed
      setOptimisticMessages(prev => prev.filter(m => m.clientMessageId !== clientMessageId));
      setFailedMessages(prev => {
        const newMap = new Map(prev);
        newMap.set(clientMessageId, { conversationId, content, imageData });
        return newMap;
      });
      
      toast({
        title: "发送失败",
        description: error.message || "消息发送失败，请点击消息旁边的重试按钮",
        variant: "destructive",
      });
    },
  });

  const retryFailedMessage = (clientMessageId: string) => {
    const failedMsg = failedMessages.get(clientMessageId);
    if (!failedMsg || !selectedConversationId) return;
    
    // Verify the failed message belongs to the current conversation
    if (failedMsg.conversationId !== selectedConversationId) {
      console.warn("Attempted to retry a message from a different conversation");
      return;
    }
    
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      content: failedMsg.content,
      imageData: failedMsg.imageData,
      clientMessageId, // Reuse same clientMessageId for retry
    });
  };

  const handleSendMessage = () => {
    if (!selectedConversationId) return;
    if (!messageInput.trim() && !imageData) return;
    if (isLoading || isStreaming) return; // 防止连续发送
    
    // Generate a client message ID for deduplication (used as stable identifier)
    const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const currentInput = messageInput.trim();
    const currentImage = imageData;
    
    console.log('[发送消息] 📤 开始发送流程', {
      clientMessageId,
      conversationId: selectedConversationId,
      hasText: !!currentInput,
      hasImage: !!currentImage,
      inputLength: currentInput.length,
    });
    
    // 立即显示用户消息（乐观更新）- 使用clientMessageId作为ID
    const optimisticMessage: Message = {
      id: clientMessageId, // CRITICAL: Use clientMessageId as temporary ID
      conversationId: selectedConversationId,
      senderId: null,
      senderType: "user",
      content: currentInput || "[Image]",
      imageData: currentImage || null,
      clientMessageId, // Store clientMessageId for server matching
      isRead: true,
      status: "sending",
      createdAt: new Date(),
    };
    
    console.log('[发送消息] 🎯 创建乐观消息', {
      clientMessageId,
      messageId: optimisticMessage.id,
      content: optimisticMessage.content?.substring(0, 30),
      status: optimisticMessage.status,
    });
    
    setOptimisticMessages(prev => {
      const updated = [...prev, optimisticMessage];
      console.log('[发送消息] 📝 更新optimisticMessages', {
        previousCount: prev.length,
        newCount: updated.length,
        addedMessageId: optimisticMessage.id,
      });
      return updated;
    });
    
    setMessageInput(""); // 立即清空输入框
    handleRemoveImage(); // 立即清空图片
    setIsLoading(true); // 锁定输入框，等待AI回复
    
    console.log('[发送消息] 🔒 输入框已锁定，准备API调用');
    
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      content: currentInput,
      imageData: currentImage,
      clientMessageId, // Send clientMessageId to server
      mentionedPersonaId: mentionedPersonaId || undefined,
    });
    
    // 清空@状态
    setMentionedPersonaId(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 处理输入变化，检测@
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    setMessageInput(value);
    
    // 检测@符号
    if (selectedConversationData?.isGroup) {
      const textBeforeCursor = value.substring(0, cursorPos);
      const lastAtPos = textBeforeCursor.lastIndexOf('@');
      
      if (lastAtPos !== -1 && (lastAtPos === 0 || value[lastAtPos - 1] === ' ')) {
        // @ 在开头或前面是空格
        const textAfterAt = textBeforeCursor.substring(lastAtPos + 1);
        
        // 如果@ 后面没有空格，显示选择器
        if (!textAfterAt.includes(' ')) {
          setShowMentionPicker(true);
          setMentionCursorPos(lastAtPos);
        } else {
          setShowMentionPicker(false);
        }
      } else {
        setShowMentionPicker(false);
      }
    }
  };

  // 选择要@的AI
  const handleSelectMention = (persona: { id: string; name: string }) => {
    const beforeAt = messageInput.substring(0, mentionCursorPos);
    const afterAt = messageInput.substring(mentionCursorPos + 1);
    // 移除@后的部分文本直到空格
    const afterAtWithoutSearch = afterAt.replace(/^[^\s]*/, '');
    
    const newValue = `${beforeAt}@${persona.name} ${afterAtWithoutSearch}`;
    setMessageInput(newValue);
    setMentionedPersonaId(persona.id);
    setShowMentionPicker(false);
  };

  // Auto-scroll to bottom (no animation) for new messages
  // CRITICAL: Use scrollTop instead of scrollIntoView to avoid reflow/flicker
  useEffect(() => {
    console.log('[渲染触发] 🎨 messages变化触发重渲染', {
      messagesLength: messages.length,
      prevLength: prevMessagesLengthRef.current,
      isLoadingMore,
      diff: messages.length - prevMessagesLengthRef.current,
      lastThreeMessages: messages.slice(-3).map(m => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        senderType: m.senderType,
        content: m.content?.substring(0, 20),
        status: m.status,
      })),
    });
    
    // Only scroll if we got new messages (not loading older ones)
    if (!isLoadingMore && messages.length > prevMessagesLengthRef.current) {
      console.log('[渲染触发] 📜 检测到新消息，执行滚动');
      // Use scrollTop directly - much faster than scrollIntoView, no reflow
      const viewport = scrollViewportRef.current;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
        console.log('[渲染触发] ✅ 滚动完成');
      }
    } else {
      console.log('[渲染触发] ⏭️ 不需要滚动', {
        reason: isLoadingMore ? '正在加载更多' : '消息数量未增加',
      });
    }
    
    prevMessagesLengthRef.current = messages.length;
    setIsLoadingMore(false);
  }, [messages]);
  
  // 检测对话切换，立即滚动到底部并重置状态
  useEffect(() => {
    if (selectedConversationId && messages.length > 0) {
      // Use scrollTop directly for instant scroll without reflow
      const viewport = scrollViewportRef.current;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
    // Reset replying AI name when switching conversations
    setReplyingAIName(null);
  }, [selectedConversationId]);

  // Mark messages as read when conversation is selected (OPTIMIZED to prevent flicker)
  // Only mark once per conversation switch, not on every message
  useEffect(() => {
    if (selectedConversationId && selectedConversationId !== lastMarkedConversationRef.current) {
      // New conversation selected, check if it has unread messages
      console.log('[未读标记] 🔄 对话切换检测', {
        conversationId: selectedConversationId,
        messagesCount: messages.length,
        lastMarkedConversation: lastMarkedConversationRef.current,
      });
      
      if (messages.length > 0) {
        const unreadAIMessages = messages.filter(m => !m.isRead && m.senderType === "ai");
        const hasUnreadMessages = unreadAIMessages.length > 0;
        
        console.log('[未读标记] 📊 未读消息检查', {
          totalMessages: messages.length,
          unreadAIMessages: unreadAIMessages.length,
          unreadMessageIds: unreadAIMessages.map(m => m.id),
          hasUnreadMessages,
        });
        
        if (hasUnreadMessages) {
          console.log('[未读标记] ✅ 开始标记对话为已读', {
            conversationId: selectedConversationId,
          });
          markAsReadMutation.mutate(selectedConversationId);
        } else {
          console.log('[未读标记] ⏭️ 无需标记，没有未读消息');
        }
      }
      // Remember we've marked this conversation
      lastMarkedConversationRef.current = selectedConversationId;
    }
  }, [selectedConversationId]); // CRITICAL: Only depend on conversation change, NOT messages
  
  // CRITICAL FIX: Mark new AI messages as read when user is viewing the chat
  // This prevents unread count from showing when user exits after receiving AI replies
  useEffect(() => {
    if (!selectedConversationId || messages.length === 0) {
      return;
    }
    
    // Find unread AI messages
    const unreadAIMessages = messages.filter(m => !m.isRead && m.senderType === "ai");
    
    if (unreadAIMessages.length > 0) {
      console.log('[未读标记] 🆕 检测到未读AI消息', {
        conversationId: selectedConversationId,
        unreadCount: unreadAIMessages.length,
        unreadMessageIds: unreadAIMessages.map(m => m.id),
        messageContents: unreadAIMessages.map(m => m.content?.substring(0, 20)),
      });
      
      console.log('[未读标记] ✅ 自动标记为已读（用户正在查看聊天）');
      markAsReadMutation.mutate(selectedConversationId);
    }
  }, [messages, selectedConversationId]); // Trigger when messages change

  // Remove optimistic messages when real messages arrive
  useEffect(() => {
    if (rawMessages.length > 0 && optimisticMessages.length > 0) {
      // Remove optimistic messages that match real user messages
      setOptimisticMessages(prev => 
        prev.filter(opt => 
          !rawMessages.some(real => 
            real.content === opt.content && real.senderType === 'user'
          )
        )
      );
    }
  }, [rawMessages]); // 修复：只依赖rawMessages，避免无限循环
  
  // Use independent query data if available, otherwise fall back to conversations list
  const selectedConversation = selectedConversationData || conversations.find(c => c.id === selectedConversationId);

  // 🆕 将selectedConversationId存储到window对象，供WebSocket使用
  useEffect(() => {
    // @ts-ignore - 临时存储在window对象上
    window.__currentConversationId = selectedConversationId;
    
    // 🆕 对话切换时的安全重置：清空队列和定时器
    console.log('[队列管理] 🔄 对话切换，重置队列状态', {
      newConversationId: selectedConversationId,
      pendingQueueLength: pendingAIMessages.length,
    });
    
    // 清空待处理的消息队列
    setPendingAIMessages([]);
    
    // 清理队列处理器定时器
    if (messageQueueProcessorRef.current) {
      clearTimeout(messageQueueProcessorRef.current);
      messageQueueProcessorRef.current = null;
    }
    
    // 清理streaming超时定时器
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current);
      streamingTimeoutRef.current = null;
    }
    
    return () => {
      // @ts-ignore
      window.__currentConversationId = null;
    };
  }, [selectedConversationId]);

  // 🆕 监听WebSocket的AI消息队列事件
  useEffect(() => {
    const handleAIMessageQueue = (event: CustomEvent) => {
      const { message } = event.detail as { message: Message };
      
      console.log('[队列监听] 📨 收到AI消息，加入显示队列', {
        messageId: message.id,
        content: message.content?.substring(0, 30),
        currentQueueLength: pendingAIMessages.length,
      });
      
      // 加入队列
      setPendingAIMessages(prev => [...prev, message]);
      
      // 设置streaming状态
      if (!isStreaming) {
        setIsStreaming(true);
        console.log('[队列监听] 🔄 启动streaming状态');
      }
    };
    
    window.addEventListener('ai-message-queue', handleAIMessageQueue as EventListener);
    
    return () => {
      window.removeEventListener('ai-message-queue', handleAIMessageQueue as EventListener);
    };
  }, [pendingAIMessages.length, isStreaming]);

  // 🆕 消息队列处理器：每1秒从队列中取出一条AI消息显示
  useEffect(() => {
    if (pendingAIMessages.length === 0) {
      // 队列为空，清理定时器
      if (messageQueueProcessorRef.current) {
        clearTimeout(messageQueueProcessorRef.current);
        messageQueueProcessorRef.current = null;
      }
      
      // 队列清空后，5秒后解锁isStreaming（如果没有新消息）
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
      }
      streamingTimeoutRef.current = setTimeout(() => {
        console.log('[队列处理] ⏱️ AI流式响应超时完成', {
          conversationId: selectedConversationId,
          timeout: '5s',
        });
        setIsStreaming(false);
        setReplyingAIName(null);
      }, 5000);
      
      return;
    }
    
    // 队列不为空，启动处理器
    console.log('[队列处理] 🚀 启动消息队列处理器', {
      queueLength: pendingAIMessages.length,
      conversationId: selectedConversationId,
    });
    
    // 设置1秒定时器
    messageQueueProcessorRef.current = setTimeout(() => {
      // 从队列中取出第一条消息
      const [firstMessage, ...remainingMessages] = pendingAIMessages;
      
      console.log('[队列处理] 📤 显示队列中的消息', {
        messageId: firstMessage.id,
        content: firstMessage.content?.substring(0, 30),
        remainingCount: remainingMessages.length,
      });
      
      // 添加到React Query缓存（模拟WebSocket收到消息的效果）
      queryClient.setQueryData(
        ["/api/messages", selectedConversationId, messageLimit],
        (old: Message[] = []) => {
          // 检查消息是否已存在
          if (old.some(m => m.id === firstMessage.id)) {
            console.log('[队列处理] ⏭️ 消息已存在，跳过', { messageId: firstMessage.id });
            return old;
          }
          
          // 添加到顶部（因为backend返回DESC）
          const newMessages = [firstMessage, ...old];
          console.log('[队列处理] ✅ 消息已添加到缓存', {
            messageId: firstMessage.id,
            newCacheLength: newMessages.length,
          });
          return newMessages;
        }
      );
      
      // 从队列中移除
      setPendingAIMessages(remainingMessages);
      
      // 更新AI消息计数
      setAiMessageCount(prev => prev + 1);
      
      // 更新正在回复的AI名字（群聊）
      if (selectedConversation?.isGroup && firstMessage.personaName) {
        setReplyingAIName(firstMessage.personaName);
      }
    }, 1000); // 🎯 1秒间隔
    
    // 清理函数
    return () => {
      if (messageQueueProcessorRef.current) {
        clearTimeout(messageQueueProcessorRef.current);
        messageQueueProcessorRef.current = null;
      }
    };
  }, [pendingAIMessages, selectedConversationId, messageLimit, selectedConversation?.isGroup]);

  // Manage AI streaming state based on new AI messages
  useEffect(() => {
    const aiMessages = messages.filter(m => m.senderType === 'ai');
    if (aiMessages.length > aiMessageCount) {
      // New AI message detected
      setAiMessageCount(aiMessages.length);
      
      // For group chats, update the replying AI name from the latest message
      if (selectedConversation?.isGroup && aiMessages.length > 0) {
        const latestAIMessage = aiMessages[aiMessages.length - 1];
        if (latestAIMessage.personaName) {
          setReplyingAIName(latestAIMessage.personaName);
        }
      }
      
      // Clear previous timeout
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
      }
      
      // Set timeout: if no new message in 5s, streaming is complete
      streamingTimeoutRef.current = setTimeout(() => {
        setIsStreaming(false); // Unlock input
        setReplyingAIName(null); // Clear replying AI name
      }, 5000);
    }
  }, [messages, aiMessageCount, selectedConversation?.isGroup]);

  return (
    <div className={cn(
      "flex h-full flex-col bg-background",
      // Mobile: only show chat when sidebar is hidden
      "md:flex",
      showMobileSidebar && "hidden md:flex"
    )}>
      {selectedConversationId && conversationLoading ? (
        // Loading state when conversation is being fetched
        <div className="flex h-full items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-conversation-loading"></div>
        </div>
      ) : selectedConversation ? (
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
                <AvatarImage src={
                  selectedConversation.isGroup 
                    ? (selectedConversation.avatarUrl || undefined)
                    : (selectedConversation.personas?.[0]?.avatarUrl || undefined)
                } />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedConversation.isGroup 
                    ? (selectedConversation.title?.substring(0, 2).toUpperCase() || "群")
                    : (selectedConversation.personas?.[0]?.name?.substring(0, 2) || "AI")
                  }
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 
                  className={cn(
                    "font-semibold truncate",
                    selectedConversation.isGroup && "cursor-pointer hover:text-primary transition-colors"
                  )}
                  onClick={selectedConversation.isGroup ? handleEditTitle : undefined}
                  data-testid="text-chat-header-title"
                >
                  {selectedConversation.title || selectedConversation.personas?.[0]?.name || "Chat"}
                </h3>
                {/* Status indicator - only show for 1-on-1 chats */}
                {!selectedConversation.isGroup && (
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      aiStatus?.isOnline === true
                        ? (isLoading || isStreaming)
                          ? "bg-blue-500" 
                          : "bg-green-500"
                        : "bg-red-500"
                    )} data-testid="status-indicator"></div>
                    <div className="flex flex-col">
                      <p className="text-sm text-muted-foreground" data-testid="text-status">
                        {aiStatus?.isOnline === true
                          ? (isLoading ? "正在思考..." : isStreaming ? "正在回复..." : "在线")
                          : "AI服务离线"
                        }
                      </p>
                      {aiStatus?.isOnline !== true && (
                        <button 
                          onClick={() => setLocation("/settings")}
                          className="text-xs text-primary hover:underline text-left"
                          data-testid="link-configure-api"
                        >
                          点击配置API密钥
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {/* Group chat: show who is replying - only when API is configured */}
                {selectedConversation.isGroup && aiStatus?.isOnline && (isLoading || isStreaming) && (
                  <p className="text-sm text-muted-foreground" data-testid="text-group-status">
                    {replyingAIName ? `${replyingAIName}正在回复...` : "AI正在回复..."}
                  </p>
                )}
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
                {selectedConversation.isGroup && (
                  <>
                    <DropdownMenuItem
                      onClick={handleViewMembers}
                      data-testid="menu-view-members"
                    >
                      <UserCircle className="mr-2 h-4 w-4" />
                      查看成员
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
            <div className="flex-1 overflow-hidden relative bg-background">
              <div className="h-full overflow-y-auto p-4 bg-background" ref={scrollViewportRef}>
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
                  {messages
                    .filter((message) => message.content && message.content.trim().length > 0)
                    .map((message, index) => {
                    const isUser = message.senderType === "user";

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          isUser ? "justify-end" : "justify-start"
                        )}
                        data-testid={`message-${message.id}`}
                      >
                        {!isUser && (
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={message.personaAvatar || undefined} />
                            <AvatarFallback className="bg-primary/10 text-sm text-primary">
                              {message.personaName?.slice(0, 2) || "AI"}
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div
                          className={cn(
                            "max-w-[75%] md:max-w-md lg:max-w-lg rounded-3xl px-4 py-3",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          )}
                        >
                          {message.imageData ? (
                            <div className="mb-2">
                              <img 
                                src={message.imageData} 
                                alt="Sent image" 
                                className="max-w-full rounded-lg"
                                data-testid={`image-content-${message.id}`}
                              />
                            </div>
                          ) : null}
                          {message.content && message.content !== "[Image]" && (
                            <p className="whitespace-pre-wrap break-words text-base leading-relaxed" data-testid={`text-message-content-${message.id}`}>
                              {message.content}
                            </p>
                          )}
                        </div>

                        {isUser && (
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user?.profileImageUrl || undefined} />
                            <AvatarFallback className="bg-primary/10 text-sm text-primary">
                              {user?.username?.slice(0, 2) || "我"}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Failed Messages - only show for current conversation */}
                  {Array.from(failedMessages.entries())
                    .filter(([_, failedMsg]) => failedMsg.conversationId === selectedConversationId)
                    .map(([tempId, failedMsg]) => (
                      <div
                        key={tempId}
                        className="flex gap-3 justify-end"
                        data-testid={`failed-message-${tempId}`}
                      >
                        <div className="flex flex-col items-end gap-2 max-w-[75%] md:max-w-md lg:max-w-lg">
                          <div className="rounded-3xl px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-br-md">
                            {failedMsg.imageData ? (
                              <div className="mb-2">
                                <img 
                                  src={failedMsg.imageData} 
                                  alt="Failed to send" 
                                  className="max-w-full rounded-lg opacity-70"
                                />
                              </div>
                            ) : null}
                            <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-destructive">
                              {failedMsg.content || "[图片]"}
                            </p>
                            <p className="mt-1.5 text-sm opacity-70 text-destructive-foreground">
                              发送失败
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryFailedMessage(tempId)}
                            className="text-xs h-7"
                            data-testid={`button-retry-${tempId}`}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            重试
                          </Button>
                        </div>
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user?.profileImageUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-sm text-primary">
                            {user?.username?.slice(0, 2) || "我"}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
              </div>
            </div>

            {/* Message Input */}
            <div className="border-t bg-background pb-[env(safe-area-inset-bottom)]">
              <div className="px-3 py-2">
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
                <div className="relative flex-1">
                  <Textarea
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    placeholder={isLoading ? "AI正在思考..." : isStreaming ? "AI正在回复..." : "输入消息..."}
                    rows={1}
                    disabled={isLoading || isStreaming}
                    className="min-h-[40px] max-h-[100px] resize-none text-base leading-relaxed"
                    data-testid="input-message"
                  />
                  
                  {/* @提及选择器 */}
                  {showMentionPicker && selectedConversationData?.personas && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                      {selectedConversationData.personas.map((persona) => (
                        <button
                          key={persona.id}
                          onClick={() => handleSelectMention(persona)}
                          className="w-full px-3 py-2 flex items-center gap-2 hover-elevate active-elevate-2 text-left"
                          data-testid={`button-mention-${persona.id}`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={persona.avatarUrl || undefined} />
                            <AvatarFallback>{persona.name[0]}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{persona.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={(!messageInput.trim() && !imageData) || isLoading || isStreaming}
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full bg-primary hover:bg-primary/90"
                  data-testid="button-send-message"
                >
                  {isLoading || isStreaming ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
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
                                  {message.personaName?.slice(0, 2) || "AI"}
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
                                <AvatarImage src={user?.profileImageUrl || undefined} />
                                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                                  {user?.username?.slice(0, 2) || "我"}
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

      {/* Members Dialog */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>群聊成员</DialogTitle>
            <DialogDescription>
              查看当前群聊的所有成员
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {selectedConversation?.personas && selectedConversation.personas.length > 0 ? (
              selectedConversation.personas.map((persona) => (
                <div
                  key={persona.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
                  onClick={() => {
                    setShowMembersDialog(false);
                    setLocation(`/contacts/${persona.id}`);
                  }}
                  data-testid={`member-item-${persona.id}`}
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={persona.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {persona.name?.slice(0, 2) || "AI"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground truncate">
                      {persona.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      AI成员
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <UserCircle className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">暂无成员</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Title Dialog */}
      <Dialog open={showEditTitleDialog} onOpenChange={setShowEditTitleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改群聊名称</DialogTitle>
            <DialogDescription>
              为这个群聊设置一个新名称
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="edit-title" className="text-sm font-medium">群聊名称</label>
              <Input
                id="edit-title"
                placeholder="输入群聊名称"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editingTitle.trim()) {
                    handleSaveTitle();
                  }
                }}
                autoFocus
                data-testid="input-edit-title"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowEditTitleDialog(false)}
              data-testid="button-cancel-edit-title"
            >
              取消
            </Button>
            <Button
              className="flex-1"
              onClick={handleSaveTitle}
              disabled={!editingTitle.trim() || updateTitleMutation.isPending}
              data-testid="button-save-title"
            >
              {updateTitleMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
