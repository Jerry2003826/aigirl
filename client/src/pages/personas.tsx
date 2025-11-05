import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAiPersonaSchema, type AiPersona } from "@shared/schema";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, MessageCircle, Sparkles, Upload, X as XIcon, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { MobileHeader } from "@/components/mobile-header";

const personaFormSchema = insertAiPersonaSchema.extend({
  name: z.string().min(1, "名字不能为空").max(100),
  personality: z.string().min(10, "性格描述至少需要10个字符"),
  systemPrompt: z.string().min(20, "系统提示至少需要20个字符"),
});

type PersonaFormData = z.infer<typeof personaFormSchema>;

type PersonasProps = {
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
};

export default function Personas({ onBackToList = () => {}, showMobileSidebar = false }: PersonasProps) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<AiPersona | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // AI Assistant form state
  const [aiName, setAiName] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: personas = [], isLoading } = useQuery<AiPersona[]>({
    queryKey: ["/api/personas"],
  });

  const form = useForm<PersonaFormData>({
    resolver: zodResolver(personaFormSchema),
    defaultValues: {
      name: "",
      avatarUrl: "",
      personality: "",
      systemPrompt: "",
      backstory: "",
      greeting: "",
      responseDelay: 0,
      userId: "",
    },
  });

  const createPersonaMutation = useMutation({
    mutationFn: (data: PersonaFormData) => 
      apiRequest("POST", "/api/personas", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "成功",
        description: "AI角色已成功创建",
      });
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "创建角色失败",
        variant: "destructive",
      });
    },
  });

  const updatePersonaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonaFormData> }) =>
      apiRequest("PATCH", `/api/personas/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personas"] });
      setDialogOpen(false);
      setEditingPersona(null);
      form.reset();
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
      setLocation(`/chat?conversationId=${conversation.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "开始聊天失败",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: PersonaFormData) => {
    if (editingPersona) {
      updatePersonaMutation.mutate({ id: editingPersona.id, data });
    } else {
      createPersonaMutation.mutate(data);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "文件无效",
        description: "请上传图片文件",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "文件过大",
        description: "请上传小于5MB的图片",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      form.setValue("avatarUrl", base64);
    };
    reader.readAsDataURL(file);
  };

  const clearAvatar = () => {
    setAvatarPreview("");
    form.setValue("avatarUrl", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openEditDialog = (persona: AiPersona) => {
    setEditingPersona(persona);
    setAvatarPreview(persona.avatarUrl ?? "");
    form.reset({
      name: persona.name,
      avatarUrl: persona.avatarUrl ?? "",
      personality: persona.personality,
      systemPrompt: persona.systemPrompt,
      backstory: persona.backstory ?? "",
      greeting: persona.greeting ?? "",
      responseDelay: persona.responseDelay || 0,
      userId: "",
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingPersona(null);
    setAvatarPreview("");
    form.reset();
    setDialogOpen(true);
  };

  const handleAiGenerate = async () => {
    if (!aiName.trim()) {
      toast({
        title: "错误",
        description: "请输入女友名字",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await apiRequest("POST", "/api/ai/generate-persona", {
        name: aiName,
        description: aiDescription,
      });
      const data = await response.json();
      
      // Fill form with AI generated data
      setAvatarPreview(data.avatarUrl || "");
      form.reset({
        name: data.name,
        avatarUrl: data.avatarUrl || "",
        personality: data.personality,
        systemPrompt: data.systemPrompt,
        backstory: data.backstory || "",
        greeting: data.greeting || "",
        responseDelay: data.responseDelay || 0,
        userId: "",
      });
      
      // Close AI assistant dialog and open create dialog
      setAiAssistantOpen(false);
      setDialogOpen(true);
      
      // Reset AI assistant form
      setAiName("");
      setAiDescription("");
      
      toast({
        title: "成功",
        description: "AI已生成女友配置，请检查并保存",
      });
    } catch (error: any) {
      toast({
        title: "错误",
        description: error.message || "AI生成失败",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-20 md:pb-6 bg-background">
      {/* Mobile Header */}
      <MobileHeader 
        title="AI女友" 
        onBack={onBackToList} 
        showMobileSidebar={showMobileSidebar}
      />
      
      <div className="container mx-auto max-w-7xl p-6">
        {/* Desktop Header */}
        <div className="mb-8 flex items-center justify-between hidden md:flex">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">AI女友</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              创建和管理你的AI女友
            </p>
          </div>
          
          <div className="flex gap-3">
            {/* AI Assistant Button - Desktop */}
            <Dialog open={aiAssistantOpen} onOpenChange={setAiAssistantOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl"
                  data-testid="button-ai-assistant"
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  AI智能助理
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle data-testid="text-ai-assistant-title">AI智能助理</DialogTitle>
                  <DialogDescription>
                    告诉我你想要的女友名字，AI会自动搜索信息并生成完整配置
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">女友名字 *</label>
                    <Input 
                      placeholder="例如：林黛玉、赫敏·格兰杰" 
                      value={aiName}
                      onChange={(e) => setAiName(e.target.value)}
                      data-testid="input-ai-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">简单描述（可选）</label>
                    <Textarea 
                      placeholder="补充描述，例如：性格温柔、喜欢读书" 
                      value={aiDescription}
                      onChange={(e) => setAiDescription(e.target.value)}
                      rows={3}
                      data-testid="input-ai-description"
                    />
                  </div>
                  
                  <Button
                    onClick={handleAiGenerate}
                    disabled={isGenerating}
                    className="w-full"
                    data-testid="button-generate-persona"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        AI生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        生成女友配置
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            {/* Create Persona Button - Desktop */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                className="h-12 rounded-xl" 
                onClick={openCreateDialog}
                data-testid="button-create-persona"
              >
                <Plus className="mr-2 h-5 w-5" />
                新建女友
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle data-testid="text-dialog-title">
                  {editingPersona ? "编辑AI女友" : "新建AI女友"}
                </DialogTitle>
                <DialogDescription>
                  {editingPersona 
                    ? "更新AI女友的详细信息" 
                    : "设计你的专属AI女友，赋予她独特的性格和特质"}
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>名字</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="输入AI女友的名字" 
                            {...field} 
                            data-testid="input-persona-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="avatarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>头像（可选）</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            {avatarPreview && (
                              <div className="relative inline-block">
                                <Avatar className="h-24 w-24 border-2 border-border">
                                  <AvatarImage src={avatarPreview} />
                                  <AvatarFallback>预览</AvatarFallback>
                                </Avatar>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="destructive"
                                  className="absolute -right-2 -top-2 h-6 w-6 min-h-6 min-w-6 !rounded-full p-0 shrink-0"
                                  onClick={clearAvatar}
                                  data-testid="button-clear-avatar"
                                >
                                  <XIcon className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                data-testid="button-upload-avatar"
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                上传图片
                              </Button>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileUpload}
                                data-testid="input-file-avatar"
                              />
                            </div>
                            <Input 
                              placeholder="或粘贴图片URL" 
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => {
                                field.onChange(e);
                                setAvatarPreview(e.target.value);
                              }}
                              data-testid="input-persona-avatar-url"
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          上传图片文件或提供图片URL
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="personality"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>性格</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="温柔体贴，善解人意，喜欢鼓励他人..."
                            className="min-h-[80px]"
                            {...field} 
                            data-testid="input-persona-personality"
                          />
                        </FormControl>
                        <FormDescription>
                          简要描述AI女友的性格特点
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="systemPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>系统提示</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="你是一位温柔体贴的AI女友，总是..."
                            className="min-h-[120px]"
                            {...field} 
                            data-testid="input-persona-system-prompt"
                          />
                        </FormControl>
                        <FormDescription>
                          定义AI行为方式的详细指令
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="backstory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>背景故事（可选）</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="我在一个小镇长大，喜欢..."
                            className="min-h-[100px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-persona-backstory"
                          />
                        </FormControl>
                        <FormDescription>
                          为AI女友增添深度的背景故事
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="greeting"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>问候语（可选）</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="嗨！很高兴见到你！" 
                            {...field}
                            value={field.value || ""}
                            data-testid="input-persona-greeting"
                          />
                        </FormControl>
                        <FormDescription>
                          开始新对话时显示的初始消息
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="responseDelay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>响应延迟（毫秒）</FormLabel>
                        <FormControl>
                          <Input 
                            type="number"
                            min="0"
                            max="10000"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-persona-delay"
                          />
                        </FormControl>
                        <FormDescription>
                          设置AI回复前的延迟时间（0-10000毫秒），模拟真人回复速度
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
                        setEditingPersona(null);
                        form.reset();
                      }}
                      data-testid="button-cancel"
                    >
                      取消
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createPersonaMutation.isPending || updatePersonaMutation.isPending}
                      data-testid="button-submit-persona"
                    >
                      {createPersonaMutation.isPending || updatePersonaMutation.isPending ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                          保存中...
                        </>
                      ) : editingPersona ? "更新" : "创建"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Personas Grid */}
        {personas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-semibold" data-testid="text-empty-title">还没有AI女友</h3>
            <p className="mb-6 text-center text-muted-foreground" data-testid="text-empty-description">
              创建你的第一个AI女友开始聊天
            </p>
            <Button onClick={openCreateDialog} data-testid="button-create-first-persona">
              <Plus className="mr-2 h-5 w-5" />
              创建第一个AI女友
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {personas.map((persona) => (
              <Card key={persona.id} className="hover-elevate overflow-hidden" data-testid={`card-persona-${persona.id}`}>
                <CardHeader className="space-y-4 pb-4">
                  <div className="flex items-center justify-between">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={persona.avatarUrl || undefined} alt={persona.name} />
                      <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                        {persona.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(persona)}
                        data-testid={`button-edit-${persona.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("确定要删除这个AI女友吗？")) {
                            deletePersonaMutation.mutate(persona.id);
                          }
                        }}
                        data-testid={`button-delete-${persona.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <CardTitle className="mb-1" data-testid={`text-persona-name-${persona.id}`}>
                      {persona.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2" data-testid={`text-persona-personality-${persona.id}`}>
                      {persona.personality}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardFooter className="flex gap-2 pt-0">
                  <Button
                    className="flex-1"
                    variant="default"
                    onClick={() => startChatMutation.mutate(persona.id)}
                    disabled={startChatMutation.isPending}
                    data-testid={`button-chat-${persona.id}`}
                  >
                    {startChatMutation.isPending ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                        开始聊天...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="mr-2 h-4 w-4" />
                        聊天
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {/* Mobile FAB - Floating Action Buttons */}
      <div className="fixed bottom-20 right-4 flex flex-col gap-3 md:hidden z-50">
        {/* AI Assistant FAB */}
        <Dialog open={aiAssistantOpen} onOpenChange={setAiAssistantOpen}>
          <DialogTrigger asChild>
            <Button 
              size="lg"
              variant="outline"
              className="h-14 w-14 rounded-full shadow-lg bg-background hover:scale-105 transition-transform"
              data-testid="button-ai-assistant-mobile"
            >
              <Sparkles className="h-6 w-6" />
            </Button>
          </DialogTrigger>
        </Dialog>
        
        {/* Create Persona FAB */}
        <Button 
          size="lg" 
          className="h-14 w-14 rounded-full shadow-lg hover:scale-105 transition-transform" 
          onClick={openCreateDialog}
          data-testid="button-create-persona-mobile"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
