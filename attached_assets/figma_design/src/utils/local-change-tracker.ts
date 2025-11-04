/**
 * 本地修改追踪器
 * 用于追踪本地数据的修改时间，防止云端同步覆盖最新的本地更改
 */

export type DataType = 'config' | 'personalities' | 'chats' | 'groupChats' | 'userProfile' | 'darkMode';

/**
 * 本地修改追踪管理器
 */
class LocalChangeTracker {
  private lastModifiedTimes: Map<DataType, number> = new Map();
  private protectionWindowMs: number = 90000; // 90秒保护窗口（必须大于轮询间隔）
  
  /**
   * 记录数据修改
   */
  recordChange(dataType: DataType): void {
    const now = Date.now();
    this.lastModifiedTimes.set(dataType, now);
    console.log(`📝 记录本地修改: ${dataType} @ ${new Date(now).toLocaleTimeString()}`);
  }
  
  /**
   * 批量记录多个数据类型的修改
   */
  recordChanges(dataTypes: DataType[]): void {
    const now = Date.now();
    dataTypes.forEach(type => {
      this.lastModifiedTimes.set(type, now);
    });
    console.log(`📝 批量记录本地修改: ${dataTypes.join(', ')} @ ${new Date(now).toLocaleTimeString()}`);
  }
  
  /**
   * 检查是否应该接受云端数据
   * @param dataType 数据类型
   * @returns true表示可以接受云端数据，false表示应该保留本地数据
   */
  shouldAcceptCloudData(dataType: DataType): boolean {
    const lastModified = this.lastModifiedTimes.get(dataType);
    
    if (!lastModified) {
      // 没有本地修改记录，可以接受云端数据
      return true;
    }
    
    const timeSinceModification = Date.now() - lastModified;
    
    if (timeSinceModification < this.protectionWindowMs) {
      // 在保护窗口内，拒绝云端数据
      console.log(`🔒 拒绝云端同步（${dataType}）: 本地在 ${(timeSinceModification / 1000).toFixed(1)}s 前修改过`);
      return false;
    }
    
    // 超出保护窗口，可以接受云端数据
    return true;
  }
  
  /**
   * 批量检查多个数据类型
   * @returns 返回应该接受的数据类型列表
   */
  getAcceptableTypes(dataTypes: DataType[]): DataType[] {
    return dataTypes.filter(type => this.shouldAcceptCloudData(type));
  }
  
  /**
   * 获取最后修改时间
   */
  getLastModifiedTime(dataType: DataType): number | undefined {
    return this.lastModifiedTimes.get(dataType);
  }
  
  /**
   * 清除特定类型的修改记录
   */
  clearChange(dataType: DataType): void {
    this.lastModifiedTimes.delete(dataType);
    console.log(`🧹 清除修改记录: ${dataType}`);
  }
  
  /**
   * 清除所有修改记录
   */
  clearAll(): void {
    this.lastModifiedTimes.clear();
    console.log('🧹 清除所有修改记录');
  }
  
  /**
   * 设置保护窗口时长
   */
  setProtectionWindow(ms: number): void {
    this.protectionWindowMs = ms;
    console.log(`⏱️ 设置保护窗口: ${ms}ms`);
  }
  
  /**
   * 获取所有修改记录（用于调试）
   */
  getAllChanges(): Record<string, string> {
    const result: Record<string, string> = {};
    this.lastModifiedTimes.forEach((time, type) => {
      const timeAgo = Date.now() - time;
      result[type] = `${(timeAgo / 1000).toFixed(1)}s ago`;
    });
    return result;
  }
}

// 导出单例
export const localChangeTracker = new LocalChangeTracker();

/**
 * 便捷函数：记录修改
 */
export function recordLocalChange(dataType: DataType): void {
  localChangeTracker.recordChange(dataType);
}

/**
 * 便捷函数：批量记录修改
 */
export function recordLocalChanges(dataTypes: DataType[]): void {
  localChangeTracker.recordChanges(dataTypes);
}

/**
 * 便捷函数：检查是否应该接受云端数据
 */
export function shouldAcceptCloudData(dataType: DataType): boolean {
  return localChangeTracker.shouldAcceptCloudData(dataType);
}

/**
 * 便捷函数：获取可以接受的数据类型
 */
export function getAcceptableCloudDataTypes(dataTypes: DataType[]): DataType[] {
  return localChangeTracker.getAcceptableTypes(dataTypes);
}
