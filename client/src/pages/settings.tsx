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
  model: string;
  customApiKey: string | null;
  ragEnabled: boolean;
  searchEnabled: boolean;
  language: string | null;
  createdAt: string;
  updatedAt: string;
};

const settingsFormSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  model: z.string().min(1, "Model is required"),
  customApiKey: z.string().min(1, "API密钥是必需的，请提供你的Google AI或OpenAI API密钥"),
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
      provider: settings?.provider || "google",
      model: settings?.model || "gemini-2.5-pro",
      customApiKey: settings?.customApiKey || "",
      ragEnabled: settings?.ragEnabled || false,
      searchEnabled: settings?.searchEnabled || false,
      language: settings?.language || "zh-CN",
    },
    values: settings ? {
      provider: settings.provider,
      model: settings.model,
      customApiKey: settings.customApiKey || "",
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
    updateSettingsMutation.mutate(data);
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
                AI Configuration
              </CardTitle>
              <CardDescription>
                Manage your AI model preferences and API settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AI Provider</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-provider">
                              <SelectValue placeholder="Select AI provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="google">Google Gemini (Recommended)</SelectItem>
                            <SelectItem value="openai">OpenAI (Future expansion)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose your preferred AI provider. Google Gemini is recommended for best results.
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
                        <FormLabel>AI Model</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="gemini-2.5-pro"
                            {...field}
                            data-testid="input-model"
                          />
                        </FormControl>
                        <FormDescription>
                          Specify the AI model to use (e.g., gemini-2.5-pro, gemini-2.5-flash). Leave default for best results.
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
                        <FormLabel className="text-base font-semibold text-destructive">🔑 API密钥 (必填)</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="输入你的 Google AI API 密钥或 OpenAI API 密钥"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-api-key"
                            required
                          />
                        </FormControl>
                        <FormDescription className="space-y-1">
                          <p className="font-medium text-foreground">⚠️ 必须提供API密钥才能使用AI功能：</p>
                          <ul className="list-disc list-inside space-y-0.5 text-sm">
                            <li><strong>Google AI（推荐）</strong>: 在 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">Google AI Studio</a> 获取免费密钥</li>
                            <li>OpenAI: 在 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenAI Platform</a> 获取密钥（付费）</li>
                            <li>你的密钥将被安全存储，仅用于你的AI请求</li>
                            <li className="text-destructive font-medium">没有API密钥将无法使用任何AI功能</li>
                          </ul>
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
                        <FormLabel>Preferred Language</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value || "zh-CN"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-language">
                              <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="zh-CN">中文 (Chinese)</SelectItem>
                            <SelectItem value="en-US">English</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose your preferred language for AI responses
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
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Settings
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
