import type { Express, RequestHandler } from "express";
import type { IStorage } from "../storage";

export type AuthRouteDeps = {
  storage: IStorage;
  authLimiter: RequestHandler;
  isAuthenticated: RequestHandler;
  sanitizeUser: (u: Record<string, unknown>) => Record<string, unknown>;
  updateUserProfileSchema: { parse: (v: unknown) => unknown };
};

export function registerAuthRoutes(app: Express, deps: AuthRouteDeps): void {
  const { storage, authLimiter, isAuthenticated, sanitizeUser, updateUserProfileSchema } = deps;
  const isDevEnv = (process.env.NODE_ENV || "development") === "development";

  app.post("/api/auth/register", authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "邮箱和密码不能为空" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "密码长度至少为6位" });
      }
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.emailVerified) {
        return res.status(400).json({ message: "该邮箱已被注册" });
      }
      const { generateVerificationCode, getVerificationCodeExpiry, hashPassword, hashVerificationCode } = await import("../auth");
      const code = generateVerificationCode();
      const expiresAt = getVerificationCodeExpiry();
      const passwordHash = await hashPassword(password);
      const codeHash = await hashVerificationCode(code);
      await storage.createUnverifiedUser(email, passwordHash, codeHash, expiresAt);
      const { sendVerificationEmail } = await import("../emailService");
      try {
        await sendVerificationEmail(email, code);
      } catch (emailErr: any) {
        if (isDevEnv) {
          console.warn("⚠️ [Register] 开发环境发送邮件失败，已返回devCode用于本机测试：", emailErr?.message || emailErr);
          return res.json({ message: "验证码发送失败（开发环境），请使用返回的 devCode 继续验证", devCode: code });
        }
        throw emailErr;
      }
      res.json({ message: existingUser ? "验证码已重新发送到您的邮箱" : "验证码已发送到您的邮箱" });
    } catch (error: any) {
      console.error("❌ [Register] 注册失败:", error);
      res.status(500).json({ message: error.message || "注册失败" });
    }
  });

  app.post("/api/auth/verify", authLimiter, async (req: any, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "邮箱和验证码不能为空" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "用户不存在" });
      if (user.emailVerified) return res.status(400).json({ message: "该邮箱已验证" });
      const { isVerificationCodeValid } = await import("../auth");
      if (!(await isVerificationCodeValid(code, user.verificationCode, user.verificationCodeExpiresAt))) {
        return res.status(400).json({ message: "验证码无效或已过期" });
      }
      await storage.verifyUser(email);
      const verifiedUser = await storage.getUserByEmail(email);
      req.session.user = { id: verifiedUser!.id };
      res.json({ message: "注册成功", user: sanitizeUser(verifiedUser!) });
    } catch (error: any) {
      console.error("❌ [Verify] 验证失败:", error);
      res.status(500).json({ message: error.message || "验证失败" });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "邮箱和密码不能为空" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ message: "邮箱或密码错误" });
      if (!user.emailVerified) return res.status(401).json({ message: "请先验证邮箱" });
      if (!user.passwordHash) return res.status(401).json({ message: "密码未设置" });
      const { verifyPassword } = await import("../auth");
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return res.status(401).json({ message: "邮箱或密码错误" });
      req.session.user = { id: user.id };
      res.json({ message: "登录成功", user: sanitizeUser(user) });
    } catch (error: any) {
      console.error("❌ [Login] 登录失败:", error);
      res.status(500).json({ message: error.message || "登录失败" });
    }
  });

  app.post("/api/auth/logout", async (req: any, res) => {
    try {
      req.session.destroy((err: any) => {
        if (err) {
          console.error("❌ [Logout] 登出失败:", err);
          return res.status(500).json({ message: "登出失败" });
        }
        res.json({ message: "登出成功" });
      });
    } catch (error: any) {
      console.error("❌ [Logout] 登出失败:", error);
      res.status(500).json({ message: error.message || "登出失败" });
    }
  });

  app.post("/api/auth/forgot-password", authLimiter, async (req: any, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "邮箱不能为空" });
      const user = await storage.getUserByEmail(email);
      if (!user || !user.emailVerified) {
        return res.json({ message: "如果该邮箱已注册，重置密码验证码已发送" });
      }
      const { generateVerificationCode, getVerificationCodeExpiry, hashVerificationCode } = await import("../auth");
      const code = generateVerificationCode();
      const expiresAt = getVerificationCodeExpiry();
      const codeHash = await hashVerificationCode(code);
      await storage.updatePasswordResetCode(email, codeHash, expiresAt);
      const { sendPasswordResetEmail } = await import("../emailService");
      try {
        await sendPasswordResetEmail(email, code);
      } catch (emailErr: any) {
        if (isDevEnv) {
          return res.json({ message: "发送失败（开发环境），请使用返回的 devCode 继续重置", devCode: code });
        }
        throw emailErr;
      }
      res.json({ message: "重置密码验证码已发送到您的邮箱" });
    } catch (error: any) {
      console.error("❌ [Forgot Password] 发送重置密码邮件失败:", error);
      res.status(500).json({ message: error.message || "发送重置密码邮件失败" });
    }
  });

  app.post("/api/auth/reset-password", authLimiter, async (req: any, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "邮箱、验证码和新密码不能为空" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "新密码长度至少为6位" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user || !user.emailVerified) {
        console.log(`[Security] Reset password attempt for non-existent/unverified user: ${email}`);
        return res.status(400).json({ message: "验证码无效或已过期" });
      }
      const { isVerificationCodeValid } = await import("../auth");
      if (!(await isVerificationCodeValid(code, user.verificationCode, user.verificationCodeExpiresAt))) {
        console.log(`[Security] Invalid verification code for user: ${email}`);
        return res.status(400).json({ message: "验证码无效或已过期" });
      }
      const { hashPassword } = await import("../auth");
      const passwordHash = await hashPassword(newPassword);
      await storage.updateUserPassword(email, passwordHash);
      res.json({ message: "密码重置成功，请使用新密码登录" });
    } catch (error: any) {
      console.error("❌ [Reset Password] 重置密码失败:", error);
      res.status(500).json({ message: error.message || "重置密码失败" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      res.json(sanitizeUser(req.user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.patch("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = updateUserProfileSchema.parse(req.body);
      const updatedUser = await storage.updateUserProfile(userId, validatedData);
      if (!updatedUser) return res.status(404).json({ message: "用户不存在" });
      res.json(sanitizeUser(updatedUser));
    } catch (error: any) {
      console.error("Error updating user profile:", error);
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "数据验证失败", errors: error.errors });
      }
      res.status(500).json({ message: "更新用户资料失败" });
    }
  });
}
