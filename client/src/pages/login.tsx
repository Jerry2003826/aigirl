import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiGoogle, SiMicrosoft } from "react-icons/si";

export default function Login() {
  const handleLogin = () => {
    window.location.href = '/api/auth/login';
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
            AI女友聊天
          </h1>
          <p className="text-center text-gray-400 mb-8 text-sm">
            登录或注册开始与AI女友的温馨对话
          </p>

          {/* Login Button */}
          <div className="w-full h-12 bg-gradient-to-r from-pink-500 to-pink-600 rounded-lg shadow-lg shadow-pink-500/30 mb-6 p-[2px]">
            <Button
              onClick={handleLogin}
              className="w-full h-full bg-pink-500 text-white font-medium border-0"
              data-testid="button-login"
            >
              使用 Replit 登录
            </Button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-gray-900 text-gray-400">
                或使用其它账号登录
              </span>
            </div>
          </div>

          {/* Social Login Icons */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={handleLogin}
              className="w-12 h-12 rounded-full bg-gray-800 hover-elevate active-elevate-2 flex items-center justify-center border border-gray-700"
              aria-label="Login with Google"
              data-testid="button-login-google"
            >
              <SiGoogle className="w-5 h-5 text-gray-300" />
            </button>
            <button
              onClick={handleLogin}
              className="w-12 h-12 rounded-full bg-gray-800 hover-elevate active-elevate-2 flex items-center justify-center border border-gray-700"
              aria-label="Login with Microsoft"
              data-testid="button-login-microsoft"
            >
              <SiMicrosoft className="w-5 h-5 text-gray-300" />
            </button>
          </div>

          {/* Footer Text */}
          <div className="text-center space-y-1">
            <p className="text-xs text-gray-500">
              数据将安全存储在云端
            </p>
            <p className="text-xs text-gray-500">
              支持多设备同步
            </p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            通过登录，您同意我们的
            <button className="text-pink-400 hover-elevate ml-1" data-testid="link-terms">
              服务条款
            </button>
            {" "}和{" "}
            <button className="text-pink-400 hover-elevate" data-testid="link-privacy">
              隐私政策
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
