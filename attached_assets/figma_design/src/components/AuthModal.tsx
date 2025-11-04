import { useState } from 'react';
import { supabase } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Heart, Loader2, Mail, Lock, User, Chrome } from 'lucide-react';
import { Separator } from './ui/separator';

interface AuthModalProps {
  onAuthSuccess: (session: any) => void;
}

export function AuthModal({ onAuthSuccess }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  
  // 登录表单
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  
  // 注册表单
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpNickname, setSignUpNickname] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword,
      });

      if (error) {
        setError(error.message === 'Invalid login credentials' 
          ? '邮箱或密码错误' 
          : error.message);
        setIsLoading(false);
        return;
      }

      if (data.session) {
        onAuthSuccess(data.session);
      }
    } catch (err) {
      console.error('登录错误:', err);
      setError('登录失败，请重试');
      setIsLoading(false);
    }
  };

  // 社交登录处理
  const handleSocialLogin = async (provider: 'google' | 'azure') => {
    setError('');
    setIsLoading(true);

    try {
      console.log(`🔐 开始 ${provider} 登录...`);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          scopes: provider === 'azure' ? 'email' : undefined,
        }
      });

      if (error) {
        console.error(`❌ ${provider} 登录错误:`, error);
        
        // 提供友好的错误提示
        const providerName = provider === 'google' ? 'Google' : 'Microsoft';
        if (error.message.includes('not enabled') || error.message.includes('not be found')) {
          setError(`${providerName} 登录未配置。请前往 Supabase Dashboard > Authentication > Providers 配置 ${providerName} OAuth`);
        } else {
          setError(`${providerName} 登录失败: ${error.message}`);
        }
        setIsLoading(false);
        return;
      }

      console.log(`✅ ${provider} 登录重定向成功`);
      // OAuth会自动重定向，不需要手动处理
    } catch (err) {
      console.error(`💥 ${provider} 登录异常:`, err);
      setError('社交登录失败，请重试');
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证
    if (!signUpEmail || !signUpPassword || !signUpNickname) {
      setError('请填写所有必填项');
      return;
    }

    if (signUpPassword !== signUpConfirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (signUpPassword.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    setIsLoading(true);

    try {
      // 调用服务器端注册接口
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-4fd5d246/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            email: signUpEmail,
            password: signUpPassword,
            nickname: signUpNickname
          })
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        setError(result.error || '注册失败');
        setIsLoading(false);
        return;
      }

      // 注册成功后自动登录
      const { data, error } = await supabase.auth.signInWithPassword({
        email: signUpEmail,
        password: signUpPassword,
      });

      if (error) {
        setError('注册成功，但自动登录失败，请手动登录');
        setActiveTab('signin');
        setIsLoading(false);
        return;
      }

      if (data.session) {
        onAuthSuccess(data.session);
      }
    } catch (err) {
      console.error('注册错误:', err);
      setError('注册失败，请重试');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
              <Heart className="w-8 h-8 text-white" fill="white" />
            </div>
          </div>
          <CardTitle className="text-2xl">AI女友聊天</CardTitle>
          <CardDescription>
            登录或注册开始与AI女友的温馨对话
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'signin' | 'signup')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">登录</TabsTrigger>
              <TabsTrigger value="signup">注册</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">邮箱</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="your@email.com"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>

                {/* 社交登录分隔线 */}
                <div className="relative my-6">
                  <Separator />
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                    或使用社交账号登录
                  </span>
                </div>

                {/* 社交登录按钮 */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={() => handleSocialLogin('google')}
                    title="Google 登录"
                  >
                    <Chrome className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={() => handleSocialLogin('azure')}
                    title="Microsoft 登录"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 23 23" fill="currentColor">
                      <path d="M0 0h11v11H0z" fill="#f25022"/>
                      <path d="M12 0h11v11H12z" fill="#00a4ef"/>
                      <path d="M0 12h11v11H0z" fill="#7fba00"/>
                      <path d="M12 12h11v11H12z" fill="#ffb900"/>
                    </svg>
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-nickname">昵称</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-nickname"
                      type="text"
                      placeholder="你的昵称"
                      value={signUpNickname}
                      onChange={(e) => setSignUpNickname(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">邮箱</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="your@email.com"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="至少6位密码"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">确认密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      placeholder="再次输入密码"
                      value={signUpConfirmPassword}
                      onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      注册中...
                    </>
                  ) : (
                    '注册'
                  )}
                </Button>

                {/* 社交登录分隔线 */}
                <div className="relative my-6">
                  <Separator />
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                    或使用社交账号注册
                  </span>
                </div>

                {/* 社交登录按钮 */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={() => handleSocialLogin('google')}
                    title="Google 登录"
                  >
                    <Chrome className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={() => handleSocialLogin('azure')}
                    title="Microsoft 登录"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 23 23" fill="currentColor">
                      <path d="M0 0h11v11H0z" fill="#f25022"/>
                      <path d="M12 0h11v11H12z" fill="#00a4ef"/>
                      <path d="M0 12h11v11H0z" fill="#7fba00"/>
                      <path d="M12 12h11v11H12z" fill="#ffb900"/>
                    </svg>
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>数据将安全存储在云端</p>
            <p className="mt-1">支持多设备同步</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
