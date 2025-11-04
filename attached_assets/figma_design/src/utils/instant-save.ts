import { saveDataToCloud, type UserData } from './data-sync';
import { recordLocalChange, localChangeTracker, type DataType } from './local-change-tracker';
import { toast } from 'sonner@2.0.3';

/**
 * 立即保存数据到云端（带自动重试）
 * 用于重要的用户操作（如上传头像、修改配置）后立即同步
 */
export async function instantSave(
  accessToken: string,
  data: Partial<UserData>,
  options?: {
    showToast?: boolean; // 是否显示toast提示
    toastMessage?: string; // 自定义toast消息
    silent?: boolean; // 是否静默保存（不显示任何提示）
    trackChanges?: DataType[]; // 需要追踪的数据类型
    autoRetry?: boolean; // 是否自动重试（默认true）
    maxRetries?: number; // 最大重试次数（默认3次）
    immersiveMode?: boolean; // 是否处于沉浸模式（沉浸模式下不显示toast）
  }
): Promise<{ success: boolean; error?: string }> {
  const {
    showToast = false,
    toastMessage = '保存中...',
    silent = false,
    trackChanges = [],
    autoRetry = true,
    maxRetries = 3,
    immersiveMode = false
  } = options || {};
  
  // 🎯 沉浸模式下强制静默保存，不显示任何toast
  const effectiveSilent = silent || immersiveMode;
  const effectiveShowToast = showToast && !immersiveMode;
  
  // 记录本地修改
  if (trackChanges.length > 0) {
    trackChanges.forEach(type => recordLocalChange(type));
  }
  
  // 显示保存提示
  let toastId: string | number | undefined;
  if (effectiveShowToast && !effectiveSilent) {
    toastId = toast.loading(toastMessage);
    console.log('🔔 Toast loading created:', { toastId, toastMessage });
  }
  
  // 带重试的保存逻辑
  let lastError: string | undefined;
  for (let attempt = 0; attempt < (autoRetry ? maxRetries : 1); attempt++) {
    try {
      console.log('💾 立即保存数据到云端...', {
        dataTypes: Object.keys(data),
        trackChanges,
        attempt: attempt + 1,
        maxRetries: autoRetry ? maxRetries : 1,
        toastId
      });
      
      console.log('📞 Calling saveDataToCloud with fastMode...');
      const result = await saveDataToCloud(accessToken, data, { fastMode: true });
      console.log('📞 saveDataToCloud returned:', result);
      
      if (result.success) {
        console.log(`✅ 立即保存成功 (尝试 ${attempt + 1}/${autoRetry ? maxRetries : 1})`, {
          showToast,
          silent,
          toastId,
          willUpdateToast: showToast && !silent && toastId
        });
        
        // 🔓 保存成功后立即清除保护标记，允许云端同步覆盖
        if (trackChanges.length > 0) {
          trackChanges.forEach(type => {
            localChangeTracker.clearChange(type);
            console.log(`🔓 清除保护标记: ${type}`);
          });
        }
        
        if (effectiveShowToast && !effectiveSilent && toastId) {
          console.log('🔔 Updating toast to success:', { toastId });
          toast.success('保存成功', { id: toastId });
          console.log('🔔 Toast updated to success');
        }
        
        console.log('✅ Returning success result');
        return { success: true };
      } else {
        lastError = result.error;
        console.error(`❌ 立即保存失败 (尝试 ${attempt + 1}/${autoRetry ? maxRetries : 1}):`, result.error);
        
        // 如果不是最后一次尝试，等待后重试
        if (autoRetry && attempt < maxRetries - 1) {
          const retryDelay = 1000 * (attempt + 1); // 递增延迟：1s, 2s, 3s
          console.log(`🔄 ${retryDelay}ms 后重试保存...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // 最后一次尝试失败
        if (effectiveShowToast && !effectiveSilent && toastId) {
          toast.error(`保存失败: ${result.error}`, { id: toastId });
        }
        
        // ⚠️ 保存失败时保持保护标记，防止云端旧数据覆盖
        console.warn('⚠️ 保存失败，保持保护标记防止云端覆盖');
        
        return { success: false, error: result.error };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : '未知错误';
      console.error(`❌ 立即保存异常 (尝试 ${attempt + 1}/${autoRetry ? maxRetries : 1}):`, error);
      
      // 如果不是最后一次尝试，等待后重试
      if (autoRetry && attempt < maxRetries - 1) {
        const retryDelay = 1000 * (attempt + 1);
        console.log(`🔄 ${retryDelay}ms 后重试保存...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      // 最后一次尝试失败
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      
      if (effectiveShowToast && !effectiveSilent && toastId) {
        toast.error(`保存失败: ${errorMessage}`, { id: toastId });
      }
      
      // ⚠️ 保存失败时保持保护标记，防止云端旧数据覆盖
      console.warn('⚠️ 保存异常，保持保护标记防止云端覆盖');
      
      return { success: false, error: errorMessage };
    }
  }
  
  // 所有尝试都失败（这个分支理论上不应该被触发，因为上面的catch块已经返回了）
  console.warn('⚠️ 意外到达函数末尾，所有尝试都失败');
  if (showToast && !silent && toastId) {
    toast.error(`保存失败: ${lastError || '未知错误'}`, { id: toastId });
  }
  return { success: false, error: lastError || '保存失败' };
}

/**
 * 批量保存多个数据（带去重和合并）
 */
export async function batchInstantSave(
  accessToken: string,
  dataList: Array<{ data: Partial<UserData>; trackChanges?: DataType[] }>,
  options?: {
    showToast?: boolean;
    toastMessage?: string;
    silent?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  // 合并所有数据
  const mergedData: Partial<UserData> = {};
  const allTrackChanges: Set<DataType> = new Set();
  
  dataList.forEach(({ data, trackChanges = [] }) => {
    Object.assign(mergedData, data);
    trackChanges.forEach(type => allTrackChanges.add(type));
  });
  
  // 一次性保存
  return instantSave(accessToken, mergedData, {
    ...options,
    trackChanges: Array.from(allTrackChanges)
  });
}

/**
 * 带重试的立即保存
 */
export async function instantSaveWithRetry(
  accessToken: string,
  data: Partial<UserData>,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    showToast?: boolean;
    toastMessage?: string;
    trackChanges?: DataType[];
  }
): Promise<{ success: boolean; error?: string; retries: number }> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    ...saveOptions
  } = options || {};
  
  let lastError: string | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    const result = await instantSave(accessToken, data, {
      ...saveOptions,
      // 只在第一次尝试时显示toast
      showToast: i === 0 ? saveOptions.showToast : false
    });
    
    if (result.success) {
      return { success: true, retries: i };
    }
    
    lastError = result.error;
    
    // 如果不是最后一次重试，等待后重试
    if (i < maxRetries - 1) {
      console.log(`🔄 保存失败，${retryDelay}ms后重试... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  console.error(`❌ 保存失败，已重试${maxRetries}次`);
  return { success: false, error: lastError, retries: maxRetries };
}

/**
 * 防抖保存：避免频繁保存
 */
let debounceTimer: NodeJS.Timeout | null = null;
let pendingData: Partial<UserData> = {};
let pendingTrackChanges: Set<DataType> = new Set();
let lastAccessToken: string = ''; // 保存最后使用的token
let isSaving: boolean = false; // 🔒 防止重复保存的锁
let lastSavedDataHash: string = ''; // 🔍 上次保存的数据哈希，用于检测是否真的变化

/**
 * 计算数据的简单哈希（用于比较）
 */
function simpleHash(data: any): string {
  try {
    return JSON.stringify(data);
  } catch {
    return Math.random().toString();
  }
}

/**
 * 清除防抖保存
 */
export function cancelDebouncedSave(): void {
  if (debounceTimer) {
    console.log('🚫 取消防抖保存');
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingData = {};
  pendingTrackChanges.clear();
  isSaving = false;
}

export function debouncedInstantSave(
  accessToken: string,
  data: Partial<UserData>,
  options?: {
    delay?: number;
    showToast?: boolean;
    trackChanges?: DataType[];
    immersiveMode?: boolean;
  }
): void {
  const { delay = 1000, showToast = false, trackChanges = [], immersiveMode = false } = options || {};
  
  // 🔒 如果正在保存，忽略新的保存请求
  if (isSaving) {
    console.log('🔒 正在保存中，忽略新的保存请求');
    return;
  }
  
  // 🔑 更新token（但不重新触发保存）
  // 只有当有新的数据改变时才重新计时
  const hasNewData = Object.keys(data).length > 0;
  
  console.log('⏱️ [debouncedInstantSave] 调用:', {
    hasNewData,
    dataKeys: Object.keys(data),
    hasTimer: !!debounceTimer,
    tokenChanged: lastAccessToken !== accessToken,
    delay,
    isSaving
  });
  
  // 如果只是token更新，没有新数据，则不重置timer
  if (!hasNewData && debounceTimer) {
    console.log('🔑 Token更新但无新数据，保持现有防抖timer');
    lastAccessToken = accessToken;
    return;
  }
  
  // 如果没有新数据，直接返回
  if (!hasNewData) {
    console.log('⏭️ 没有新数据，跳过');
    return;
  }
  
  // 🔍 检测数据是否真的变化了
  const newDataHash = simpleHash(data);
  if (newDataHash === lastSavedDataHash && !debounceTimer) {
    console.log('🔍 数据内容未变化，跳过保存');
    return;
  }
  
  // 合并待保存的数据
  console.log('📝 合并新数据:', Object.keys(data));
  Object.assign(pendingData, data);
  trackChanges.forEach(type => pendingTrackChanges.add(type));
  
  // 更新token
  lastAccessToken = accessToken;
  
  // 清除之前的定时器
  if (debounceTimer) {
    console.log('⏰ 清除旧的防抖timer');
    clearTimeout(debounceTimer);
  }
  
  // 设置新的定时器
  console.log(`⏰ 设置新的防抖timer (${delay}ms)`);
  debounceTimer = setTimeout(async () => {
    // 🔒 设置保存锁
    isSaving = true;
    
    const dataToSave = { ...pendingData };
    const tracksToRecord = Array.from(pendingTrackChanges);
    const tokenToUse = lastAccessToken; // 使用保存的最新token
    
    console.log('💾 [debouncedInstantSave] Timer触发，开始保存:', {
      dataKeys: Object.keys(dataToSave),
      trackChanges: tracksToRecord
    });
    
    // 清空待保存数据
    pendingData = {};
    pendingTrackChanges.clear();
    debounceTimer = null;
    
    try {
      // 执行保存
      const result = await instantSave(tokenToUse, dataToSave, {
        showToast,
        silent: !showToast,
        trackChanges: tracksToRecord,
        immersiveMode
      });
      
      // 🔍 保存成功后更新哈希
      if (result.success) {
        lastSavedDataHash = simpleHash(dataToSave);
        console.log('🔍 更新上次保存的数据哈希');
      }
    } finally {
      // 🔓 释放保存锁
      isSaving = false;
      console.log('🔓 保存完成，释放锁');
    }
  }, delay);
}
