import { Avatar, AvatarFallback } from './ui/avatar';
import { isValidAvatarUrl } from '../utils/avatar-helper';

interface SafeAvatarProps {
  avatarUrl?: string;
  name: string;
  className?: string;
  fallbackClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-20 h-20 text-2xl'
};

/**
 * 安全的头像组件，自动过滤无效的URL（如Figma资源路径）
 */
export function SafeAvatar({ avatarUrl, name, className, fallbackClassName, size = 'md' }: SafeAvatarProps) {
  const hasValidAvatar = isValidAvatarUrl(avatarUrl);
  const sizeClass = sizeClasses[size];
  
  // 调试日志（只在开发环境输出）
  if (process.env.NODE_ENV === 'development' && avatarUrl) {
    const urlPreview = avatarUrl.length > 50 ? `${avatarUrl.substring(0, 50)}...` : avatarUrl;
    console.log('🖼️ SafeAvatar渲染:', {
      name,
      hasValidAvatar,
      avatarUrlLength: avatarUrl?.length,
      avatarUrlPreview: urlPreview,
      startsWithDataImage: avatarUrl?.startsWith('data:image/')
    });
  }
  
  return (
    <Avatar className={className || sizeClass}>
      {hasValidAvatar ? (
        <img 
          src={avatarUrl} 
          alt={name} 
          className="w-full h-full object-cover"
          onLoad={() => {
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ 头像加载成功:', name);
            }
          }}
          onError={(e) => {
            console.error('❌ 头像加载失败:', name, {
              src: e.currentTarget.src?.substring(0, 100)
            });
            // 如果图片加载失败，隐藏img标签，让fallback显示
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <AvatarFallback className={fallbackClassName || "bg-gradient-to-br from-green-400 to-teal-500 text-white"}>
          {name?.[0] || '?'}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
