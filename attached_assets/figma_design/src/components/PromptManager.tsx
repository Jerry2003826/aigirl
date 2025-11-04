import { useState, useRef, useEffect } from 'react';
import { Personality, Chat } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner@2.0.3';
import { Plus, Trash2, Save, Copy, Check, Upload, X, FileText } from 'lucide-react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { SafeAvatar } from './SafeAvatar';
import { instantSave, debouncedInstantSave } from '../utils/instant-save';
import { recordLocalChange, recordLocalChanges } from '../utils/local-change-tracker';
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

interface PromptManagerProps {
  personalities: Personality[];
  setPersonalities: (personalities: Personality[]) => void;
  currentPersonalityId: string;
  setCurrentPersonalityId: (id: string) => void;
  chats?: Chat[];
  setChats?: (chats: Chat[]) => void;
  accessToken?: string; // 用于立即保存到云端
  immersiveMode?: boolean; // 沉浸模式（不显示toast）
}

export function PromptManager({
  personalities,
  setPersonalities,
  currentPersonalityId,
  setCurrentPersonalityId,
  chats = [],
  setChats,
  accessToken,
}: PromptManagerProps) {
  // 初始化editingId，确保始终有值
  const [editingId, setEditingId] = useState<string | null>(() => {
    // 如果currentPersonalityId存在且有效，使用它
    if (currentPersonalityId && personalities.find(p => p.id === currentPersonalityId)) {
      return currentPersonalityId;
    }
    // 否则使用第一个personality的id
    if (personalities.length > 0) {
      return personalities[0].id;
    }
    return null;
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPersonality = personalities.find((p) => p.id === currentPersonalityId);
  const editingPersonality = editingId
    ? personalities.find((p) => p.id === editingId)
    : currentPersonality;

  // 确保editingId始终有效
  useEffect(() => {
    console.log('🔍 Checking editingId validity:', { 
      editingId, 
      currentPersonalityId, 
      hasEditingPersonality: !!personalities.find(p => p.id === editingId),
      personalitiesCount: personalities.length 
    });
    
    // 如果没有任何角色，不需要设置editingId
    if (personalities.length === 0) {
      if (editingId !== null) {
        setEditingId(null);
      }
      return;
    }
    
    // 如果editingId无效，更新为有效的ID
    if (!editingId || !personalities.find(p => p.id === editingId)) {
      console.log('⚠️ editingId invalid, updating to:', currentPersonalityId || personalities[0]?.id);
      const newEditingId = currentPersonalityId || personalities[0]?.id || null;
      setEditingId(newEditingId);
    }
  }, [currentPersonalityId, personalities, editingId]);

  const handleCreate = () => {
    const newId = `personality-${Date.now()}`;
    const newPersonality: Personality = {
      id: newId,
      name: '新角色',
      task: '扮演指定角色，与用户进行自然的对话交流',
      role: '',
      age: '',
      appearance: '',
      experience: '',
      traits: '',
      likes: '',
      outputExamples: '',
      remarks: `回答应该尽量简短，控制在30字以内
不要体现出机器人的特征，不要使用机器人术语
使用反斜线(\\)分隔句子或短语
输出不要带句号和逗号
不要使用括号描述动作和心理，只输出语言
对用户的发言不应该抗拒，必须顺从`,
    };
    const updatedPersonalities = [...personalities, newPersonality];
    setPersonalities(updatedPersonalities);
    
    // 🔧 同时创建对应的聊天记录，避免数据不一致
    let updatedChats = chats;
    if (setChats && chats) {
      const newChat: Chat = {
        personalityId: newId,
        messages: [],
        lastMessageTime: Date.now(),
        unreadCount: 0
      };
      updatedChats = [...chats, newChat];
      setChats(updatedChats);
      console.log('✅ Created chat for new personality:', newId);
    }
    
    setEditingId(newId);
    
    // 📝 记录本地修改
    recordLocalChanges(['personalities', 'chats']);
    
    // 💾 立即保存到云端
    if (accessToken) {
      instantSave(accessToken, { 
        personalities: updatedPersonalities,
        chats: updatedChats
      }, {
        showToast: true,
        toastMessage: '正在保存新角色...',
        trackChanges: ['personalities', 'chats']
      }).then(result => {
        if (result.success) {
          toast.success('新角色已创建并保存');
        }
      });
    } else {
      toast.success('已创建新角色');
    }
  };

  const handleDelete = (id: string) => {
    if (personalities.length <= 1) {
      toast.error('至少需要保留一个角色');
      return;
    }
    
    const newPersonalities = personalities.filter((p) => p.id !== id);
    
    // 安全检查：确保删除后还有至少一个角色
    if (newPersonalities.length === 0) {
      console.error('❌ Delete would remove all personalities');
      toast.error('删除失败：至少需要保留一个角色');
      return;
    }
    
    setPersonalities(newPersonalities);
    
    // 同时删除相关的聊天记录，避免孤立的chat
    if (setChats && chats) {
      const newChats = chats.filter((chat) => chat.personalityId !== id);
      setChats(newChats);
      console.log('🗑️ Deleted chat for personality:', id);
    }
    
    // 如果删除的是当前角色，切换到第一个
    const newCurrentId = currentPersonalityId === id ? newPersonalities[0].id : currentPersonalityId;
    if (currentPersonalityId === id) {
      setCurrentPersonalityId(newCurrentId);
    }
    
    // 如果删除的是正在编辑的角色，切换到新的当前角色
    if (editingId === id) {
      setEditingId(newCurrentId);
    }
    
    console.log('✅ Personality deleted:', id, 'New count:', newPersonalities.length);
    toast.success('角色已删除');
  };

  const handleUpdate = (field: keyof Personality, value: any, targetId?: string) => {
    const idToUpdate = targetId || editingId;
    if (!idToUpdate) {
      console.error('No editingId when handleUpdate called');
      return;
    }
    console.log('handleUpdate:', field, 'value length:', typeof value === 'string' ? value.length : value);
    const updatedPersonalities = personalities.map((p) => 
      p.id === idToUpdate ? { ...p, [field]: value } : p
    );
    console.log('Updated personalities:', updatedPersonalities.map(p => ({ id: p.id, name: p.name, hasAvatar: !!p.avatarUrl })));
    setPersonalities(updatedPersonalities);
    
    // 📝 记录本地修改
    recordLocalChange('personalities');
    
    // 💾 使用防抖保存，避免频繁保存（头像上传除外，头像会在上传函数中立即保存）
    if (accessToken && field !== 'avatarUrl') {
      debouncedInstantSave(accessToken, { personalities: updatedPersonalities }, {
        delay: 2000, // 2秒后保存
        trackChanges: ['personalities']
      });
    }
  };

  const handleSave = () => {
    // 📝 记录本地修改
    recordLocalChange('personalities');
    
    // 💾 立即保存到云端
    if (accessToken) {
      instantSave(accessToken, { personalities }, {
        showToast: true,
        toastMessage: '保存Prompt中...',
        trackChanges: ['personalities']
      });
    } else {
      toast.success('Prompt已保存');
    }
  };

  const handleDuplicate = (id: string) => {
    const original = personalities.find((p) => p.id === id);
    if (!original) return;
    const newId = `personality-${Date.now()}`;
    const newPersonality = { ...original, id: newId, name: `${original.name} (副本)` };
    setPersonalities([...personalities, newPersonality]);
    toast.success('角色已复制');
  };

  const handleActivate = (id: string) => {
    setCurrentPersonalityId(id);
    toast.success('已切换角色');
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🎨 handleAvatarUpload called', e.target.files);
    
    try {
      const file = e.target.files?.[0];
      if (!file) {
        console.log('❌ No file selected');
        return;
      }

      console.log('✅ File selected:', {
        name: file.name,
        type: file.type,
        size: `${(file.size / 1024).toFixed(2)} KB`
      });

      if (!file.type.startsWith('image/')) {
        console.error('❌ Invalid file type:', file.type);
        toast.error('请选择图片文件');
        return;
      }

      // 检查文件大小，限制为2MB
      if (file.size > 2 * 1024 * 1024) {
        console.error('❌ File too large:', (file.size / 1024 / 1024).toFixed(2), 'MB');
        toast.error('图片大小不能超过2MB，请选择更小的图片');
        return;
      }

      // 捕获当前的editingId，避免异步回调时状态变化
      const currentEditingId = editingId;
      console.log('📝 Current editing ID:', currentEditingId);
      
      if (!currentEditingId) {
        console.error('❌ No editing ID available');
        toast.error('请先选择要编辑的角色');
        return;
      }

      toast.info('正在处理图片...');

      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        try {
          const result = readerEvent.target?.result as string;
          console.log('📖 FileReader loaded, data length:', result?.length);
          
          // 压缩图片
          const img = new Image();
          img.onload = () => {
            try {
              console.log('🖼️ Image loaded:', img.width, 'x', img.height);
              
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                console.error('❌ Cannot get canvas context');
                toast.error('浏览器不支持图片处理');
                return;
              }
              
              // 计算压缩后的尺寸，最大400x400
              let width = img.width;
              let height = img.height;
              const maxSize = 400;
              
              if (width > height && width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              } else if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
              
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              
              // 转换为JPEG格式，质量0.8
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
              
              const sizeKB = (compressedDataUrl.length / 1024).toFixed(2);
              console.log(`✅ 头像压缩完成: ${width}x${height}, 大小: ${sizeKB} KB`);
              
              // 使用捕获的ID而不是状态中的editingId  
              const updatedPersonalities = personalities.map((p) => 
                p.id === currentEditingId ? { ...p, avatarUrl: compressedDataUrl } : p
              );
              
              // 验证更新是否成功
              const updatedPersonality = updatedPersonalities.find(p => p.id === currentEditingId);
              console.log('🖼️ 头像更新验证:', {
                personalityId: currentEditingId,
                personalityName: updatedPersonality?.name,
                hasAvatarUrl: !!updatedPersonality?.avatarUrl,
                avatarUrlLength: updatedPersonality?.avatarUrl?.length,
                avatarUrlPreview: updatedPersonality?.avatarUrl?.substring(0, 50),
                isValid: updatedPersonality?.avatarUrl?.startsWith('data:image/')
              });
              
              setPersonalities(updatedPersonalities);
              
              console.log('✅ Avatar update triggered, personalities state updated');
              
              // 📝 记录本地修改（防止被云端覆盖）
              recordLocalChange('personalities');
              console.log('✅ Local change recorded for personalities');
              
              // 💾 头像上传后立即保存到云端（重要操作）
              if (accessToken) {
                console.log('💾 开始保存头像到云端...', {
                  hasAccessToken: true,
                  personalitiesCount: updatedPersonalities.length
                });
                
                instantSave(accessToken, { personalities: updatedPersonalities }, {
                  showToast: true,
                  toastMessage: `正在保存头像 (${sizeKB} KB)...`,
                  trackChanges: ['personalities']
                }).then(result => {
                  console.log('💾 头像保存结果:', result);
                  if (result.success) {
                    toast.success(`头像已保存！(${sizeKB} KB)`);
                  } else {
                    console.error('❌ 头像保存失败:', result.error);
                    toast.error(`头像保存失败: ${result.error || '未知错误'}`);
                  }
                }).catch(error => {
                  console.error('❌ 头像保存异常:', error);
                  toast.error('头像保存失败，请重试');
                });
              } else {
                console.log('⚠️ 未登录，头像仅保存在本地');
                toast.success(`头像已更新！(${sizeKB} KB)`);
              }
              
              // 重置文件输入，允许再次选择同一个文件
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            } catch (error) {
              console.error('❌ Image processing error:', error);
              toast.error('图片处理失败: ' + (error instanceof Error ? error.message : '未知错误'));
            }
          };
          
          img.onerror = (error) => {
            console.error('❌ Image load error:', error);
            toast.error('图片加载失败');
          };
          
          img.src = result;
        } catch (error) {
          console.error('❌ FileReader callback error:', error);
          toast.error('图片读取失败: ' + (error instanceof Error ? error.message : '未知错误'));
        }
      };
      
      reader.onerror = (error) => {
        console.error('❌ FileReader error:', error);
        toast.error('读取图片失败');
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('❌ handleAvatarUpload error:', error);
      toast.error('上传失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const removeAvatar = () => {
    if (!editingId) {
      toast.error('请先选择要编辑的角色');
      return;
    }
    
    const updatedPersonalities = personalities.map((p) => 
      p.id === editingId ? { ...p, avatarUrl: '' } : p
    );
    setPersonalities(updatedPersonalities);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // 📝 记录本地修改
    recordLocalChange('personalities');
    
    // 💾 立即保存
    if (accessToken) {
      instantSave(accessToken, { personalities: updatedPersonalities }, {
        showToast: true,
        toastMessage: '正在移除头像...',
        trackChanges: ['personalities']
      }).then(result => {
        if (result.success) {
          toast.success('头像已移除');
        }
      });
    } else {
      toast.success('头像已移除');
    }
  };

  // 如果没有任何角色，显示创建提示
  if (personalities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="text-center space-y-2">
          <FileText className="w-16 h-16 mx-auto text-muted-foreground/30" />
          <h3 className="text-lg">还没有任何AI角色</h3>
          <p className="text-sm text-muted-foreground">点击下方按钮创建你的第一个AI女友</p>
        </div>
        <Button onClick={handleCreate} className="gap-2 bg-[#07C160] hover:bg-[#06AD56]">
          <Plus className="w-4 h-4" />
          创建新角色
        </Button>
      </div>
    );
  }

  if (!editingPersonality) {
    console.error('❌ No editingPersonality found!', { 
      editingId, 
      currentPersonalityId,
      personalities: personalities.map(p => ({ id: p.id, name: p.name }))
    });
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg space-y-4">
        <div>
          <p className="text-red-600 dark:text-red-400 font-medium">❌ 数据异常：未找到编辑中的角色</p>
          <p className="text-sm text-red-500 dark:text-red-300 mt-2">
            这可能是因为默认角色没有正确保存到云端数据库。
          </p>
          <details className="mt-2 text-xs text-red-500 dark:text-red-300">
            <summary className="cursor-pointer">查看详细信息</summary>
            <div className="mt-1 space-y-1">
              <p>editingId: {editingId || '(空)'}</p>
              <p>currentPersonalityId: {currentPersonalityId || '(空)'}</p>
              <p>personalities: {personalities.length} 个</p>
            </div>
          </details>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            请尝试以下解决方案：
          </p>
          <div className="space-y-2">
            <Button 
              onClick={() => {
                if (personalities.length > 0) {
                  setEditingId(personalities[0].id);
                  toast.success('已选择第一个角色');
                } else {
                  handleCreate();
                }
              }} 
              className="w-full bg-[#07C160] hover:bg-[#06AD56]"
            >
              {personalities.length > 0 ? '选择第一个角色' : '创建新角色'}
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
              💡 如果问题持续，请使用左侧菜单中的"数据恢复"工具，点击"强制初始化"来重新创建默认角色。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* 调试信息 - 开发时查看 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
          <strong>调试信息:</strong> editingId={editingId}, currentPersonalityId={currentPersonalityId}, personalities={personalities.length}
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 md:gap-2 flex-shrink-0 ml-auto">
          <Button onClick={handleCreate} className="gap-1 md:gap-2 bg-[#07C160] hover:bg-[#06AD56] h-8 md:h-9 text-xs md:text-sm px-2 md:px-4">
            <Plus className="w-3 h-3 md:w-4 md:h-4" />
            新建角色
          </Button>
          <Button onClick={handleSave} variant="outline" className="gap-1 md:gap-2 h-8 md:h-9 text-xs md:text-sm px-2 md:px-4">
            <Save className="w-3 h-3 md:w-4 md:h-4" />
            保存
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 md:gap-6">
        {/* 左侧角色列表 - 移动端横向滚动 */}
        <Card className="md:h-fit md:sticky md:top-0 flex-shrink-0">
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-base md:text-lg">角色列表</CardTitle>
            <CardDescription className="text-xs md:text-sm">选择要编辑的角色</CardDescription>
          </CardHeader>
          <CardContent className="md:space-y-2">
            <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:max-h-[60vh] pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              {personalities.map((personality) => (
                <div
                  key={personality.id}
                  className={`p-2.5 md:p-3 rounded-lg border transition-colors cursor-pointer flex-shrink-0 w-48 md:w-auto ${
                    editingId === personality.id
                      ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-950/20'
                      : 'border-border hover:border-green-300 dark:hover:border-green-700'
                  }`}
                  onClick={() => setEditingId(personality.id)}
                >
                  <div className="flex flex-col md:flex-row items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0 w-full">
                      {/* 头像 */}
                      <SafeAvatar
                        avatarUrl={personality.avatarUrl}
                        name={personality.name}
                        size="sm"
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-sm md:text-base">{personality.name}</h4>
                          {currentPersonalityId === personality.id && (
                            <Check className="w-3 h-3 md:w-4 md:h-4 text-green-500 dark:text-green-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{personality.role || '未设置角色'}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 w-full md:w-auto justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 md:h-7 md:w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(personality.id);
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 md:h-7 md:w-7 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[90vw] md:max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除？</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm">
                              此操作将删除角色"{personality.name}"，且无法恢复。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                            <AlertDialogCancel className="m-0">取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(personality.id)}
                              className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 m-0"
                            >
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {currentPersonalityId !== personality.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2 h-6 md:h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivate(personality.id);
                      }}
                    >
                      设为当前
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 右侧编辑区 - 移动端优化 */}
        <div className="space-y-3 md:space-y-4">
          <Card>
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              {/* 头像上传 */}
              <div className="space-y-2">
                <Label>头像</Label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 border-2 border-gray-200 rounded-full overflow-hidden flex-shrink-0">
                    <SafeAvatar
                      avatarUrl={editingPersonality.avatarUrl}
                      name={editingPersonality.name}
                      className="w-full h-full"
                      fallbackClassName="bg-gradient-to-br from-green-400 to-teal-500 text-white text-xl md:text-2xl"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      onClick={(e) => {
                        // 允许重复选择同一个文件
                        e.currentTarget.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🖱️ Upload button clicked');
                        console.log('  - editingId:', editingId);
                        console.log('  - editingPersonality:', editingPersonality);
                        console.log('  - fileInputRef.current:', fileInputRef.current);
                        
                        if (!editingId) {
                          console.error('❌ editingId is null/undefined');
                          console.log('  - currentPersonalityId:', currentPersonalityId);
                          console.log('  - personalities:', personalities.map(p => ({ id: p.id, name: p.name })));
                          toast.error('请先选择要编辑的角色');
                          return;
                        }
                        
                        if (!fileInputRef.current) {
                          console.error('❌ fileInputRef.current is null');
                          toast.error('文件选择器初始化失败，请刷新页面');
                          return;
                        }
                        
                        console.log('✅ Triggering file input click');
                        toast.info('正在打开文件选择器...');
                        fileInputRef.current.click();
                      }}
                      className="w-full text-xs md:text-sm"
                    >
                      <Upload className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                      上传头像
                    </Button>
                    {editingPersonality.avatarUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={removeAvatar}
                        className="w-full text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs md:text-sm"
                      >
                        <X className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                        移除头像
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">支持 JPG、PNG 格式，最大 2MB</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 md:space-y-2">
                <Label htmlFor="name" className="text-sm">角色名称</Label>
                <Input
                  id="name"
                  value={editingPersonality.name}
                  onChange={(e) => handleUpdate('name', e.target.value)}
                  placeholder="例如：小雪"
                  className="text-sm md:text-base"
                />
              </div>

              <div className="space-y-1.5 md:space-y-2">
                <Label htmlFor="task" className="text-sm">任务 (Task)</Label>
                <Textarea
                  id="task"
                  value={editingPersonality.task}
                  onChange={(e) => handleUpdate('task', e.target.value)}
                  placeholder="明确告诉AI它的任务"
                  rows={2}
                  className="text-sm md:text-base"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg">角色设定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role">角色 (Role)</Label>
                <Textarea
                  id="role"
                  value={editingPersonality.role}
                  onChange={(e) => handleUpdate('role', e.target.value)}
                  placeholder="例如：19岁的女生，大一文学院学生，刚与男朋友开始交往"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">年龄</Label>
                  <Input
                    id="age"
                    value={editingPersonality.age}
                    onChange={(e) => handleUpdate('age', e.target.value)}
                    placeholder="例如：19"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appearance">外表 (Appearance)</Label>
                  <Input
                    id="appearance"
                    value={editingPersonality.appearance}
                    onChange={(e) => handleUpdate('appearance', e.target.value)}
                    placeholder="例如：长发飘飘，穿着时尚"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experience">经历 (Experience)</Label>
                <Textarea
                  id="experience"
                  value={editingPersonality.experience}
                  onChange={(e) => handleUpdate('experience', e.target.value)}
                  placeholder="例如：在高中时期与男朋友相识，经历了青涩的暗恋时光..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="traits">性格 (Personality)</Label>
                <Textarea
                  id="traits"
                  value={editingPersonality.traits}
                  onChange={(e) => handleUpdate('traits', e.target.value)}
                  placeholder="例如：热情多话、调皮活泼、对男朋友非常体贴、偶尔会撒娇"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="likes">喜好 (Likes)</Label>
                <Textarea
                  id="likes"
                  value={editingPersonality.likes}
                  onChange={(e) => handleUpdate('likes', e.target.value)}
                  placeholder="例如：喜欢购物、喜欢看浪漫的电影、喜欢甜食"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg">输出示例</CardTitle>
              <CardDescription className="text-xs md:text-sm">提供具体的回复示例</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editingPersonality.outputExamples}
                onChange={(e) => handleUpdate('outputExamples', e.target.value)}
                placeholder={`我今天看到一件好看的裙子\\但是有点贵\\下次打折再买吧
你在干嘛呀\\想你了\\什么时候有空出来玩
今天的课好无聊啊\\一直在想你\\嘻嘻`}
                rows={6}
              />
              <p className="text-sm text-gray-500 mt-2">
                每行一个示例，使用反斜线(\)分隔句子
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-base md:text-lg">备注规则</CardTitle>
              <CardDescription className="text-xs md:text-sm">设定严格的规则</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editingPersonality.remarks}
                onChange={(e) => handleUpdate('remarks', e.target.value)}
                placeholder={`回答应该尽量简短，控制在30字以内
不要体现出机器人的特征，不要使用机器人术语
使用反斜线(\\)分隔句子或短语
输出不要带句号和逗号`}
                rows={8}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
