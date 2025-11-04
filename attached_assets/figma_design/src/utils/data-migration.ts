import { Personality, UserProfile } from '../App';
import { isValidAvatarUrl } from './avatar-helper';

/**
 * 清理无效的头像URL（例如Figma资源路径）
 */
export function cleanInvalidAvatarUrls(personalities?: Personality[]): Personality[] | undefined {
  if (!personalities || !Array.isArray(personalities)) {
    return personalities;
  }
  
  let cleaned = false;
  
  const cleanedPersonalities = personalities.map(p => {
    if (p.avatarUrl && !isValidAvatarUrl(p.avatarUrl)) {
      console.log(`🔧 检测到无效头像URL，准备清理 ${p.name}:`);
      console.log(`  - URL长度: ${p.avatarUrl.length}`);
      console.log(`  - URL前50字符:`, p.avatarUrl.substring(0, 50));
      console.log(`  - URL后50字符:`, p.avatarUrl.substring(Math.max(0, p.avatarUrl.length - 50)));
      console.log(`  - 是否以data:image/开头:`, p.avatarUrl.startsWith('data:image/'));
      console.log(`  - 是否以http开头:`, p.avatarUrl.startsWith('http'));
      cleaned = true;
      return { ...p, avatarUrl: '' };
    }
    // 如果有有效的头像，记录一下
    if (p.avatarUrl) {
      console.log(`✅ ${p.name} 的头像URL有效: ${(p.avatarUrl.length / 1024).toFixed(2)} KB`);
    }
    return p;
  });
  
  if (cleaned) {
    console.log('⚠️ 已自动清理无效的头像URL');
  } else {
    console.log('✅ 所有头像URL都有效，无需清理');
  }
  
  return cleanedPersonalities;
}

/**
 * 清理用户配置中的无效头像URL
 */
export function cleanUserProfileAvatar(userProfile?: UserProfile): UserProfile | undefined {
  if (!userProfile) {
    return userProfile;
  }
  
  if (userProfile.avatarUrl && !isValidAvatarUrl(userProfile.avatarUrl)) {
    console.log('🔧 自动清理用户头像的无效URL');
    return { ...userProfile, avatarUrl: '' };
  }
  return userProfile;
}

/**
 * 运行所有数据迁移
 */
export function runDataMigrations(data: {
  personalities?: Personality[];
  userProfile?: UserProfile;
}): {
  personalities?: Personality[];
  userProfile?: UserProfile;
} {
  console.log('🔄 开始数据迁移检查...', {
    hasPersonalities: !!data.personalities,
    personalitiesIsArray: Array.isArray(data.personalities),
    personalitiesLength: Array.isArray(data.personalities) ? data.personalities.length : 'N/A',
    hasUserProfile: !!data.userProfile
  });
  
  const result: {
    personalities?: Personality[];
    userProfile?: UserProfile;
  } = {};
  
  if (data.personalities) {
    result.personalities = cleanInvalidAvatarUrls(data.personalities);
  }
  
  if (data.userProfile) {
    result.userProfile = cleanUserProfileAvatar(data.userProfile);
  }
  
  console.log('✅ 数据迁移检查完成', {
    hasPersonalities: !!result.personalities,
    personalitiesIsArray: Array.isArray(result.personalities),
    hasUserProfile: !!result.userProfile
  });
  
  return result;
}
