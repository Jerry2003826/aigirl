import { supabase } from './supabase/client';
import type { UserData } from './data-sync';
import { loadDataFromCloud } from './data-sync';

export type SyncCallback = (data: UserData) => void;

/**
 * 实时同步管理器
 * 使用 Supabase Realtime 和轮询相结合的策略
 */
export class RealtimeSyncManager {
  private accessToken: string;
  private userId: string;
  private syncCallback: SyncCallback;
  private pollInterval: NodeJS.Timeout | null = null;
  private realtimeChannel: any = null;
  private lastSyncTime: number = 0;
  private syncInProgress: boolean = false;
  private pollIntervalMs: number = 15000; // 默认15秒轮询一次
  
  constructor(
    accessToken: string,
    userId: string,
    syncCallback: SyncCallback,
    options?: { pollIntervalMs?: number }
  ) {
    this.accessToken = accessToken;
    this.userId = userId;
    this.syncCallback = syncCallback;
    if (options?.pollIntervalMs) {
      this.pollIntervalMs = options.pollIntervalMs;
    }
  }

  /**
   * 开始实时同步
   * 使用双重策略：
   * 1. Supabase Realtime 监听 KV 变化（更快）
   * 2. 定时轮询（兜底策略，防止 Realtime 失败）
   */
  start() {
    console.log('🔄 启动实时同步...');
    
    // 策略1: 尝试使用 Supabase Realtime
    this.startRealtimeListener();
    
    // 策略2: 启动轮询（兜底）
    this.startPolling();
  }

  /**
   * 停止实时同步
   */
  stop() {
    console.log('⏹️ 停止实时同步...');
    
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * 手动触发同步
   */
  async triggerSync() {
    await this.performSync('manual');
  }

  /**
   * 启动 Supabase Realtime 监听
   * 监听 KV store 的变化
   */
  private startRealtimeListener() {
    try {
      // 订阅 postgres 变化（监听 kv_store_4fd5d246 表）
      this.realtimeChannel = supabase
        .channel(`user-data-${this.userId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // 监听所有事件（INSERT, UPDATE, DELETE）
            schema: 'public',
            table: 'kv_store_4fd5d246',
            filter: `key=like.user_${this.userId}_%`
          },
          (payload) => {
            console.log('🔔 检测到数据变化（Realtime）:', payload);
            this.performSync('realtime');
          }
        )
        .subscribe((status) => {
          console.log('📡 Realtime 订阅状态:', status);
        });
      
      console.log('✅ Realtime 监听已启动');
    } catch (error) {
      console.error('❌ 启动 Realtime 监听失败:', error);
      console.log('⚠️ 将依赖轮询进行同步');
    }
  }

  /**
   * 启动轮询
   */
  private startPolling() {
    console.log(`🔄 启动轮询（每 ${this.pollIntervalMs / 1000} 秒）...`);
    
    this.pollInterval = setInterval(() => {
      this.performSync('polling');
    }, this.pollIntervalMs);
  }

  /**
   * 执行同步
   */
  private async performSync(source: 'realtime' | 'polling' | 'manual') {
    // 防止重复同步
    if (this.syncInProgress) {
      console.log(`⏳ 同步正在进行中，跳过本次${source}同步`);
      return;
    }

    // 防止过于频繁的同步（最少间隔3秒）
    const now = Date.now();
    if (now - this.lastSyncTime < 3000 && source !== 'manual') {
      console.log(`⏰ 同步间隔太短，跳过本次${source}同步`);
      return;
    }

    try {
      this.syncInProgress = true;
      console.log(`🔄 开始同步数据（来源：${source}）...`);
      
      // 🔑 在每次同步前，获取最新的 access token
      // 这样可以确保使用有效的 token，即使原始 token 已过期
      let currentAccessToken = this.accessToken;
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!sessionError && session?.access_token) {
          // 使用最新的 token
          currentAccessToken = session.access_token;
          
          // 如果 token 已更新，也更新保存的 token
          if (currentAccessToken !== this.accessToken) {
            console.log('🔑 Token 已更新，使用最新的 token 进行同步');
            this.accessToken = currentAccessToken;
          }
        } else if (sessionError) {
          console.warn('⚠️ 无法获取当前 session:', sessionError.message);
          // 仍然使用原始 token 尝试
        }
      } catch (sessionException) {
        console.warn('⚠️ 获取 session 时发生异常:', sessionException.message);
        // 仍然使用原始 token 尝试
      }
      
      const result = await loadDataFromCloud(currentAccessToken);
      
      if (result.success && result.data) {
        this.lastSyncTime = now;
        console.log('✅ 数据同步成功，更新本地状态');
        this.syncCallback(result.data);
      } else {
        // 检查是否是认证错误
        const isAuthError = result.error && 
          (result.error.includes('401') || 
           result.error.includes('Unauthorized') || 
           result.error.includes('Invalid JWT') ||
           result.error.includes('登录已过期'));
        
        if (isAuthError) {
          console.error('🔐 Token 认证失败，需要重新登录:', result.error);
          // 停止后台同步，避免重复的 401 错误
          if (source !== 'manual') {
            console.log('⏹️ 停止后台同步，等待用户重新登录');
            this.stop();
          }
        } else {
          // 静默失败，不要显示过多错误（特别是轮询的时候）
          if (source === 'manual') {
            console.error('❌ 数据同步失败:', result.error);
          } else {
            console.log('⚠️ 后台同步失败，将在下次重试:', result.error);
          }
        }
      }
    } catch (error) {
      // 静默失败，避免控制台太多错误
      if (source === 'manual') {
        console.error('❌ 同步过程出错:', error);
      } else {
        console.log('⚠️ 后台同步异常，将在下次重试');
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * 更新轮询间隔
   */
  updatePollInterval(intervalMs: number) {
    this.pollIntervalMs = intervalMs;
    
    // 重启轮询
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.startPolling();
    }
  }

  /**
   * 更新 access token
   * 当 token 被刷新时，外部可以调用此方法更新保存的 token
   */
  updateAccessToken(newToken: string) {
    if (newToken && newToken !== this.accessToken) {
      console.log('🔑 更新 RealtimeSyncManager 的 access token');
      this.accessToken = newToken;
    }
  }
}

/**
 * 创建实时同步管理器的便捷函数
 */
export function createRealtimeSync(
  accessToken: string,
  userId: string,
  syncCallback: SyncCallback,
  options?: { pollIntervalMs?: number }
): RealtimeSyncManager {
  return new RealtimeSyncManager(accessToken, userId, syncCallback, options);
}
