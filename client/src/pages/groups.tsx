import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Users, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type Conversation = {
  id: string;
  title: string | null;
  isGroup: boolean;
  lastMessageAt: Date | null;
  personas?: { id: string; name: string; avatarUrl: string | null }[];
};

type Persona = {
  id: string;
  name: string;
  avatarUrl: string | null;
  personality: string;
};

export default function GroupsPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Fetch conversations (filter for groups)
  const { data: allConversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const groupConversations = allConversations.filter(conv => conv.isGroup);

  // Fetch personas
  const { data: personas = [] } = useQuery<Persona[]>({
    queryKey: ["/api/personas"],
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async ({ title, personaIds }: { title: string; personaIds: string[] }) => {
      // Create group conversation
      const convResponse = await apiRequest("POST", "/api/conversations", {
        title: title || "新群聊",
        isGroup: true,
      });
      const conversation = await convResponse.json();

      // Add selected personas as participants
      for (const personaId of personaIds) {
        await apiRequest("POST", `/api/conversations/${conversation.id}/participants`, {
          personaId,
        });
      }

      return conversation;
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setDialogOpen(false);
      setGroupTitle("");
      setSelectedPersonas([]);
      toast({ title: "✅ 群聊创建成功" });
      // Navigate to the new group chat
      setLocation(`/chat?conversationId=${conversation.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "❌ 创建群聊失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const handleCreateGroup = () => {
    if (selectedPersonas.length === 0) {
      toast({
        title: "请选择成员",
        description: "至少选择一个AI成员",
        variant: "destructive",
      });
      return;
    }

    setCreatingGroup(true);
    createGroupMutation.mutate(
      { title: groupTitle, personaIds: selectedPersonas },
      {
        onSettled: () => setCreatingGroup(false),
      }
    );
  };

  const togglePersona = (personaId: string) => {
    setSelectedPersonas(prev =>
      prev.includes(personaId)
        ? prev.filter(id => id !== personaId)
        : [...prev, personaId]
    );
  };

  const handleGroupClick = (conversationId: string) => {
    setLocation(`/chat?conversationId=${conversationId}`);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Create Group Button */}
      <div className="p-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Card className="hover-elevate cursor-pointer" data-testid="button-create-group">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Plus className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">创建新群聊</div>
                    <div className="text-sm text-muted-foreground">发起群组对话</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>创建群聊</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Group Title Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">群聊名称（可选）</label>
                <Input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="输入群聊名称..."
                  data-testid="input-group-title"
                />
              </div>

              {/* Persona Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">选择成员</label>
                {personas.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>还没有AI女友</p>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDialogOpen(false);
                        setLocation("/personas");
                      }}
                      className="mt-2"
                    >
                      去创建
                    </Button>
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-lg p-2">
                    {personas.map((persona) => (
                      <div
                        key={persona.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover-elevate cursor-pointer"
                        onClick={() => togglePersona(persona.id)}
                        data-testid={`persona-item-${persona.id}`}
                      >
                        <Checkbox
                          checked={selectedPersonas.includes(persona.id)}
                          onCheckedChange={() => togglePersona(persona.id)}
                          data-testid={`checkbox-persona-${persona.id}`}
                          className="shrink-0"
                        />
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={persona.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {persona.name.substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{persona.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {persona.personality}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Count */}
              {selectedPersonas.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  已选择 {selectedPersonas.length} 个成员
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setGroupTitle("");
                    setSelectedPersonas([]);
                  }}
                  data-testid="button-cancel-group"
                >
                  取消
                </Button>
                <Button
                  onClick={handleCreateGroup}
                  disabled={selectedPersonas.length === 0 || creatingGroup}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-confirm-create-group"
                >
                  {creatingGroup ? "创建中..." : "创建群聊"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            我的群聊
          </h2>
        </div>

        {groupConversations.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground mb-1" data-testid="text-no-groups">暂无群聊</p>
            <p className="text-sm text-muted-foreground">
              <span className="text-primary font-medium">0人</span>
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {groupConversations.map((group) => (
              <Card
                key={group.id}
                className="hover-elevate cursor-pointer"
                onClick={() => handleGroupClick(group.id)}
                data-testid={`group-item-${group.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Group Avatar (show multiple faces or group icon) */}
                    <div className="relative h-12 w-12 flex-shrink-0">
                      {group.personas && group.personas.length > 0 ? (
                        <div className="grid grid-cols-2 gap-0.5 h-12 w-12">
                          {group.personas.slice(0, 4).map((persona, idx) => (
                            <Avatar key={persona.id} className="h-[22px] w-[22px]">
                              <AvatarImage src={persona.avatarUrl || undefined} />
                              <AvatarFallback className="text-[10px] bg-primary/10">
                                {persona.name[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                      )}
                    </div>

                    {/* Group Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {group.title || "群聊"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {group.personas?.length || 0} 位成员
                      </div>
                    </div>

                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
