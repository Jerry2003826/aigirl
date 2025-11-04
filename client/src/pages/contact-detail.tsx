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
import { MessageCircle, Edit, Trash2, Plus, ArrowLeft, Star, StarOff } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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

interface ContactDetailProps {
  personaId: string;
}

export default function ContactDetail({ personaId }: ContactDetailProps) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);

  const { data: persona, isLoading: personaLoading } = useQuery<Persona>({
    queryKey: ["/api/personas", personaId],
  });

  const { data: memories = [], isLoading: memoriesLoading } = useQuery<Memory[]>({
    queryKey: ["/api/memories", "persona", personaId],
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
      {/* Header */}
      <div className="border-b p-4">
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

          <Button
            onClick={() => setLocation("/chat")}
            data-testid="button-start-chat"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            发消息
          </Button>
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
    </div>
  );
}
