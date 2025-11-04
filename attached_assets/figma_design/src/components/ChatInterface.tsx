import { useState, useRef, useEffect, useCallback } from 'react';
import { AIConfig, Personality, Message, UserProfile, Memory } from '../App';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Card } from './ui/card';
import { toast } from 'sonner@2.0.3';
import { Send, Trash2, Loader2, Heart, Image as ImageIcon, X, ArrowLeft, MoreVertical, Globe, Database, Maximize2, Minimize2, User, Search, Brain } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { generateWithRAGAndSearch, generateWithVision, generateText, extractMemoriesFromConversation } from '../utils/gemini-service';
import { getActualModel } from '../utils/get-actual-model';
import { cleanShortTermMemories } from '../utils/memory-cleaner';
import { SafeAvatar } from './SafeAvatar';
import { MemoryViewer } from './MemoryViewer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ChatInterfaceProps {
  config: AIConfig;
  personality: Personality;
  messages: Message[];
  setMessages: (messagesOrUpdater: Message[] | ((prev: Message[]) => Message[]), clearUnread?: boolean) => void;
  onBack?: () => void;
  personalities: Personality[];
  setPersonalities: (personalities: Personality[]) => void;
  immersiveMode?: boolean;
  onToggleImmersiveMode?: () => void;
  userProfile: UserProfile;
  isVisible?: boolean; // 用于检测移动端可见性变化
}

export function ChatInterface({ config, personality, messages, setMessages, onBack, personalities, setPersonalities, immersiveMode, onToggleImmersiveMode, userProfile, isVisible }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>(''); // 正在流式显示的消息
  const [isStreaming, setIsStreaming] = useState(false); // 是否正在流式显示
  const [showProfileDialog, setShowProfileDialog] = useState(false); // 个人资料弹窗
  const [showSearchDialog, setShowSearchDialog] = useState(false); // 搜索对话框
  const [showMemoryDialog, setShowMemoryDialog] = useState(false); // 记忆查看器对话框
  const [searchKeyword, setSearchKeyword] = useState(''); // 搜索关键词
  const [searchFilter, setSearchFilter] = useState<'all' | 'text' | 'image'>('all'); // 搜索筛选
  const [searchResults, setSearchResults] = useState<Message[]>([]); // 搜索结果
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map()); // 消息元素引用

  // 首次加载时滚动到底部（特别是移动端切换聊天时）
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 0);
    }
  }, []); // 空依赖数组，只在组件首次挂载时执行

  // 当切换聊天对象时，滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [personality.id]); // 当聊天对象改变时触发

  // 当移动端显示聊天界面时，滚动到底部
  useEffect(() => {
    if (isVisible && scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [isVisible]); // 当可见性变化时触发

  useEffect(() => {
    // 消息更新时滚动到底部
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages]);

  const buildSystemPrompt = () => {
    let prompt = `# 任务 (Task)
${personality.task || '作为AI助手与用户交流'}

# 角色 (Role)
${personality.role || 'AI助手'}

# 基本信息
- 名字：${personality.name || '未命名'}
- 年龄：${personality.age || '未知'}岁

# 外表 (Appearance)
${personality.appearance || '未设定'}

# 经历 (Experience)
${personality.experience || '未设定'}

# 性格 (Personality)
${personality.traits || '友善、乐于助人'}

# 喜好 (Likes)
${personality.likes || '未设定'}`;

    if (personality.outputExamples) {
      prompt += `\n\n# 输出示例 (Output Examples)\n${personality.outputExamples}`;
    }

    prompt += `\n\n# 备注 (Remarks)\n${personality.remarks || '无'}

# 核心规则
1. 你必须完全以${personality.name || '未命名'}的身份和用户对话
2. 记住之前的所有对话内容，保持对话的连贯性
3. 严格遵守上述所有设定和规则
4. 表现得像一个真实的人，不要有任何AI的痕迹`;

    return prompt;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    // 检查文件大小（限制为 5MB）
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error(`图片太大！请选择小于 ${(maxSize / 1024 / 1024).toFixed(0)}MB 的图片`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      
      // 再次检查 base64 编码后的大小
      if (result && result.length > maxSize * 1.5) {
        toast.error('图片编码后过大，请选择更小的图片或降低图片质量');
        return;
      }
      
      console.log(`图片已选择，大小: ${(result.length / 1024).toFixed(2)} KB`);
      setSelectedImage(result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 延迟添加分段消息的辅助函数
  const addSegmentedMessages = async (baseId: string, content: string, newMessages: Message[]) => {
    const segments = content.split('\\\\').filter(s => s.trim());
    
    if (segments.length > 1) {
      // 多段消息，逐段添加
      setIsStreaming(true);
      
      for (let i = 0; i < segments.length; i++) {
        // 第一段立即显示，后续段延迟2-3秒
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        }
        
        // 创建独立的分段消息（不含\\）
        const segmentMessage: Message = {
          id: `${baseId}-seg-${i}`,
          role: 'assistant',
          content: segments[i].trim(),
          timestamp: Date.now(),
        };
        
        setMessages(prev => [...prev, segmentMessage]);
      }
      
      setIsStreaming(false);
    } else {
      // 单段消息直接添加
      const singleMessage: Message = {
        id: baseId,
        role: 'assistant',
        content: content,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, singleMessage]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() && !selectedImage) {
      toast.error('请输入消息或选择图片');
      return;
    }

    if (!config.geminiApiKey) {
      toast.error('需要配置API Key', {
        description: immersiveMode 
          ? '请稍后再试' 
          : '点击右上角"设置"按钮配置Gemini API Key',
        duration: 5000,
        action: immersiveMode ? undefined : {
          label: '查看教程',
          onClick: () => {
            window.open('https://aistudio.google.com/apikey', '_blank');
          }
        }
      });
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim() || '[图片]',
      imageUrl: selectedImage || undefined,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages, true); // 用户发送消息时清除未读计数
    setInput('');
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsLoading(true);

    try {
      let assistantMessage: Message;
      
      // 获取实际要使用的模型（支持自定义模型）
      const actualModel = getActualModel(config);

      // 优先使用Gemini API（如果配置了）
      if (config.geminiApiKey) {
        
        // 情况1: 有图片 - 使用Gemini Vision
        if (selectedImage) {
          const result = await generateWithVision(
            `${buildSystemPrompt()}\n\n用户消息: ${userMessage.content}`,
            selectedImage,
            config.geminiApiKey,
            actualModel
          );

          assistantMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.text,
            timestamp: Date.now(),
          };
        }
        // 情况2: 启用RAG或联网搜索
        else if (config.enableRAG || config.enableWebSearch) {
          const result = await generateWithRAGAndSearch(
            userMessage.content,
            messages,
            buildSystemPrompt(),
            config.geminiApiKey,
            config.enableRAG,
            config.enableWebSearch,
            personality.memories || [],
            actualModel
          );

          assistantMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.text,
            timestamp: Date.now(),
          };

          // 显示功能使用提示（沉浸模式下不显示）
          if (!immersiveMode) {
            if (config.enableWebSearch && result.groundingSources && result.groundingSources.length > 0) {
              console.log('🌐 联网搜索来源:', result.groundingSources);
              toast.success(`🌐 已使用联网搜索 (${result.groundingSources.length}个来源)`);
            } else if (config.enableRAG && result.ragMatches && result.ragMatches.length > 0) {
              console.log('📚 RAG检索结果:', result.ragMatches);
              const memoryCount = result.ragMatches.filter(m => m.isMemory).length;
              const historyCount = result.ragMatches.length - memoryCount;
              if (memoryCount > 0) {
                toast.success(`📚 已检索${historyCount}条历史 + ${memoryCount}条记忆`);
              } else {
                toast.success(`📚 已检索${result.ragMatches.length}条历史记录`);
              }
            }
          }
        }
        // 情况3: 普通文本对话 - 使用Gemini标准生成
        else {
          const apiMessages = [
            { role: 'system', content: buildSystemPrompt() },
            ...newMessages.map(msg => ({
              role: msg.role,
              content: msg.content
            }))
          ];

          const result = await generateText(
            apiMessages,
            config.geminiApiKey,
            config.temperature,
            config.maxTokens,
            actualModel
          );

          assistantMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.text,
            timestamp: Date.now(),
          };
        }
      } else {
        throw new Error('请配置Gemini API Key');
      }

      // 检查是否需要分段显示
      const segments = assistantMessage.content.split('\\').filter(s => s.trim());
      
      if (segments.length > 1) {
        // 有多段，需要逐段显示
        setIsStreaming(true);
        
        // 先显示用户消息
        setMessages(newMessages);
        
        // 逐段显示AI回复
        for (let i = 0; i < segments.length; i++) {
          // 等待2-3秒（随机）
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
          
          // 添加当前段
          const currentSegments = segments.slice(0, i + 1);
          const currentContent = currentSegments.join('\\');
          
          const segmentMessage: Message = {
            id: `${assistantMessage.id}-seg-${i}`,
            role: 'assistant',
            content: segments[i].trim(),
            timestamp: Date.now(),
          };
          
          setMessages(prev => [...prev, segmentMessage]);
        }
        
        setIsStreaming(false);
      } else {
        // 单段消息，直接显示
        setMessages([...newMessages, assistantMessage]);
      }

      const finalMessages = [...newMessages, assistantMessage];

      // 自动提取记忆（每5条消息触发一次）
      if (config.geminiApiKey && finalMessages.length % 5 === 0 && finalMessages.length >= 5) {
        try {
          const memoryResult = await extractMemoriesFromConversation(
            finalMessages,
            config.geminiApiKey,
            actualModel
          );

          if (memoryResult.memories.length > 0) {
            const currentMemories = personality.memories || [];
            const newMemories = memoryResult.memories.map(m => ({
              id: `memory-${Date.now()}-${Math.random()}`,
              content: m.content,
              memoryType: m.memoryType,
              importance: m.importance,
              timestamp: Date.now(),
              tags: m.tags,
              autoGenerated: true,
            }));

            // 清理过期的短期记忆
            const { cleaned: cleanedMemories, removedCount } = cleanShortTermMemories(currentMemories);
            const finalMemories = [...cleanedMemories, ...newMemories];

            setPersonalities(
              personalities.map(p =>
                p.id === personality.id
                  ? { ...p, memories: finalMemories }
                  : p
              )
            );

            // 沉浸模式下不显示记忆提取提示
            if (!immersiveMode) {
              const longTermCount = newMemories.filter(m => m.memoryType === 'long-term').length;
              const shortTermCount = newMemories.length - longTermCount;
              
              if (longTermCount > 0) {
                toast.success(`🧠 AI自动保存了${longTermCount}条长时记忆${shortTermCount > 0 ? `和${shortTermCount}条短时记忆` : ''}${removedCount > 0 ? `（清理了${removedCount}条过期短时记忆）` : ''}`);
              } else if (shortTermCount > 0) {
                toast.success(`🧠 AI自动保存了${shortTermCount}条短时记忆${removedCount > 0 ? `（清理了${removedCount}条过期短时记忆）` : ''}`);
              }
            }
          }
        } catch (error) {
          console.error('Failed to extract memories:', error);
          // 静默失败，不影响正常聊天
        }
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      
      const errorMessage = (error as Error).message || '';
      let description = '请稍后重试';
      let actionLabel = undefined;
      let actionOnClick = undefined;
      
      if (errorMessage.includes('API key') || errorMessage.includes('API 错误')) {
        description = immersiveMode 
          ? '请检查配置' 
          : '请在设置中检查API Key是否正确';
        if (!immersiveMode) {
          actionLabel = '获取API Key';
          actionOnClick = () => {
            window.open('https://aistudio.google.com/apikey', '_blank');
          };
        }
      } else if (errorMessage.includes('quota') || errorMessage.includes('配额')) {
        description = 'API配额已用完，请检查账户余额';
      } else if (errorMessage.includes('network') || errorMessage.includes('网络')) {
        description = '网络连接失败，请检查网络';
      } else if (!immersiveMode) {
        description = '请检查API配置是否正确';
      }
      
      toast.error('发送失败', {
        description,
        duration: 5000,
        action: actionLabel && actionOnClick ? {
          label: actionLabel,
          onClick: actionOnClick
        } : undefined
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    toast.success('聊天记录已清空');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        sendMessage();
      }
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  // 更新记忆
  const handleUpdateMemories = (memories: Memory[]) => {
    const updatedPersonalities = personalities.map(p =>
      p.id === personality.id ? { ...p, memories } : p
    );
    setPersonalities(updatedPersonalities);
    console.log('💾 更新记忆:', { personalityId: personality.id, count: memories.length });
  };

  // 搜索消息
  const handleSearch = useCallback(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    
    let results = messages;
    
    // 应用文本筛选
    if (keyword) {
      results = results.filter(msg => 
        msg.content.toLowerCase().includes(keyword)
      );
    }
    
    // 应用图片筛选
    if (searchFilter === 'image') {
      results = results.filter(msg => msg.imageUrl);
    } else if (searchFilter === 'text') {
      results = results.filter(msg => !msg.imageUrl);
    }
    
    setSearchResults(results);
    console.log('🔍 搜索结果:', { keyword, filter: searchFilter, count: results.length });
  }, [searchKeyword, searchFilter, messages]);

  // 定位到指定消息
  const scrollToMessage = (messageId: string) => {
    const element = messageRefs.current.get(messageId);
    if (element && scrollRef.current) {
      // 关闭搜索对话框
      setShowSearchDialog(false);
      
      // 计算目标位置（让消息居中显示）
      const container = scrollRef.current;
      const elementTop = element.offsetTop;
      const containerHeight = container.clientHeight;
      const elementHeight = element.clientHeight;
      const scrollPosition = elementTop - (containerHeight / 2) + (elementHeight / 2);
      
      // 平滑滚动到目标位置
      container.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });
      
      // 高亮动画
      element.style.transition = 'background-color 0.3s ease';
      element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; // 蓝色高亮
      
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 2000);
      
      console.log('📍 定位到消息:', messageId.substring(0, 8));
    }
  };

  // 高亮搜索关键词
  const highlightText = (text: string, keyword: string) => {
    if (!keyword) return text;
    
    const parts = text.split(new RegExp(`(${keyword})`, 'gi'));
    return parts.map((part, index) => {
      if (part.toLowerCase() === keyword.toLowerCase()) {
        return <mark key={index} className="bg-yellow-300 dark:bg-yellow-600 text-inherit px-0.5 rounded">{part}</mark>;
      }
      return part;
    });
  };

  // 监听搜索关键词变化，自动搜索
  useEffect(() => {
    if (showSearchDialog) {
      handleSearch();
    }
  }, [showSearchDialog, handleSearch]);

  return (
    <div className="h-full flex flex-col bg-chat-bg overflow-hidden">
      {/* 头部 - 类似微信 */}
      <div className="border-b bg-card px-3 py-3 md:px-4 md:py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            {/* 移动端显示返回按钮 - 沉浸模式下点击先退出沉浸模式 */}
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden flex-shrink-0"
                onClick={onBack}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <div onClick={() => setShowProfileDialog(true)}>
              <SafeAvatar
                avatarUrl={personality.avatarUrl}
                name={personality.name}
                className="w-10 h-10 border-2 border-gray-200 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
              />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowProfileDialog(true)}>
              <h3 className="truncate">{personality.name || '未命名'}</h3>
              <p className="text-xs text-green-600 dark:text-green-400">
                {isLoading ? '正在输入中...' : '在线'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onToggleImmersiveMode && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onToggleImmersiveMode}
                className="flex-shrink-0"
                title={immersiveMode ? "退出沉浸模式" : "进入沉浸模式"}
              >
                {immersiveMode ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </Button>
            )}
            {!immersiveMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowProfileDialog(true)}>
                    <User className="w-4 h-4 mr-2" />
                    查看资料
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowMemoryDialog(true)}>
                    <Brain className="w-4 h-4 mr-2" />
                    查看记忆
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSearchDialog(true)}>
                    <Search className="w-4 h-4 mr-2" />
                    查找聊天记录
                  </DropdownMenuItem>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        清空聊天记录
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认清空聊天记录？</AlertDialogTitle>
                        <AlertDialogDescription>
                          此操作将删除所有聊天记录，且无法恢复。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={clearMessages} className="bg-red-500 hover:bg-red-600">
                          确认清空
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* 消息列表 - 移动端优化间距 */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }} ref={scrollRef}>
        <div className="py-4 md:py-6 space-y-3 md:space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Avatar className="w-16 h-16 mx-auto mb-4 border-4 border-gray-200">
                <AvatarFallback className="bg-gradient-to-br from-green-400 to-teal-500 text-white text-2xl">
                  {personality.name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-muted-foreground mb-2">{personality.name || '未命名'}</h3>
              <p className="text-sm text-muted-foreground/70">开始你们的甜蜜对话吧 💕</p>
            </div>
          ) : (
            messages.map((message) => {
              // 如果是AI回复，按\分割成多个气泡
              if (message.role === 'assistant' && message.content.includes('\\')) {
                const segments = message.content.split('\\').filter(s => s.trim());
                return segments.map((segment, segIndex) => (
                  <div
                    key={`${message.id}-seg-${segIndex}`}
                    ref={(el) => {
                      // 只在第一段设置 ref，用于定位
                      if (segIndex === 0) {
                        if (el) messageRefs.current.set(message.id, el);
                        else messageRefs.current.delete(message.id);
                      }
                    }}
                    className="flex gap-2"
                  >
                    <Avatar className="w-9 h-9 flex-shrink-0">
                      {personality.avatarUrl ? (
                        <img src={personality.avatarUrl} alt={personality.name} className="w-full h-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-green-400 to-teal-500 text-white">
                          {personality.name?.[0] || '?'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex flex-col max-w-[70%] items-start">
                      <div className="relative px-3 py-2 rounded-lg bg-message-assistant text-message-assistant-foreground rounded-tl-none shadow-sm border border-border">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{segment.trim()}</p>
                      </div>
                      {segIndex === segments.length - 1 && (
                        <p className="text-xs text-muted-foreground mt-1 px-1">
                          {formatTime(message.timestamp)}
                        </p>
                      )}
                    </div>
                  </div>
                ));
              }
              
              // 用户消息或不包含\的AI消息，正常显示
              return (
                <div
                  key={message.id}
                  ref={(el) => {
                    if (el) messageRefs.current.set(message.id, el);
                    else messageRefs.current.delete(message.id);
                  }}
                  className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {message.role === 'assistant' ? (
                    <SafeAvatar
                      avatarUrl={personality.avatarUrl}
                      name={personality.name}
                      className="w-9 h-9 flex-shrink-0"
                    />
                  ) : (
                    <SafeAvatar
                      avatarUrl={userProfile.avatarUrl}
                      name={userProfile.nickname}
                      className="w-9 h-9 flex-shrink-0"
                      fallbackClassName="bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                    />
                  )}
                  <div className={`flex flex-col max-w-[70%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`relative px-3 py-2 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-message-user text-message-user-foreground rounded-tr-none'
                          : 'bg-message-assistant text-message-assistant-foreground rounded-tl-none shadow-sm border border-border'
                      }`}
                    >
                      {message.imageUrl && (
                        <div className="mb-2 rounded-md overflow-hidden">
                          <ImageWithFallback
                            src={message.imageUrl}
                            alt="图片"
                            className="max-w-full h-auto max-h-48 object-contain"
                          />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                    </div>
                    <p className={`text-xs text-muted-foreground mt-1 px-1`}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 输入框 - 类似微信 */}
      <div className="border-t border-border bg-surface-dim px-3 py-2 flex-shrink-0">
        {/* 功能状态指示器（沉浸模式下不显示） */}
        {!immersiveMode && (config.enableRAG || config.enableWebSearch) && config.geminiApiKey && (
          <div className="mb-2 flex gap-2 flex-wrap">
            {config.enableRAG && (
              <div className="flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded text-xs border border-blue-500/20">
                <Database className="w-3 h-3" />
                <span>RAG语义检索</span>
              </div>
            )}
            {config.enableWebSearch && (
              <div className="flex items-center gap-1 bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded text-xs border border-green-500/20">
                <Globe className="w-3 h-3" />
                <span>联网搜索</span>
              </div>
            )}
          </div>
        )}
        
        {selectedImage && (
          <div className="mb-2 relative inline-block">
            <ImageWithFallback
              src={selectedImage}
              alt="待发送的图片"
              className="max-h-24 rounded-md border"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              onClick={removeImage}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="h-9 w-9 flex-shrink-0"
          >
            <ImageIcon className="w-5 h-5" />
          </Button>
          <div className="flex-1 bg-card rounded-md border border-border">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="消息"
              className="resize-none min-h-[36px] max-h-[100px] text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-2 bg-transparent text-foreground placeholder:text-muted-foreground"
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && !selectedImage)}
            className="h-9 w-9 p-0 flex-shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        {!immersiveMode && !config.geminiApiKey && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            ⚠️ 请先设置Gemini API Key
          </p>
        )}
      </div>

      {/* 个人资料弹窗 */}
      <Dialog open={showProfileDialog} onOpenChange={(open) => {
        setShowProfileDialog(open);
        // 退出沉浸模式
        if (!open && immersiveMode && onToggleImmersiveMode) {
          onToggleImmersiveMode();
        }
      }}>
        <DialogContent className="max-w-md" aria-describedby="profile-description">
          <DialogHeader>
            <DialogTitle>个人资料</DialogTitle>
            <DialogDescription id="profile-description">
              查看{personality.name || '未命名'}的详细资料
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col items-center">
              <SafeAvatar
                avatarUrl={personality.avatarUrl}
                name={personality.name}
                className="w-24 h-24 border-4 border-border"
                fallbackClassName="bg-gradient-to-br from-green-400 to-teal-500 text-white text-3xl"
              />
              <h3 className="mt-4">{personality.name || '未命名'}</h3>
              <p className="text-sm text-muted-foreground">{personality.age || '未知'}</p>
            </div>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">性格</p>
                <p className="text-sm">{personality.traits}</p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">喜好</p>
                <p className="text-sm">{personality.likes}</p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">外表</p>
                <p className="text-sm whitespace-pre-wrap">{personality.appearance}</p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">经历</p>
                <p className="text-sm whitespace-pre-wrap">{personality.experience}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 搜索对话框 */}
      <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" aria-describedby="search-description">
          <DialogHeader>
            <DialogTitle>查找聊天记录</DialogTitle>
            <DialogDescription id="search-description">
              搜索与{personality.name || '未命名'}的聊天内容
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            {/* 搜索框 */}
            <div className="flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索聊天内容..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                  autoFocus
                />
              </div>
            </div>

            {/* 筛选标签 */}
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant={searchFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchFilter('all')}
              >
                全部
              </Button>
              <Button
                variant={searchFilter === 'text' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchFilter('text')}
              >
                文本
              </Button>
              <Button
                variant={searchFilter === 'image' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchFilter('image')}
              >
                🖼️ 图片
              </Button>
            </div>

            {/* 搜索结果 */}
            <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
              {searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                  <Search className="w-12 h-12 mb-4 opacity-50" />
                  <p>
                    {searchKeyword || searchFilter !== 'all' 
                      ? '没有找到匹配的消息' 
                      : '输入关键词开始搜索'}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {searchResults.map((message) => (
                    <div
                      key={message.id}
                      onClick={() => scrollToMessage(message.id)}
                      className="p-4 hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* 头像 */}
                        {message.role === 'assistant' ? (
                          <SafeAvatar
                            avatarUrl={personality.avatarUrl}
                            name={personality.name}
                            className="w-10 h-10 flex-shrink-0"
                          />
                        ) : (
                          <SafeAvatar
                            avatarUrl={userProfile.avatarUrl}
                            name={userProfile.nickname}
                            className="w-10 h-10 flex-shrink-0"
                            fallbackClassName="bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                          />
                        )}
                        
                        {/* 内容 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {message.role === 'assistant' ? personality.name : userProfile.nickname}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatTime(message.timestamp)}
                            </span>
                          </div>
                          
                          {message.imageUrl && (
                            <div className="mb-2">
                              <ImageWithFallback
                                src={message.imageUrl}
                                alt="图片"
                                className="max-w-[120px] max-h-[120px] rounded-md object-cover border"
                              />
                            </div>
                          )}
                          
                          <p className="text-sm text-foreground/80 line-clamp-2">
                            {highlightText(message.content, searchKeyword.trim())}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 结果统计 */}
            {searchResults.length > 0 && (
              <div className="text-sm text-muted-foreground text-center flex-shrink-0">
                找到 {searchResults.length} 条消息
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 记忆查看器对话框 */}
      <Dialog open={showMemoryDialog} onOpenChange={setShowMemoryDialog}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 flex flex-col overflow-hidden" aria-describedby="memory-viewer-description">
          <DialogHeader className="sr-only">
            <DialogTitle>AI记忆管理</DialogTitle>
            <DialogDescription id="memory-viewer-description">
              查看和管理 {personality.name} 的所有记忆，包括聊天记忆、核心记忆和任务记忆
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <MemoryViewer
              personality={personality}
              messages={messages}
              config={config}
              onUpdateMemories={handleUpdateMemories}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
