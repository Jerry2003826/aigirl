import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Settings as SettingsIcon, Sparkles, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MobileHeader } from "@/components/mobile-header";

type AiSettings = {
  id: string;
  userId: string;
  provider: string;
  apiFormat: "google_native" | "openai_compatible";
  apiBaseUrl: string | null;
  model: string;
  customApiKey: string | null;
  minimaxApiKey: string | null;
  minimaxStreamAsrUrl: string | null;
  minimaxStreamTtsUrl: string | null;
  ragEnabled: boolean;
  searchEnabled: boolean;
  language: string | null;
  createdAt: string;
  updatedAt: string;
};

const urlOptional = (msg: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v || v.trim() === "" || /^(https?|wss?):\/\//.test(v.trim()), msg);

const settingsFormSchema = z.object({
  provider: z.string().optional(),
  apiFormat: z.enum(["google_native", "openai_compatible"]),
  apiBaseUrl: urlOptional("API Base URL 需以 http://、https://、ws:// 或 wss:// 开头"),
  model: z.string().min(1, "模型名不能为空"),
  customApiKey: z.string().min(1, "API密钥是必需的，请提供你的API密钥"),
  minimaxApiKey: z.string().optional(),
  minimaxStreamAsrUrl: urlOptional("MiniMax ASR URL 需为 ws:// 或 wss:// 地址"),
  minimaxStreamTtsUrl: urlOptional("MiniMax TTS URL 需为 ws:// 或 wss:// 地址"),
  ragEnabled: z.boolean(),
  searchEnabled: z.boolean(),
  language: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;

type SettingsProps = {
  onBackToList?: () => void;
  showMobileSidebar?: boolean;
};

export default function Settings({ onBackToList = () => {}, showMobileSidebar = false }: SettingsProps) {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<AiSettings>({
    queryKey: ["/api/settings/ai"],
  });

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      provider: settings?.provider || "custom",
      apiFormat: settings?.apiFormat || "google_native",
      apiBaseUrl: settings?.apiBaseUrl || "",
      model: settings?.model || "gemini-2.5-pro",
      customApiKey: settings?.customApiKey || "",
      minimaxApiKey: settings?.minimaxApiKey || "",
      minimaxStreamAsrUrl: settings?.minimaxStreamAsrUrl || "",
      minimaxStreamTtsUrl: settings?.minimaxStreamTtsUrl || "",
      ragEnabled: settings?.ragEnabled || false,
      searchEnabled: settings?.searchEnabled || false,
      language: settings?.language || "zh-CN",
    },
    values: settings ? {
      provider: settings.provider || "custom",
      apiFormat: settings.apiFormat || "google_native",
      apiBaseUrl: settings.apiBaseUrl || "",
      model: settings.model,
      customApiKey: settings.customApiKey || "",
      minimaxApiKey: settings.minimaxApiKey || "",
      minimaxStreamAsrUrl: settings.minimaxStreamAsrUrl || "",
      minimaxStreamTtsUrl: settings.minimaxStreamTtsUrl || "",
      ragEnabled: settings.ragEnabled,
      searchEnabled: settings.searchEnabled,
      language: settings.language || "zh-CN",
    } : undefined,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: SettingsFormData) =>
      apiRequest("PUT", "/api/settings/ai", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai"] });
      toast({
        title: "设置已保存",
        description: "您的AI设置已成功更新",
      });
    },
    onError: (error: any) => {
      toast({
        title: "错误",
        description: error.message || "更新设置失败",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: SettingsFormData) => {
    updateSettingsMutation.mutate({
      ...data,
      provider: "custom",
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" data-testid="spinner-loading"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Mobile Header */}
      <MobileHeader 
        title="设置" 
        onBack={onBackToList} 
        showMobileSidebar={showMobileSidebar}
      />
      
      <div className="container mx-auto max-w-3xl p-4 md:p-6">
        {/* Header */}
        <div className="mb-8 hidden md:block">
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">设置</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-page-description">
            配置您的AI偏好和应用设置
          </p>
        </div>

        <div className="space-y-6">
          {/* AI Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI配置
              </CardTitle>
              <CardDescription>
                管理你的AI模型偏好和API设置
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="apiFormat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>协议格式</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-api-format">
                              <SelectValue placeholder="选择协议格式" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="google_native">Google Native（Gemini原生）</SelectItem>
                            <SelectItem value="openai_compatible">OpenAI Compatible（兼容格式）</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          统一采用“用户自定义URL + 选择协议格式”的方式调用模型。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="apiBaseUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Base URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="例如：https://api.openai.com/v1 或 https://generativelanguage.googleapis.com/v1beta"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-api-base-url"
                          />
                        </FormControl>
                        <FormDescription>
                          可留空使用官方默认地址。填写后将按你选择的协议格式发起请求。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AI模型</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="gemini-2.5-pro"
                            {...field}
                            data-testid="input-model"
                          />
                        </FormControl>
                        <FormDescription>
                          指定要使用的AI模型（例如：gemini-2.5-pro, gemini-2.5-flash）。保持默认值以获得最佳效果。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-destructive">🔑 文本模型 API密钥 (必填)</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="输入你的模型 API Key"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-api-key"
                            required
                          />
                        </FormControl>
                        <FormDescription className="space-y-1">
                          <p className="font-medium text-foreground">⚠️ 必须提供API密钥才能使用AI功能：</p>
                          <ul className="list-disc list-inside space-y-0.5 text-sm">
                            <li>支持 Google Native 与 OpenAI Compatible 两种协议格式</li>
                            <li>你可以填写任意服务商 URL，只要协议格式匹配</li>
                            <li>密钥仅用于你自己的请求，并会安全存储</li>
                            <li className="text-destructive font-medium">没有API密钥将无法使用任何AI功能</li>
                          </ul>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="minimaxApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">🎙️ MiniMax 语音 API密钥（用于语音通话）</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="输入你的 MiniMax API Key（JWT）"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-minimax-api-key"
                          />
                        </FormControl>
                        <FormDescription className="space-y-1">
                          <p className="text-sm">
                            仅用于 MiniMax 实时语音（ASR/TTS）。不填也能正常文字聊天，但语音通话会提示未配置。
                          </p>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="minimaxStreamAsrUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MiniMax ASR WebSocket URL（海外默认）</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="wss://api.minimax.io/ws/v1/asr"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-minimax-asr-url"
                          />
                        </FormControl>
                        <FormDescription>
                          留空将使用海外默认地址，可按你的网络环境覆盖。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="minimaxStreamTtsUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MiniMax TTS WebSocket URL（海外默认）</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="wss://api.minimax.io/ws/v1/t2a_v2"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-minimax-tts-url"
                          />
                        </FormControl>
                        <FormDescription>
                          留空将使用海外默认地址，可按你的网络环境覆盖。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>偏好语言</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value || "zh-CN"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-language">
                              <SelectValue placeholder="选择语言" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="zh-CN">中文 (Chinese)</SelectItem>
                            <SelectItem value="en-US">English</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          选择AI回复的偏好语言
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4 border-t pt-4">
                    <h3 className="text-sm font-medium">高级功能</h3>
                    
                    <FormField
                      control={form.control}
                      name="ragEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5 flex-1">
                            <FormLabel className="text-base">记忆检索增强 (RAG)</FormLabel>
                            <FormDescription>
                              启用AI女友记忆库检索，让她能更好地记住和理解你们的对话
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-rag"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="searchEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5 flex-1">
                            <FormLabel className="text-base">联网搜索</FormLabel>
                            <FormDescription>
                              允许AI联网搜索最新信息，了解实时新闻和资讯
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-search"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-settings"
                  >
                    {updateSettingsMutation.isPending ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                        保存中...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        保存设置
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
