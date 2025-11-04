// 辅助函数：获取实际要使用的模型名称
import { AIConfig } from '../App';

export function getActualModel(config: AIConfig): string {
  // 如果选择了custom模型且提供了自定义模型名称，使用自定义模型
  if (config.model === 'custom' && config.customModel) {
    return config.customModel;
  }
  // 否则使用配置中的model
  return config.model;
}
