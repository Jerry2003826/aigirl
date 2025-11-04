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
  customApiKey: z.string().optional(),
  ragEnabled: z.boolean(),
  searchEnabled: z.boolean(),
  language: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;

export default function Settings() {
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
      apiRequest("/api/settings/ai", "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai"] });
      toast({
        title: "Settings saved",
        description: "Your AI settings have been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: SettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  const handleSeedDefaultPersona = async () => {
    try {
      await apiRequest("/api/seed/default-persona", "POST", {});
      toast({
        title: "Success",
        description: "Default test persona created successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create default persona",
        variant: "destructive",
      });
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
      <div className="container mx-auto max-w-4xl p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Settings</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Configure your AI preferences and application settings
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
                        <FormLabel>Custom API Key (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter your custom API key"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-api-key"
                          />
                        </FormControl>
                        <FormDescription>
                          For future RAG and embedding features. Leave empty to use Replit AI Integrations.
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
                    <h3 className="text-sm font-medium">Advanced Features (Coming Soon)</h3>
                    
                    <FormField
                      control={form.control}
                      name="ragEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">RAG (Retrieval-Augmented Generation)</FormLabel>
                            <FormDescription>
                              Enable document retrieval and knowledge base features
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled
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
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Web Search</FormLabel>
                            <FormDescription>
                              Allow AI to search the web for up-to-date information
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled
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

          {/* Test Tools */}
          <Card>
            <CardHeader>
              <CardTitle>Test Tools</CardTitle>
              <CardDescription>
                Quick actions for testing and development
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={handleSeedDefaultPersona}
                data-testid="button-seed-persona"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Create Default Test Persona (更科瑠夏)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
