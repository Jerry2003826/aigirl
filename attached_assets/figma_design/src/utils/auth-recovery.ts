// 认证恢复工具 - 处理 refresh token 错误和认证失效

import { supabase } from './supabase/client';

/**
 * 清除所有认证相关的存储数据
 */
export function clearAuthStorage() {
  console.log('🧹 清除认证存储...');
  
  try {
    // 清除 Supabase 认证数据
    const keys = Object.keys(localStorage);
    const authKeys = keys.filter(key => 
      key.startsWith('supabase.auth') || 
      key.includes('sb-') ||
      key.includes('auth-token')
    );
    
    authKeys.forEach(key => {
      console.log('🗑️ 移除:', key);
      localStorage.removeItem(key);
    });
    
    // 清除 session storage
    sessionStorage.clear();
    
    console.log('✅ 认证存储已清除');
    return true;
  } catch (error) {
    console.error('❌ 清除认证存储失败:', error);
    return false;
  }
}

/**
 * 检查当前认证状态是否健康
 */
export async function checkAuthHealth(): Promise<{
  isHealthy: boolean;
  session: any;
  error?: string;
}> {
  try {
    console.log('🔍 检查认证健康状态...');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ 认证健康检查失败:', error);
      
      // 检查是否是 refresh token 错误
      if (error.message.includes('refresh_token') || 
          error.message.includes('invalid_grant') ||
          error.message.includes('400')) {
        return {
          isHealthy: false,
          session: null,
          error: 'refresh_token_expired'
        };
      }
      
      return {
        isHealthy: false,
        session: null,
        error: error.message
      };
    }
    
    if (!session) {
      console.log('ℹ️ 无活跃session');
      return {
        isHealthy: false,
        session: null,
        error: 'no_session'
      };
    }
    
    // 检查 token 过期时间
    if (session.expires_at) {
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      
      if (expiresAt <= now) {
        console.warn('⚠️ Token已过期');
        return {
          isHealthy: false,
          session: null,
          error: 'token_expired'
        };
      }
      
      const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000 / 60;
      console.log(`✅ 认证健康，token还有${minutesUntilExpiry.toFixed(1)}分钟过期`);
    }
    
    return {
      isHealthy: true,
      session
    };
  } catch (err) {
    console.error('❌ 认证健康检查异常:', err);
    return {
      isHealthy: false,
      session: null,
      error: err instanceof Error ? err.message : 'unknown_error'
    };
  }
}

/**
 * 尝试恢复认证状态
 */
export async function attemptAuthRecovery(): Promise<{
  success: boolean;
  action: 'recovered' | 'refresh_needed' | 'relogin_required';
  message: string;
}> {
  console.log('🔧 尝试恢复认证状态...');
  
  // 1. 检查当前状态
  const health = await checkAuthHealth();
  
  if (health.isHealthy) {
    return {
      success: true,
      action: 'recovered',
      message: '认证状态正常'
    };
  }
  
  // 2. 如果是 refresh token 错误，尝试刷新
  if (health.error === 'refresh_token_expired' || health.error === 'token_expired') {
    console.log('🔄 尝试刷新token...');
    
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('❌ Token刷新失败:', error);
        
        // 刷新失败，需要重新登录
        clearAuthStorage();
        return {
          success: false,
          action: 'relogin_required',
          message: '登录已过期，请重新登录'
        };
      }
      
      if (data.session) {
        console.log('✅ Token刷新成功');
        return {
          success: true,
          action: 'refresh_needed',
          message: '认证已恢复'
        };
      }
    } catch (err) {
      console.error('❌ Token刷新异常:', err);
    }
  }
  
  // 3. 其他错误，清除存储并要求重新登录
  clearAuthStorage();
  return {
    success: false,
    action: 'relogin_required',
    message: '认证失效，请重新登录'
  };
}

/**
 * 安全登出（清除所有认证数据）
 */
export async function safeSignOut() {
  console.log('👋 执行安全登出...');
  
  try {
    // 1. 调用 Supabase 登出
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.warn('⚠️ Supabase登出失败（可能已登出）:', error);
    }
    
    // 2. 清除本地存储（即使 signOut 失败也要清除）
    clearAuthStorage();
    
    console.log('✅ 安全登出完成');
    return { success: true };
  } catch (err) {
    console.error('❌ 登出异常:', err);
    
    // 异常时也要清除存储
    clearAuthStorage();
    
    return { success: false, error: err };
  }
}

/**
 * 处理 refresh token 错误的统一入口
 */
export async function handleRefreshTokenError(): Promise<void> {
  console.error('🚨 检测到 Refresh Token 错误');
  
  // 1. 清除认证存储
  clearAuthStorage();
  
  // 2. 延迟一小段时间后刷新页面（让用户看到提示）
  setTimeout(() => {
    console.log('🔄 刷新页面以重新开始...');
    window.location.reload();
  }, 2000);
}
