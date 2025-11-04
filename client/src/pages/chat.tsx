import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Send, Plus, MessageCircle, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  title: string | null;
  isGroup: boolean;
  lastMessageAt: Date | null;
  personas?: { name: string; avatarUrl: string | null }[];
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

export default function Chat() {
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: personas = [] } = useQuery<Persona[]>({
    queryKey: ["/api/personas"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedConversationId],
    enabled: !!selectedConversationId,
  });

  const createConversationMutation = useMutation({
    mutationFn: (personaId: string) =>
      apiRequest("/api/conversations", "POST", {
        title: null,
        isGroup: false,
      }).then((conv: Conversation) => {
        return apiRequest("/api/conversations/participants", "POST", {
          conversationId: conv.id,
          personaId,
        }).then(() => conv);
      }),
    onSuccess: (conversation: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSelectedConversationId(conversation.id);
      toast({
        title: "Success",
        description: "Conversation created",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create conversation",
        variant: "destructive",
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      // Send user message
      return apiRequest("/api/messages", "POST", {
        conversationId,
        content,
        senderType: "user",
      });
    },
    onSuccess: async (_, { conversationId, content }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setMessageInput("");
      
      // Get conversation participants to find AI persona
      const conversation = conversations.find(c => c.id === conversationId);
      if (!conversation) return;

      try {
        const participants = await queryClient.fetchQuery({
          queryKey: ["/api/conversations/participants", conversationId],
          queryFn: async () => {
            const response = await fetch(`/api/conversations/${conversationId}/participants`);
            if (!response.ok) throw new Error("Failed to fetch participants");
            return response.json();
          },
        });

        const personaParticipant = participants[0];
        if (!personaParticipant) return;

        // Trigger AI response (use captured content, not state)
        setIsTyping(true);
        await apiRequest("/api/ai/generate", "POST", {
          conversationId,
          personaId: personaParticipant.personaId,
          content,
        });
        setIsTyping(false);
        queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      } catch (error) {
        setIsTyping(false);
        console.error("Error generating AI response:", error);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConversationId) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      content: messageInput.trim(),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  if (conversationsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Conversations List */}
      <div className="w-80 border-r bg-background">
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" data-testid="text-conversations-title">Conversations</h2>
            {personas.length > 0 && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (personas.length > 0) {
                    createConversationMutation.mutate(personas[0].id);
                  }
                }}
                disabled={createConversationMutation.isPending}
                data-testid="button-new-conversation"
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-73px)]">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 text-sm font-medium" data-testid="text-no-conversations">No conversations yet</p>
              <p className="mb-4 text-xs text-muted-foreground">
                Create a persona first, then start chatting
              </p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={cn(
                    "w-full rounded-lg p-3 text-left transition-colors hover-elevate",
                    selectedConversationId === conversation.id && "bg-accent"
                  )}
                  data-testid={`button-conversation-${conversation.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={conversation.personas?.[0]?.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {conversation.title?.substring(0, 2).toUpperCase() || "AI"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-medium" data-testid={`text-conversation-title-${conversation.id}`}>
                          {conversation.title || conversation.personas?.[0]?.name || "New Chat"}
                        </p>
                        {conversation.lastMessageAt && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(conversation.lastMessageAt), "HH:mm")}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {conversation.isGroup ? "Group Chat" : "1-on-1"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Messages Area */}
      <div className="flex flex-1 flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 border-b p-4">
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedConversation.personas?.[0]?.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedConversation.title?.substring(0, 2).toUpperCase() || "AI"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold" data-testid="text-chat-header-title">
                  {selectedConversation.title || selectedConversation.personas?.[0]?.name || "Chat"}
                </h3>
                {isTyping && (
                  <p className="text-sm text-muted-foreground" data-testid="text-typing-indicator">
                    Typing...
                  </p>
                )}
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <MessageCircle className="mb-4 h-16 w-16 text-muted-foreground" />
                  <p className="text-lg font-medium" data-testid="text-no-messages">Start the conversation</p>
                  <p className="text-sm text-muted-foreground">
                    Send a message to begin chatting
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
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={message.personaAvatar || undefined} />
                            <AvatarFallback className="bg-primary/10 text-xs text-primary">
                              AI
                            </AvatarFallback>
                          </Avatar>
                        )}
                        {!isUser && !showAvatar && <div className="w-8" />}

                        <div
                          className={cn(
                            "max-w-md rounded-3xl px-4 py-3",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm" data-testid={`text-message-content-${message.id}`}>
                            {message.content}
                          </p>
                          <p className={cn(
                            "mt-1 text-xs opacity-60",
                            isUser ? "text-primary-foreground" : "text-muted-foreground"
                          )}>
                            {format(new Date(message.createdAt), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t bg-background p-4">
              <div className="flex gap-3">
                <Textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Type a message..."
                  className="min-h-[44px] max-h-[120px] resize-none"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sendMessageMutation.isPending}
                  size="icon"
                  className="h-11 w-11 shrink-0"
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
                Select a conversation
              </p>
              <p className="text-sm text-muted-foreground">
                Choose a conversation from the list to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
