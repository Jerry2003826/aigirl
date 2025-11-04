import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Settings, Copy } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner@2.0.3';

interface ApiConfigCheckerProps {
  geminiApiKey: string;
  onOpenSettings: () => void;
}

export function ApiConfigChecker({ geminiApiKey, onOpenSettings }: ApiConfigCheckerProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const configured = !!geminiApiKey && geminiApiKey.trim() !== '';
    setIsConfigured(configured);
    
    // 如果未配置，等待5秒后显示提示
    if (!configured) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setShowPrompt(false);
    }
  }, [geminiApiKey]);

  // 如果已配置，不显示任何内容
  if (isConfigured) {
    return null;
  }

  // 如果5秒内没有显示提示，不显示
  if (!showPrompt) {
    return null;
  }

  const handleCopyGuide = () => {
    const guide = `获取Gemini API Key步骤：

1. 访问 Google AI Studio
   https://aistudio.google.com/apikey

2. 登录你的Google账号

3. 点击 "Create API Key" 或 "Get API Key"

4. 选择或创建一个Google Cloud项目

5. 复制生成的API Key

6. 返回应用，点击右上角"⚙️设置"

7. 在"AI配置"中粘贴API Key并保存

注意：
- 免费版有足够的配额用于日常使用
- API Key以 "AIza" 开头
- 请妥善保管，不要泄露给他人`;

    navigator.clipboard.writeText(guide);
    toast.success('使用指南已复制到剪贴板');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <Card className="max-w-lg w-full shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <CardTitle>需要配置API Key</CardTitle>
              <CardDescription>首次使用需要设置Gemini API Key</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>为什么需要配置？</AlertTitle>
            <AlertDescription>
              AI女友需要使用Google Gemini API来生成回复。每个用户都需要配置自己的API Key。
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">快速开始：</h4>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-medium">获取免费API Key</p>
                  <a 
                    href="https://aistudio.google.com/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    访问 Google AI Studio ↗
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-medium">登录并创建API Key</p>
                  <p className="text-muted-foreground">使用你的Google账号登录并生成密钥</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-medium">在应用中配置</p>
                  <p className="text-muted-foreground">点击下方按钮打开设置并粘贴API Key</p>
                </div>
              </div>
            </div>
          </div>

          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-900 dark:text-green-100">完全免费</AlertTitle>
            <AlertDescription className="text-green-800 dark:text-green-200">
              Gemini API 提供慷慨的免费配额，足够日常使用
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button 
              onClick={onOpenSettings}
              className="flex-1"
              size="lg"
            >
              <Settings className="w-4 h-4 mr-2" />
              打开设置配置
            </Button>
            <Button
              onClick={handleCopyGuide}
              variant="outline"
              size="lg"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>

          <button
            onClick={() => setShowPrompt(false)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            暂时跳过
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
