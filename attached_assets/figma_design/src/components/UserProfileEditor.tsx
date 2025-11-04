import { useState, useRef, useEffect } from 'react';
import { UserProfile } from '../App';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { instantSave } from '../utils/instant-save';
import { recordLocalChange } from '../utils/local-change-tracker';

interface UserProfileEditorProps {
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  accessToken?: string; // 用于立即保存到云端
}

export function UserProfileEditor({ userProfile, setUserProfile, accessToken }: UserProfileEditorProps) {
  const [editedProfile, setEditedProfile] = useState<UserProfile>(userProfile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 当userProfile从外部更新时，同步到editedProfile
  // 但要检查是否有本地未保存的更改，避免覆盖
  useEffect(() => {
    // 只有当editedProfile和userProfile完全相同时才更新
    // 这样可以避免在用户编辑时被外部更新覆盖
    if (JSON.stringify(editedProfile) === JSON.stringify(userProfile)) {
      return;
    }
    
    // 如果外部的userProfile有更新（比如从云端加载），且本地没有未保存的更改
    // 那么更新editedProfile
    const hasLocalChanges = 
      editedProfile.nickname !== userProfile.nickname ||
      editedProfile.avatarUrl !== userProfile.avatarUrl;
    
    if (!hasLocalChanges) {
      console.log('🔄 UserProfileEditor: 同步外部userProfile到editedProfile');
      setEditedProfile(userProfile);
    } else {
      console.log('⚠️ UserProfileEditor: 检测到本地未保存的更改，不同步外部更新');
    }
  }, [userProfile]);

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
    reader.onload = (event) => {
      const result = event.target?.result as string;
      
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
        
        // 立即更新本地状态
        const newProfile = { ...editedProfile, avatarUrl: compressedDataUrl };
        setEditedProfile(newProfile);
        
        // 🔥 关键修复：立即保存到主应用状态
        setUserProfile(newProfile);
        
        // 📝 记录本地修改，防止被云端同步覆盖
        recordLocalChange('userProfile');
        
        console.log('✅ 头像已上传并立即保存', {
          avatarSize: (compressedDataUrl.length / 1024).toFixed(2) + ' KB'
        });
        
        // 💾 立即保存到云端
        if (accessToken) {
          instantSave(accessToken, { userProfile: newProfile }, {
            showToast: false, // 不显示额外toast，避免重复
            silent: true,
            trackChanges: ['userProfile']
          }).then(result => {
            if (result.success) {
              console.log('✅ 头像已立即保存到云端');
              toast.success('头像已上传并保存！');
            } else {
              console.error('❌ 头像保存到云端失败:', result.error);
              toast.warning('头像已上传，但云端保存失败。数据将在下次同步时保存。');
            }
          });
        } else {
          toast.success('头像已上传！');
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    const newProfile = { ...editedProfile, avatarUrl: '' };
    setEditedProfile(newProfile);
    
    // 立即保存到主应用状态
    setUserProfile(newProfile);
    
    // 📝 记录本地修改
    recordLocalChange('userProfile');
    
    console.log('✅ 头像已删除并立即保存');
    
    // 💾 立即保存到云端
    if (accessToken) {
      instantSave(accessToken, { userProfile: newProfile }, {
        showToast: false,
        silent: true,
        trackChanges: ['userProfile']
      }).then(result => {
        if (result.success) {
          console.log('✅ 头像删除已保存到云端');
          toast.success('头像已删除');
        } else {
          toast.warning('头像已删除，但云端保存失败');
        }
      });
    } else {
      toast.success('头像已删除');
    }
  };

  const handleSave = () => {
    if (!editedProfile.nickname.trim()) {
      toast.error('昵称不能为空');
      return;
    }
    
    setUserProfile(editedProfile);
    
    // 📝 记录本地修改
    recordLocalChange('userProfile');
    
    // 💾 立即保存到云端
    if (accessToken) {
      instantSave(accessToken, { userProfile: editedProfile }, {
        showToast: true,
        toastMessage: '保存个人资料中...',
        trackChanges: ['userProfile']
      });
    } else {
      toast.success('个人资料已保存');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Avatar className="w-24 h-24">
                {editedProfile.avatarUrl ? (
                  <img src={editedProfile.avatarUrl} alt={editedProfile.nickname} className="w-full h-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-500 text-white text-3xl">
                    {editedProfile.nickname?.[0] || '我'}
                  </AvatarFallback>
                )}
              </Avatar>
              {editedProfile.avatarUrl && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                  onClick={removeAvatar}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                console.log('📸 文件选择触发（用户资料）', e.target.files);
                handleAvatarUpload(e);
              }}
              onClick={(e) => {
                console.log('📂 文件输入被点击（用户资料）');
                // 清除之前的值，确保可以重复上传同一文件
                (e.target as HTMLInputElement).value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔍 点击上传头像按钮（用户资料）');
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
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              上传头像
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">昵称</Label>
            <Input
              id="nickname"
              value={editedProfile.nickname}
              onChange={(e) => setEditedProfile({ ...editedProfile, nickname: e.target.value })}
              placeholder="输入你的昵称"
            />
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1 bg-primary hover:bg-primary/90">
          保存
        </Button>
      </div>
    </div>
  );
}
