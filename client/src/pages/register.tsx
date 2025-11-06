import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Heart, Mail, Lock, KeyRound, ArrowLeft } from "lucide-react";

const registerSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码长度至少为6位"),
});

const verifySchema = z.object({
  code: z.string().length(6, "验证码为6位数字"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;
type VerifyFormValues = z.infer<typeof verifySchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<'register' | 'verify'>('register');
  const [email, setEmail] = useState('');

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const verifyForm = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      code: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormValues) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response;
    },
    onSuccess: (_, variables) => {
      setEmail(variables.email);
      verifyForm.reset({ code: "" }); // Reset verify form when switching to verify step
      setStep('verify');
      toast({
        title: "验证码已发送",
        description: "请查收邮件并输入验证码",
      });
    },
    onError: (error: any) => {
      toast({
        title: "注册失败",
        description: error.message || "发送验证码失败",
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (data: VerifyFormValues) => {
      const response = await apiRequest("POST", "/api/auth/verify", { 
        email, 
        code: data.code 
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "注册成功",
        description: "欢迎使用AI伴侣！",
      });
      // Reload to trigger app re-initialization with authenticated user
      window.location.href = "/";
    },
    onError: (error: any) => {
      toast({
        title: "验证失败",
        description: error.message || "验证码错误或已过期",
        variant: "destructive",
      });
    },
  });

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    await registerMutation.mutateAsync(data);
  };

  const onVerifySubmit = async (data: VerifyFormValues) => {
    await verifyMutation.mutateAsync(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-blue-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-gray-800">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-lg shadow-pink-500/50">
              <Heart className="w-8 h-8 text-white fill-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-center text-white mb-2">
            {step === 'register' ? '创建账户' : '验证邮箱'}
          </h1>
          <p className="text-center text-gray-400 mb-8 text-sm">
            {step === 'register' ? '开始您的AI伴侣之旅' : `验证码已发送至 ${email}`}
          </p>

          {step === 'register' ? (
            /* 注册表单 */
            <Form {...registerForm} key="register-form">
              <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                <FormField
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">邮箱</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            {...field}
                            type="email"
                            placeholder="请输入邮箱"
                            className="pl-10 bg-gray-800 border-gray-700 text-white"
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">密码</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            {...field}
                            type="password"
                            placeholder="至少6位密码"
                            className="pl-10 bg-gray-800 border-gray-700 text-white"
                            data-testid="input-password"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-medium"
                  disabled={registerMutation.isPending}
                  data-testid="button-send-code"
                >
                  {registerMutation.isPending ? "发送中..." : "发送验证码"}
                </Button>
              </form>
            </Form>
          ) : (
            /* 验证码表单 */
            <Form {...verifyForm} key="verify-form">
              <form onSubmit={verifyForm.handleSubmit(onVerifySubmit)} className="space-y-4">
                <FormField
                  control={verifyForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">验证码</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            {...field}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="请输入6位验证码"
                            maxLength={6}
                            autoComplete="off"
                            className="pl-10 bg-gray-800 border-gray-700 text-white text-center text-lg tracking-widest"
                            data-testid="input-code"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-gray-500 mt-2">
                        验证码将在15分钟后过期
                      </p>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-medium"
                  disabled={verifyMutation.isPending}
                  data-testid="button-verify"
                >
                  {verifyMutation.isPending ? "验证中..." : "验证并注册"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-gray-400 hover:text-white"
                  onClick={() => {
                    verifyForm.reset({ code: "" }); // Reset verify form when going back
                    setStep('register');
                  }}
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  返回修改邮箱
                </Button>
              </form>
            </Form>
          )}

          {/* 登录链接 */}
          {step === 'register' && (
            <div className="mt-6">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-gray-900 text-gray-400">
                    已有账户？
                  </span>
                </div>
              </div>
              
              <Button
                variant="outline"
                className="w-full border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
                onClick={() => setLocation("/login")}
                data-testid="link-login"
              >
                返回登录
              </Button>
            </div>
          )}

          {/* Footer Text */}
          <div className="text-center space-y-1 mt-6">
            <p className="text-xs text-gray-500">
              通过注册，您同意我们的服务条款和隐私政策
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
