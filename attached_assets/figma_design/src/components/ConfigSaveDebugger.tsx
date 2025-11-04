import { useEffect, useRef } from 'react';
import { AIConfig } from '../App';

interface ConfigSaveDebuggerProps {
  config: AIConfig;
}

/**
 * 配置保存调试器
 * 用于追踪 config 的变化和保存操作
 */
export function ConfigSaveDebugger({ config }: ConfigSaveDebuggerProps) {
  const renderCount = useRef(0);
  const lastConfig = useRef<AIConfig | null>(null);
  const configChangeLog = useRef<Array<{ time: Date; field: string; oldValue: any; newValue: any }>>([]);

  useEffect(() => {
    renderCount.current += 1;
    
    if (!lastConfig.current) {
      console.log('🔍 [ConfigSaveDebugger] Initial render', { config });
      lastConfig.current = config;
      return;
    }

    // 检测哪些字段变化了
    const changes: string[] = [];
    Object.keys(config).forEach((key) => {
      const typedKey = key as keyof AIConfig;
      if (config[typedKey] !== lastConfig.current![typedKey]) {
        changes.push(key);
        configChangeLog.current.push({
          time: new Date(),
          field: key,
          oldValue: lastConfig.current![typedKey],
          newValue: config[typedKey]
        });
      }
    });

    if (changes.length > 0) {
      console.log('🔍 [ConfigSaveDebugger] Config changed', {
        renderCount: renderCount.current,
        changes,
        details: changes.map(key => ({
          field: key,
          old: lastConfig.current![key as keyof AIConfig],
          new: config[key as keyof AIConfig]
        }))
      });

      // 如果变化频繁，显示警告
      if (renderCount.current > 20) {
        console.warn('⚠️ [ConfigSaveDebugger] 频繁的 config 更新！', {
          renderCount: renderCount.current,
          recentChanges: configChangeLog.current.slice(-10)
        });
      }
    }

    lastConfig.current = config;
  }, [config]);

  return null; // 这是一个无UI的调试组件
}
