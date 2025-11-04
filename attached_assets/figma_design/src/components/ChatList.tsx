import { Personality, Chat, UserProfile } from '../App';
import { Avatar, AvatarFallback } from './ui/avatar';
import { SafeAvatar } from './SafeAvatar';
import { ContactsList } from './ContactsList';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Settings, Search, Plus, FileText, Brain, User, Moon, Sun, MessageCircle, Users, Image as ImageIcon, UsersRound, LogOut, AlertTriangle, RefreshCw, Download, Check, Heart, Trash2, X, Send } from 'lucide-react';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Label } from './ui/label';
import { toast } from 'sonner@2.0.3';
import { useState, useEffect } from 'react';
import { Moment } from '../utils/moments-manager';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

import { GroupChat as GroupChatType } from '../App';

interface ChatListProps {
  personalities: Personality[];
  chats: Chat[];
  setChats?: (chats: Chat[]) => void;
  groupChats: GroupChatType[];
  setGroupChats?: (groupChats: GroupChatType[]) => void;
  currentPersonalityId: string;
  onSelectChat: (personalityId: string) => void;
  onSelectGroupChat?: (groupId: string) => void;
  onOpenSettings: () => void;
  onOpenPromptManager: () => void;
  onOpenMemoryManager: () => void;
  onOpenUserProfile: () => void;
  onOpenDataRecovery?: () => void;
  onOpenDataImport?: () => void;
  onOpenGroupChat?: () => void;
  onOpenMoments?: () => void;
  onSignOut?: () => void;
  onManualSync?: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  userProfile: UserProfile;
  immersiveMode?: boolean;
  userEmail?: string;
  moments?: Moment[];
  onSelectMoment?: (momentId: string) => void;
  onCreateMoment?: (content: string, images: string[]) => void;
  onDeleteMoment?: (momentId: string) => void;
  onToggleLike?: (momentId: string) => void;
  onAddComment?: (momentId: string, content: string) => void;
  onReplyToComment?: (momentId: string, commentId: string, content: string) => void;
}

export function ChatList({
  personalities,
  chats,
  setChats,
  groupChats,
  setGroupChats,
  currentPersonalityId,
  onSelectChat,
  onSelectGroupChat,
  onOpenSettings,
  onOpenPromptManager,
  onOpenMemoryManager,
  onOpenUserProfile,
  onOpenDataRecovery,
  onOpenDataImport,
  onOpenGroupChat,
  onOpenMoments,
  onSignOut,
  onManualSync,
  darkMode,
  onToggleDarkMode,
  userProfile,
  immersiveMode = false,
  userEmail,
  moments = [],
  onSelectMoment,
  onCreateMoment,
  onDeleteMoment,
  onToggleLike,
  onAddComment,
  onReplyToComment,
}: ChatListProps) {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'moments' | 'groups'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // 发布动态相关状态
  const [showCreateMomentDialog, setShowCreateMomentDialog] = useState(false);
  const [momentContent, setMomentContent] = useState('');
  const [momentImages, setMomentImages] = useState<string[]>([]);
  
  // 评论相关状态
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // 创建新群聊
  const handleCreateGroup = () => {
    if (!groupName.trim()) {
      toast.error('请输入群聊名称');
      return;
    }

    const newGroup: GroupChatType = {
      id: `group_${Date.now()}`,
      name: groupName.trim(),
      memberIds: [], // 创建空群聊
      messages: [],
      createdAt: Date.now(),
      lastMessageTime: Date.now(),
      unreadCount: 0,
    };

    if (setGroupChats) {
      setGroupChats([...groupChats, newGroup]);
      toast.success(`群聊"${groupName}"已创建`);
      setGroupName('');
      setShowCreateGroupDialog(false);
    }
  };

  // 发布新动态
  const handleCreateMoment = () => {
    if (!momentContent.trim() && momentImages.length === 0) {
      toast.error('请输入内容或添加图片');
      return;
    }

    if (onCreateMoment) {
      onCreateMoment(momentContent.trim(), momentImages);
      toast.success('动态已发布');
      setMomentContent('');
      setMomentImages([]);
      setShowCreateMomentDialog(false);
    }
  };

  // 添加图片（从URL）
  const handleAddImage = () => {
    const url = prompt('请输入图片URL:');
    if (url && url.trim()) {
      setMomentImages([...momentImages, url.trim()]);
    }
  };

  // 移除图片
  const handleRemoveImage = (index: number) => {
    setMomentImages(momentImages.filter((_, i) => i !== index));
  };

  // 获取群聊的最后一条消息
  const getGroupLastMessage = (group: GroupChatType) => {
    if (!group?.messages || group.messages.length === 0) return '暂无消息';
    const lastMsg = group.messages[group.messages.length - 1];
    if (!lastMsg) return '暂无消息';
    const authorName = lastMsg.authorId === 'user' 
      ? userProfile.nickname 
      : personalities.find(p => p.id === lastMsg.authorId)?.name || 'AI';
    const content = lastMsg.content || '';
    return `${authorName}: ${content.substring(0, 20)}${content.length > 20 ? '...' : ''}`;
  };

  // 按拼音首字母排序群聊
  const sortedGroupChats = (groupChats || [])
    .filter(g => g && g.id) // 过滤掉无效的群聊对象
    .sort((a, b) => {
      const nameA = a?.name || '';
      const nameB = b?.name || '';
      return nameA.localeCompare(nameB, 'zh-CN');
    });

  const getLastMessage = (chat: Chat) => {
    if (chat.messages.length === 0) return '暂无消息';
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg.imageUrl && !lastMsg.content) return '[图片]';
    
    // 如果包含\，只显示第一段
    let content = lastMsg.content;
    if (content.includes('\\')) {
      const segments = content.split('\\').filter(s => s.trim());
      content = segments[segments.length - 1] || content;
    }
    
    return content.length > 30 
      ? content.substring(0, 30) + '...' 
      : content;
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const date = new Date(timestamp);
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}天前`;
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  // 确保每个personality都有对应的chat显示项
  // 即使chats数组中没有，也创建一个临时的chat对象用于显示
  const allChatsWithPersonalities = personalities
    .filter(personality => personality && personality.id && personality.name)
    .map(personality => {
      const existingChat = chats.find(c => c.personalityId === personality.id);
      return existingChat || {
        personalityId: personality.id,
        messages: [],
        lastMessageTime: Date.now(),
        unreadCount: 0
      };
    });
  
  // 按最后消息时间排序并过滤搜索
  const sortedChats = allChatsWithPersonalities
    .sort((a, b) => b.lastMessageTime - a.lastMessageTime)
    .filter(chat => {
      if (!searchQuery.trim()) return true;
      const personality = personalities.find(p => p.id === chat.personalityId);
      if (!personality || !personality.name) return false;
      return personality.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

  // 自动清理孤立的chat记录
  useEffect(() => {
    const personalityIds = personalities.map(p => p.id);
    const chatIds = chats.map(c => c.personalityId);
    const missingChats = personalityIds.filter(id => !chatIds.includes(id));
    const orphanChats = chatIds.filter(id => !personalityIds.includes(id));
    
    console.log('📊 ChatList 数据状态:', {
      personalitiesCount: personalities.length,
      chatsCount: chats.length,
      sortedChatsCount: sortedChats.length,
      searchQuery,
      personalities: personalities.map(p => ({ id: p.id, name: p.name })),
      chats: chats.map(c => ({ personalityId: c.personalityId, messagesCount: c.messages.length })),
      missingChats: missingChats.length > 0 ? missingChats : '无',
      orphanChats: orphanChats.length > 0 ? orphanChats : '无'
    });
    
    if (missingChats.length > 0) {
      console.log('ℹ️ 检测到', missingChats.length, '个角色缺少聊天记录，系统会自动创建');
      console.log('   角色ID:', missingChats);
    }
    
    if (orphanChats.length > 0) {
      console.log('🧹 检测到', orphanChats.length, '个孤立的聊天记录，正在自动清理...');
      console.log('   清理的ID:', orphanChats);
      const cleanedChats = chats.filter(chat => personalityIds.includes(chat.personalityId));
      if (cleanedChats.length !== chats.length) {
        setChats(cleanedChats);
        console.log('✅ 已清理', chats.length - cleanedChats.length, '个孤立聊天记录');
      }
    }
  }, [personalities, chats, searchQuery, sortedChats.length, setChats]);

  // 调试：打印未读消息数量
  useEffect(() => {
    const totalUnread = chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
    if (totalUnread > 0) {
      console.log('未读消息:', chats.map(chat => ({ 
        id: chat.personalityId, 
        unread: chat.unreadCount 
      })));
    }
  }, [chats]);

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex-shrink-0 px-3 py-2 border-b bg-surface-dim">
        {/* 用户资料区 */}
        <div className="flex items-center justify-between mb-2">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:bg-surface-hover rounded-lg p-0.5 -ml-0.5 transition-colors min-w-0 flex-shrink"
            onClick={onOpenUserProfile}
          >
            <Avatar className="w-8 h-8 flex-shrink-0">
              {userProfile.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt={userProfile.nickname || '我'} className="w-full h-full object-cover" />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-500 text-white">
                  {userProfile.nickname?.[0] || '我'}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex flex-col min-w-0 overflow-hidden">
              <h1 className="text-foreground text-sm truncate">{userProfile.nickname || '我'}</h1>
              {userEmail && (
                <p className="text-[10px] text-muted-foreground truncate">{userEmail}</p>
              )}
            </div>
          </div>
          <div className="flex gap-0.5 flex-shrink-0">
            {/* 退出登录 - 始终显示 */}
            {onSignOut && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-surface-hover hover:text-red-500 h-8 w-8"
                onClick={onSignOut}
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
            {/* 黑夜模式切换 - 始终显示 */}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-surface-hover h-8 w-8"
              onClick={onToggleDarkMode}
              title={darkMode ? "切换到亮色模式" : "切换到暗色模式"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            {/* 以下按钮仅在非沉浸模式下显示 */}
            {!immersiveMode && onOpenDataImport && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-surface-hover h-8 w-8"
                onClick={onOpenDataImport}
                title="数据导入"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {!immersiveMode && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-surface-hover h-8 w-8"
                onClick={onOpenMemoryManager}
                title="记忆管理"
              >
                <Brain className="w-4 h-4" />
              </Button>
            )}
            {!immersiveMode && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-surface-hover h-8 w-8"
                onClick={onOpenPromptManager}
                title="角色管理"
              >
                <FileText className="w-4 h-4" />
              </Button>
            )}
            {!immersiveMode && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-surface-hover h-8 w-8"
                onClick={onOpenSettings}
                title="AI配置"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            {/* 手动同步按钮 */}
            {!immersiveMode && onManualSync && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-surface-hover h-8 w-8"
                onClick={async () => {
                  setIsSyncing(true);
                  await onManualSync();
                  setTimeout(() => setIsSyncing(false), 1000);
                }}
                disabled={isSyncing}
                title="同步数据"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {/* 搜索框 - 仅在聊天标签显示 */}
        {activeTab === 'chats' && (
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-surface border-none rounded-md h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 bg-card overflow-y-auto">
        {/* 聊天列表 */}
        {activeTab === 'chats' && (
          <div className="divide-y divide-border">
            {/* 数据恢复提示 - 当没有AI女友时显示 */}
            {personalities.length === 0 && (
              <div className="p-8 text-center space-y-4">
                <div className="bg-red-500/10 rounded-full p-6 w-24 h-24 mx-auto flex items-center justify-center">
                  <AlertTriangle className="w-12 h-12 text-red-500" />
                </div>
                <h3 className="text-foreground">未找到AI女友</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  数据似乎丢失了。请使用数据恢复工具检查并恢复你的AI女友数据。
                </p>
                {onOpenDataRecovery && (
                  <Button
                    onClick={onOpenDataRecovery}
                    variant="default"
                    className="mt-4"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    打开数据恢复工具
                  </Button>
                )}
              </div>
            )}
            
            {/* 搜索无结果提示 */}
            {personalities.length > 0 && sortedChats.length === 0 && searchQuery && (
              <div className="p-8 text-center">
                <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">未找到匹配的聊天</p>
                <p className="text-sm text-muted-foreground/70 mt-2">试试其他关键词</p>
              </div>
            )}
            
            {sortedChats
              .filter(chat => {
                const personality = personalities.find(p => p.id === chat.personalityId);
                return !!personality && !!personality.name;
              })
              .map((chat) => {
              const personality = personalities.find(p => p.id === chat.personalityId);
              if (!personality) return null;
              const isActive = chat.personalityId === currentPersonalityId;

              return (
                <div
                  key={chat.personalityId}
                  className={`flex items-center gap-3 p-4 cursor-pointer transition-colors ${
                    isActive ? 'bg-surface-hover' : 'hover:bg-surface-hover/50'
                  }`}
                  onClick={() => onSelectChat(chat.personalityId)}
                >
                  <SafeAvatar
                    avatarUrl={personality.avatarUrl}
                    name={personality.name || '未命名'}
                    className="w-12 h-12 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="truncate text-foreground">{personality.name || '未命名'}</h3>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatTime(chat.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground truncate flex-1">
                        {getLastMessage(chat)}
                      </p>
                      {chat.unreadCount > 0 && (
                        <Badge variant="destructive" className="ml-2 rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-lg">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 联系人列表 */}
        {activeTab === 'contacts' && (
          <ContactsList
            personalities={personalities}
            currentPersonalityId={currentPersonalityId}
            onSelectContact={onSelectChat}
          />
        )}

        {/* 动态/朋友圈 */}
        {activeTab === 'moments' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 发布动态按钮 */}
            <div className="p-3 border-b border-border bg-surface-dim flex-shrink-0">
              <Button
                onClick={() => setShowCreateMomentDialog(true)}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                发布动态
              </Button>
            </div>

            {/* 动态列表 */}
            {moments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full p-6 mb-6">
                  <ImageIcon className="w-16 h-16 text-purple-500" />
                </div>
                <h3 className="text-foreground mb-2">朋友圈动态</h3>
                <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
                  还没有动态，点击上方发布第一条吧！
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="divide-y divide-border">
                  {[...moments].sort((a, b) => b.timestamp - a.timestamp).map((moment) => {
                    // 获取作者信息
                    const author = moment.authorId === 'user' 
                      ? { name: userProfile.nickname, avatarUrl: userProfile.avatarUrl }
                      : personalities.find(p => p.id === moment.authorId) || { name: 'AI', avatarUrl: undefined };
                    
                    const isOwner = moment.authorId === 'user';
                    
                    return (
                      <div
                        key={moment.id}
                        className="p-4 hover:bg-accent/50 transition-colors relative group"
                      >
                        {/* 头部 */}
                        <div className="flex items-start gap-3 mb-2">
                          <SafeAvatar
                            avatarUrl={author.avatarUrl}
                            name={author.name}
                            className="h-10 w-10 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{author.name}</span>
                              {moment.authorId !== 'user' && (
                                <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                                  AI
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(moment.timestamp, 'MM月dd日 HH:mm', { locale: zhCN })}
                            </div>
                          </div>

                          {/* 删除按钮 - 仅显示在自己的动态上 */}
                          {isOwner && onDeleteMoment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('确定要删除这条动态吗？')) {
                                  onDeleteMoment(moment.id);
                                  toast.success('动态已删除');
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* 内容预览 */}
                        {moment.content && (
                          <p className="text-sm mb-2 line-clamp-3 text-foreground/90">
                            {moment.content}
                          </p>
                        )}

                        {/* 图片网格预览 */}
                        {moment.images.length > 0 && (
                          <div className={`grid gap-1 mb-2 ${
                            moment.images.length === 1 ? 'grid-cols-1' :
                            moment.images.length === 2 ? 'grid-cols-2' :
                            'grid-cols-3'
                          }`}>
                            {moment.images.slice(0, 3).map((img, idx) => (
                              <div 
                                key={idx} 
                                className="relative aspect-square overflow-hidden rounded"
                              >
                                <ImageWithFallback
                                  src={img}
                                  alt={`图片 ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                {/* 如果有更多图片，显示数量 */}
                                {idx === 2 && moment.images.length > 3 && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <span className="text-white text-xs">
                                      +{moment.images.length - 3}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 点赞和评论按钮 */}
                        <div className="flex items-center gap-4 py-2 border-t border-border">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleLike?.(moment.id);
                            }}
                            className={`flex items-center gap-2 transition-colors ${
                              moment.likes.includes('user') 
                                ? 'text-red-500' 
                                : 'text-muted-foreground hover:text-red-500'
                            }`}
                          >
                            <Heart className={`h-4 w-4 ${moment.likes.includes('user') ? 'fill-current' : ''}`} />
                            <span className="text-xs">
                              {moment.likes.length > 0 ? moment.likes.length : '点赞'}
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowComments({ ...showComments, [moment.id]: !showComments[moment.id] });
                            }}
                            className="flex items-center gap-2 text-muted-foreground hover:text-green-600 transition-colors"
                          >
                            <MessageCircle className="h-4 w-4" />
                            <span className="text-xs">
                              {moment.comments.length > 0 ? moment.comments.length : '评论'}
                            </span>
                          </button>
                        </div>

                        {/* 评论区 */}
                        {showComments[moment.id] && (
                          <div className="mt-3 space-y-3 border-t border-border pt-3">
                            {/* 评论列表 */}
                            {moment.comments.map((comment) => {
                              const commentAuthor = comment.authorId === 'user'
                                ? { name: userProfile.nickname, avatarUrl: userProfile.avatarUrl }
                                : personalities.find(p => p.id === comment.authorId) || { name: 'AI', avatarUrl: undefined };
                              const replyKey = `${moment.id}_${comment.id}`;
                              
                              return (
                                <div key={comment.id} className="space-y-2">
                                  <div className="flex gap-2">
                                    <SafeAvatar
                                      avatarUrl={commentAuthor.avatarUrl}
                                      name={commentAuthor.name}
                                      className="h-8 w-8 flex-shrink-0"
                                    />
                                    <div className="flex-1">
                                      <div className="bg-accent/50 dark:bg-gray-800 rounded-lg p-2">
                                        <div className="text-sm font-medium mb-1">
                                          {commentAuthor.name}
                                        </div>
                                        <div className="text-sm">{comment.content}</div>
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                        <span>{format(comment.timestamp, 'MM月dd日 HH:mm', { locale: zhCN })}</span>
                                        <button
                                          onClick={() => setReplyingTo(replyingTo === replyKey ? null : replyKey)}
                                          className="hover:text-green-600"
                                        >
                                          回复
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 回复列表 */}
                                  {comment.replies && comment.replies.length > 0 && (
                                    <div className="ml-10 space-y-2">
                                      {comment.replies.map((reply) => {
                                        const replyAuthor = reply.authorId === 'user'
                                          ? { name: userProfile.nickname, avatarUrl: userProfile.avatarUrl }
                                          : personalities.find(p => p.id === reply.authorId) || { name: 'AI', avatarUrl: undefined };
                                        return (
                                          <div key={reply.id} className="flex gap-2">
                                            <SafeAvatar
                                              avatarUrl={replyAuthor.avatarUrl}
                                              name={replyAuthor.name}
                                              className="h-6 w-6 flex-shrink-0"
                                            />
                                            <div className="flex-1">
                                              <div className="bg-accent/30 dark:bg-gray-900 rounded-lg p-2">
                                                <div className="text-xs font-medium mb-1">
                                                  {replyAuthor.name}
                                                </div>
                                                <div className="text-xs">{reply.content}</div>
                                              </div>
                                              <div className="text-xs text-muted-foreground mt-1">
                                                {format(reply.timestamp, 'MM月dd日 HH:mm', { locale: zhCN })}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* 回复输入框 */}
                                  {replyingTo === replyKey && (
                                    <div className="ml-10 flex gap-2">
                                      <SafeAvatar
                                        avatarUrl={userProfile.avatarUrl}
                                        name={userProfile.nickname}
                                        className="h-6 w-6 flex-shrink-0"
                                      />
                                      <div className="flex-1 flex gap-2">
                                        <input
                                          type="text"
                                          value={replyInputs[replyKey] || ''}
                                          onChange={(e) => setReplyInputs({ ...replyInputs, [replyKey]: e.target.value })}
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                              const content = replyInputs[replyKey]?.trim();
                                              if (content && onReplyToComment) {
                                                onReplyToComment(moment.id, comment.id, content);
                                                setReplyInputs({ ...replyInputs, [replyKey]: '' });
                                                setReplyingTo(null);
                                              }
                                            }
                                          }}
                                          placeholder={`回复 ${commentAuthor.name}...`}
                                          className="flex-1 px-2 py-1 border border-border rounded text-xs bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                                          autoFocus
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            const content = replyInputs[replyKey]?.trim();
                                            if (content && onReplyToComment) {
                                              onReplyToComment(moment.id, comment.id, content);
                                              setReplyInputs({ ...replyInputs, [replyKey]: '' });
                                              setReplyingTo(null);
                                            }
                                          }}
                                          disabled={!replyInputs[replyKey]?.trim()}
                                          className="h-7 bg-green-600 hover:bg-green-700"
                                        >
                                          <Send className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* 评论输入框 */}
                            <div className="flex gap-2">
                              <SafeAvatar
                                avatarUrl={userProfile.avatarUrl}
                                name={userProfile.nickname}
                                className="h-8 w-8 flex-shrink-0"
                              />
                              <div className="flex-1 flex gap-2">
                                <input
                                  type="text"
                                  value={commentInputs[moment.id] || ''}
                                  onChange={(e) => setCommentInputs({ ...commentInputs, [moment.id]: e.target.value })}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      const content = commentInputs[moment.id]?.trim();
                                      if (content && onAddComment) {
                                        onAddComment(moment.id, content);
                                        setCommentInputs({ ...commentInputs, [moment.id]: '' });
                                      }
                                    }
                                  }}
                                  placeholder="说点什么..."
                                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const content = commentInputs[moment.id]?.trim();
                                    if (content && onAddComment) {
                                      onAddComment(moment.id, content);
                                      setCommentInputs({ ...commentInputs, [moment.id]: '' });
                                    }
                                  }}
                                  disabled={!commentInputs[moment.id]?.trim()}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 群聊列表 */}
        {activeTab === 'groups' && (
          <div>
            {sortedGroupChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-full p-6 mb-6">
                  <UsersRound className="w-16 h-16 text-green-500" />
                </div>
                <h3 className="text-foreground mb-2">AI群聊</h3>
                <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
                  创建群聊，与多个AI女友同时互动
                </p>
                <Button
                  onClick={() => setShowCreateGroupDialog(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  创建群聊
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* 创建群聊按钮 */}
                <div className="p-4 hover:bg-surface-hover cursor-pointer transition-colors" onClick={() => setShowCreateGroupDialog(true)}>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <Plus className="w-6 h-6 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">创建新群聊</div>
                      <div className="text-sm text-muted-foreground">发起群组对话</div>
                    </div>
                  </div>
                </div>

                {/* 群聊列表 */}
                {sortedGroupChats.map(group => {
                  if (!group) return null;
                  const memberCount = group.memberIds?.length || 0;
                  const groupName = group.name || '未命名群聊';
                  return (
                    <div
                      key={group.id}
                      className="p-4 hover:bg-surface-hover cursor-pointer transition-colors"
                      onClick={() => onSelectGroupChat?.(group.id)}
                    >
                      <div className="flex items-center gap-3">
                        {/* 群聊头像 */}
                        <div className="relative flex-shrink-0">
                          <Avatar className="h-12 w-12">
                            {group.avatarUrl ? (
                              <SafeAvatar
                                src={group.avatarUrl}
                                alt={groupName}
                                fallback={groupName.charAt(0)}
                              />
                            ) : (
                              <AvatarFallback className="bg-green-500/20 text-green-700 dark:text-green-300">
                                <UsersRound className="w-6 h-6" />
                              </AvatarFallback>
                            )}
                          </Avatar>
                          {group.unreadCount > 0 && (
                            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center px-1 bg-red-500 text-white text-xs">
                              {group.unreadCount > 99 ? '99+' : group.unreadCount}
                            </Badge>
                          )}
                        </div>

                        {/* 群聊信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between mb-1">
                            <h3 className="font-medium text-foreground truncate">
                              {groupName}
                            </h3>
                            <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                              {formatTime(group.lastMessageTime || Date.now())}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground truncate">
                              {getGroupLastMessage(group)}
                            </p>
                            <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                              ({memberCount}人)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部导航栏 - 始终显示 */}
      <div className="flex-shrink-0 border-t bg-card">
        {/* 导航标签 */}
        <div className="grid grid-cols-4 border-b border-border bg-surface-dim">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center gap-1 py-3 transition-all relative ${
              activeTab === 'chats'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageCircle className={`w-5 h-5 transition-transform ${activeTab === 'chats' ? 'scale-110' : ''}`} />
            <span className="text-xs">聊天</span>
            {activeTab === 'chats' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`flex flex-col items-center gap-1 py-3 transition-all relative ${
              activeTab === 'contacts'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className={`w-5 h-5 transition-transform ${activeTab === 'contacts' ? 'scale-110' : ''}`} />
            <span className="text-xs">联系人</span>
            {activeTab === 'contacts' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('moments')}
            className={`flex flex-col items-center gap-1 py-3 transition-all relative ${
              activeTab === 'moments'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ImageIcon className={`w-5 h-5 transition-transform ${activeTab === 'moments' ? 'scale-110' : ''}`} />
            <span className="text-xs">动态</span>
            {activeTab === 'moments' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex flex-col items-center gap-1 py-3 transition-all relative ${
              activeTab === 'groups'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UsersRound className={`w-5 h-5 transition-transform ${activeTab === 'groups' ? 'scale-110' : ''}`} />
            <span className="text-xs">群聊</span>
            {activeTab === 'groups' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>

        {/* 创建新AI女友按钮 - 仅在非沉浸模式下显示 */}
        {!immersiveMode && (
          <div className="p-4">
            <Button
              onClick={onOpenPromptManager}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              创建新AI女友
            </Button>
          </div>
        )}
      </div>

      {/* 创建群聊对话框 */}
      <Dialog open={showCreateGroupDialog} onOpenChange={setShowCreateGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建群聊</DialogTitle>
            <DialogDescription>
              输入群聊名称，创建后可以添加成员
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="groupName">群聊名称</Label>
              <Input
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="例如：闺蜜群、学习小组..."
                maxLength={20}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateGroup();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroupDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreateGroup} disabled={!groupName.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 发布动态对话框 */}
      <Dialog open={showCreateMomentDialog} onOpenChange={setShowCreateMomentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>发布动态</DialogTitle>
            <DialogDescription>
              分享你的心情、照片和生活点滴
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 文字输入 */}
            <div>
              <Label htmlFor="momentContent">内容</Label>
              <textarea
                id="momentContent"
                value={momentContent}
                onChange={(e) => setMomentContent(e.target.value)}
                placeholder="分享此刻的心情..."
                className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                maxLength={500}
              />
              <div className="text-xs text-muted-foreground mt-1 text-right">
                {momentContent.length}/500
              </div>
            </div>

            {/* 图片管理 */}
            <div>
              <Label>图片</Label>
              <div className="mt-2">
                {/* 图片预览网格 */}
                {momentImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {momentImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                        <ImageWithFallback
                          src={img}
                          alt={`图片 ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* 添加图片按钮 */}
                {momentImages.length < 9 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddImage}
                    className="w-full"
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    添加图片 ({momentImages.length}/9)
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateMomentDialog(false);
                setMomentContent('');
                setMomentImages([]);
              }}
            >
              取消
            </Button>
            <Button 
              onClick={handleCreateMoment} 
              disabled={!momentContent.trim() && momentImages.length === 0}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              发布
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
