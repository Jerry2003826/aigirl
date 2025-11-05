import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Users, MessageCircle, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { MobileHeader } from "@/components/mobile-header";
import { type AiPersona } from "@shared/schema";

type Conversation = {
  id: string;
  title: string | null;
  avatarUrl?: string | null;
  isGroup: boolean;
  lastMessageAt: Date | null;
  personas?: { id: string; name: string; avatarUrl: string | null }[];
};

type GroupsPageProps = {
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
};

export default function GroupsPage({ onBackToList = () => {}, showMobileSidebar = false }: GroupsPageProps) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  
  // Edit group states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Conversation | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations (filter for groups)
  const { data: allConversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const groupConversations = allConversations.filter(conv => conv.isGroup);

  // Fetch personas
  const { data: personas = [] } = useQuery<AiPersona[]>({
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

  // Update group mutation
  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, avatarUrl, title }: { id: string; avatarUrl?: string; title?: string }) => {
      const response = await apiRequest("PATCH", `/api/conversations/${id}`, {
        avatarUrl,
        title,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setEditDialogOpen(false);
      setEditingGroup(null);
      setEditAvatarPreview(null);
      toast({ title: "✅ 群聊更新成功" });
    },
    onError: (error: any) => {
      toast({
        title: "❌ 更新失败",
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

  const handleEditGroup = (group: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroup(group);
    setEditTitle(group.title || "");
    setEditAvatarPreview(group.avatarUrl || null);
    setEditDialogOpen(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "❌ 文件格式不支持",
        description: "请上传图片文件",
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('上传失败');
      }

      const data = await response.json();
      setEditAvatarPreview(data.url);
      toast({ title: "✅ 图片上传成功" });
    } catch (error: any) {
      toast({
        title: "❌ 上传失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveGroup = () => {
    if (!editingGroup) return;

    updateGroupMutation.mutate({
      id: editingGroup.id,
      avatarUrl: editAvatarPreview || undefined,
      title: editTitle || undefined,
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Mobile Header */}
      <MobileHeader 
        title="群聊" 
        onBack={onBackToList} 
        showMobileSidebar={showMobileSidebar}
      />
      
      {/* Create Group Button */}
      <div className="p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
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
                        className="flex items-center gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
                        onClick={() => togglePersona(persona.id)}
                        data-testid={`persona-item-${persona.id}`}
                      >
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center justify-center w-5 h-5">
                          <Checkbox
                            checked={selectedPersonas.includes(persona.id)}
                            onCheckedChange={() => togglePersona(persona.id)}
                            data-testid={`checkbox-persona-${persona.id}`}
                            className="!h-5 !w-5"
                          />
                        </div>
                        <Avatar className="h-12 w-12 shrink-0">
                          <AvatarImage src={persona.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                            {persona.name.substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-base truncate">{persona.name}</div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
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
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
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
                    {/* Group Avatar - click to edit */}
                    <div className="relative h-12 w-12 flex-shrink-0">
                      <Avatar 
                        className="h-12 w-12 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => handleEditGroup(group, e)}
                        data-testid={`avatar-group-${group.id}`}
                      >
                        <AvatarImage src={group.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {group.title?.substring(0, 2).toUpperCase() || "群"}
                        </AvatarFallback>
                      </Avatar>
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

      {/* Edit Group Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑群聊</DialogTitle>
            <DialogDescription>
              修改群聊名称和头像
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={editAvatarPreview || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                    {editTitle?.substring(0, 2).toUpperCase() || "群"}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate active-elevate-2"
                  disabled={uploadingAvatar}
                  data-testid="button-upload-group-avatar"
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

            {/* Group Title Input */}
            <div className="space-y-2">
              <label htmlFor="edit-group-title" className="text-sm font-medium">群聊名称</label>
              <Input
                id="edit-group-title"
                placeholder="输入群聊名称"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="input-edit-group-title"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setEditDialogOpen(false)}
              data-testid="button-cancel-edit-group"
            >
              取消
            </Button>
            <Button
              className="flex-1"
              onClick={handleSaveGroup}
              disabled={updateGroupMutation.isPending}
              data-testid="button-save-group"
            >
              {updateGroupMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
