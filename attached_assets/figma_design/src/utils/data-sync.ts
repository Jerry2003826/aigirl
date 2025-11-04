import { projectId, publicAnonKey } from './supabase/info';
import { supabase } from './supabase/client';
import type { AIConfig, Personality, Chat, UserProfile } from '../App';

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-4fd5d246`;

/**
 * 获取当前有效的access token，如果token过期则自动刷新
 * 优化版本：快速模式直接返回当前token，避免额外的验证调用
 */
async function getValidAccessToken(currentToken: string, fastMode = false): Promise<string | null> {
  try {
    // 🚀 快速模式：直接返回当前token，不做验证
    if (fastMode && currentToken) {
      console.log('🚀 [getValidAccessToken] 快速模式：直接使用当前token');
      return currentToken;
    }
    
    console.log('🔐 [getValidAccessToken] 检查token有效性...', {
      hasCurrentToken: !!currentToken,
      currentTokenLength: currentToken?.length || 0,
      fastMode
    });
    
    // 获取当前会话（带超时保护 - 1秒超时）
    console.log('🔍 [getValidAccessToken] 调用 getSession...');
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('getSession timeout after 1s')), 1000)
    );
    
    const { data: { session }, error: sessionError } = await Promise.race([
      sessionPromise,
      timeoutPromise
    ]) as any;
    
    console.log('📦 [getValidAccessToken] getSession 返回:', { hasSession: !!session, hasError: !!sessionError });
    
    if (sessionError) {
      console.error('❌ 获取会话失败:', sessionError);
      // 不要尝试刷新，直接返回null
      // 刷新token可能已经不存在（用户已登出）
      return null;
    }
    
    if (!session) {
      console.error('❌ 没有活跃会话');
      // 不要尝试刷新，直接返回null
      // 如果没有session，说明用户未登录或已登出
      return null;
    }
    
    console.log('📊 Session信息:', {
      hasSession: !!session,
      hasAccessToken: !!session.access_token,
      tokenLength: session.access_token?.length || 0,
      expiresAt: session.expires_at,
      currentTime: Math.floor(Date.now() / 1000)
    });
    
    // 检查session中的token是否与传入的token匹配
    if (session.access_token !== currentToken) {
      console.warn('⚠️ Session token与传入token不匹配，使用session中的token');
    }
    
    // 检查token是否过期或即将过期
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at || 0;
    
    console.log('⏰ Token过期检查:', {
      now,
      expiresAt,
      timeUntilExpiry: expiresAt - now,
      isExpired: expiresAt > 0 && expiresAt <= now,
      willExpireSoon: expiresAt > 0 && expiresAt < now + 300 // 5分钟内过期
    });
    
    // 🔑 修改策略：如果 token 已过期或即将过期（10分钟内），立即刷新
    const needsRefresh = expiresAt > 0 && expiresAt < now + 600; // 10分钟内过期
    
    if (needsRefresh) {
      const isExpired = expiresAt <= now;
      console.log(`🔄 Token${isExpired ? '已过期' : '即将过期（10分钟内）'}，刷新中...`);
      
      try {
        const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          // 检查是否是因为refresh token不存在
          if (refreshError.message?.includes('Refresh Token') || refreshError.message?.includes('refresh_token')) {
            console.error('❌ Refresh token不存在或已失效，用户需要重新登录');
            return null;
          }
          
          console.error('❌ Token刷新失败:', refreshError);
          
          // 如果 token 已经过期，不能继续使用
          if (isExpired) {
            console.error('❌ Token已过期且刷新失败，无法继续');
            return null;
          }
          
          // 如果刷新失败但token还没完全过期，继续使用当前token
          console.warn('⚠️ 刷新失败，但token尚未过期，继续使用');
          return session.access_token;
        }
        
        if (!newSession) {
          console.error('❌ 刷新返回空session');
          
          // 如果 token 已经过期，不能继续使用
          if (isExpired) {
            console.error('❌ Token已过期且刷新返回空，无法继续');
            return null;
          }
          
          console.warn('⚠️ 刷新返回空，但token尚未过期，继续使用');
          return session.access_token;
        }
        
        console.log('✅ Token已刷新', {
          newTokenLength: newSession.access_token.length,
          newExpiresAt: newSession.expires_at,
          newTimeUntilExpiry: newSession.expires_at - now
        });
        return newSession.access_token;
      } catch (refreshException) {
        console.error('❌ 刷新token时发生异常:', refreshException);
        
        // 如果 token 已经过期，不能继续使用
        if (isExpired) {
          console.error('❌ Token已过期且刷新异常，无法继续');
          return null;
        }
        
        // 如果token尚未过期，继续使用
        console.warn('⚠️ 发生异常，但token尚未过期，继续使用');
        return session.access_token;
      }
    }
    
    // Token仍然有效（超过10分钟才过期）
    console.log('✅ Token仍然有效');
    return session.access_token;
  } catch (error) {
    // 如果是超时错误，并且有currentToken，则返回currentToken作为兜底
    if (error.message?.includes('timeout') && currentToken) {
      console.warn('⚠️ [getValidAccessToken] getSession超时，使用传入token作为兜底 (这是正常的备用方案)');
      return currentToken;
    }
    
    console.error('❌ [getValidAccessToken] 验证token失败:', {
      message: error.message,
      name: error.name
    });
    
    return null;
  }
}

export interface UserData {
  config: AIConfig;
  personalities: Personality[];
  chats: Chat[];
  groupChats?: any[]; // GroupChat type from App.tsx
  moments?: any[]; // Moment type from moments-manager.ts
  userProfile: UserProfile;
  darkMode: boolean;
  lastModified?: number; // 最后修改时间戳（毫秒）
  syncVersion?: number; // 同步版本号
}

/**
 * 保存用户数据到云端
 * @param accessToken - 访问令牌
 * @param data - 要保存的数据
 * @param options - 选项
 * @param options.fastMode - 是否使用快速模式（默认true，跳过token验证）
 * @param options.verifyToken - 是否验证token（默认false，除非fastMode为false）
 */
export async function saveDataToCloud(
  accessToken: string,
  data: Partial<UserData>,
  options?: { fastMode?: boolean; verifyToken?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!accessToken) {
      console.warn('⚠️ 尝试保存数据但没有 accessToken');
      return { success: false, error: '未登录' };
    }

    // 默认使用快速模式，除非明确要求验证token
    const useFastMode = options?.verifyToken === true ? false : (options?.fastMode !== false);
    
    console.log(`🔐 saveDataToCloud 使用${useFastMode ? '快速' : '验证'}模式`);
    
    // 验证并获取有效的token（默认快速模式）
    const validToken = await getValidAccessToken(accessToken, useFastMode);
    if (!validToken) {
      console.error('❌ 无法获取有效的access token');
      return { success: false, error: '登录已过期，请重新登录' };
    }

    // 添加时间戳和版本号
    const dataWithTimestamp = {
      ...data,
      lastModified: Date.now(),
      syncVersion: (data.syncVersion || 0) + 1
    };
    
    // 记录要保存的数据信息
    const dataSize = JSON.stringify(dataWithTimestamp).length;
    console.log('📤 准备保存数据到云端:', {
      size: `${(dataSize / 1024).toFixed(2)} KB`,
      hasConfig: !!data.config,
      personalitiesCount: data.personalities?.length || 0,
      chatsCount: data.chats?.length || 0,
      groupChatsCount: data.groupChats?.length || 0,
      hasUserProfile: !!data.userProfile,
      hasDarkMode: data.darkMode !== undefined,
      lastModified: new Date(dataWithTimestamp.lastModified).toISOString(),
      syncVersion: dataWithTimestamp.syncVersion
    });

    console.log('🔐 saveDataToCloud 开始:', {
      hasToken: !!validToken,
      tokenLength: validToken.length,
      tokenPreview: `${validToken.substring(0, 30)}...`,
      tokenChanged: validToken !== accessToken,
      url: `${API_BASE_URL}/data/save`
    });

    // 创建带超时的fetch请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
      const response = await fetch(`${API_BASE_URL}/data/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`
        },
        body: JSON.stringify(dataWithTimestamp),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      console.log('📡 Save response received:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      let result;
      try {
        result = await response.json();
        console.log('📦 Save response JSON:', result);
      } catch (jsonError) {
        console.error('❌ Failed to parse save response JSON:', jsonError);
        return { success: false, error: `Invalid JSON response (HTTP ${response.status})` };
      }

      if (!response.ok) {
        // 支持两种错误格式：
        // 1. {error: '...', details: '...'}  (我们的服务器格式)
        // 2. {code: 401, message: '...'}     (Supabase格式)
        const errorMessage = result.error || result.message || result.details || '保存失败';
        
        console.error('❌ 保存数据失败:', {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          code: result.code,
          details: result.details,
          url: `${API_BASE_URL}/data/save`,
          hasToken: !!accessToken,
          tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'none'
        });
        return { 
          success: false, 
          error: `${errorMessage} (HTTP ${response.status})`
        };
      }

      console.log('✅ 数据保存成功', {
        timestamp: new Date().toISOString()
      });
      return { success: true };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // 处理超时错误
      if (fetchError.name === 'AbortError') {
        console.error('❌ 保存请求超时（30秒）');
        return { success: false, error: '保存超时，请检查网络连接' };
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ 保存数据异常:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    // 更详细的错误信息
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return { success: false, error: '网络连接失败，请检查网络' };
    }
    
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时，请重试' };
    }
    
    return { success: false, error: `保存失败: ${error.message}` };
  }
}

/**
 * 智能合并本地和云端数据
 * 策略：比较时间戳和版本号，使用更新的数据
 */
export function mergeLocalAndCloudData(
  localData: Partial<UserData> | null,
  cloudData: UserData
): { data: UserData; source: 'cloud' | 'local' | 'merged'; reason: string } {
  // 如果没有本地数据，直接使用云端数据
  if (!localData) {
    return { 
      data: cloudData, 
      source: 'cloud', 
      reason: '无本地数据，使用云端数据' 
    };
  }

  // 如果云端数据没有时间戳，使用云端数据（兼容旧版本）
  if (!cloudData.lastModified) {
    console.log('⚠️ 云端数据无时间戳，直接使用云端数据');
    return { 
      data: cloudData, 
      source: 'cloud', 
      reason: '云端数据无时间戳（兼容模式）' 
    };
  }

  // 如果本地数据没有时间戳，使用云端数据
  if (!localData.lastModified) {
    console.log('⚠️ 本地数据无时间戳，使用云端数据');
    return { 
      data: cloudData, 
      source: 'cloud', 
      reason: '本地数据无时间戳' 
    };
  }

  // 比较时间戳
  const cloudTime = cloudData.lastModified;
  const localTime = localData.lastModified;
  const timeDiff = cloudTime - localTime;

  console.log('🔍 数据版本比较:', {
    cloudTime: new Date(cloudTime).toISOString(),
    localTime: new Date(localTime).toISOString(),
    timeDiff: `${timeDiff}ms (${(timeDiff / 1000).toFixed(1)}秒)`,
    cloudVersion: cloudData.syncVersion,
    localVersion: localData.syncVersion,
    cloudNewer: timeDiff > 0
  });

  // 如果时间差小于1秒，认为是同一版本（可能是网络延迟导致的微小差异）
  if (Math.abs(timeDiff) < 1000) {
    // 使用版本号判断
    const cloudVersion = cloudData.syncVersion || 0;
    const localVersion = localData.syncVersion || 0;
    
    if (cloudVersion > localVersion) {
      return { 
        data: cloudData, 
        source: 'cloud', 
        reason: `云端版本更新 (v${cloudVersion} > v${localVersion})` 
      };
    } else if (localVersion > cloudVersion) {
      return { 
        data: { ...cloudData, ...localData } as UserData, 
        source: 'local', 
        reason: `本地版本更新 (v${localVersion} > v${cloudVersion})` 
      };
    } else {
      return { 
        data: cloudData, 
        source: 'cloud', 
        reason: '版本号相同，使用云端数据' 
      };
    }
  }

  // 云端数据更新
  if (timeDiff > 0) {
    return { 
      data: cloudData, 
      source: 'cloud', 
      reason: `云端数据更新 (${(timeDiff / 1000).toFixed(1)}秒前)` 
    };
  }

  // 本地数据更新
  return { 
    data: { ...cloudData, ...localData } as UserData, 
    source: 'local', 
    reason: `本地数据更新 (${Math.abs(timeDiff / 1000).toFixed(1)}秒前)` 
  };
}

/**
 * 从云端加载用户数据
 */
export async function loadDataFromCloud(
  accessToken: string
): Promise<{ success: boolean; data?: UserData; error?: string }> {
  try {
    console.log('🚀 [loadDataFromCloud] 开始执行');
    
    if (!accessToken) {
      console.warn('⚠️ 尝试加载数据但没有 accessToken');
      return { success: false, error: '未登录' };
    }

    console.log('🔐 开始验证token（快速模式）...');
    // 验证并刷新 token（使用快速模式，避免超时）
    const validToken = await getValidAccessToken(accessToken, true);
    
    console.log('🔑 Token验证结果:', validToken ? '✅ 成功（快速模式）' : '❌ 失败');
    
    if (!validToken) {
      console.error('❌ 无法获取有效的access token');
      return { success: false, error: '登录已过期，请重新登录' };
    }

    console.log('🔐 loadDataFromCloud 开始:', {
      hasToken: !!validToken,
      tokenLength: validToken.length,
      tokenPreview: `${validToken.substring(0, 30)}...`,
      tokenChanged: validToken !== accessToken,
      url: `${API_BASE_URL}/data/load`
    });

    console.log('📡 发起fetch请求...');
    // 使用AbortController实现超时控制（30秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(`${API_BASE_URL}/data/load`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      console.log('📡 Response received:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      let result;
      try {
        result = await response.json();
        console.log('📦 Response JSON:', result);
      } catch (jsonError) {
        console.error('❌ Failed to parse response JSON:', jsonError);
        const text = await response.text();
        console.error('  Response text:', text.substring(0, 500));
        return { success: false, error: `Invalid JSON response (HTTP ${response.status})` };
      }

      if (!response.ok) {
        // 支持两种错误格式：
        // 1. {error: '...', details: '...'}  (我们的服务器格式)
        // 2. {code: 401, message: '...'}     (Supabase格式)
        const errorMessage = result.error || result.message || result.details || '加载失败';
        
        console.error('❌ 加载数据失败:', {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          code: result.code,
          details: result.details,
          url: `${API_BASE_URL}/data/load`,
          hasToken: !!accessToken,
          tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'none'
        });
        return { success: false, error: `${errorMessage} (HTTP ${response.status})` };
      }

      console.log('✅ 数据加载成功', {
        hasConfig: !!result.data?.config,
        personalitiesCount: result.data?.personalities?.length || 0,
        chatsCount: result.data?.chats?.length || 0
      });
      console.log('✅ [loadDataFromCloud] 成功完成，准备返回数据');
      return { success: true, data: result.data };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // 处理超时错误
      if (fetchError.name === 'AbortError') {
        console.error('❌ 加载请求超时（30秒）');
        return { success: false, error: '加载超时，请检查网络连接' };
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ [loadDataFromCloud] 加载数据异常:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    // 更详细的错误信息
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return { success: false, error: '网络连接失败，请检查网络' };
    }
    
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时，请重试' };
    }
    
    if (error.message?.includes('超时')) {
      return { success: false, error: '请求超时，请检查网络连接' };
    }
    
    return { success: false, error: `加载失败: ${error.message}` };
  }
}

/**
 * 从云端删除用户数据
 */
export async function deleteDataFromCloud(
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/data/delete`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('删除数据失败:', result.error);
      return { success: false, error: result.error || '删除失败' };
    }

    return { success: true };
  } catch (error) {
    console.error('删除数据错误:', error);
    return { success: false, error: '网络错误，删除失败' };
  }
}

/**
 * 清除所有旧的localStorage数据
 * 在迁移到Supabase后使用
 */
export function clearOldLocalStorage(): void {
  const keysToRemove = [
    'aiGirlfriendConfig',
    'aiGirlfriendPersonalities',
    'aiGirlfriendChats',
    'aiGirlfriendUserProfile',
    'aiGirlfriendDarkMode'
  ];
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
  
  console.log('已清除旧的localStorage数据');
}


