import type { Personality, Chat } from '../App';

export interface DataConsistencyFix {
  fixedChats: Chat[];
  fixedCurrentId: string;
  wasFixed: boolean;
  issues: string[];
}

/**
 * 强制修复数据一致性问题
 * 这个函数会立即修复所有数据不一致问题
 */
export function forceFixDataConsistency(
  personalities: Personality[],
  chats: Chat[],
  currentPersonalityId: string
): DataConsistencyFix {
  const issues: string[] = [];
  let wasFixed = false;

  console.log('🔧 开始强制修复数据一致性...');
  console.log('  当前状态:', {
    personalities: personalities.length,
    chats: chats.length,
    currentPersonalityId,
    personalityIds: personalities.map(p => p.id),
    chatIds: chats.map(c => c.personalityId)
  });

  if (personalities.length === 0) {
    console.warn('⚠️ 没有任何 personalities，无法修复');
    return {
      fixedChats: chats,
      fixedCurrentId: currentPersonalityId,
      wasFixed: false,
      issues: ['没有任何角色数据']
    };
  }

  const personalityIds = personalities.map(p => p.id);
  const chatIds = chats.map(c => c.personalityId);

  // 1. 检查并移除孤立的 chats（没有对应 personality）
  const orphanedChatIds = chatIds.filter(id => !personalityIds.includes(id));
  let fixedChats = chats;

  if (orphanedChatIds.length > 0) {
    console.log('🔧 自动修复：移除孤立的聊天记录:', orphanedChatIds);
    issues.push(`移除 ${orphanedChatIds.length} 个无效聊天记录`);
    fixedChats = chats.filter(c => personalityIds.includes(c.personalityId));
    wasFixed = true;
    console.log('✅ 已移除', orphanedChatIds.length, '个孤立聊天记录');
  }

  // 2. 检查并创建缺失的 chats（有 personality 但无 chat）
  const existingChatIds = fixedChats.map(c => c.personalityId);
  const missingChatIds = personalityIds.filter(id => !existingChatIds.includes(id));

  if (missingChatIds.length > 0) {
    console.log('🔧 自动修复：为以下角色创建聊天记录:', missingChatIds);
    issues.push(`为 ${missingChatIds.length} 个角色创建聊天记录`);
    
    const newChats = personalities
      .filter(p => missingChatIds.includes(p.id))
      .map(p => ({
        personalityId: p.id,
        messages: [],
        lastMessageTime: Date.now(),
        unreadCount: 0
      }));
    
    fixedChats = [...fixedChats, ...newChats];
    wasFixed = true;
    console.log('✅ 已创建', newChats.length, '个聊天记录');
  }

  // 3. 检查并修复 currentPersonalityId
  let fixedCurrentId = currentPersonalityId;
  
  if (!personalityIds.includes(currentPersonalityId)) {
    const oldId = currentPersonalityId;
    fixedCurrentId = personalities[0].id;
    console.log('🔧 自动修复：当前选中ID无效，已切换到首个角色');
    console.log('  无效ID:', oldId, '→ 新ID:', fixedCurrentId);
    issues.push('切换到有效角色');
    wasFixed = true;
  }

  // 4. 清理 localStorage 中的无效 ID
  if (wasFixed) {
    try {
      localStorage.removeItem('aiGirlfriendCurrentPersonalityId');
      localStorage.setItem('aiGirlfriendCurrentPersonalityId', fixedCurrentId);
      console.log('✅ 已清理 localStorage 中的无效 ID');
    } catch (e) {
      console.warn('⚠️ 清理 localStorage 失败:', e);
    }
  }

  if (wasFixed) {
    console.log('✅ 数据一致性修复完成！');
    console.log('  修复后状态:', {
      chats: fixedChats.length,
      chatIds: fixedChats.map(c => c.personalityId),
      currentPersonalityId: fixedCurrentId
    });
    console.log('  修复的问题:', issues);
  } else {
    console.log('✅ 数据一致性检查通过，无需修复');
  }

  return {
    fixedChats,
    fixedCurrentId,
    wasFixed,
    issues
  };
}

/**
 * 检查数据是否一致（只检查不修复）
 */
export function checkDataConsistency(
  personalities: Personality[],
  chats: Chat[],
  currentPersonalityId: string
): { isConsistent: boolean; issues: string[] } {
  const issues: string[] = [];

  if (personalities.length === 0) {
    return { isConsistent: true, issues: [] };
  }

  const personalityIds = personalities.map(p => p.id);
  const chatIds = chats.map(c => c.personalityId);

  // 检查孤立的 chats
  const orphanedChatIds = chatIds.filter(id => !personalityIds.includes(id));
  if (orphanedChatIds.length > 0) {
    issues.push(`以下 chat 没有对应的 personality: [${orphanedChatIds.join(', ')}]`);
  }

  // 检查缺失的 chats
  const missingChatIds = personalityIds.filter(id => !chatIds.includes(id));
  if (missingChatIds.length > 0) {
    issues.push(`以下 personality 缺少对应的 chat: [${missingChatIds.join(', ')}]`);
  }

  // 检查 currentPersonalityId
  if (!personalityIds.includes(currentPersonalityId)) {
    issues.push(`currentPersonalityId 无效: "${currentPersonalityId}", 可用ID: [${personalityIds.join(', ')}]`);
  }

  return {
    isConsistent: issues.length === 0,
    issues
  };
}
