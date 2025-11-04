import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner@2.0.3';
import { RefreshCw, CheckCircle, XCircle, Database } from 'lucide-react';
import { loadDataFromCloud } from '../utils/data-sync';

interface DataVerificationToolProps {
  accessToken: string;
}

export function DataVerificationTool({ accessToken }: DataVerificationToolProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      console.log('🔍 开始验证云端数据...');
      const result = await loadDataFromCloud(accessToken);
      
      if (result.success && result.data) {
        const { config, personalities, chats, userProfile, darkMode } = result.data;
        
        const verification = {
          hasConfig: !!config,
          personalitiesCount: Array.isArray(personalities) ? personalities.length : 0,
          personalitiesDetails: Array.isArray(personalities) 
            ? personalities.map((p: any) => ({
                id: p.id,
                name: p.name,
                hasAvatar: !!p.avatarUrl,
                avatarSize: p.avatarUrl ? `${(p.avatarUrl.length / 1024).toFixed(2)} KB` : 'N/A'
              }))
            : [],
          chatsCount: Array.isArray(chats) ? chats.length : 0,
          hasUserProfile: !!userProfile,
          darkMode: darkMode,
          timestamp: new Date().toISOString()
        };
        
        setVerificationResult(verification);
        console.log('✅ 验证完成:', verification);
        
        if (verification.personalitiesCount > 0) {
          toast.success(`✅ 验证成功：找到 ${verification.personalitiesCount} 个角色`);
        } else {
          toast.warning('⚠️ 云端没有角色数据');
        }
      } else {
        setVerificationResult({ error: result.error || '加载失败' });
        toast.error('❌ 验证失败：' + (result.error || '未知错误'));
      }
    } catch (error) {
      console.error('❌ 验证错误:', error);
      setVerificationResult({ error: error instanceof Error ? error.message : '未知错误' });
      toast.error('验证失败');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          云端数据验证
        </CardTitle>
        <CardDescription>
          检查Supabase云端存储的数据状态
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleVerify} 
          disabled={isVerifying}
          className="w-full"
        >
          {isVerifying ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              验证中...
            </>
          ) : (
            <>
              <Database className="w-4 h-4 mr-2" />
              验证云端数据
            </>
          )}
        </Button>

        {verificationResult && (
          <div className="space-y-3">
            {verificationResult.error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">验证失败</span>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  {verificationResult.error}
                </p>
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">验证成功</span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">配置数据:</span>
                    <span className={verificationResult.hasConfig ? "text-green-600" : "text-red-600"}>
                      {verificationResult.hasConfig ? "✅ 存在" : "❌ 缺失"}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">角色数量:</span>
                    <span className={verificationResult.personalitiesCount > 0 ? "text-green-600" : "text-red-600"}>
                      {verificationResult.personalitiesCount} 个
                    </span>
                  </div>
                  
                  {verificationResult.personalitiesDetails && verificationResult.personalitiesDetails.length > 0 && (
                    <div className="border-t pt-2 mt-2">
                      <p className="font-medium mb-2">角色详情:</p>
                      {verificationResult.personalitiesDetails.map((p: any, i: number) => (
                        <div key={i} className="bg-white dark:bg-gray-800 rounded p-2 mb-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground">{p.id}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            头像: {p.hasAvatar ? `✅ ${p.avatarSize}` : '❌ 无'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">聊天记录:</span>
                    <span>{verificationResult.chatsCount} 个</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">用户配置:</span>
                    <span className={verificationResult.hasUserProfile ? "text-green-600" : "text-red-600"}>
                      {verificationResult.hasUserProfile ? "✅ 存在" : "❌ 缺失"}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">主题模式:</span>
                    <span>{verificationResult.darkMode ? "🌙 暗夜" : "☀️ 明亮"}</span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    验证时间: {new Date(verificationResult.timestamp).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
          <p className="text-blue-700 dark:text-blue-300">
            💡 <strong>提示:</strong> 如果发现数据缺失，请尝试刷新页面。系统会自动重新初始化默认角色"更科瑠夏"。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
