/**
 * Memory Deduplication Utility
 * 用于清理重复的记忆数据，确保每个记忆ID唯一
 */

import { Memory } from '../App';

/**
 * 去除重复的记忆
 * @param memories 记忆数组
 * @returns 去重后的记忆数组
 */
export function deduplicateMemories(memories: Memory[]): Memory[] {
  const seen = new Set<string>();
  const unique: Memory[] = [];
  
  for (const memory of memories) {
    if (!seen.has(memory.id)) {
      seen.add(memory.id);
      unique.push(memory);
    } else {
      console.warn(`⚠️ 跳过重复记忆 ID: ${memory.id}, 内容: ${memory.content.substring(0, 50)}...`);
    }
  }
  
  const duplicateCount = memories.length - unique.length;
  if (duplicateCount > 0) {
    console.log(`✨ 清理了 ${duplicateCount} 条重复记忆`);
  }
  
  return unique;
}

/**
 * 生成唯一的记忆ID
 * @param prefix ID前缀
 * @returns 唯一的ID字符串
 */
export function generateUniqueMemoryId(prefix: string = 'memory'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 修复所有记忆的ID，确保唯一性
 * @param memories 记忆数组
 * @returns 修复后的记忆数组
 */
export function fixDuplicateMemoryIds(memories: Memory[]): Memory[] {
  const seen = new Set<string>();
  const fixed: Memory[] = [];
  
  for (const memory of memories) {
    if (!seen.has(memory.id)) {
      seen.add(memory.id);
      fixed.push(memory);
    } else {
      // ID重复，生成新ID
      const newId = generateUniqueMemoryId('fixed');
      console.warn(`⚠️ 修复重复ID: ${memory.id} -> ${newId}`);
      fixed.push({
        ...memory,
        id: newId,
      });
      seen.add(newId);
    }
  }
  
  return fixed;
}
