import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { TokenDebugger } from './TokenDebugger';

interface EmptyStateErrorProps {
  onOpenDataRecovery: () => void;
  onRefresh?: () => void;
  accessToken?: string;
}

export function EmptyStateError({ onOpenDataRecovery, onRefresh, accessToken }: EmptyStateErrorProps) {
  return (
    <div className="fixed inset-0 bg-surface flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-red-200 dark:border-red-800">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-600 dark:text-red-400">
                数据加载失败
              </CardTitle>
              <CardDescription className="text-red-500 dark:text-red-300 text-sm mt-1">
                未找到任何AI女友角色数据
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
              这通常是因为默认角色"更科瑠夏"没有正确保存到Supabase云端数据库。
            </p>
            <div className="bg-white dark:bg-gray-900 rounded p-3 space-y-2">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                🔧 推荐解决方案：
              </p>
              <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-2 list-decimal list-inside ml-1">
                <li>点击下方"打开数据恢复工具"按钮</li>
                <li>在工具中找到"强制初始化"卡片</li>
                <li>点击"强制初始化默认角色"按钮</li>
                <li>等待页面自动刷新完成</li>
              </ol>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={onOpenDataRecovery}
              className="w-full bg-[#07C160] hover:bg-[#06AD56]"
              size="lg"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              打开数据恢复工具
            </Button>
            
            {onRefresh && (
              <Button
                onClick={onRefresh}
                variant="outline"
                className="w-full"
              >
                刷新页面
              </Button>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              💡 <strong>提示：</strong>强制初始化只会创建默认角色"更科瑠夏"，不会删除或影响你的其他自定义角色和聊天记录。
            </p>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              为什么会出现这个问题？
            </summary>
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 space-y-2">
              <p>可能的原因包括：</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>首次登录时网络连接不稳定</li>
                <li>Supabase数据库保存失败</li>
                <li>浏览器缓存或本地存储问题</li>
                <li>认证令牌过期或失效</li>
              </ul>
              <p className="mt-2">
                使用强制初始化工具可以重新创建默认数据并确保正确保存到云端。
              </p>
            </div>
          </details>
          {accessToken && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <TokenDebugger accessToken={accessToken} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
