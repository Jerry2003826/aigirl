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
import { Heart, Mail, ArrowLeft } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormValues) => {
      const response = await apiRequest("POST", "/api/auth/forgot-password", data);
      return response;
    },
    onSuccess: (data, variables) => {
      toast({
        title: "验证码已发送",
        description: "请查收您的邮箱",
      });
      setEmailSent(true);
      // 跳转到重置密码页面，带上邮箱参数
      setLocation(`/reset-password?email=${encodeURIComponent(variables.email)}`);
    },
    onError: (error: any) => {
      toast({
        title: "发送失败",
        description: error.message || "发送验证码失败",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true);
    try {
      await forgotPasswordMutation.mutateAsync(data);
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
            忘记密码
          </h1>
          <p className="text-center text-gray-400 mb-8 text-sm">
            输入您的邮箱，我们将发送验证码
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

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white shadow-lg shadow-pink-500/30"
                disabled={isLoading}
                data-testid="button-send-code"
              >
                {isLoading ? "发送中..." : "发送验证码"}
              </Button>
            </form>
          </Form>

          {/* 返回登录 */}
          <div className="mt-6 flex items-center justify-center">
            <button
              onClick={() => setLocation("/login")}
              className="flex items-center gap-2 text-gray-400 hover:text-pink-400 transition-colors text-sm"
              data-testid="link-back-to-login"
            >
              <ArrowLeft className="w-4 h-4" />
              返回登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
