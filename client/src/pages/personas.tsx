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
  name: z.string().min(1, "Name is required").max(100),
  personality: z.string().min(10, "Personality should be at least 10 characters"),
  systemPrompt: z.string().min(20, "System prompt should be at least 20 characters"),
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
  const [generateAvatar, setGenerateAvatar] = useState(false);
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
        generateAvatar,
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
        model: data.model || "gemini-2.5-pro",
        responseDelay: data.responseDelay || 0,
        userId: "",
      });
      
      // Close AI assistant dialog and open create dialog
      setAiAssistantOpen(false);
      setDialogOpen(true);
      
      // Reset AI assistant form
      setAiName("");
      setAiDescription("");
      setGenerateAvatar(false);
      
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
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Mobile Header */}
      <MobileHeader 
        title="AI角色" 
        onBack={onBackToList} 
        showMobileSidebar={showMobileSidebar}
      />
      
      <div className="container mx-auto max-w-7xl p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between hidden md:flex">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Personas</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              Create and manage your AI companions
            </p>
          </div>
          
          <div className="flex gap-3">
            {/* AI Assistant Button */}
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
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="generate-avatar"
                      checked={generateAvatar}
                      onChange={(e) => setGenerateAvatar(e.target.checked)}
                      className="h-4 w-4"
                      data-testid="checkbox-generate-avatar"
                    />
                    <label htmlFor="generate-avatar" className="text-sm">
                      让AI生成头像（基于人物形象）
                    </label>
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
            
            {/* Create Persona Button */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                className="h-12 rounded-xl" 
                onClick={openCreateDialog}
                data-testid="button-create-persona"
              >
                <Plus className="mr-2 h-5 w-5" />
                Create Persona
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle data-testid="text-dialog-title">
                  {editingPersona ? "Edit Persona" : "Create New Persona"}
                </DialogTitle>
                <DialogDescription>
                  {editingPersona 
                    ? "Update your AI companion's details" 
                    : "Design your AI companion with unique personality and traits"}
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter persona name" 
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
                        <FormLabel>Avatar (optional)</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            {avatarPreview && (
                              <div className="relative inline-block">
                                <Avatar className="h-24 w-24 border-2 border-border">
                                  <AvatarImage src={avatarPreview} />
                                  <AvatarFallback>Preview</AvatarFallback>
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
                                Upload Image
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
                              placeholder="Or paste image URL" 
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
                          Upload an image file or provide an image URL
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
                        <FormLabel>Personality</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Friendly and supportive, loves to encourage others..."
                            className="min-h-[80px]"
                            {...field} 
                            data-testid="input-persona-personality"
                          />
                        </FormControl>
                        <FormDescription>
                          Short description of the persona's personality traits
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
                        <FormLabel>System Prompt</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="You are a helpful AI companion who..."
                            className="min-h-[120px]"
                            {...field} 
                            data-testid="input-persona-system-prompt"
                          />
                        </FormControl>
                        <FormDescription>
                          Detailed instructions that define how the AI should behave
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
                        <FormLabel>Backstory (optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="I grew up in a small town and love..."
                            className="min-h-[100px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-persona-backstory"
                          />
                        </FormControl>
                        <FormDescription>
                          Background story that adds depth to the persona
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
                        <FormLabel>Greeting Message (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Hi! I'm excited to chat with you!" 
                            {...field}
                            value={field.value || ""}
                            data-testid="input-persona-greeting"
                          />
                        </FormControl>
                        <FormDescription>
                          Initial message shown when starting a new conversation
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
                        <FormLabel>Response Delay (ms)</FormLabel>
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
                          Add a delay before AI responds (0-10000ms) to simulate human-like response times
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
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createPersonaMutation.isPending || updatePersonaMutation.isPending}
                      data-testid="button-submit-persona"
                    >
                      {createPersonaMutation.isPending || updatePersonaMutation.isPending ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                          Saving...
                        </>
                      ) : editingPersona ? "Update" : "Create"}
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
            <h3 className="mb-2 text-xl font-semibold" data-testid="text-empty-title">No personas yet</h3>
            <p className="mb-6 text-center text-muted-foreground" data-testid="text-empty-description">
              Create your first AI companion to start chatting
            </p>
            <Button onClick={openCreateDialog} data-testid="button-create-first-persona">
              <Plus className="mr-2 h-5 w-5" />
              Create Your First Persona
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
                          if (confirm("Are you sure you want to delete this persona?")) {
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
                        Starting...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Chat
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
