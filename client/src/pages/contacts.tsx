import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { pinyin } from "pinyin-pro";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MobileHeader } from "@/components/mobile-header";

type Persona = {
  id: string;
  name: string;
  avatarUrl: string | null;
  personality: string;
  systemPrompt: string;
  backstory: string | null;
  greeting: string | null;
  model: string;
  responseDelay: number;
};

// Get first letter of name using pinyin for Chinese characters
function getFirstLetter(name: string): string {
  if (!name) return "#";
  const firstChar = name.charAt(0);
  
  // Check if it's A-Z or a-z
  if (/[A-Za-z]/.test(firstChar)) {
    return firstChar.toUpperCase();
  }
  
  // For Chinese characters, get pinyin and return first letter
  try {
    const pinyinStr = pinyin(firstChar, { pattern: 'first', toneType: 'none' });
    if (pinyinStr && /[A-Za-z]/.test(pinyinStr)) {
      return pinyinStr.toUpperCase();
    }
  } catch (e) {
    console.error("Error getting pinyin:", e);
  }
  
  // Fallback to # for special characters
  return "#";
}

type ContactsProps = {
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
};

export default function Contacts({ onBackToList = () => {}, showMobileSidebar = false }: ContactsProps) {
  const [_, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: personas = [], isLoading } = useQuery<Persona[]>({
    queryKey: ["/api/personas"],
  });

  const startChatMutation = useMutation({
    mutationFn: async (personaId: string) => {
      // Check if conversation already exists
      const conversations: any[] = await queryClient.fetchQuery({
        queryKey: ["/api/conversations"],
      });
      
      const existingConversation = conversations.find(
        (conv) => !conv.isGroup && conv.personas?.[0]?.id === personaId
      );

      if (existingConversation) {
        return existingConversation;
      }

      // Create new conversation
      const res = await apiRequest("POST", "/api/conversations", {
        title: null,
        isGroup: false,
        personaIds: [personaId],
      });
      return await res.json();
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      // Navigate to chat with conversation ID
      setLocation(`/chat?conversationId=${conversation.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "无法创建对话",
        variant: "destructive",
      });
    },
  });

  // Filter personas by search query
  const filteredPersonas = useMemo(() => {
    if (!searchQuery) return personas;
    const query = searchQuery.toLowerCase();
    return personas.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.personality.toLowerCase().includes(query)
    );
  }, [personas, searchQuery]);

  // Group personas by first letter
  const groupedPersonas = useMemo(() => {
    const groups: Record<string, Persona[]> = {};
    
    filteredPersonas.forEach(persona => {
      const letter = getFirstLetter(persona.name);
      if (!groups[letter]) {
        groups[letter] = [];
      }
      groups[letter].push(persona);
    });

    // Sort personas within each group by pinyin
    Object.keys(groups).forEach(letter => {
      groups[letter].sort((a, b) => {
        const pinyinA = pinyin(a.name, { toneType: 'none' });
        const pinyinB = pinyin(b.name, { toneType: 'none' });
        return pinyinA.localeCompare(pinyinB, 'zh-CN');
      });
    });

    // Sort groups by key
    return Object.entries(groups).sort(([a], [b]) => {
      // English letters first, then others
      if (/[A-Z]/.test(a) && !/[A-Z]/.test(b)) return -1;
      if (!/[A-Z]/.test(a) && /[A-Z]/.test(b)) return 1;
      return a.localeCompare(b);
    });
  }, [filteredPersonas]);

  const handlePersonaClick = (personaId: string) => {
    // Start chat with this persona (find existing or create new conversation)
    startChatMutation.mutate(personaId);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Mobile Header */}
      <MobileHeader 
        title="联系人" 
        onBack={onBackToList} 
        showMobileSidebar={showMobileSidebar}
      />
      
      {/* Header */}
      <div className="border-b p-4 md:p-6 hidden md:block">
        <div className="max-w-3xl mx-auto">
          <h1 className="mb-4 text-2xl font-bold" data-testid="text-page-title">联系人</h1>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索联系人"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-contacts"
            />
          </div>

          {/* Contact Count */}
          <div className="mt-3 text-sm text-muted-foreground" data-testid="text-contact-count">
            {filteredPersonas.length} 位联系人
          </div>
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto pb-4 md:pb-6">
        <div className="max-w-3xl mx-auto">
        {groupedPersonas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-muted-foreground" data-testid="text-no-contacts">没有找到联系人</p>
          </div>
        ) : (
          <div>
            {groupedPersonas.map(([letter, personasInGroup]) => (
              <div key={letter}>
                {/* Letter Header */}
                <div className="sticky top-0 z-10 bg-muted px-4 py-2">
                  <span className="text-sm font-semibold text-muted-foreground" data-testid={`text-group-${letter}`}>
                    {letter}
                  </span>
                </div>

                {/* Personas in this group */}
                {personasInGroup.map((persona) => (
                  <div
                    key={persona.id}
                    className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 transition-colors hover-elevate"
                    onClick={() => handlePersonaClick(persona.id)}
                    data-testid={`contact-item-${persona.id}`}
                  >
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={persona.avatarUrl || undefined} alt={persona.name} />
                        <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                          {persona.name.substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      {/* Online indicator */}
                      <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-primary" data-testid={`online-indicator-${persona.id}`}></div>
                    </div>
                    
                    <div className="flex-1 overflow-hidden">
                      <div className="font-medium" data-testid={`contact-name-${persona.id}`}>
                        {persona.name}
                      </div>
                      <div className="truncate text-sm text-muted-foreground" data-testid={`contact-status-${persona.id}`}>
                        {persona.personality}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
