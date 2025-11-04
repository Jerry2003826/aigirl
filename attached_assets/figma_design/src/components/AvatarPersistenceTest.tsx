import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { toast } from 'sonner@2.0.3';
import { Check, X, AlertTriangle, RefreshCw, Upload } from 'lucide-react';

interface AvatarPersistenceTestProps {
  personalities: any[];
  onClose: () => void;
}

export function AvatarPersistenceTest({ personalities, onClose }: AvatarPersistenceTestProps) {
  const [testResults, setTestResults] = useState<Array<{ test: string; status: 'pass' | 'fail' | 'warning'; message: string }>>([]);
  const [testing, setTesting] = useState(false);

  const runTests = () => {
    setTesting(true);
    const results: Array<{ test: string; status: 'pass' | 'fail' | 'warning'; message: string }> = [];

    // 测试1：检查Personalities数据结构
    results.push({
      test: '数据结构检查',
      status: Array.isArray(personalities) && personalities.length > 0 ? 'pass' : 'fail',
      message: Array.isArray(personalities) 
        ? `找到 ${personalities.length} 个角色` 
        : '角色数据不是数组或为空'
    });

    // 测试2：检查每个personality的avatarUrl
    personalities.forEach((p, i) => {
      if (p.avatarUrl) {
        const isValid = p.avatarUrl.startsWith('data:image/') || p.avatarUrl.startsWith('http');
        const sizeKB = (p.avatarUrl.length / 1024).toFixed(2);
        
        results.push({
          test: `${p.name} 头像检查`,
          status: isValid ? 'pass' : 'fail',
          message: isValid 
            ? `头像有效 (${sizeKB} KB, 前缀: ${p.avatarUrl.substring(0, 30)}...)` 
            : `头像无效 (前缀: ${p.avatarUrl.substring(0, 30)}...)`
        });

        // 测试图片是否能加载
        if (isValid && p.avatarUrl.startsWith('data:image/')) {
          const img = new Image();
          img.onload = () => {
            console.log(`✅ ${p.name} 的头像可以正常加载`);
          };
          img.onerror = () => {
            console.error(`❌ ${p.name} 的头像无法加载，数据可能已损坏`);
            results.push({
              test: `${p.name} 头像加载测试`,
              status: 'fail',
              message: '头像数据已损坏，无法加载为图片'
            });
            setTestResults([...results]);
          };
          img.src = p.avatarUrl;
        }
      } else {
        results.push({
          test: `${p.name} 头像检查`,
          status: 'warning',
          message: '未设置头像'
        });
      }
    });

    // 测试3：检查localStorage备份
    const backup = localStorage.getItem('aiGirlfriend_backup');
    if (backup) {
      try {
        const backupData = JSON.parse(backup);
        const backupSize = (backup.length / 1024).toFixed(2);
        results.push({
          test: '本地备份检查',
          status: 'pass',
          message: `找到本地备份 (${backupSize} KB, 时间: ${new Date(backupData.timestamp).toLocaleString()})`
        });
      } catch (e) {
        results.push({
          test: '本地备份检查',
          status: 'fail',
          message: '本地备份存在但解析失败'
        });
      }
    } else {
      results.push({
        test: '本地备份检查',
        status: 'warning',
        message: '未找到本地备份'
      });
    }

    // 测试4：检查数据大小
    const totalDataSize = JSON.stringify({ personalities }).length;
    const totalSizeKB = (totalDataSize / 1024).toFixed(2);
    const totalSizeMB = (totalDataSize / 1024 / 1024).toFixed(2);
    
    results.push({
      test: '数据大小检查',
      status: totalDataSize > 1024 * 1024 ? 'warning' : 'pass',
      message: `总数据大小: ${totalSizeKB} KB (${totalSizeMB} MB)${totalDataSize > 1024 * 1024 ? ' - 数据可能过大' : ''}`
    });

    setTestResults(results);
    setTesting(false);
  };

  useEffect(() => {
    runTests();
  }, [personalities]);

  const getStatusIcon = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return <Check className="w-5 h-5 text-green-500" />;
      case 'fail':
        return <X className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return 'text-green-700 bg-green-50';
      case 'fail':
        return 'text-red-700 bg-red-50';
      case 'warning':
        return 'text-amber-700 bg-amber-50';
    }
  };

  const handleExportDebugInfo = () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      personalities: personalities.map(p => ({
        id: p.id,
        name: p.name,
        hasAvatar: !!p.avatarUrl,
        avatarSize: p.avatarUrl?.length || 0,
        avatarPrefix: p.avatarUrl?.substring(0, 50) || 'N/A',
        avatarSuffix: p.avatarUrl ? p.avatarUrl.substring(Math.max(0, p.avatarUrl.length - 50)) : 'N/A',
        isValidFormat: p.avatarUrl ? (p.avatarUrl.startsWith('data:image/') || p.avatarUrl.startsWith('http')) : false
      })),
      testResults,
      backup: localStorage.getItem('aiGirlfriend_backup') ? 'exists' : 'not found',
      browser: navigator.userAgent
    };

    const dataStr = JSON.stringify(debugInfo, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `avatar-debug-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success('调试信息已导出');
  };

  const passCount = testResults.filter(r => r.status === 'pass').length;
  const failCount = testResults.filter(r => r.status === 'fail').length;
  const warningCount = testResults.filter(r => r.status === 'warning').length;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          头像持久化诊断工具
        </CardTitle>
        <CardDescription>
          检查头像上传和保存的各个环节，帮助定位问题
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 测试结果总览 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{passCount}</div>
            <div className="text-sm text-green-600">通过</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-700">{failCount}</div>
            <div className="text-sm text-red-600">失败</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-amber-700">{warningCount}</div>
            <div className="text-sm text-amber-600">警告</div>
          </div>
        </div>

        {/* 详细测试结果 */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {testResults.map((result, index) => (
            <div 
              key={index} 
              className={`flex items-start gap-3 p-3 rounded-lg ${getStatusColor(result.status)}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getStatusIcon(result.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{result.test}</div>
                <div className="text-sm mt-1 break-all">{result.message}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button 
            onClick={runTests} 
            disabled={testing}
            className="flex-1"
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${testing ? 'animate-spin' : ''}`} />
            重新测试
          </Button>
          <Button 
            onClick={handleExportDebugInfo}
            className="flex-1"
            variant="outline"
          >
            导出调试信息
          </Button>
        </div>

        {/* 建议 */}
        {failCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-800 mb-2">发现问题</h4>
            <ul className="text-sm text-red-700 space-y-1">
              <li>• 请查看浏览器控制台（F12）获取详细日志</li>
              <li>• 尝试重新上传头像，观察日志输出</li>
              <li>• 如果问题持续，请导出调试信息并联系开发者</li>
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onClose} variant="ghost">
            关闭
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
