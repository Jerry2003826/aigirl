import { AIConfig } from '../App';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner@2.0.3';
import { Save, RefreshCw, Globe, Database } from 'lucide-react';
import { AuthDebugger } from './AuthDebugger';
import { useState, useEffect, useRef } from 'react';
import { instantSave, debouncedInstantSave } from '../utils/instant-save';
import { recordLocalChange } from '../utils/local-change-tracker';

interface ConfigPanelProps {
  config: AIConfig;
  setConfig: (config: AIConfig) => void;
  accessToken?: string; // 用于立即保存到云端
  immersiveMode?: boolean; // 沉浸模式（不显示toast）
}

export function ConfigPanel({ config, setConfig, accessToken, immersiveMode = false }: ConfigPanelProps) {
  const [showAuthDebugger, setShowAuthDebugger] = useState(false);
  const renderCount = useRef(0);
  const lastAccessToken = useRef(accessToken);
  
  // 调试：追踪渲染次数和token变化
  useEffect(() => {
    renderCount.current += 1;
    const tokenChanged = lastAccessToken.current !== accessToken;
    
    if (renderCount.current % 10 === 0 || tokenChanged) {
      console.log('🔧 [ConfigPanel] Render #' + renderCount.current, {
        hasAccessToken: !!accessToken,
        tokenChanged,
        tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'null'
      });
    }
    
    lastAccessToken.current = accessToken;
  });

  const handleSave = async () => {
    const saveStartTime = Date.now();
    console.log('🔧 [ConfigPanel] 开始保存配置...', {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length || 0,
      configKeys: Object.keys(config),
      timestamp: new Date().toISOString()
    });
    
    // 记录本地修改
    recordLocalChange('config');
    
    // 立即保存到云端
    if (accessToken) {
      try {
        console.log('🔧 [ConfigPanel] 调用 instantSave...');
        const result = await instantSave(accessToken, { config }, {
          showToast: true,
          toastMessage: '保存配置中...',
          trackChanges: ['config'],
          immersiveMode
        });
        
        const saveTime = Date.now() - saveStartTime;
        console.log('🔧 [ConfigPanel] 保存结果:', {
          ...result,
          saveTime: `${saveTime}ms`,
          timestamp: new Date().toISOString()
        });
        
        if (!result.success) {
          console.error('🔧 [ConfigPanel] 保存失败，详细信息:', result.error);
        }
      } catch (error) {
        const saveTime = Date.now() - saveStartTime;
        console.error('🔧 [ConfigPanel] 保存异常:', {
          error,
          message: error?.message,
          stack: error?.stack,
          saveTime: `${saveTime}ms`,
          timestamp: new Date().toISOString()
        });
        toast.error(`保存失败: ${error?.message || '未知错误'}`);
      }
    } else {
      toast.success('配置已保存！');
    }
  };

  const handleReset = async () => {
    console.log('🔧 [ConfigPanel] 开始重置配置...');
    
    const defaultConfig: AIConfig = {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      customModel: '',
      geminiApiKey: '',
      openaiApiKey: '',
      anthropicApiKey: '',
      customApiKey: '',
      customApiUrl: '',
      temperature: 0.8,
      maxTokens: 2000,
      supportsVision: true,
      enableWebSearch: false,
      enableRAG: false,
    };
    
    setConfig(defaultConfig);
    
    // 记录本地修改
    recordLocalChange('config');
    
    // 立即保存到云端
    if (accessToken) {
      try {
        const result = await instantSave(accessToken, { config: defaultConfig }, {
          showToast: true,
          toastMessage: '重置配置中...',
          trackChanges: ['config'],
          immersiveMode
        });
        
        console.log('🔧 [ConfigPanel] 重置结果:', result);
      } catch (error) {
        console.error('🔧 [ConfigPanel] 重置异常:', error);
        toast.error(`重置失败: ${error.message}`);
      }
    } else {
      toast.success('配置已重置为默认值');
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 md:gap-2 flex-shrink-0 ml-auto">
            <Button variant="outline" onClick={handleReset} className="gap-1 md:gap-2 h-8 md:h-9 text-xs md:text-sm px-2 md:px-4">
              <RefreshCw className="w-3 h-3 md:w-4 md:h-4" />
              重置
            </Button>
            <Button onClick={handleSave} className="gap-1 md:gap-2 bg-[#07C160] hover:bg-[#06AD56] h-8 md:h-9 text-xs md:text-sm px-2 md:px-4">
              <Save className="w-3 h-3 md:w-4 md:h-4" />
              保存
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-right">
          💡 提示：修改配置后请点击"保存"按钮
        </p>
      </div>

      <div className="grid gap-4 md:gap-6">
        {/* API提供商选择 */}
        <Card>
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-base md:text-lg">API提供商</CardTitle>
            <CardDescription className="text-xs md:text-sm">选择您的AI模型提供商</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">提供商</Label>
              <Select value={config.provider} onValueChange={(value: 'gemini' | 'openai' | 'anthropic' | 'custom') => {
                setConfig({ ...config, provider: value });
              }}>
                <SelectTrigger id="provider">
                  <SelectValue placeholder="选择提供商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">🌟 Google Gemini（推荐）</SelectItem>
                  <SelectItem value="openai">🤖 OpenAI (GPT-4, GPT-3.5)</SelectItem>
                  <SelectItem value="anthropic">🧠 Anthropic (Claude)</SelectItem>
                  <SelectItem value="custom">⚙️ 自定义API</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Gemini配置 */}
        {config.provider === 'gemini' && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg text-green-800">
                ⭐ Gemini API配置
              </CardTitle>
              <CardDescription className="text-xs md:text-sm text-green-700">
                一个API Key满足所有需求：聊天、图片识别、RAG、联网搜索
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              <div className="space-y-2">
                <Label htmlFor="geminiApiKey">Gemini API Key</Label>
                <Input
                  id="geminiApiKey"
                  type="password"
                  value={config.geminiApiKey}
                  onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                  placeholder="AIza..."
                />
                <p className="text-sm text-green-700">
                  获取地址: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-medium">Google AI Studio</a> （免费额度充足）
                </p>
              </div>

              <div className="bg-white rounded-lg p-3 text-sm text-green-800">
                <p className="font-medium mb-2">✅ Gemini API 功能：</p>
                <ul className="space-y-1 text-xs">
                  <li>• 文字对话 - 免费</li>
                  <li>• 图片识别 - 免费</li>
                  <li>• RAG语义检索 - 免费</li>
                  <li>• 联网搜索 - 免费</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* OpenAI配置 */}
        {config.provider === 'openai' && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg text-blue-800">
                🤖 OpenAI API配置
              </CardTitle>
              <CardDescription className="text-xs md:text-sm text-blue-700">
                GPT-4、GPT-4 Turbo、GPT-3.5 Turbo等模型
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
                <Input
                  id="openaiApiKey"
                  type="password"
                  value={config.openaiApiKey || ''}
                  onChange={(e) => setConfig({ ...config, openaiApiKey: e.target.value })}
                  placeholder="sk-..."
                />
                <p className="text-sm text-blue-700">
                  获取地址: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">OpenAI Platform</a>
                </p>
              </div>

              <div className="bg-white rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium mb-2">📌 OpenAI支持的模型：</p>
                <ul className="space-y-1 text-xs">
                  <li>• gpt-4-turbo - 最新GPT-4</li>
                  <li>• gpt-4 - GPT-4标准版</li>
                  <li>• gpt-3.5-turbo - 快速且经济</li>
                  <li>• gpt-4-vision-preview - 支持图片</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Anthropic配置 */}
        {config.provider === 'anthropic' && (
          <Card className="border-purple-200 bg-purple-50">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg text-purple-800">
                🧠 Anthropic API配置
              </CardTitle>
              <CardDescription className="text-xs md:text-sm text-purple-700">
                Claude 3.5 Sonnet、Claude 3 Opus等模型
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anthropicApiKey">Anthropic API Key</Label>
                <Input
                  id="anthropicApiKey"
                  type="password"
                  value={config.anthropicApiKey || ''}
                  onChange={(e) => setConfig({ ...config, anthropicApiKey: e.target.value })}
                  placeholder="sk-ant-..."
                />
                <p className="text-sm text-purple-700">
                  获取地址: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline font-medium">Anthropic Console</a>
                </p>
              </div>

              <div className="bg-white rounded-lg p-3 text-sm text-purple-800">
                <p className="font-medium mb-2">📌 Claude支持的模型：</p>
                <ul className="space-y-1 text-xs">
                  <li>• claude-3-5-sonnet-20241022 - 最新版本</li>
                  <li>• claude-3-opus-20240229 - 最强大</li>
                  <li>• claude-3-sonnet-20240229 - 平衡性能</li>
                  <li>• claude-3-haiku-20240307 - 快速响应</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 自定义API配置 */}
        {config.provider === 'custom' && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg text-orange-800">
                ⚙️ 自定义API配置
              </CardTitle>
              <CardDescription className="text-xs md:text-sm text-orange-700">
                支持任何兼容OpenAI格式的API（如Ollama、国产模型等）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customApiUrl">API URL</Label>
                <Input
                  id="customApiUrl"
                  type="text"
                  value={config.customApiUrl || ''}
                  onChange={(e) => setConfig({ ...config, customApiUrl: e.target.value })}
                  placeholder="https://api.example.com/v1/chat/completions"
                />
                <p className="text-sm text-orange-700">
                  输入完整的API URL（需兼容OpenAI格式）
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customApiKey">API Key（可选）</Label>
                <Input
                  id="customApiKey"
                  type="password"
                  value={config.customApiKey || ''}
                  onChange={(e) => setConfig({ ...config, customApiKey: e.target.value })}
                  placeholder="如果API需要认证，请输入API Key"
                />
              </div>

              <div className="bg-white rounded-lg p-3 text-sm text-orange-800">
                <p className="font-medium mb-2">💡 支持的自定义API：</p>
                <ul className="space-y-1 text-xs">
                  <li>• Ollama本地模型</li>
                  <li>• 国产大模型（通义千问、文心一言等）</li>
                  <li>• 自建模型服务</li>
                  <li>• OpenAI兼容的第三方API</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-base md:text-lg">模型配置</CardTitle>
            <CardDescription className="text-xs md:text-sm">选择模型和调整参数</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            <div className="space-y-2">
              <Label htmlFor="model">模型名称</Label>
              
              {/* Gemini模型 */}
              {config.provider === 'gemini' && (
                <Select value={config.model} onValueChange={(value) => setConfig({ ...config, model: value })}>
                  <SelectTrigger id="model">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.5-pro">gemini-2.5-pro (推荐)</SelectItem>
                    <SelectItem value="gemini-2.0-flash-exp">gemini-2.0-flash-exp (快速)</SelectItem>
                    <SelectItem value="gemini-1.5-pro">gemini-1.5-pro</SelectItem>
                    <SelectItem value="gemini-1.5-flash">gemini-1.5-flash</SelectItem>
                    <SelectItem value="custom">自定义模型</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* OpenAI模型 */}
              {config.provider === 'openai' && (
                <Select value={config.model} onValueChange={(value) => setConfig({ ...config, model: value })}>
                  <SelectTrigger id="model">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4-turbo">gpt-4-turbo (推荐)</SelectItem>
                    <SelectItem value="gpt-4">gpt-4</SelectItem>
                    <SelectItem value="gpt-4-vision-preview">gpt-4-vision-preview (支持图片)</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">gpt-3.5-turbo (快速)</SelectItem>
                    <SelectItem value="custom">自定义模型</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Anthropic模型 */}
              {config.provider === 'anthropic' && (
                <Select value={config.model} onValueChange={(value) => setConfig({ ...config, model: value })}>
                  <SelectTrigger id="model">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022 (推荐)</SelectItem>
                    <SelectItem value="claude-3-opus-20240229">claude-3-opus-20240229 (最强)</SelectItem>
                    <SelectItem value="claude-3-sonnet-20240229">claude-3-sonnet-20240229 (平衡)</SelectItem>
                    <SelectItem value="claude-3-haiku-20240307">claude-3-haiku-20240307 (快速)</SelectItem>
                    <SelectItem value="custom">自定义模型</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* 自定义API直接输入模型名 */}
              {config.provider === 'custom' && (
                <Input
                  id="model"
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  placeholder="输入模型名称，如：llama2, qwen-plus等"
                />
              )}
              
              {/* 自定义模型名输入框 */}
              {config.model === 'custom' && config.provider !== 'custom' && (
                <>
                  <Input
                    value={config.customModel || ''}
                    onChange={(e) => setConfig({ ...config, customModel: e.target.value })}
                    placeholder={
                      config.provider === 'gemini' ? "输入自定义模型名称，如：gemini-exp-1206" :
                      config.provider === 'openai' ? "输入自定义模型名称，如：gpt-4-0125-preview" :
                      "输入自定义模型名称，如：claude-3-opus-latest"
                    }
                    className="mt-2"
                  />
                  {config.customModel && (
                    <div className="bg-blue-50 rounded-lg p-2 text-sm text-blue-700 mt-2">
                      ✅ 当前使用模型: {config.customModel}
                    </div>
                  )}
                </>
              )}
              
              {/* 当前模型显示 */}
              {config.provider === 'custom' && config.model && (
                <div className="bg-blue-50 rounded-lg p-2 text-sm text-blue-700 mt-2">
                  ✅ 当前使用模型: {config.model}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="supportsVision"
                checked={config.supportsVision}
                onChange={(e) => setConfig({ ...config, supportsVision: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="supportsVision" className="cursor-pointer">
                模型支持图片识别 (Vision)
              </Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Temperature (创造性)</Label>
                <span className="text-sm text-muted-foreground">{config.temperature}</span>
              </div>
              <Slider
                value={[config.temperature]}
                onValueChange={([value]) => setConfig({ ...config, temperature: value })}
                min={0}
                max={2}
                step={0.1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                越高越有创造性，越低越稳定。推荐0.7-1.0
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Max Tokens (最大长度)</Label>
                <span className="text-sm text-muted-foreground">{config.maxTokens}</span>
              </div>
              <Slider
                value={[config.maxTokens]}
                onValueChange={([value]) => setConfig({ ...config, maxTokens: value })}
                min={100}
                max={4000}
                step={100}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">控制AI回复的最大长度</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <Globe className="w-4 h-4 md:w-5 md:h-5" />
              高级功能开关
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              需要先配置Gemini API Key才能启用
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableWebSearch"
                checked={config.enableWebSearch}
                onChange={(e) => setConfig({ ...config, enableWebSearch: e.target.checked })}
                className="w-4 h-4"
                disabled={!config.geminiApiKey}
              />
              <Label htmlFor="enableWebSearch" className="cursor-pointer">
                <Globe className="w-4 h-4 inline mr-1" />
                启用联网搜索 (Google Search Grounding)
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableRAG"
                checked={config.enableRAG}
                onChange={(e) => setConfig({ ...config, enableRAG: e.target.checked })}
                className="w-4 h-4"
                disabled={!config.geminiApiKey}
              />
              <Label htmlFor="enableRAG" className="cursor-pointer">
                <Database className="w-4 h-4 inline mr-1" />
                启用RAG语义检索 (从聊天历史中检索)
              </Label>
            </div>

            {(!config.geminiApiKey) && (
              <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
                💡 请先在上方配置Gemini API Key
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">💡 提示</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-yellow-700 space-y-2">
            <p>• 所有配置会自动保存到Supabase云端，支持跨设备同步</p>
            <p>• API Key加密存储在云端，仅供您的账户使用</p>
            <p>• 使用Gemini API，一个Key支持所有功能且免费额度充足</p>
            <p>• Gemini支持：文字对话、图片识别、RAG检索、联网搜索</p>
            <p>• 可以选择不同的Gemini模型（2.5-pro推荐）或使用自定义模型名称</p>
            <p>• RAG功能会从聊天历史中检索相关内容，提高回答准确性</p>
            <p>• 联网搜索可以获取最新信息，但可能影响角色人设的一致性</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-blue-800">🔧 认证调试工具</CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowAuthDebugger(!showAuthDebugger)}
              >
                {showAuthDebugger ? '隐藏' : '显示'}
              </Button>
            </div>
            <CardDescription>查看当前认证状态和Token信息（遇到401错误时使用）</CardDescription>
          </CardHeader>
          {showAuthDebugger && (
            <CardContent>
              <AuthDebugger />
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
