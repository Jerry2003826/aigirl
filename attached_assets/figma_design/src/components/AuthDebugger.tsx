import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner@2.0.3';

export function AuthDebugger() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDebugInfo = async () => {
    try {
      // 获取当前session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      const now = Math.floor(Date.now() / 1000);
      
      const info = {
        timestamp: new Date().toISOString(),
        hasSession: !!session,
        sessionError: sessionError?.message || null,
        session: session ? {
          userId: session.user.id,
          email: session.user.email,
          provider: session.user.app_metadata?.provider || 'email',
          tokenLength: session.access_token.length,
          tokenPreview: `${session.access_token.substring(0, 30)}...`,
          tokenSuffix: `...${session.access_token.substring(session.access_token.length - 20)}`,
          expiresAt: session.expires_at,
          expiresAtFormatted: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
          currentTime: now,
          timeUntilExpiry: session.expires_at ? Math.floor(session.expires_at - now) : null,
          timeUntilExpiryFormatted: session.expires_at ? 
            `${Math.floor((session.expires_at - now) / 60)} 分钟 ${(session.expires_at - now) % 60} 秒` : null,
          isExpired: session.expires_at ? session.expires_at < now : false,
          willExpireSoon: session.expires_at ? session.expires_at < now + 300 : false,
        } : null
      };
      
      setDebugInfo(info);
      console.log('🔍 认证调试信息:', info);
    } catch (error) {
      console.error('❌ 获取调试信息失败:', error);
      toast.error('获取调试信息失败');
    }
  };

  const handleRefreshSession = async () => {
    setIsRefreshing(true);
    try {
      console.log('🔄 手动刷新session...');
      const { data: { session }, error } = await supabase.auth.refreshSession();
      
      if (error || !session) {
        console.error('❌ 刷新失败:', error);
        toast.error(`刷新失败: ${error?.message || '未知错误'}`);
      } else {
        console.log('✅ 刷新成功');
        toast.success('Session已刷新');
        await fetchDebugInfo();
      }
    } catch (error) {
      console.error('❌ 刷新异常:', error);
      toast.error('刷新异常');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTestAPI = async () => {
    if (!debugInfo?.session) {
      toast.error('没有有效的session');
      return;
    }

    try {
      console.log('🧪 测试API调用...');
      const token = debugInfo.session.tokenPreview.replace('...', '') + debugInfo.session.tokenSuffix.replace('...', '');
      
      // 获取完整token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('无法获取session');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-4fd5d246/auth/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      const result = await response.json();
      console.log('📡 API响应:', result);

      if (response.ok) {
        toast.success('API调用成功');
      } else {
        toast.error(`API调用失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('❌ API测试失败:', error);
      toast.error('API测试失败');
    }
  };

  useEffect(() => {
    fetchDebugInfo();
    
    // 每10秒自动刷新
    const interval = setInterval(fetchDebugInfo, 10000);
    
    return () => clearInterval(interval);
  }, []);

  if (!debugInfo) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">认证状态调试</h3>
        <div className="flex gap-2">
          <Button onClick={fetchDebugInfo} variant="outline" size="sm">
            刷新
          </Button>
          <Button onClick={handleRefreshSession} variant="outline" size="sm" disabled={isRefreshing}>
            {isRefreshing ? '刷新中...' : '刷新Token'}
          </Button>
          <Button onClick={handleTestAPI} variant="outline" size="sm">
            测试API
          </Button>
        </div>
      </div>

      <div className="space-y-3 text-sm font-mono">
        <div>
          <span className="text-muted-foreground">时间: </span>
          <span>{debugInfo.timestamp}</span>
        </div>

        <div>
          <span className="text-muted-foreground">Session状态: </span>
          <span className={debugInfo.hasSession ? 'text-green-600' : 'text-red-600'}>
            {debugInfo.hasSession ? '✅ 有效' : '❌ 无效'}
          </span>
        </div>

        {debugInfo.sessionError && (
          <div>
            <span className="text-muted-foreground">Session错误: </span>
            <span className="text-red-600">{debugInfo.sessionError}</span>
          </div>
        )}

        {debugInfo.session && (
          <>
            <div>
              <span className="text-muted-foreground">用户ID: </span>
              <span>{debugInfo.session.userId}</span>
            </div>

            <div>
              <span className="text-muted-foreground">邮箱: </span>
              <span>{debugInfo.session.email}</span>
            </div>

            <div>
              <span className="text-muted-foreground">登录方式: </span>
              <span>{debugInfo.session.provider}</span>
            </div>

            <div>
              <span className="text-muted-foreground">Token长度: </span>
              <span>{debugInfo.session.tokenLength}</span>
            </div>

            <div>
              <span className="text-muted-foreground">Token预览: </span>
              <span className="break-all">{debugInfo.session.tokenPreview}</span>
            </div>

            <div>
              <span className="text-muted-foreground">过期状态: </span>
              <span className={debugInfo.session.isExpired ? 'text-red-600' : debugInfo.session.willExpireSoon ? 'text-yellow-600' : 'text-green-600'}>
                {debugInfo.session.isExpired ? '❌ 已过期' : debugInfo.session.willExpireSoon ? '⚠️ 即将过期' : '✅ 有效'}
              </span>
            </div>

            <div>
              <span className="text-muted-foreground">过期时间: </span>
              <span>{debugInfo.session.expiresAtFormatted || 'N/A'}</span>
            </div>

            <div>
              <span className="text-muted-foreground">剩余时间: </span>
              <span className={debugInfo.session.isExpired ? 'text-red-600' : debugInfo.session.willExpireSoon ? 'text-yellow-600' : 'text-green-600'}>
                {debugInfo.session.timeUntilExpiryFormatted || 'N/A'}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="pt-4 border-t text-xs text-muted-foreground">
        <p>💡 提示：如果Token即将过期或已过期，点击"刷新Token"按钮</p>
        <p>💡 点击"测试API"可以测试服务器端的token验证</p>
      </div>
    </Card>
  );
}
