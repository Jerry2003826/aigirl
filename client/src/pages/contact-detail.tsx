import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MessageCircle, Edit, Trash2, Plus, ArrowLeft, Star, StarOff, Upload, X as XIcon } from "lucide-react";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertAiPersonaSchema } from "@shared/schema";
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

type Memory = {
  id: string;
  personaId: string;
  userId: string;
  key: string;
  value: string;
  context: string | null;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
};

const memoryFormSchema = z.object({
  key: z.string().min(1, "记忆标题不能为空").max(100),
  value: z.string().min(1, "记忆内容不能为空"),
  context: z.string().optional(),
  importance: z.number().min(1).max(10).default(5),
});

type MemoryFormData = z.infer<typeof memoryFormSchema>;

const personaFormSchema = insertAiPersonaSchema.extend({
  name: z.string().min(1, "名字不能为空").max(100),
  personality: z.string().min(10, "性格描述至少10个字符"),
  systemPrompt: z.string().min(20, "系统提示至少20个字符"),
});

type PersonaFormData = z.infer<typeof personaFormSchema>;

interface ContactDetailProps {
  personaId: string;
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
}

export default function ContactDetail({ personaId, onBackToList = () => {}, showMobileSidebar = false }: ContactDetailProps) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: persona, isLoading: personaLoading } = useQuery<Persona>({
    queryKey: ["/api/personas", personaId],
  });

  const { data: memories = [], isLoading: memoriesLoading } = useQuery<Memory[]>({
    queryKey: ["/api/memories/persona", personaId],
  });

  const form = useForm<MemoryFormData>({
    resolver: zodResolver(memoryFormSchema),
    defaultValues: {
      key: "",
      value: "",
      context: "",
      importance: 5,
    },
  });

  const personaForm = useForm<PersonaFormData>({
    resolver: zodResolver(personaFormSchema),
    defaultValues: {
      name: "",
      avatarUrl: "",
      personality: "",
      systemPrompt: "",
      backstory: "",
      greeting: "",
      model: "gemini-2.5-pro",
      responseDelay: 0,
      userId: "",
    },
  });

  const createMemoryMutation = useMutation({
    mutationFn: (data: MemoryFormData) =>
      apiRequest("POST", "/api/memories", {
        ...data,
        personaId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories/persona", personaId] });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "成功",
        description: "记忆已创建",
      });
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "创建记忆失败",
        variant: "destructive",
      });
    },
  });

  const updateMemoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MemoryFormData> }) =>
      apiRequest("PATCH", `/api/memories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories/persona", personaId] });
      setDialogOpen(false);
      setEditingMemory(null);
      form.reset();
      toast({
        title: "成功",
        description: "记忆已更新",
      });
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "更新记忆失败",
        variant: "destructive",
      });
    },
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/memories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories/persona", personaId] });
      toast({
        title: "成功",
        description: "记忆已删除",
      });
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "删除记忆失败",
        variant: "destructive",
      });
    },
  });

  const updatePersonaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonaFormData> }) =>
      apiRequest("PATCH", `/api/personas/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas", personaId] });
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      setPersonaDialogOpen(false);
      setAvatarPreview("");
      toast({
        title: "成功",
        description: "AI角色已成功更新",
      });
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "更新角色失败",
        variant: "destructive",
      });
    },
  });

  const deletePersonaMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/personas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      toast({
        title: "成功",
        description: "AI角色已成功删除",
      });
      setLocation("/contacts");
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "删除角色失败",
        variant: "destructive",
      });
    },
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

  const handleSubmit = (data: MemoryFormData) => {
    if (editingMemory) {
      updateMemoryMutation.mutate({ id: editingMemory.id, data });
    } else {
      createMemoryMutation.mutate(data);
    }
  };

  const openEditDialog = (memory: Memory) => {
    setEditingMemory(memory);
    form.reset({
      key: memory.key,
      value: memory.value,
      context: memory.context || "",
      importance: memory.importance,
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingMemory(null);
    form.reset();
    setDialogOpen(true);
  };

  const openEditPersonaDialog = () => {
    if (!persona) return;
    personaForm.reset({
      name: persona.name,
      avatarUrl: persona.avatarUrl || "",
      personality: persona.personality,
      systemPrompt: persona.systemPrompt,
      backstory: persona.backstory || "",
      greeting: persona.greeting || "",
      model: persona.model,
      responseDelay: persona.responseDelay,
      userId: "",
    });
    setAvatarPreview(persona.avatarUrl || "");
    setPersonaDialogOpen(true);
  };

  const handlePersonaSubmit = (data: PersonaFormData) => {
    updatePersonaMutation.mutate({ id: personaId, data });
  };

  const handlePersonaDelete = () => {
    if (confirm(`确定要删除 ${persona?.name} 吗？这将删除所有相关的聊天记录和记忆。`)) {
      deletePersonaMutation.mutate(personaId);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "错误",
        description: "文件类型无效，请选择图片",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "错误",
        description: "图片必须小于5MB",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) throw new Error("上传失败");

      const data = await res.json();
      personaForm.setValue("avatarUrl", data.url);
      setAvatarPreview(data.url);
    } catch (error) {
      toast({
        title: "错误",
        description: "上传头像失败",
        variant: "destructive",
      });
    }
  };

  const getImportanceLabel = (importance: number): string => {
    if (importance >= 8) return "非常重要";
    if (importance >= 6) return "重要";
    if (importance >= 4) return "普通";
    return "不重要";
  };

  const getImportanceColor = (importance: number): string => {
    if (importance >= 8) return "bg-red-500/10 text-red-500 border-red-500/20";
    if (importance >= 6) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    if (importance >= 4) return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    return "bg-gray-500/10 text-gray-500 border-gray-500/20";
  };

  if (personaLoading || memoriesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">未找到联系人</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Mobile Header */}
      <MobileHeader 
        title={persona.name} 
        onBack={onBackToList} 
        showMobileSidebar={showMobileSidebar}
      />
      
      {/* Header */}
      <div className="border-b p-4 hidden md:block">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/contacts")}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>

        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={persona.avatarUrl || undefined} alt={persona.name} />
            <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
              {persona.name.substring(0, 2)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-persona-name">{persona.name}</h1>
            <p className="text-muted-foreground" data-testid="text-persona-personality">{persona.personality}</p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => startChatMutation.mutate(personaId)}
              disabled={startChatMutation.isPending}
              data-testid="button-start-chat"
            >
              {startChatMutation.isPending ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                  创建中...
                </>
              ) : (
                <>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  发消息
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={openEditPersonaDialog}
              data-testid="button-edit-persona"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Memories Section */}
      <div className="flex-1 overflow-hidden p-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>记忆</CardTitle>
                <CardDescription>管理AI对你的记忆</CardDescription>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openCreateDialog} data-testid="button-create-memory">
                    <Plus className="mr-2 h-4 w-4" />
                    添加记忆
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingMemory ? "编辑记忆" : "创建记忆"}</DialogTitle>
                    <DialogDescription>
                      {editingMemory ? "修改现有记忆" : "为AI添加新的记忆"}
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="key"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>记忆标题</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="例如：最喜欢的颜色"
                                {...field}
                                data-testid="input-memory-key"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="value"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>记忆内容</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="例如：蓝色"
                                {...field}
                                data-testid="input-memory-value"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="context"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>上下文（可选）</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="这个记忆是在什么场景下得知的"
                                {...field}
                                data-testid="input-memory-context"
                              />
                            </FormControl>
                            <FormDescription>
                              帮助AI更好地理解这个记忆的来源
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="importance"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>重要性</FormLabel>
                            <Select
                              onValueChange={(value) => field.onChange(parseInt(value))}
                              defaultValue={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-memory-importance">
                                  <SelectValue placeholder="选择重要性" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="1">1 - 不重要</SelectItem>
                                <SelectItem value="2">2</SelectItem>
                                <SelectItem value="3">3</SelectItem>
                                <SelectItem value="4">4</SelectItem>
                                <SelectItem value="5">5 - 普通</SelectItem>
                                <SelectItem value="6">6</SelectItem>
                                <SelectItem value="7">7</SelectItem>
                                <SelectItem value="8">8 - 重要</SelectItem>
                                <SelectItem value="9">9</SelectItem>
                                <SelectItem value="10">10 - 非常重要</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              重要性越高，AI越会优先考虑这个记忆
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setDialogOpen(false);
                            setEditingMemory(null);
                            form.reset();
                          }}
                          data-testid="button-cancel"
                        >
                          取消
                        </Button>
                        <Button
                          type="submit"
                          disabled={createMemoryMutation.isPending || updateMemoryMutation.isPending}
                          data-testid="button-submit-memory"
                        >
                          {createMemoryMutation.isPending || updateMemoryMutation.isPending ? (
                            <>
                              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                              保存中...
                            </>
                          ) : editingMemory ? "更新" : "创建"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {memories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground" data-testid="text-no-memories">还没有任何记忆</p>
                  <p className="mt-2 text-sm text-muted-foreground">AI会在聊天中自动学习，或者你可以手动添加</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {memories.map((memory) => (
                    <Card key={memory.id} className="hover-elevate" data-testid={`memory-card-${memory.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base" data-testid={`memory-key-${memory.id}`}>
                                {memory.key}
                              </CardTitle>
                              <Badge
                                variant="outline"
                                className={getImportanceColor(memory.importance)}
                                data-testid={`memory-importance-${memory.id}`}
                              >
                                {memory.importance >= 8 ? <Star className="mr-1 h-3 w-3" /> : <StarOff className="mr-1 h-3 w-3" />}
                                {getImportanceLabel(memory.importance)}
                              </Badge>
                            </div>
                            <CardDescription className="mt-2" data-testid={`memory-value-${memory.id}`}>
                              {memory.value}
                            </CardDescription>
                            {memory.context && (
                              <p className="mt-2 text-sm text-muted-foreground" data-testid={`memory-context-${memory.id}`}>
                                上下文: {memory.context}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditDialog(memory)}
                              data-testid={`button-edit-memory-${memory.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("确定要删除这条记忆吗？")) {
                                  deleteMemoryMutation.mutate(memory.id);
                                }
                              }}
                              data-testid={`button-delete-memory-${memory.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Edit Persona Dialog */}
      <Dialog open={personaDialogOpen} onOpenChange={setPersonaDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑AI女友</DialogTitle>
            <DialogDescription>
              修改AI女友的详细信息
            </DialogDescription>
          </DialogHeader>
          <Form {...personaForm}>
            <form onSubmit={personaForm.handleSubmit(handlePersonaSubmit)} className="space-y-4">
              {/* Avatar Upload */}
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={avatarPreview || persona?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
                    {personaForm.watch("name")?.substring(0, 2) || "AI"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-avatar"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    上传头像
                  </Button>
                  {avatarPreview && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAvatarPreview("");
                        personaForm.setValue("avatarUrl", "");
                      }}
                      data-testid="button-remove-avatar"
                    >
                      <XIcon className="mr-2 h-4 w-4" />
                      移除
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <FormField
                control={personaForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名字</FormLabel>
                    <FormControl>
                      <Input placeholder="例如：小美" {...field} data-testid="input-persona-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={personaForm.control}
                name="personality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>性格</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="例如：温柔体贴、善解人意、喜欢浪漫"
                        rows={3}
                        {...field}
                        data-testid="input-persona-personality"
                      />
                    </FormControl>
                    <FormDescription>
                      描述AI的性格特点，这将影响她的对话风格
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={personaForm.control}
                name="systemPrompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>系统提示</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="例如：你是一个温柔的AI女友，总是关心用户的感受..."
                        rows={4}
                        {...field}
                        data-testid="input-persona-systemprompt"
                      />
                    </FormControl>
                    <FormDescription>
                      定义AI的行为和对话方式的核心指令
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={personaForm.control}
                name="backstory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>背景故事（可选）</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="例如：我在大学学习计算机科学，喜欢音乐和绘画..."
                        rows={3}
                        {...field}
                        value={field.value || ""}
                        data-testid="input-persona-backstory"
                      />
                    </FormControl>
                    <FormDescription>
                      添加背景故事让对话更有深度
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={personaForm.control}
                name="greeting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>问候语（可选）</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="例如：嗨！很高兴见到你~"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-persona-greeting"
                      />
                    </FormControl>
                    <FormDescription>
                      首次对话时的开场白
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={personaForm.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AI模型</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-persona-model">
                          <SelectValue placeholder="选择AI模型" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro（推荐）</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      选择不同的AI模型获得不同的对话体验
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={personaForm.control}
                name="responseDelay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>回复延迟（秒）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-persona-delay"
                      />
                    </FormControl>
                    <FormDescription>
                      模拟真实的思考时间（0-10秒）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPersonaDialogOpen(false);
                    setAvatarPreview("");
                  }}
                  data-testid="button-cancel-persona"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={updatePersonaMutation.isPending}
                  data-testid="button-submit-persona"
                >
                  {updatePersonaMutation.isPending ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      保存中...
                    </>
                  ) : "保存"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
