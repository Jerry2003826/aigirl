import { useEffect, useRef, useCallback } from 'react';
import {
  EnhancedRealtimeSyncManager,
  createEnhancedRealtimeSync,
  type SyncEvent,
  type EventHandler,
  mergeMessages,
  mergeGroupMessages,
  updateChatInList,
  updateGroupChatInList
} from './enhanced-realtime-sync';
import { loadDataFromCloud } from './data-sync';
import type { Chat, GroupChat, Personality, AIConfig, Message, GroupMessage, UserProfile } from '../App';

export interface RealtimeSyncCallbacks {
  onMessageCreated?: (personalityId: string, message: Message) => void;
  onChatUpdated?: (chats: Chat[]) => void;
  onGroupMessageCreated?: (groupId: string, message: GroupMessage) => void;
  onGroupChatCreated?: (groupChat: GroupChat) => void;
  onGroupChatUpdated?: (groupChats: GroupChat[]) => void;
  onGroupChatDeleted?: (groupId: string) => void;
  onPersonalityCreated?: (personality: Personality) => void;
  onPersonalityUpdated?: (personalities: Personality[]) => void;
  onPersonalityDeleted?: (personalityId: string) => void;
  onConfigUpdated?: (config: AIConfig) => void;
  onUserProfileUpdated?: (profile: UserProfile) => void;
  onFullSync?: () => Promise<void>;
  onConnectionStatusChange?: (status: 'connected' | 'connecting' | 'disconnected') => void;
}

/**
 * 实时同步 Hook
 * 简化在 React 组件中使用实时同步的过程
 */
export function useRealtimeSync(
  accessToken: string | null,
  userId: string | null,
  callbacks: RealtimeSyncCallbacks,
  options?: {
    enabled?: boolean; // 是否启用实时同步
    autoReconnect?: boolean; // 是否自动重连
  }
) {
  const syncManagerRef = useRef<EnhancedRealtimeSyncManager | null>(null);
  const callbacksRef = useRef(callbacks);
  const isEnabledRef = useRef(options?.enabled !== false);

  // 更新 callbacks ref
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // 启动和停止同步管理器
  useEffect(() => {
    if (!accessToken || !userId || !isEnabledRef.current) {
      return;
    }

    console.log('🎯 初始化实时同步管理器...');

    // 创建同步管理器
    const syncManager = createEnhancedRealtimeSync(accessToken, userId);
    syncManagerRef.current = syncManager;

    // 注册事件处理器
    setupEventHandlers(syncManager, callbacksRef);

    // 启动同步
    syncManager.start();

    // 清理函数
    return () => {
      console.log('🧹 清理实时同步管理器...');
      syncManager.stop();
      syncManagerRef.current = null;
    };
  }, [accessToken, userId]);

  // 手动触发完整同步
  const triggerFullSync = useCallback(async () => {
    if (callbacksRef.current.onFullSync) {
      await callbacksRef.current.onFullSync();
    }
  }, []);

  // 获取连接状态
  const getConnectionStatus = useCallback(() => {
    return syncManagerRef.current?.getConnectionStatus() || 'disconnected';
  }, []);

  return {
    triggerFullSync,
    getConnectionStatus,
    isConnected: syncManagerRef.current?.getConnectionStatus() === 'connected'
  };
}

/**
 * 设置事件处理器
 */
function setupEventHandlers(
  syncManager: EnhancedRealtimeSyncManager,
  callbacksRef: React.MutableRefObject<RealtimeSyncCallbacks>
) {
  // 聊天消息更新
  syncManager.on('chat:updated', (event: SyncEvent) => {
    console.log('💬 聊天更新事件:', event.payload);
    if (callbacksRef.current.onChatUpdated && Array.isArray(event.payload)) {
      callbacksRef.current.onChatUpdated(event.payload);
    }
  });

  // 群聊消息创建
  syncManager.on('group_message:created', (event: SyncEvent) => {
    console.log('👥 群聊消息创建:', event.payload);
    if (callbacksRef.current.onGroupMessageCreated && event.payload) {
      const { groupId, message } = event.payload;
      callbacksRef.current.onGroupMessageCreated(groupId, message);
    }
  });

  // 群聊创建
  syncManager.on('group_chat:created', (event: SyncEvent) => {
    console.log('🆕 群聊创建:', event.payload);
    if (callbacksRef.current.onGroupChatCreated && event.payload) {
      callbacksRef.current.onGroupChatCreated(event.payload);
    }
  });

  // 群聊更新
  syncManager.on('group_chat:updated', (event: SyncEvent) => {
    console.log('🔄 群聊更新:', event.payload);
    if (callbacksRef.current.onGroupChatUpdated && Array.isArray(event.payload)) {
      callbacksRef.current.onGroupChatUpdated(event.payload);
    }
  });

  // 群聊删除
  syncManager.on('group_chat:deleted', (event: SyncEvent) => {
    console.log('🗑️ 群聊删除:', event.payload);
    if (callbacksRef.current.onGroupChatDeleted && event.payload) {
      callbacksRef.current.onGroupChatDeleted(event.payload.id);
    }
  });

  // AI角色创建
  syncManager.on('personality:created', (event: SyncEvent) => {
    console.log('🎭 角色创建:', event.payload);
    if (callbacksRef.current.onPersonalityCreated && event.payload) {
      callbacksRef.current.onPersonalityCreated(event.payload);
    }
  });

  // AI角色更新
  syncManager.on('personality:updated', (event: SyncEvent) => {
    console.log('🎭 角色更新:', event.payload);
    if (callbacksRef.current.onPersonalityUpdated && Array.isArray(event.payload)) {
      callbacksRef.current.onPersonalityUpdated(event.payload);
    }
  });

  // AI角色删除
  syncManager.on('personality:deleted', (event: SyncEvent) => {
    console.log('🗑️ 角色删除:', event.payload);
    if (callbacksRef.current.onPersonalityDeleted && event.payload) {
      callbacksRef.current.onPersonalityDeleted(event.payload.id);
    }
  });

  // 配置更新
  syncManager.on('config:updated', (event: SyncEvent) => {
    console.log('⚙️ 配置更新:', event.payload);
    if (callbacksRef.current.onConfigUpdated && event.payload) {
      callbacksRef.current.onConfigUpdated(event.payload);
    }
  });

  // 用户资料更新
  syncManager.on('user_profile:updated', (event: SyncEvent) => {
    console.log('👤 用户资料更新:', event.payload);
    if (callbacksRef.current.onUserProfileUpdated && event.payload) {
      callbacksRef.current.onUserProfileUpdated(event.payload);
    }
  });

  // 完整同步
  syncManager.on('full_sync', async (event: SyncEvent) => {
    console.log('🔄 触发完整同步');
    if (callbacksRef.current.onFullSync) {
      await callbacksRef.current.onFullSync();
    }
  });
}

/**
 * 智能合并策略：合并远程数据和本地数据
 * 用于处理冲突和保持数据一致性
 */
export function smartMerge<T extends { id: string }>(
  local: T[],
  remote: T[],
  compareField?: keyof T
): T[] {
  const merged = new Map<string, T>();

  // 先添加本地数据
  local.forEach(item => merged.set(item.id, item));

  // 用远程数据更新（远程数据优先）
  remote.forEach(item => {
    const existing = merged.get(item.id);
    if (!existing) {
      // 新数据，直接添加
      merged.set(item.id, item);
    } else if (compareField) {
      // 使用比较字段决定保留哪个版本
      const existingValue = existing[compareField];
      const remoteValue = item[compareField];
      
      // 假设compareField是时间戳，保留最新的
      if (typeof existingValue === 'number' && typeof remoteValue === 'number') {
        if (remoteValue > existingValue) {
          merged.set(item.id, item);
        }
      } else {
        // 默认使用远程数据
        merged.set(item.id, item);
      }
    } else {
      // 没有比较字段，使用远程数据
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
}
