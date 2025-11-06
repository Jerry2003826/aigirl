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
import { Heart, Mail, Lock, UserPlus } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码长度至少为6位"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormValues) => {
      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "登录成功",
        description: "欢迎回来！",
      });
      // Reload to trigger app re-initialization with authenticated user
      window.location.href = "/";
    },
    onError: (error: any) => {
      toast({
        title: "登录失败",
        description: error.message || "邮箱或密码错误",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      await loginMutation.mutateAsync(data);
    } finally {
      setIsLoading(false);
    }
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
            AI伴侣聊天
          </h1>
          <p className="text-center text-gray-400 mb-8 text-sm">
            登录到您的账户
          </p>

          {/* 登录表单 */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
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
                control={form.control}
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
                          placeholder="请输入密码"
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
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? "登录中..." : "登录"}
              </Button>
            </form>
          </Form>

          {/* 注册链接 */}
          <div className="mt-6">
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-gray-900 text-gray-400">
                  还没有账户？
                </span>
              </div>
            </div>
            
            <Button
              variant="outline"
              className="w-full border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
              onClick={() => setLocation("/register")}
              data-testid="link-register"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              创建新账户
            </Button>
          </div>

          {/* Footer Text */}
          <div className="text-center space-y-1 mt-6">
            <p className="text-xs text-gray-500">
              数据将安全存储在云端
            </p>
            <p className="text-xs text-gray-500">
              支持多设备同步
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
