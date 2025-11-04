import type { UserData } from './data-sync';

/**
 * 导出用户数据为JSON文件
 */
export function exportDataToFile(data: UserData, filename?: string): void {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `ai-girlfriend-backup-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('数据已导出到文件');
  } catch (error) {
    console.error('导出数据失败:', error);
    throw new Error('导出数据失败');
  }
}

/**
 * 从JSON文件导入用户数据
 */
export function importDataFromFile(): Promise<UserData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    
    input.onchange = async (e) => {
      try {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          reject(new Error('未选择文件'));
          return;
        }
        
        const text = await file.text();
        const data = JSON.parse(text) as UserData;
        
        // 验证数据结构
        if (!data.config || !data.personalities || !data.chats) {
          reject(new Error('无效的数据格式'));
          return;
        }
        
        console.log('数据已从文件导入');
        resolve(data);
      } catch (error) {
        console.error('导入数据失败:', error);
        reject(new Error('导入数据失败，请确保文件格式正确'));
      }
    };
    
    input.click();
  });
}

/**
 * 复制数据到剪贴板
 */
export async function copyDataToClipboard(data: UserData): Promise<void> {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(jsonStr);
    console.log('数据已复制到剪贴板');
  } catch (error) {
    console.error('复制数据失败:', error);
    throw new Error('复制数据失败');
  }
}

/**
 * 从剪贴板粘贴数据
 */
export async function pasteDataFromClipboard(): Promise<UserData> {
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text) as UserData;
    
    // 验证数据结构
    if (!data.config || !data.personalities || !data.chats) {
      throw new Error('无效的数据格式');
    }
    
    console.log('数据已从剪贴板导入');
    return data;
  } catch (error) {
    console.error('从剪贴板粘贴数据失败:', error);
    throw new Error('从剪贴板粘贴数据失败，请确保数据格式正确');
  }
}
