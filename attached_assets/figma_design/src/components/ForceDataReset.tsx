import { useState } from 'react';
import { Button } from './ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { Personality, Chat } from '../App';
import { saveDataToCloud } from '../utils/data-sync';

interface ForceDataResetProps {
  personalities: Personality[];
  accessToken: string | null;
  onResetComplete: () => void;
}

export function ForceDataReset({ 
  personalities, 
  accessToken,
  onResetComplete 
}: ForceDataResetProps) {
  const [isResetting, setIsResetting] = useState(false);

  const forceReset = async () => {
    if (!accessToken) {
      toast.error('未登录，无法重置数据');
      return;
    }

    const confirm = window.confirm(
      '⚠️ 警告：这将清除所有聊天记录（但保留角色设置），并重新同步数据。\n\n确定要继续吗？'
    );

    if (!confirm) return;

    setIsResetting(true);
    
    try {
      console.log('🔥 开始强制重置数据...');
      
      // 为每个 personality 创建全新的 chat
      const freshChats: Chat[] = personalities.map(p => ({
        personalityId: p.id,
        messages: [],
        lastMessageTime: Date.now(),
        unreadCount: 0
      }));
      
      console.log('📝 创建的新聊天记录:', freshChats.map(c => c.personalityId));
      
      // 清除 localStorage 中的旧数据
      try {
        localStorage.removeItem('aiGirlfriendCurrentPersonalityId');
        if (personalities.length > 0) {
          localStorage.setItem('aiGirlfriendCurrentPersonalityId', personalities[0].id);
        }
        console.log('✅ 已清除 localStorage');
      } catch (e) {
        console.warn('清除 localStorage 失败:', e);
      }
      
      // 保存到云端
      console.log('💾 保存新数据到云端...');
      const result = await saveDataToCloud(accessToken, {
        chats: freshChats,
        personalities: personalities // 同时保存确保一致性
      });
      
      if (result.success) {
        console.log('✅ 数据重置成功！');
        toast.success('✅ 数据已重置！请刷新页面');
        
        // 等待 1 秒后刷新页面
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        console.error('❌ 保存失败:', result.error);
        toast.error('重置失败: ' + result.error);
      }
      
    } catch (error) {
      console.error('❌ 重置失败:', error);
      toast.error('重置失败，请查看控制台');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-2">
              数据同步失败
            </h3>
            <p className="text-sm mb-3 opacity-90">
              自动修复多次失败。点击下方按钮强制重建数据（将清除所有聊天记录）。
            </p>
            <Button
              onClick={forceReset}
              disabled={isResetting}
              className="w-full bg-white text-orange-600 hover:bg-gray-100 font-bold"
              size="lg"
            >
              {isResetting ? (
                <>
                  <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mr-2" />
                  重置中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  强制重置数据
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
