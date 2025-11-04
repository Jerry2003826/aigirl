import { useState, useRef } from 'react';
import { Personality } from '../App';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner@2.0.3';
import { Save, Sparkles, Upload, X } from 'lucide-react';
import { SafeAvatar } from './SafeAvatar';
import { instantSave, debouncedInstantSave } from '../utils/instant-save';
import { recordLocalChange } from '../utils/local-change-tracker';

interface PersonalityEditorProps {
  personality: Personality;
  personalities: Personality[];
  setPersonalities: (personalities: Personality[]) => void;
  accessToken?: string; // 用于立即保存到云端
}

export function PersonalityEditor({ personality, personalities, setPersonalities, accessToken }: PersonalityEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 错误处理：如果personality为null/undefined，显示友好的错误提示
  if (!personality) {
    console.error('❌ PersonalityEditor: personality is null/undefined');
    console.log('  - personalities:', personalities.map(p => ({ id: p.id, name: p.name })));
    
    return (
      <div className="p-6 space-y-4">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-red-600 dark:text-red-400 mb-2">
                数据异常：未找到角色数据
              </h3>
              <p className="text-sm text-red-500 dark:text-red-300 mb-3">
                这通常是因为默认角色"更科瑠夏"没有正确保存到Supabase云端数据库。
              </p>
              <div className="bg-white dark:bg-gray-900 rounded p-3 mb-3">
                <p className="text-sm font-medium mb-2">🔧 解决方案：</p>
                <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-decimal list-inside">
                  <li>点击左侧菜单中的"数据恢复"选项</li>
                  <li>找到"强制初始化"卡片</li>
                  <li>点击"强制初始化默认角色"按钮</li>
                  <li>等待页面自动刷新</li>
                </ol>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                💡 提示：强制初始化会创建默认角色"更科瑠夏"，不会删除你的其他自定义角色。
              </p>
            </div>
          </div>
        </div>
        
        <details className="text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
            查看技术详情
          </summary>
          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
            <p>当前角色列表（{personalities.length} 个）：</p>
            <ul className="mt-1 space-y-1">
              {personalities.length > 0 ? (
                personalities.map(p => (
                  <li key={p.id}>• {p.name} (ID: {p.id})</li>
                ))
              ) : (
                <li className="text-red-500">无角色数据</li>
              )}
            </ul>
          </div>
        </details>
      </div>
    );
  }

  const handleSave = () => {
    // 记录本地修改
    recordLocalChange('personalities');
    
    // 立即保存到云端
    if (accessToken) {
      instantSave(accessToken, { personalities }, {
        showToast: true,
        toastMessage: '保存性格设定中...',
        trackChanges: ['personalities']
      });
    } else {
      toast.success(`${personality.name}的性格设定已保存！`);
    }
  };

  const handleUpdate = (field: keyof Personality, value: string) => {
    if (field === 'avatarUrl') {
      console.log('更新头像URL, 长度:', value.length);
    }
    
    const updatedPersonalities = personalities.map((p) => 
      (p.id === personality.id ? { ...p, [field]: value } : p)
    );
    
    setPersonalities(updatedPersonalities);
    
    // 📝 记录本地修改，防止被云端同步覆盖
    recordLocalChange('personalities');
    
    // 💾 使用防抖保存，避免频繁保存
    if (accessToken) {
      debouncedInstantSave(accessToken, { personalities: updatedPersonalities }, {
        delay: 2000, // 2秒后保存
        trackChanges: ['personalities']
      });
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    // 检查文件大小，限制为2MB
    if (file.size > 2 * 1024 * 1024) {
      toast.error('图片大小不能超过2MB，请选择更小的图片');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      
      // 压缩图片
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
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
        ctx?.drawImage(img, 0, 0, width, height);
        
        // 转换为JPEG格式，质量0.8
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        // 详细的调试信息
        const sizeKB = (compressedDataUrl.length / 1024).toFixed(2);
        console.log('🖼️ 头像上传调试信息:');
        console.log(`  - 压缩后尺寸: ${width}x${height}`);
        console.log(`  - 数据大小: ${sizeKB} KB`);
        console.log(`  - URL总长度: ${compressedDataUrl.length}`);
        console.log(`  - URL前50字符:`, compressedDataUrl.substring(0, 50));
        console.log(`  - URL后50字符:`, compressedDataUrl.substring(compressedDataUrl.length - 50));
        console.log(`  - 是否以data:image/开头:`, compressedDataUrl.startsWith('data:image/'));
        
        // 验证URL完整性
        if (!compressedDataUrl.startsWith('data:image/')) {
          console.error('❌ 错误：生成的URL格式不正确！');
          toast.error('头像生成失败，请重试');
          return;
        }
        
        // 更新头像
        const updatedPersonalities = personalities.map((p) => 
          (p.id === personality.id ? { ...p, avatarUrl: compressedDataUrl } : p)
        );
        
        console.log('🖼️ 更新personalities数组:', {
          personalityId: personality.id,
          personalityName: personality.name,
          hasAvatarUrl: !!compressedDataUrl,
          avatarUrlLength: compressedDataUrl.length,
          updatedCount: updatedPersonalities.filter(p => p.id === personality.id).length,
          totalCount: updatedPersonalities.length
        });
        
        setPersonalities(updatedPersonalities);
        
        // 📝 记录本地修改（防止被云端覆盖）
        recordLocalChange('personalities');
        console.log('✅ 已记录本地修改: personalities');
        
        // 💾 头像上传后立即保存到云端（重要操作）
        if (accessToken) {
          console.log('💾 开始保存头像到云端...');
          instantSave(accessToken, { personalities: updatedPersonalities }, {
            showToast: true,
            toastMessage: `正在保存头像 (${sizeKB} KB)...`,
            trackChanges: ['personalities']
          }).then(result => {
            console.log('💾 保存头像结果:', result);
            if (result.success) {
              toast.success(`头像已保存！(${sizeKB} KB)`);
            } else {
              console.error('❌ 头像保存失败:', result.error);
              toast.error(`头像保存失败: ${result.error}`);
            }
          }).catch(error => {
            console.error('❌ 头像保存异常:', error);
            toast.error('头像保存失败，请重试');
          });
        } else {
          console.log('⚠️ 未登录，头像仅保存在本地');
          toast.success(`头像已更新！(${sizeKB} KB)`);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    const updatedPersonalities = personalities.map((p) => 
      (p.id === personality.id ? { ...p, avatarUrl: '' } : p)
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

  const presets = [
    {
      name: '温柔小雪',
      data: {
        name: '小雪',
        age: '22',
        appearance: '长发飘飘，温柔可人',
        traits: '善解人意、温柔体贴、聪明伶俐、有点害羞',
        experience: '在一所艺术大学学习音乐，喜欢弹钢琴和唱歌',
        likes: '喜欢古典音乐、喜欢在咖啡厅看书、喜欢散步',
      },
    },
    {
      name: '活力小樱',
      data: {
        name: '小樱',
        age: '20',
        appearance: '短发俏皮，充满活力',
        traits: '开朗阳光、古灵精怪、积极向上、充满好奇心',
        experience: '体育系学生，热爱运动和旅行，梦想环游世界',
        likes: '喜欢户外运动、喜欢尝试新鲜事物、喜欢拍照',
      },
    },
    {
      name: '知性雨欣',
      data: {
        name: '雨欣',
        age: '24',
        appearance: '戴着眼镜，气质优雅',
        traits: '理性睿智、温文尔雅、博学多才、成熟稳重',
        experience: '文学系研究生，喜欢读书和写作，对哲学和艺术有深刻见解',
        likes: '喜欢阅读经典文学、喜欢艺术展览、喜欢品茶',
      },
    },
  ];

  const loadPreset = (preset: typeof presets[0]) => {
    handleUpdate('name', preset.data.name);
    handleUpdate('age', preset.data.age);
    handleUpdate('appearance', preset.data.appearance);
    handleUpdate('traits', preset.data.traits);
    handleUpdate('experience', preset.data.experience);
    handleUpdate('likes', preset.data.likes);
    toast.success(`已加载预设：${preset.name}`);
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-pink-600 mb-1 md:mb-2">快速设定</h2>
          <p className="text-gray-600 text-xs md:text-sm hidden md:block">定制你的专属AI女友</p>
        </div>
        <Button onClick={handleSave} className="gap-1 md:gap-2 bg-[#07C160] hover:bg-[#06AD56] h-8 md:h-9 text-xs md:text-sm px-2 md:px-4 flex-shrink-0">
          <Save className="w-3 h-3 md:w-4 md:h-4" />
          <span className="hidden sm:inline">保存</span>
        </Button>
      </div>

      <div className="grid gap-4 md:gap-6">
        <Card>
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-pink-500" />
              快速预设
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">选择预设模板</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
              {presets.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  onClick={() => loadPreset(preset)}
                  className="h-auto py-3 flex flex-col items-center gap-1 hover:border-green-500 hover:bg-green-50"
                >
                  <span>{preset.name}</span>
                  <span className="text-xs text-gray-500">{preset.data.traits.split('、')[0]}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-base md:text-lg">基本信息</CardTitle>
            <CardDescription className="text-xs md:text-sm">设定基本资料</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            {/* 头像上传 */}
            <div className="space-y-2">
              <Label>头像</Label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 border-2 border-gray-200 rounded-full overflow-hidden">
                  <SafeAvatar
                    avatarUrl={personality.avatarUrl}
                    name={personality.name}
                    size="xl"
                    fallbackClassName="bg-gradient-to-br from-green-400 to-teal-500 text-white text-2xl"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      console.log('📸 文件选择触发', e.target.files);
                      handleAvatarUpload(e);
                    }}
                    onClick={(e) => {
                      console.log('📂 文件输入被点击');
                      // 清除之前的值，确保可以重复上传同一文件
                      (e.target as HTMLInputElement).value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('🔍 点击上传头像按钮');
                      console.log('📁 fileInputRef.current:', fileInputRef.current);
                      if (fileInputRef.current) {
                        console.log('✅ 触发文件选择');
                        toast.info('正在打开文件选择器...');
                        fileInputRef.current.click();
                      } else {
                        console.error('❌ fileInputRef.current 为空');
                        toast.error('文件选择器初始化失败，请刷新页面重试');
                      }
                    }}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    上传头像
                  </Button>
                  {personality.avatarUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={removeAvatar}
                      className="w-full text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4 mr-2" />
                      移除头像
                    </Button>
                  )}
                  <p className="text-xs text-gray-500">支持 JPG、PNG 格式</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">名字</Label>
                <Input
                  id="name"
                  value={personality.name}
                  onChange={(e) => handleUpdate('name', e.target.value)}
                  placeholder="例如：小雪"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">年龄</Label>
                <Input
                  id="age"
                  value={personality.age}
                  onChange={(e) => handleUpdate('age', e.target.value)}
                  placeholder="例如：22"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appearance">外貌特征</Label>
              <Input
                id="appearance"
                value={personality.appearance}
                onChange={(e) => handleUpdate('appearance', e.target.value)}
                placeholder="例如：长发飘飘，温柔可人"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-base md:text-lg">性格特征</CardTitle>
            <CardDescription className="text-xs md:text-sm">定义个性风格</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <div className="space-y-2">
              <Label htmlFor="traits">性格标签</Label>
              <Input
                id="traits"
                value={personality.traits}
                onChange={(e) => handleUpdate('traits', e.target.value)}
                placeholder="例如：善解人意、温柔体贴、聪明伶俐、有点害羞"
              />
              <p className="text-sm text-gray-500">用顿号（、）分隔多个性格特征</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience">经历背景</Label>
              <Textarea
                id="experience"
                value={personality.experience}
                onChange={(e) => handleUpdate('experience', e.target.value)}
                placeholder="例如：在一所艺术大学学习音乐，喜欢弹钢琴和唱歌..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="likes">喜好</Label>
              <Textarea
                id="likes"
                value={personality.likes}
                onChange={(e) => handleUpdate('likes', e.target.value)}
                placeholder="例如：喜欢购物、喜欢看浪漫的电影、喜欢甜食..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-pink-200 bg-pink-50">
          <CardHeader>
            <CardTitle className="text-pink-800">💝 温馨提示</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-pink-700 space-y-2">
            <p>• 性格设定会影响AI的回复风格和内容</p>
            <p>• 越详细的设定会让对话越自然和个性化</p>
            <p>• 所有设定会自动保存，下次打开时会自动加载</p>
            <p>• 可以随时修改性格设定，立即生效</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
