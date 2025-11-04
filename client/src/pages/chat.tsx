import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Send, Plus, MessageCircle, Loader2, Users, UserPlus } from "lucide-react";
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
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [messageLimit, setMessageLimit] = useState(50);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: personas = [] } = useQuery<Persona[]>({
    queryKey: ["/api/personas"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedConversationId, messageLimit],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages?limit=${messageLimit}&offset=0`
      );
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !!selectedConversationId,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (conversationId: string) =>
      apiRequest(`/api/conversations/${conversationId}/read`, "POST"),
  });

  const createConversationMutation = useMutation({
    mutationFn: (personaId: string) =>
      apiRequest("/api/conversations", "POST", {
        title: null,
        isGroup: false,
      }).then((conv: Conversation) => {
        return apiRequest(`/api/conversations/${conv.id}/participants`, "POST", {
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

  const createGroupMutation = useMutation({
    mutationFn: async ({ title, personaIds }: { title: string; personaIds: string[] }) => {
      const conversation = await apiRequest("/api/conversations", "POST", {
        title,
        isGroup: true,
      });
      
      // Add all selected personas as participants
      await Promise.all(
        personaIds.map((personaId) =>
          apiRequest(`/api/conversations/${conversation.id}/participants`, "POST", {
            personaId,
          })
        )
      );
      
      return conversation;
    },
    onSuccess: (conversation: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSelectedConversationId(conversation.id);
      setGroupDialogOpen(false);
      setGroupTitle("");
      setSelectedPersonas([]);
      toast({
        title: "Success",
        description: "Group created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create group",
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
        // Determine which persona should respond
        let respondingPersonaId: string;
        
        if (conversation.isGroup) {
          // For group chats, use intelligent rotation
          setIsTyping(true);
          const selectionResult = await apiRequest("/api/ai/select-persona", "POST", {
            conversationId,
            userMessage: content,
          });
          respondingPersonaId = selectionResult.personaId;
        } else {
          // For 1-on-1 chats, use the single participant
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
          respondingPersonaId = personaParticipant.personaId;
        }

        // Trigger AI response
        setIsTyping(true);
        await apiRequest("/api/ai/generate", "POST", {
          conversationId,
          personaId: respondingPersonaId,
          content,
        });
        setIsTyping(false);
        queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      } catch (error) {
        setIsTyping(false);
        console.error("Error generating AI response:", error);
      }
    },
    onError: (error: any, variables) => {
      setFailedMessageId(variables.conversationId);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid="button-new-conversation-menu"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      if (personas.length > 0) {
                        createConversationMutation.mutate(personas[0].id);
                      }
                    }}
                    data-testid="button-new-1on1"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    New 1-on-1 Chat
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setGroupDialogOpen(true)}
                    data-testid="button-new-group"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Create Group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        
        {/* Group Creation Dialog */}
        <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle data-testid="text-group-dialog-title">Create Group Chat</DialogTitle>
              <DialogDescription>
                Add multiple AI personas to create a group conversation
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="group-title">Group Name</Label>
                <Input
                  id="group-title"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="Enter group name"
                  data-testid="input-group-title"
                />
              </div>
              
              <div>
                <Label>Select AI Personas (minimum 2)</Label>
                <div className="mt-2 space-y-2">
                  {personas.map((persona) => (
                    <div key={persona.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`persona-${persona.id}`}
                        checked={selectedPersonas.includes(persona.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedPersonas([...selectedPersonas, persona.id]);
                          } else {
                            setSelectedPersonas(selectedPersonas.filter(id => id !== persona.id));
                          }
                        }}
                        data-testid={`checkbox-persona-${persona.id}`}
                      />
                      <label
                        htmlFor={`persona-${persona.id}`}
                        className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={persona.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {persona.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {persona.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setGroupDialogOpen(false);
                    setGroupTitle("");
                    setSelectedPersonas([]);
                  }}
                  data-testid="button-cancel-group"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (groupTitle.trim() && selectedPersonas.length >= 2) {
                      createGroupMutation.mutate({
                        title: groupTitle.trim(),
                        personaIds: selectedPersonas,
                      });
                    }
                  }}
                  disabled={!groupTitle.trim() || selectedPersonas.length < 2 || createGroupMutation.isPending}
                  data-testid="button-create-group"
                >
                  {createGroupMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Group"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
                    Load More Messages
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
                  
                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex gap-3 justify-start" data-testid="typing-indicator">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          AI
                        </AvatarFallback>
                      </Avatar>
                      <div className="max-w-md rounded-3xl px-4 py-3 bg-muted rounded-bl-md">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t bg-background p-4">
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
