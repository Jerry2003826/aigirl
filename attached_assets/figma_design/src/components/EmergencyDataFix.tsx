import { useState } from 'react';
import { Button } from './ui/button';
import { AlertCircle, CheckCircle, Zap } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { Personality, Chat } from '../App';

interface EmergencyDataFixProps {
  personalities: Personality[];
  chats: Chat[];
  currentPersonalityId: string;
  onFixComplete: (fixedChats: Chat[], fixedCurrentId: string) => void;
}

export function EmergencyDataFix({ 
  personalities, 
  chats, 
  currentPersonalityId,
  onFixComplete 
}: EmergencyDataFixProps) {
  const [isFixing, setIsFixing] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  // 检测问题
  const detectIssues = () => {
    const foundIssues: string[] = [];
    const personalityIds = personalities.map(p => p.id);
    const chatIds = chats.map(c => c.personalityId);

    // 缺少chat的personalities
    const missingChats = personalityIds.filter(id => !chatIds.includes(id));
    if (missingChats.length > 0) {
      foundIssues.push(`${missingChats.length} 个角色缺少聊天记录: [${missingChats.join(', ')}]`);
    }

    // 孤立的chats
    const orphanedChats = chatIds.filter(id => !personalityIds.includes(id));
    if (orphanedChats.length > 0) {
      foundIssues.push(`${orphanedChats.length} 个孤立的聊天记录: [${orphanedChats.join(', ')}]`);
    }

    // 无效的currentPersonalityId
    if (!personalityIds.includes(currentPersonalityId)) {
      foundIssues.push(`当前选中ID无效: "${currentPersonalityId}"`);
    }

    setIssues(foundIssues);
    return foundIssues.length;
  };

  // 立即修复
  const fixNow = () => {
    setIsFixing(true);
    
    try {
      const personalityIds = personalities.map(p => p.id);
      
      // 修复chats
      let fixedChats = chats.filter(c => personalityIds.includes(c.personalityId));
      
      const existingChatIds = fixedChats.map(c => c.personalityId);
      const newChats = personalities
        .filter(p => !existingChatIds.includes(p.id))
        .map(p => ({
          personalityId: p.id,
          messages: [],
          lastMessageTime: Date.now(),
          unreadCount: 0
        }));
      
      fixedChats = [...fixedChats, ...newChats];
      
      // 修复currentPersonalityId
      let fixedCurrentId = currentPersonalityId;
      if (!personalityIds.includes(currentPersonalityId) && personalities.length > 0) {
        fixedCurrentId = personalities[0].id;
      }
      
      // 应用修复
      onFixComplete(fixedChats, fixedCurrentId);
      
      console.log('✅ 紧急修复完成:', {
        fixedChats: fixedChats.map(c => c.personalityId),
        fixedCurrentId
      });
      
      toast.success('✅ 数据已修复！请刷新页面验证');
      
      // 重新检测
      setTimeout(() => {
        const remainingIssues = detectIssues();
        if (remainingIssues === 0) {
          toast.success('🎉 所有问题已解决！');
        }
      }, 1000);
      
    } catch (error) {
      console.error('修复失败:', error);
      toast.error('修复失败，请查看控制台');
    } finally {
      setIsFixing(false);
    }
  };

  // 初始检测
  useState(() => {
    detectIssues();
  });

  const issueCount = issues.length;

  if (issueCount === 0) {
    return null; // 没有问题，不显示
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-red-500 text-white rounded-lg shadow-2xl p-4 animate-pulse">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-2">
              检测到 {issueCount} 个数据问题
            </h3>
            <ul className="text-sm space-y-1 mb-3 opacity-90">
              {issues.map((issue, i) => (
                <li key={i}>• {issue}</li>
              ))}
            </ul>
            <Button
              onClick={fixNow}
              disabled={isFixing}
              className="w-full bg-white text-red-600 hover:bg-gray-100 font-bold"
              size="lg"
            >
              {isFixing ? (
                <>
                  <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin mr-2" />
                  修复中...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  立即修复
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
