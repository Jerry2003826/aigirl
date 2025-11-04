import { useState, useRef, useEffect } from 'react';
import { AIConfig, Personality, UserProfile, GroupChat as GroupChatType, GroupMessage } from '../App';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback } from './ui/avatar';
import { SafeAvatar } from './SafeAvatar';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner@2.0.3';
import { ArrowLeft, Send, Users, Loader2, RefreshCw, Settings as SettingsIcon, UserPlus, X, Trash2 } from 'lucide-react';
import { GroupChatOrchestrator, OrchestratorConfig } from '../utils/group-chat-orchestrator';
import { Message } from '../utils/agent-selector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Slider } from './ui/slider';

interface GroupChatProps {
  groupChat: GroupChatType;
  config: AIConfig;
  allPersonalities: Personality[];
  userProfile: UserProfile;
  onBack?: () => void;
  onUpdateGroup?: (updatedGroup: GroupChatType) => void;
  onDeleteGroup?: (groupId: string) => void;
}

export function GroupChat({ 
  groupChat, 
  config, 
  allPersonalities, 
  userProfile, 
  onBack,
  onUpdateGroup,
  onDeleteGroup
}: GroupChatProps) {
  // 早期返回：如果 groupChat 无效
  if (!groupChat || !groupChat.id) {
    return (
      <div className="flex-1 flex items-center justify-center bg-chat-bg">
        <div className="text-center">
          <Users className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-muted-foreground mb-2">群聊不存在</h3>
          <Button onClick={onBack}>返回</Button>
        </div>
      </div>
    );
  }

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [orchestrator, setOrchestrator] = useState<GroupChatOrchestrator | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMemberDialog, setShowMemberDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([]);
  
  // 可配置的参数
  const [orchestratorConfig, setOrchestratorConfig] = useState<Partial<OrchestratorConfig>>({
    maxRoundsPerTopic: 10,
    cooldownMs: 2000,
    maxFollowUpsPerTopic: 3,
    maxFollowUpsPerRound: 1,
    maxChainDepth: 2,
    maxMessageLength: 150,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 获取群成员personalities
  const memberPersonalities = allPersonalities.filter(p => 
    groupChat?.memberIds && groupChat.memberIds.includes(p.id)
  );

  // 获取可添加的成员（不在群里的）
  const availablePersonalities = allPersonalities.filter(p => 
    !groupChat?.memberIds || !groupChat.memberIds.includes(p.id)
  );

  // 初始化Orchestrator（仅包含群成员）
  useEffect(() => {
    if (memberPersonalities.length > 0) {
      const orc = new GroupChatOrchestrator(orchestratorConfig, memberPersonalities);
      setOrchestrator(orc);
      console.log('✅ 群聊调度器已初始化，成员:', memberPersonalities.map(p => p.name));
    } else {
      setOrchestrator(null);
    }
  }, [groupChat?.memberIds, orchestratorConfig]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [groupChat?.messages]);

  // 添加成员
  const handleAddMembers = () => {
    if (selectedNewMembers.length === 0) {
      toast.error('请至少选择一个成员');
      return;
    }

    const updatedGroup: GroupChatType = {
      ...groupChat,
      memberIds: [...groupChat.memberIds, ...selectedNewMembers],
    };

    onUpdateGroup?.(updatedGroup);
    
    const addedNames = selectedNewMembers
      .map(id => allPersonalities.find(p => p.id === id)?.name)
      .filter(Boolean)
      .join('、');
    
    toast.success(`已添加 ${addedNames} 到群聊`);
    setSelectedNewMembers([]);
    setShowMemberDialog(false);
  };

  // 移除成员
  const handleRemoveMember = (memberId: string) => {
    const memberName = allPersonalities.find(p => p.id === memberId)?.name;
    
    const updatedGroup: GroupChatType = {
      ...groupChat,
      memberIds: groupChat.memberIds.filter(id => id !== memberId),
    };

    onUpdateGroup?.(updatedGroup);
    toast.success(`已将 ${memberName} 移出群聊`);
  };

  // 删除群聊
  const handleDeleteGroup = () => {
    onDeleteGroup?.(groupChat.id);
    onBack?.();
    toast.success('群聊已删除');
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim()) {
      toast.error('请输入消息');
      return;
    }

    if (!config.geminiApiKey) {
      toast.error('请先在"AI配置"中设置Gemini API Key');
      return;
    }

    if (memberPersonalities.length === 0) {
      toast.error('群聊中没有成员，请先添加成员');
      return;
    }

    const userMessage: GroupMessage = {
      id: `msg_${Date.now()}_user`,
      authorId: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    // 更新群聊消息
    const updatedMessages = [...groupChat.messages, userMessage];
    const updatedGroup: GroupChatType = {
      ...groupChat,
      messages: updatedMessages,
      lastMessageTime: Date.now(),
    };
    onUpdateGroup?.(updatedGroup);

    setInput('');
    setIsLoading(true);

    try {
      if (!orchestrator) {
        toast.error('群聊系统未初始化');
        return;
      }

      // 转换为Orchestrator需要的Message格式
      const orchestratorMessage: Message = {
        id: userMessage.id,
        authorId: userMessage.authorId,
        content: userMessage.content,
        timestamp: userMessage.timestamp,
      };

      // 调用Orchestrator处理
      const replies = await orchestrator.handleUserMessage(
        orchestratorMessage,
        memberPersonalities,
        config
      );

      if (replies.length === 0) {
        toast.info('AI们暂时没有回复，请稍后再试');
      } else {
        toast.success(`收到${replies.length}条回复`);
        
        // 转换回GroupMessage格式并更新
        const groupReplies: GroupMessage[] = replies.map(r => ({
          id: r.id,
          authorId: r.authorId,
          content: r.content,
          timestamp: r.timestamp,
        }));

        const finalUpdatedGroup: GroupChatType = {
          ...groupChat,
          messages: [...updatedMessages, ...groupReplies],
          lastMessageTime: Date.now(),
        };
        onUpdateGroup?.(finalUpdatedGroup);
      }
    } catch (error) {
      console.error('❌ 群聊处理失败:', error);
      toast.error('发送失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 重置话题
  const handleResetTopic = () => {
    if (orchestrator) {
      orchestrator.resetTopic();
      toast.success('话题已重置');
    }
  };

  // 清空聊天
  const handleClearChat = () => {
    if (orchestrator) {
      orchestrator.clearMessages();
    }
    const updatedGroup: GroupChatType = {
      ...groupChat,
      messages: [],
    };
    onUpdateGroup?.(updatedGroup);
    toast.success('聊天记录已清空');
  };

  // 渲染消息
  const renderMessage = (msg: GroupMessage) => {
    const isUser = msg.authorId === 'user';
    const personality = isUser ? null : allPersonalities.find(p => p.id === msg.authorId);

    return (
      <div
        key={msg.id}
        className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}
      >
        {/* 头像 */}
        <div className="flex-shrink-0">
          {isUser ? (
            <SafeAvatar
              avatarUrl={userProfile.avatarUrl}
              name={userProfile.nickname || 'User'}
              className="h-10 w-10"
            />
          ) : personality ? (
            <SafeAvatar
              avatarUrl={personality.avatarUrl}
              name={personality.name}
              className="h-10 w-10"
            />
          ) : (
            <Avatar className="h-10 w-10">
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
          )}
        </div>

        {/* 消息内容 */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[70%]`}>
          {/* 名字 */}
          {!isUser && personality && (
            <div className="text-xs text-muted-foreground mb-1">
              {personality.name}
            </div>
          )}

          {/* 消息气泡 */}
          <div
            className={`rounded-2xl px-4 py-2 ${
              isUser
                ? 'bg-[#95EC69] text-black'
                : 'bg-white dark:bg-gray-800 text-black dark:text-white border border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="whitespace-pre-wrap break-words">
              {msg.content}
            </div>
          </div>

          {/* 时间戳 */}
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#07C160]" />
            <div>
              <h2 className="font-semibold">{groupChat.name}</h2>
              <p className="text-xs text-muted-foreground">
                {groupChat.memberIds.length} 位成员
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMemberDialog(true)}
            title="管理成员"
          >
            <UserPlus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetTopic}
            title="重置话题"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title="群聊设置"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 成员列表 */}
      <div className="px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-sm text-muted-foreground flex-shrink-0">成员:</span>
          {memberPersonalities.length === 0 ? (
            <span className="text-sm text-amber-600 dark:text-amber-400">
              暂无成员，点击右上角添加
            </span>
          ) : (
            memberPersonalities.map(p => (
              <Badge key={p.id} variant="secondary" className="flex-shrink-0">
                {p.name}
              </Badge>
            ))
          )}
        </div>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div ref={scrollRef} className="p-4 space-y-2">
            {groupChat.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <Users className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                  {groupChat.name}
                </h3>
                {memberPersonalities.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-500 max-w-md">
                    群聊还没有成员，点击右上角添加AI女友加入群聊
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-500 max-w-md">
                    开始和{memberPersonalities.length}位AI女友聊天吧！<br />
                    她们会根据话题智能参与对话
                  </p>
                )}
              </div>
            ) : (
              groupChat.messages.map(renderMessage)
            )}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI们正在思考...</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 输入区域 */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={memberPersonalities.length === 0 ? '请先添加成员...' : '输入消息... (Shift+Enter换行)'}
            className="min-h-[44px] max-h-[120px] resize-none"
            disabled={isLoading || memberPersonalities.length === 0}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || memberPersonalities.length === 0}
            size="icon"
            className="h-11 w-11 bg-[#07C160] hover:bg-[#06AD56] flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* 成员管理对话框 */}
      <Dialog open={showMemberDialog} onOpenChange={setShowMemberDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>管理成员</DialogTitle>
            <DialogDescription>
              添加或移除群聊成员
            </DialogDescription>
          </DialogHeader>

          {/* 当前成员 */}
          <div className="space-y-2">
            <Label>当前成员 ({memberPersonalities.length}人)</Label>
            {memberPersonalities.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无成员</div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                {memberPersonalities.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                    <div className="flex items-center gap-2">
                      <SafeAvatar
                        avatarUrl={p.avatarUrl}
                        name={p.name}
                        className="h-8 w-8"
                      />
                      <span className="text-sm">{p.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRemoveMember(p.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 添加新成员 */}
          {availablePersonalities.length > 0 && (
            <div className="space-y-2">
              <Label>添加成员</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                {availablePersonalities.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                    <Checkbox
                      checked={selectedNewMembers.includes(p.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedNewMembers([...selectedNewMembers, p.id]);
                        } else {
                          setSelectedNewMembers(selectedNewMembers.filter(id => id !== p.id));
                        }
                      }}
                    />
                    <SafeAvatar
                      avatarUrl={p.avatarUrl}
                      name={p.name}
                      className="h-8 w-8"
                    />
                    <span className="text-sm">{p.name}</span>
                  </div>
                ))}
              </div>
              {selectedNewMembers.length > 0 && (
                <Button onClick={handleAddMembers} className="w-full">
                  添加 {selectedNewMembers.length} 位成员
                </Button>
              )}
            </div>
          )}

          {availablePersonalities.length === 0 && memberPersonalities.length > 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              所有AI都已在群聊中
            </div>
          )}

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除群聊
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 群聊设置对话框 */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>群聊设置</DialogTitle>
            <DialogDescription>
              调整群聊行为参数
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>话题最大轮数: {orchestratorConfig.maxRoundsPerTopic}</Label>
              <Slider
                value={[orchestratorConfig.maxRoundsPerTopic || 10]}
                onValueChange={([v]) =>
                  setOrchestratorConfig(prev => ({ ...prev, maxRoundsPerTopic: v }))
                }
                min={5}
                max={20}
                step={1}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                每个话题的最大对话轮数
              </p>
            </div>

            <div>
              <Label>冷却时间: {orchestratorConfig.cooldownMs}ms</Label>
              <Slider
                value={[orchestratorConfig.cooldownMs || 2000]}
                onValueChange={([v]) =>
                  setOrchestratorConfig(prev => ({ ...prev, cooldownMs: v }))
                }
                min={1000}
                max={5000}
                step={500}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                AI发言后的冷却时间
              </p>
            </div>

            <div>
              <Label>话题追问次数上限: {orchestratorConfig.maxFollowUpsPerTopic}</Label>
              <Slider
                value={[orchestratorConfig.maxFollowUpsPerTopic || 3]}
                onValueChange={([v]) =>
                  setOrchestratorConfig(prev => ({ ...prev, maxFollowUpsPerTopic: v }))
                }
                min={1}
                max={5}
                step={1}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                每个话题允许的追问次数
              </p>
            </div>

            <div>
              <Label>消息最大长度: {orchestratorConfig.maxMessageLength}</Label>
              <Slider
                value={[orchestratorConfig.maxMessageLength || 150]}
                onValueChange={([v]) =>
                  setOrchestratorConfig(prev => ({ ...prev, maxMessageLength: v }))
                }
                min={50}
                max={300}
                step={10}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                AI回复的最大字符数
              </p>
            </div>

            <Button
              onClick={handleClearChat}
              variant="outline"
              className="w-full"
            >
              清空聊天记录
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除群聊</AlertDialogTitle>
            <AlertDialogDescription>
              删除"{groupChat.name}"后，所有聊天记录将永久丢失，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteGroup} className="bg-red-600 hover:bg-red-700">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
