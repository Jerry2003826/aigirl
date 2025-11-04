import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { toast } from 'sonner@2.0.3';
import { loadDataFromCloud, saveDataToCloud } from '../utils/data-sync';

interface RealtimeSyncTestProps {
  accessToken: string;
  userId: string;
  isConnected: boolean;
  getConnectionStatus: () => string;
  triggerFullSync: () => Promise<void>;
}

export function RealtimeSyncTest({
  accessToken,
  userId,
  isConnected,
  getConnectionStatus,
  triggerFullSync
}: RealtimeSyncTestProps) {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('unknown');

  // 定期更新连接状态
  useEffect(() => {
    const interval = setInterval(() => {
      setConnectionStatus(getConnectionStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, [getConnectionStatus]);

  const addResult = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    setTestResults(prev => [...prev, `[${timestamp}] ${prefix} ${message}`]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  // 测试1: 连接状态测试
  const testConnectionStatus = async () => {
    addResult('开始测试连接状态...');
    const status = getConnectionStatus();
    addResult(`当前连接状态: ${status}`, status === 'connected' ? 'success' : 'error');
    
    if (status !== 'connected') {
      addResult('连接未建立，请稍后重试', 'error');
      return false;
    }
    return true;
  };

  // 测试2: 数据读写测试
  const testDataReadWrite = async () => {
    addResult('开始测试数据读写...');
    
    try {
      // 写入测试数据
      const testData = {
        config: {
          model: 'test-model',
          temperature: 0.5,
          maxTokens: 1000,
          supportsVision: true,
          geminiApiKey: 'test-key',
          enableWebSearch: false,
          enableRAG: false
        }
      };
      
      addResult('正在写入测试数据...');
      const saveResult = await saveDataToCloud(accessToken, testData);
      
      if (!saveResult.success) {
        addResult(`写入失败: ${saveResult.error}`, 'error');
        return false;
      }
      
      addResult('写入成功', 'success');
      
      // 等待2秒让Realtime传播
      addResult('等待2秒以确保Realtime传播...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 读取数据验证
      addResult('正在读取数据验证...');
      const loadResult = await loadDataFromCloud(accessToken);
      
      if (!loadResult.success) {
        addResult(`读取失败: ${loadResult.error}`, 'error');
        return false;
      }
      
      if (loadResult.data?.config?.model === 'test-model') {
        addResult('数据验证成功', 'success');
        return true;
      } else {
        addResult('数据验证失败：读取的数据与写入的不一致', 'error');
        return false;
      }
    } catch (error) {
      addResult(`测试异常: ${error.message}`, 'error');
      return false;
    }
  };

  // 测试3: 完整同步测试
  const testFullSync = async () => {
    addResult('开始测试完整同步...');
    
    try {
      await triggerFullSync();
      addResult('完整同步执行成功', 'success');
      return true;
    } catch (error) {
      addResult(`完整同步失败: ${error.message}`, 'error');
      return false;
    }
  };

  // 测试4: 高频写入测试
  const testHighFrequencyWrites = async () => {
    addResult('开始测试高频写入（模拟快速发送多条消息）...');
    
    try {
      const writes = [];
      for (let i = 0; i < 5; i++) {
        writes.push(
          saveDataToCloud(accessToken, {
            config: {
              model: `test-${i}`,
              temperature: 0.5,
              maxTokens: 1000,
              supportsVision: true,
              geminiApiKey: 'test-key',
              enableWebSearch: false,
              enableRAG: false
            }
          })
        );
        addResult(`发起第 ${i + 1} 次写入...`);
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms间隔
      }
      
      const results = await Promise.all(writes);
      const allSuccess = results.every(r => r.success);
      
      if (allSuccess) {
        addResult('所有高频写入都成功', 'success');
        return true;
      } else {
        addResult('部分高频写入失败', 'error');
        return false;
      }
    } catch (error) {
      addResult(`高频写入测试异常: ${error.message}`, 'error');
      return false;
    }
  };

  // 运行所有测试
  const runAllTests = async () => {
    setIsTesting(true);
    clearResults();
    
    addResult('========== 开始实时同步测试 ==========');
    addResult(`用户ID: ${userId}`);
    addResult(`访问令牌: ${accessToken.substring(0, 20)}...`);
    addResult('');

    let passedCount = 0;
    let totalCount = 4;

    // 测试1
    addResult('--- 测试 1/4: 连接状态 ---');
    if (await testConnectionStatus()) passedCount++;
    addResult('');

    // 测试2
    addResult('--- 测试 2/4: 数据读写 ---');
    if (await testDataReadWrite()) passedCount++;
    addResult('');

    // 测试3
    addResult('--- 测试 3/4: 完整同步 ---');
    if (await testFullSync()) passedCount++;
    addResult('');

    // 测试4
    addResult('--- 测试 4/4: 高频写入 ---');
    if (await testHighFrequencyWrites()) passedCount++;
    addResult('');

    // 总结
    addResult('========== 测试完成 ==========');
    addResult(`通过: ${passedCount}/${totalCount}`, passedCount === totalCount ? 'success' : 'error');
    
    if (passedCount === totalCount) {
      toast.success('所有测试通过！实时同步工作正常');
    } else {
      toast.error(`${totalCount - passedCount} 个测试失败，请检查日志`);
    }

    setIsTesting(false);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>实时同步测试工具</span>
          <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
            {connectionStatus === 'connected' ? '已连接' : connectionStatus === 'connecting' ? '连接中' : '未连接'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 连接状态显示 */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div 
              className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`}
            />
            <span className="text-sm">
              {connectionStatus === 'connected' ? '实时同步已启用' :
               connectionStatus === 'connecting' ? '正在连接...' :
               '连接断开'}
            </span>
          </div>
        </div>

        <Separator />

        {/* 测试按钮 */}
        <div className="flex gap-2">
          <Button 
            onClick={runAllTests} 
            disabled={isTesting || !accessToken}
            className="flex-1"
          >
            {isTesting ? '测试中...' : '运行所有测试'}
          </Button>
          <Button 
            onClick={clearResults} 
            variant="outline"
            disabled={isTesting}
          >
            清空日志
          </Button>
        </div>

        {/* 单项测试按钮 */}
        <div className="grid grid-cols-2 gap-2">
          <Button 
            onClick={async () => {
              setIsTesting(true);
              await testConnectionStatus();
              setIsTesting(false);
            }} 
            variant="outline"
            size="sm"
            disabled={isTesting}
          >
            测试连接
          </Button>
          <Button 
            onClick={async () => {
              setIsTesting(true);
              await testDataReadWrite();
              setIsTesting(false);
            }} 
            variant="outline"
            size="sm"
            disabled={isTesting}
          >
            测试读写
          </Button>
          <Button 
            onClick={async () => {
              setIsTesting(true);
              await testFullSync();
              setIsTesting(false);
            }} 
            variant="outline"
            size="sm"
            disabled={isTesting}
          >
            测试同步
          </Button>
          <Button 
            onClick={async () => {
              setIsTesting(true);
              await testHighFrequencyWrites();
              setIsTesting(false);
            }} 
            variant="outline"
            size="sm"
            disabled={isTesting}
          >
            测试高频
          </Button>
        </div>

        <Separator />

        {/* 测试结果日志 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">测试日志</span>
            <span className="text-sm text-muted-foreground">
              {testResults.length} 条记录
            </span>
          </div>
          <div className="h-96 overflow-y-auto border rounded-md p-4 bg-muted/30 font-mono text-xs space-y-1">
            {testResults.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                点击"运行所有测试"开始测试
              </p>
            ) : (
              testResults.map((result, index) => (
                <div 
                  key={index}
                  className={`
                    ${result.includes('✅') ? 'text-green-600' : ''}
                    ${result.includes('❌') ? 'text-red-600' : ''}
                    ${result.includes('===') ? 'font-semibold mt-2' : ''}
                    ${result.includes('---') ? 'font-medium text-blue-600' : ''}
                  `}
                >
                  {result}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 使用说明 */}
        <div className="text-sm text-muted-foreground space-y-1 mt-4 p-3 bg-muted/50 rounded">
          <p className="font-medium mb-2">使用说明：</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>确保已登录并完成数据加载</li>
            <li>点击"运行所有测试"执行完整测试套件</li>
            <li>可以单独运行某个测试项</li>
            <li>在多个设备上同时运行测试以验证多端同步</li>
            <li>测试数据会写入真实数据库，测试后建议恢复原始设置</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
