import { useEffect } from 'react';
import { Personality } from '../App';

interface AvatarDebuggerProps {
  personalities: Personality[];
}

export function AvatarDebugger({ personalities }: AvatarDebuggerProps) {
  useEffect(() => {
    console.log('=== 头像调试信息 ===');
    console.log('时间:', new Date().toLocaleString());
    let hasValidAvatars = 0;
    let hasInvalidAvatars = 0;
    let hasNoAvatars = 0;
    
    personalities.forEach((p, index) => {
      console.log(`\n角色 ${index}: ${p.name}`);
      if (p.avatarUrl) {
        const isDataUrl = p.avatarUrl.startsWith('data:image/');
        const isHttpUrl = p.avatarUrl.startsWith('http');
        const isValid = isDataUrl || isHttpUrl;
        
        if (isValid) {
          hasValidAvatars++;
          console.log('✅ 头像有效:', {
            type: isDataUrl ? 'Base64 Data URL' : 'HTTP URL',
            length: p.avatarUrl.length,
            sizeKB: (p.avatarUrl.length / 1024).toFixed(2) + ' KB',
            prefix: p.avatarUrl.substring(0, 50) + '...',
            suffix: '...' + p.avatarUrl.substring(Math.max(0, p.avatarUrl.length - 30))
          });
        } else {
          hasInvalidAvatars++;
          console.error('❌ 头像无效:', {
            length: p.avatarUrl.length,
            prefix: p.avatarUrl.substring(0, 50),
            startsWithDataImage: p.avatarUrl.startsWith('data:image/'),
            startsWithHttp: p.avatarUrl.startsWith('http'),
            提示: '此头像将被清理'
          });
        }
      } else {
        hasNoAvatars++;
        console.log('⚪ 未设置头像 (将显示首字母)');
      }
    });
    
    console.log('\n📊 统计:', {
      总数: personalities.length,
      有效头像: hasValidAvatars,
      无效头像: hasInvalidAvatars,
      无头像: hasNoAvatars
    });
    
    if (hasInvalidAvatars > 0) {
      console.warn('⚠️ 警告: 发现无效头像，数据迁移时将被清理');
      console.log('💡 提示: 请查看 AVATAR_PERSISTENCE_DEBUG.md 了解如何调试');
    }
    
    console.log('===================\n');
  }, [personalities]);

  return null;
}
