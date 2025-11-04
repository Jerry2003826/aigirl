import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { projectId, publicAnonKey } from '../utils/supabase/info';

export function TokenDebugger({ accessToken }: { accessToken: string }) {
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const testToken = async () => {
    setIsLoading(true);
    setTestResult(null);

    try {
      console.log('🧪 Testing token:', {
        hasToken: !!accessToken,
        tokenLength: accessToken?.length || 0,
        tokenPreview: accessToken ? `${accessToken.substring(0, 50)}...` : 'none',
        tokenEnd: accessToken ? `...${accessToken.substring(accessToken.length - 20)}` : 'none'
      });

      const url = `https://${projectId}.supabase.co/functions/v1/make-server-4fd5d246/auth/verify`;
      console.log('  Testing URL:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.log('  Response text:', text);
        data = { text };
      }

      console.log('📦 Response data:', data);

      setTestResult({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Test error:', error);
      setTestResult({
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Parse JWT to show its contents
  const parseJWT = (token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { error: 'Invalid JWT format' };
      }

      // Decode base64url
      const base64UrlDecode = (str: string) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        if (pad) {
          if (pad === 1) throw new Error('Invalid base64url');
          base64 += '='.repeat(4 - pad);
        }
        return atob(base64);
      };

      const header = JSON.parse(base64UrlDecode(parts[0]));
      const payload = JSON.parse(base64UrlDecode(parts[1]));

      return {
        header,
        payload,
        signature: parts[2].substring(0, 20) + '...'
      };
    } catch (error) {
      return { error: error.message };
    }
  };

  const jwtInfo = accessToken ? parseJWT(accessToken) : null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>🔐 Token 调试器</CardTitle>
        <CardDescription>
          测试当前的 access token 是否有效
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-2">Token 信息:</h3>
          <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-auto max-h-60">
            {accessToken ? (
              <>
                <div><strong>Length:</strong> {accessToken.length}</div>
                <div><strong>Preview:</strong> {accessToken.substring(0, 100)}...</div>
                <div className="mt-2"><strong>JWT Decoded:</strong></div>
                <pre>{JSON.stringify(jwtInfo, null, 2)}</pre>
              </>
            ) : (
              <div>No token available</div>
            )}
          </div>
        </div>

        <Button 
          onClick={testToken} 
          disabled={isLoading || !accessToken}
          className="w-full"
        >
          {isLoading ? '测试中...' : '测试 Token'}
        </Button>

        {testResult && (
          <div>
            <h3 className="mb-2">测试结果:</h3>
            <div className={`p-3 rounded ${testResult.success ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
              <pre className="text-xs overflow-auto max-h-96">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
