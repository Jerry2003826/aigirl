import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Conversation = { id: string; isGroup?: boolean; personas?: Array<{ id: string }> };

export function useStartChat() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (personaId: string) => {
      const conversations: Conversation[] = await queryClient.fetchQuery({
        queryKey: ["/api/conversations"],
      });
      const existing = conversations.find(
        (conv) => !conv.isGroup && conv.personas?.[0]?.id === personaId
      );
      if (existing) return existing;
      const res = await apiRequest("POST", "/api/conversations", {
        title: null,
        isGroup: false,
        personaIds: [personaId],
      });
      return (await res.json()) as Conversation;
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setLocation(`/chat?conversationId=${conversation.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "错误",
        description: error.message || "无法创建对话",
        variant: "destructive",
      });
    },
  });
}
