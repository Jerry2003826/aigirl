import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertCircle, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { toast } from 'sonner@2.0.3';
import type { Personality, Chat } from '../App';

interface DataHealthCheckProps {
  personalities: Personality[];
  chats: Chat[];
  currentPersonalityId: string;
  onFixData: (fixedChats: Chat[], fixedCurrentId: string) => void;
}

interface HealthIssue {
  type: 'missing_chat' | 'orphaned_chat' | 'invalid_current_id';
  severity: 'error' | 'warning';
  message: string;
  personalityId?: string;
  chatId?: string;
}

export function DataHealthCheck({ 
  personalities, 
  chats, 
  currentPersonalityId,
  onFixData 
}: DataHealthCheckProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);

  const checkDataHealth = () => {
    setIsChecking(true);
    const foundIssues: HealthIssue[] = [];

    try {
      const personalityIds = personalities.map(p => p.id);
      const chatIds = chats.map(c => c.personalityId);

      // 检查1: 找出缺少chat的personality
      const missingChats = personalities.filter(p => !chatIds.includes(p.id));
      missingChats.forEach(p => {
        foundIssues.push({
          type: 'missing_chat',
          severity: 'error',
          message: `Personality "${p.name}" (${p.id}) 缺少对应的聊天记录`,
          personalityId: p.id
        });
      });

      // 检查2: 找出孤立的chat（没有对应personality）
      const orphanedChats = chats.filter(c => !personalityIds.includes(c.personalityId));
      orphanedChats.forEach(c => {
        foundIssues.push({
          type: 'orphaned_chat',
          severity: 'warning',
          message: `聊天记录 "${c.personalityId}" 没有对应的角色`,
          chatId: c.personalityId
        });
      });

      // 检查3: 检查currentPersonalityId是否有效
      if (!personalityIds.includes(currentPersonalityId)) {
        foundIssues.push({
          type: 'invalid_current_id',
          severity: 'error',
          message: `当前选中的角色ID "${currentPersonalityId}" 无效，可用的ID: [${personalityIds.join(', ')}]`,
          personalityId: currentPersonalityId
        });
      }

      setIssues(foundIssues);
      setLastCheckTime(new Date());

      if (foundIssues.length === 0) {
        toast.success('✅ 数据检查通过，没有发现问题！');
      } else {
        toast.warning(`⚠️ 发现 ${foundIssues.length} 个问题`);
      }
    } catch (error) {
      console.error('数据健康检查失败:', error);
      toast.error('检查失败，请查看控制台');
    } finally {
      setIsChecking(false);
    }
  };

  const autoFixIssues = () => {
    if (issues.length === 0) {
      toast.info('没有需要修复的问题');
      return;
    }

    try {
      const personalityIds = personalities.map(p => p.id);
      let fixedChats = [...chats];
      let fixedCurrentId = currentPersonalityId;

      // 修复1: 移除孤立的chats
      const orphanedCount = fixedChats.filter(c => !personalityIds.includes(c.personalityId)).length;
      fixedChats = fixedChats.filter(c => personalityIds.includes(c.personalityId));
      
      if (orphanedCount > 0) {
        console.log(`🗑️ 移除了 ${orphanedCount} 个孤立的chat`);
      }

      // 修复2: 为缺失的personalities创建chats
      const existingChatIds = fixedChats.map(c => c.personalityId);
      const missingChats = personalities
        .filter(p => !existingChatIds.includes(p.id))
        .map(p => ({
          personalityId: p.id,
          messages: [],
          lastMessageTime: Date.now(),
          unreadCount: 0
        }));

      if (missingChats.length > 0) {
        console.log(`➕ 为 ${missingChats.length} 个角色创建了chat:`, missingChats.map(c => c.personalityId));
        fixedChats = [...fixedChats, ...missingChats];
      }

      // 修复3: 修复无效的currentPersonalityId
      if (!personalityIds.includes(currentPersonalityId)) {
        if (personalities.length > 0) {
          fixedCurrentId = personalities[0].id;
          console.log(`🔄 将currentPersonalityId从 "${currentPersonalityId}" 修改为 "${fixedCurrentId}"`);
        }
      }

      // 应用修复
      onFixData(fixedChats, fixedCurrentId);

      toast.success(`✅ 已修复 ${issues.length} 个问题`);
      
      // 重新检查
      setTimeout(() => checkDataHealth(), 500);
    } catch (error) {
      console.error('自动修复失败:', error);
      toast.error('修复失败，请查看控制台');
    }
  };

  return (
    <Card className="border-yellow-500/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              数据健康检查
            </CardTitle>
            <CardDescription>
              检查并修复角色和聊天记录之间的数据一致性问题
            </CardDescription>
          </div>
          <Button 
            onClick={checkDataHealth} 
            disabled={isChecking}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            检查
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground">角色数量</div>
            <div className="text-2xl font-bold">{personalities.length}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">聊天记录</div>
            <div className="text-2xl font-bold">{chats.length}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">问题数量</div>
            <div className={`text-2xl font-bold ${issues.length > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {issues.length}
            </div>
          </div>
        </div>

        {/* 最后检查时间 */}
        {lastCheckTime && (
          <div className="text-sm text-muted-foreground">
            最后检查: {lastCheckTime.toLocaleString('zh-CN')}
          </div>
        )}

        {/* 问题列表 */}
        {issues.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">发现的问题:</h4>
              <Button 
                onClick={autoFixIssues}
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                一键修复
              </Button>
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {issues.map((issue, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-lg border ${
                    issue.severity === 'error' 
                      ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' 
                      : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Badge 
                      variant={issue.severity === 'error' ? 'destructive' : 'secondary'}
                      className="mt-0.5"
                    >
                      {issue.severity === 'error' ? '错误' : '警告'}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm">{issue.message}</p>
                      {issue.personalityId && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ID: {issue.personalityId}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 无问题状态 */}
        {issues.length === 0 && lastCheckTime && (
          <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">数据健康状态良好！</span>
            </div>
          </div>
        )}

        {/* 检查提示 */}
        {!lastCheckTime && (
          <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground text-center">
            点击"检查"按钮开始数据健康检查
          </div>
        )}

        {/* 详细说明 */}
        <div className="pt-4 border-t space-y-2">
          <h4 className="text-sm font-medium">检查项目:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
              检查每个角色是否有对应的聊天记录
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
              检查是否存在孤立的聊天记录（没有对应角色）
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
              检查当前选中的角色ID是否有效
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
