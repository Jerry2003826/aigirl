import { useState, useEffect } from "react";
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
import { Heart, Mail, Lock, Shield } from "lucide-react";

const resetPasswordSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  code: z.string().min(6, "验证码必须为6位").max(6, "验证码必须为6位"),
  newPassword: z.string().min(6, "新密码长度至少为6位"),
  confirmPassword: z.string().min(6, "新密码长度至少为6位"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: "",
      code: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // 从 URL 参数获取邮箱
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    if (emailParam) {
      form.setValue("email", emailParam);
    }
  }, [location]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormValues) => {
      const response = await apiRequest("POST", "/api/auth/reset-password", {
        email: data.email,
        code: data.code,
        newPassword: data.newPassword,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "密码重置成功",
        description: "请使用新密码登录",
      });
      // 跳转到登录页
      setTimeout(() => {
        setLocation("/login");
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: "重置失败",
        description: error.message || "重置密码失败",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    setIsLoading(true);
    try {
      await resetPasswordMutation.mutateAsync(data);
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
            重置密码
          </h1>
          <p className="text-center text-gray-400 mb-8 text-sm">
            输入验证码和新密码
          </p>

          {/* 表单 */}
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
                          placeholder="your@email.com"
                          className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-pink-500"
                          disabled={isLoading}
                          data-testid="input-email"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-pink-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">验证码</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          {...field}
                          type="text"
                          placeholder="请输入6位验证码"
                          maxLength={6}
                          className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-pink-500"
                          disabled={isLoading}
                          data-testid="input-code"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-pink-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">新密码</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          {...field}
                          type="password"
                          placeholder="至少6位"
                          className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-pink-500"
                          disabled={isLoading}
                          data-testid="input-new-password"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-pink-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">确认新密码</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          {...field}
                          type="password"
                          placeholder="再次输入新密码"
                          className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-pink-500"
                          disabled={isLoading}
                          data-testid="input-confirm-password"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-pink-400" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white shadow-lg shadow-pink-500/30"
                disabled={isLoading}
                data-testid="button-reset-password"
              >
                {isLoading ? "重置中..." : "重置密码"}
              </Button>
            </form>
          </Form>

          {/* 返回登录 */}
          <div className="mt-6 text-center">
            <button
              onClick={() => setLocation("/login")}
              className="text-gray-400 hover:text-pink-400 transition-colors text-sm"
              data-testid="link-back-to-login"
            >
              返回登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
