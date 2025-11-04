import { supabase } from './supabase/client';
import type { UserData } from './data-sync';
import type { Message, GroupMessage, Chat, GroupChat, Personality, AIConfig } from '../App';

/**
 * 实时同步事件类型
 */
export type SyncEventType =
  // 消息相关
  | 'message:created'
  | 'message:updated'
  | 'message:deleted'
  // 群聊消息相关
  | 'group_message:created'
  | 'group_message:updated'
  | 'group_message:deleted'
  // 会话相关
  | 'chat:updated'
  | 'chat:unread_cleared'
  // 群聊相关
  | 'group_chat:created'
  | 'group_chat:updated'
  | 'group_chat:deleted'
  | 'group_chat:unread_cleared'
  // AI角色相关
  | 'personality:created'
  | 'personality:updated'
  | 'personality:deleted'
  // 配置相关
  | 'config:updated'
  // 用户资料相关
  | 'user_profile:updated'
  // 完整同步（兜底）
  | 'full_sync';

/**
 * 同步事件数据结构
 */
export interface SyncEvent {
  type: SyncEventType;
  timestamp: number;
  payload: any;
}

/**
 * 事件处理器类型
 */
export type EventHandler = (event: SyncEvent) => void | Promise<void>;

/**
 * 增强版实时同步管理器
 * 使用事件驱动架构，支持增量更新和细粒度同步
 */
export class EnhancedRealtimeSyncManager {
  private accessToken: string;
  private userId: string;
  private realtimeChannel: any = null;
  private eventHandlers: Map<SyncEventType, EventHandler[]> = new Map();
  private eventQueue: SyncEvent[] = [];
  private isProcessingQueue: boolean = false;
  private lastSyncTimestamp: number = 0;
  private connectionStatus: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
  
  constructor(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    this.userId = userId;
  }

  /**
   * 注册事件处理器
   */
  on(eventType: SyncEventType, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  /**
   * 移除事件处理器
   */
  off(eventType: SyncEventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   */
  private emit(event: SyncEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers && handlers.length > 0) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`处理事件 ${event.type} 时出错:`, error);
        }
      });
    }
  }

  /**
   * 启动实时同步
   */
  async start(): Promise<void> {
    console.log('🚀 启动增强版实时同步系统...');
    
    this.connectionStatus = 'connecting';
    
    try {
      // 设置 Supabase Realtime 监听
      await this.setupRealtimeListener();
      
      console.log('✅ 实时同步系统启动成功');
      this.connectionStatus = 'connected';
    } catch (error) {
      console.error('❌ 启动实时同步失败:', error);
      this.connectionStatus = 'disconnected';
      
      // 30秒后重试
      setTimeout(() => {
        if (this.connectionStatus === 'disconnected') {
          console.log('🔄 尝试重新连接...');
          this.start();
        }
      }, 30000);
    }
  }

  /**
   * 停止实时同步
   */
  stop(): void {
    console.log('⏹️ 停止实时同步...');
    
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    
    this.connectionStatus = 'disconnected';
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): string {
    return this.connectionStatus;
  }

  /**
   * 设置 Realtime 监听器
   */
  private async setupRealtimeListener(): Promise<void> {
    // 创建唯一的channel名称
    const channelName = `user-sync-${this.userId}-${Date.now()}`;
    
    this.realtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kv_store_4fd5d246',
          filter: `key=like.user_${this.userId}_%`
        },
        (payload) => {
          console.log('🔔 检测到数据库变化:', {
            event: payload.eventType,
            table: payload.table,
            key: payload.new?.key || payload.old?.key
          });
          
          this.handleDatabaseChange(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime订阅状态:', status);
        
        if (status === 'SUBSCRIBED') {
          this.connectionStatus = 'connected';
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.connectionStatus = 'disconnected';
          // 尝试重新连接
          setTimeout(() => this.reconnect(), 5000);
        }
      });
  }

  /**
   * 重新连接
   */
  private async reconnect(): Promise<void> {
    console.log('🔄 尝试重新连接实时同步...');
    
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    
    await this.start();
  }

  /**
   * 处理数据库变化
   */
  private handleDatabaseChange(payload: any): void {
    const key = payload.new?.key || payload.old?.key;
    
    if (!key) return;

    // 解析key确定数据类型
    const keyParts = key.split('_');
    const dataType = keyParts[keyParts.length - 1]; // 最后一部分是数据类型
    
    console.log('📊 数据变化类型:', dataType, '| 操作:', payload.eventType);

    // 根据数据类型和操作类型创建相应的事件
    const timestamp = Date.now();
    
    switch (dataType) {
      case 'chats':
        this.queueEvent({
          type: 'chat:updated',
          timestamp,
          payload: payload.new?.value
        });
        break;
      case 'groupChats':
        if (payload.eventType === 'INSERT') {
          this.queueEvent({
            type: 'group_chat:created',
            timestamp,
            payload: payload.new?.value
          });
        } else if (payload.eventType === 'UPDATE') {
          this.queueEvent({
            type: 'group_chat:updated',
            timestamp,
            payload: payload.new?.value
          });
        } else if (payload.eventType === 'DELETE') {
          this.queueEvent({
            type: 'group_chat:deleted',
            timestamp,
            payload: payload.old?.value
          });
        }
        break;
      case 'personalities':
        if (payload.eventType === 'INSERT') {
          this.queueEvent({
            type: 'personality:created',
            timestamp,
            payload: payload.new?.value
          });
        } else if (payload.eventType === 'UPDATE') {
          this.queueEvent({
            type: 'personality:updated',
            timestamp,
            payload: payload.new?.value
          });
        } else if (payload.eventType === 'DELETE') {
          this.queueEvent({
            type: 'personality:deleted',
            timestamp,
            payload: payload.old?.value
          });
        }
        break;
      case 'config':
        this.queueEvent({
          type: 'config:updated',
          timestamp,
          payload: payload.new?.value
        });
        break;
      case 'userProfile':
        this.queueEvent({
          type: 'user_profile:updated',
          timestamp,
          payload: payload.new?.value
        });
        break;
      default:
        // 未识别的类型，触发完整同步
        console.log('⚠️ 未识别的数据类型，触发完整同步');
        this.queueEvent({
          type: 'full_sync',
          timestamp,
          payload: null
        });
    }
  }

  /**
   * 将事件加入队列
   */
  private queueEvent(event: SyncEvent): void {
    // 检查是否是重复事件（时间戳在1秒内的相同类型事件）
    const isDuplicate = this.eventQueue.some(
      e => e.type === event.type && Math.abs(e.timestamp - event.timestamp) < 1000
    );
    
    if (isDuplicate) {
      console.log('⏭️ 跳过重复事件:', event.type);
      return;
    }
    
    this.eventQueue.push(event);
    this.processEventQueue();
  }

  /**
   * 处理事件队列
   */
  private async processEventQueue(): Promise<void> {
    if (this.isProcessingQueue || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      
      // 更新最后同步时间戳
      if (event.timestamp > this.lastSyncTimestamp) {
        this.lastSyncTimestamp = event.timestamp;
      }
      
      console.log('⚡ 处理同步事件:', event.type);
      
      try {
        this.emit(event);
        
        // 小延迟避免过于频繁的更新
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('❌ 处理事件时出错:', error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 获取最后同步时间戳
   */
  getLastSyncTimestamp(): number {
    return this.lastSyncTimestamp;
  }
}

/**
 * 创建增强版实时同步管理器
 */
export function createEnhancedRealtimeSync(
  accessToken: string,
  userId: string
): EnhancedRealtimeSyncManager {
  return new EnhancedRealtimeSyncManager(accessToken, userId);
}

/**
 * 辅助函数：合并消息数组（基于ID去重，保留最新的）
 */
export function mergeMessages(
  existing: Message[],
  incoming: Message[]
): Message[] {
  const messageMap = new Map<string, Message>();
  
  // 先添加现有消息
  existing.forEach(msg => messageMap.set(msg.id, msg));
  
  // 用新消息覆盖（新消息优先）
  incoming.forEach(msg => messageMap.set(msg.id, msg));
  
  // 转回数组并按时间戳排序
  return Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 辅助函数：合并群聊消息数组
 */
export function mergeGroupMessages(
  existing: GroupMessage[],
  incoming: GroupMessage[]
): GroupMessage[] {
  const messageMap = new Map<string, GroupMessage>();
  
  existing.forEach(msg => messageMap.set(msg.id, msg));
  incoming.forEach(msg => messageMap.set(msg.id, msg));
  
  return Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 辅助函数：更新聊天列表中的某个聊天
 */
export function updateChatInList(
  chats: Chat[],
  personalityId: string,
  updater: (chat: Chat) => Chat
): Chat[] {
  const index = chats.findIndex(c => c.personalityId === personalityId);
  
  if (index === -1) {
    // 聊天不存在，创建新的
    const newChat: Chat = {
      personalityId,
      messages: [],
      lastMessageTime: Date.now(),
      unreadCount: 0
    };
    return [...chats, updater(newChat)];
  }
  
  // 更新现有聊天
  const newChats = [...chats];
  newChats[index] = updater(chats[index]);
  return newChats;
}

/**
 * 辅助函数：更新群聊列表中的某个群聊
 */
export function updateGroupChatInList(
  groupChats: GroupChat[],
  groupId: string,
  updater: (groupChat: GroupChat) => GroupChat
): GroupChat[] {
  const index = groupChats.findIndex(g => g.id === groupId);
  
  if (index === -1) {
    console.warn('⚠️ 群聊不存在，无法更新:', groupId);
    return groupChats;
  }
  
  const newGroupChats = [...groupChats];
  newGroupChats[index] = updater(groupChats[index]);
  return newGroupChats;
}
