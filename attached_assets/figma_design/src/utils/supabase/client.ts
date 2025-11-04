import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

// 检查localStorage是否可用（带超时保护）
function isStorageAvailable() {
  try {
    // 使用超时保护，如果100ms内没有响应就认为不可用
    const startTime = Date.now();
    const test = '__storage_test__';
    
    localStorage.setItem(test, test);
    
    // 检查是否超时
    if (Date.now() - startTime > 100) {
      console.warn('⚠️ localStorage响应缓慢，判定为不可用');
      return false;
    }
    
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.warn('⚠️ localStorage不可用，将使用内存会话:', e);
    return false;
  }
}

// 创建单例Supabase客户端，避免多个实例警告
let supabaseClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!supabaseClient) {
    const storageAvailable = isStorageAvailable();
    console.log('🔧 初始化Supabase客户端:', {
      projectId,
      storageAvailable,
      url: `https://${projectId}.supabase.co`
    });
    
    supabaseClient = createClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      {
        auth: {
          persistSession: storageAvailable, // 只有在storage可用时才持久化
          autoRefreshToken: true,
          detectSessionInUrl: true, // OAuth需要这个
          flowType: 'pkce', // 使用更安全的PKCE流程
          storage: storageAvailable ? undefined : {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
          },
          // 添加 debug 模式以查看更多信息
          debug: false,
          // 设置 token 刷新的阈值（提前5分钟刷新）
          storageKey: 'supabase.auth.token',
        },
        global: {
          headers: {
            'x-client-info': 'supabase-js-web'
          }
        }
      }
    );
    
    console.log('✅ Supabase客户端已初始化');
  }
  return supabaseClient;
}

// 导出单例实例
export const supabase = getSupabaseClient();
