import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Personality, Chat, AIConfig, UserProfile } from '../App';
import { projectId } from '../utils/supabase/info';
import { DataVerificationTool } from './DataVerificationTool';
import { ForceInitializeTool } from './ForceInitializeTool';

interface DataRecoveryToolProps {
  accessToken: string;
  currentPersonalities: Personality[];
  currentChats: Chat[];
  onDataRecovered?: (data: {
    personalities?: Personality[];
    chats?: Chat[];
    config?: AIConfig;
    userProfile?: UserProfile;
  }) => void;
}

export function DataRecoveryTool({ accessToken, currentPersonalities, currentChats, onDataRecovered }: DataRecoveryToolProps) {
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<{
    cloudData: any | null;
    backupData: any | null;
    hasCloudPersonalities: boolean;
    hasBackupPersonalities: boolean;
    inconsistencies?: {
      missingChats: string[];
      orphanChats: string[];
    };
  } | null>(null);

  const checkDataStatus = async () => {
    setChecking(true);
    try {
      // 检查云端数据
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-4fd5d246/data/load`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      const cloudResult = await response.json();
      const cloudData = cloudResult.success ? cloudResult.data : null;

      // 检查本地备份
      const backupString = localStorage.getItem('aiGirlfriend_backup');
      let backupData = null;
      if (backupString) {
        try {
          backupData = JSON.parse(backupString);
        } catch (e) {
          console.error('备份数据解析失败:', e);
        }
      }

      // 检查数据一致性
      const personalityIds = currentPersonalities.map(p => p.id);
      const chatIds = currentChats.map(c => c.personalityId);
      const missingChats = personalityIds.filter(id => !chatIds.includes(id));
      const orphanChats = chatIds.filter(id => !personalityIds.includes(id));

      setRecoveryStatus({
        cloudData,
        backupData,
        hasCloudPersonalities: Array.isArray(cloudData?.personalities) && cloudData.personalities.length > 0,
        hasBackupPersonalities: Array.isArray(backupData?.personalities) && backupData.personalities.length > 0,
        inconsistencies: missingChats.length > 0 || orphanChats.length > 0 ? {
          missingChats,
          orphanChats
        } : undefined
      });
    } catch (error) {
      console.error('检查数据状态失败:', error);
    } finally {
      setChecking(false);
    }
  };

  const recoverFromBackup = async () => {
    if (!recoveryStatus?.backupData) return;

    try {
      const data = recoveryStatus.backupData;
      
      // 通知父组件恢复数据
      if (onDataRecovered) {
        onDataRecovered({
          personalities: data.personalities,
          chats: data.chats,
          config: data.config,
          userProfile: data.userProfile
        });
      }

      // 保存到云端
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-4fd5d246/data/save`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(data)
        }
      );

      alert('数据已从本地备份恢复！');
      window.location.reload();
    } catch (error) {
      console.error('恢复数据失败:', error);
      alert('恢复失败，请查看控制台日志');
    }
  };

  const fixInconsistencies = async () => {
    if (!recoveryStatus?.inconsistencies) return;

    setFixing(true);
    try {
      // 为每个缺失chat的personality创建新的chat
      const newChats = recoveryStatus.inconsistencies.missingChats.map(personalityId => ({
        personalityId,
        messages: [],
        lastMessageTime: Date.now(),
        unreadCount: 0
      }));

      // 移除孤立的chats
      const fixedChats = [
        ...currentChats.filter(c => !recoveryStatus.inconsistencies!.orphanChats.includes(c.personalityId)),
        ...newChats
      ];

      // 通知父组件更新数据
      if (onDataRecovered) {
        onDataRecovered({
          chats: fixedChats
        });
      }

      alert('数据一致性已修复！页面将刷新。');
      window.location.reload();
    } catch (error) {
      console.error('修复数据失败:', error);
      alert('修复失败，请查看控制台日志');
    } finally {
      setFixing(false);
    }
  };

  const downloadBackup = () => {
    if (!recoveryStatus?.backupData && !recoveryStatus?.cloudData) return;

    const dataToDownload = recoveryStatus.backupData || recoveryStatus.cloudData;
    const blob = new Blob([JSON.stringify(dataToDownload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-girlfriend-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 数据验证工具 */}
      <DataVerificationTool accessToken={accessToken} />

      {/* 强制初始化工具 */}
      <ForceInitializeTool 
        accessToken={accessToken}
        onDataInitialized={(data) => {
          if (onDataRecovered) {
            onDataRecovered(data);
          }
        }}
      />

      {/* 数据恢复工具 */}
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            数据恢复工具
          </CardTitle>
          <CardDescription>
            检查和恢复你的AI女友数据
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={checkDataStatus} 
            disabled={checking}
            className="w-full"
          >
            {checking ? '检查中...' : '检查数据状态'}
          </Button>

        {recoveryStatus && (
          <div className="space-y-3">
            <Alert variant={recoveryStatus.hasCloudPersonalities ? 'default' : 'destructive'}>
              <AlertDescription className="flex items-start gap-2">
                {recoveryStatus.hasCloudPersonalities ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>云端数据：</strong>
                      {recoveryStatus.cloudData?.personalities?.length || 0} 个AI女友
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>云端数据：</strong>无AI女友数据
                    </div>
                  </>
                )}
              </AlertDescription>
            </Alert>

            <Alert variant={recoveryStatus.hasBackupPersonalities ? 'default' : 'destructive'}>
              <AlertDescription className="flex items-start gap-2">
                {recoveryStatus.hasBackupPersonalities ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>本地备份：</strong>
                      {recoveryStatus.backupData?.personalities?.length || 0} 个AI女友
                      {recoveryStatus.backupData?.timestamp && (
                        <div className="text-xs text-muted-foreground mt-1">
                          备份时间：{new Date(recoveryStatus.backupData.timestamp).toLocaleString('zh-CN')}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>本地备份：</strong>无备份数据
                    </div>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {recoveryStatus.inconsistencies && (
              <Alert variant="destructive">
                <AlertDescription className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <strong>数据不一致：</strong>
                    {recoveryStatus.inconsistencies.missingChats.length > 0 && (
                      <div className="mt-1 text-sm">
                        • {recoveryStatus.inconsistencies.missingChats.length} 个AI女友缺少聊天记录
                        {recoveryStatus.inconsistencies.missingChats.length <= 3 && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ({recoveryStatus.inconsistencies.missingChats.join(', ')})
                          </div>
                        )}
                      </div>
                    )}
                    {recoveryStatus.inconsistencies.orphanChats.length > 0 && (
                      <div className="mt-1 text-sm">
                        • {recoveryStatus.inconsistencies.orphanChats.length} 个孤立的聊天记录
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 flex-wrap">
              {recoveryStatus.inconsistencies && (
                <Button 
                  onClick={fixInconsistencies}
                  disabled={fixing}
                  variant="default"
                  className="flex-1 min-w-[150px]"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {fixing ? '修复中...' : '修复数据一致性'}
                </Button>
              )}
              
              {recoveryStatus.hasBackupPersonalities && (
                <Button 
                  onClick={recoverFromBackup}
                  variant="default"
                  className="flex-1 min-w-[120px]"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  从备份恢复
                </Button>
              )}
              
              {(recoveryStatus.backupData || recoveryStatus.cloudData) && (
                <Button 
                  onClick={downloadBackup}
                  variant="outline"
                  className="flex-1 min-w-[120px]"
                >
                  <Download className="w-4 h-4 mr-2" />
                  下载备份
                </Button>
              )}
            </div>

            {recoveryStatus.cloudData && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  查看云端数据详情
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-60">
                  {JSON.stringify(recoveryStatus.cloudData, null, 2)}
                </pre>
              </details>
            )}

            {recoveryStatus.backupData && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  查看备份数据详情
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-60">
                  {JSON.stringify(recoveryStatus.backupData, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
