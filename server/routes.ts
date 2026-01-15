import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { generateAIResponse, generateAIResponseStream, selectRespondingPersona, extractAndStoreMemories, triggerAICommentsOnMoment, triggerAIPostMoment, triggerAIReplyToComment } from "./aiService";
import { minimaxTtsToBuffer } from "./voice/minimaxTts";
import { setupVoiceWebSocket } from "./voice/voiceWs";
import { setupWebSocket, broadcastNewMessage, broadcastMomentEvent, broadcastGroupEvent, broadcastToUserEvent } from "./websocket";
import { loadAndApplyConfig } from "./config";
import { getSession } from "./session";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { S3StorageService } from "./storage/s3";
import { 
  insertAiPersonaSchema, 
  updateAiPersonaSchema,
  insertConversationSchema, 
  insertMessageSchema,
  insertConversationParticipantSchema,
  insertMomentSchema,
  insertMomentCommentSchema,
  updateUserProfileSchema,
  insertMemorySchema
} from "@shared/schema";

// ========== 认证中间件 ==========
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ message: "未登录" });
  }
  
  // 从数据库加载用户信息
  const user = await storage.getUser(req.session.user.id);
  if (!user) {
    return res.status(401).json({ message: "用户不存在" });
  }
  
  // 将用户信息附加到req对象上，供后续中间件使用
  req.user = user;
  next();
};

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.'));
    }
  }
});

// Rate limiter for message sending (20 messages per minute per user)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each user to 20 requests per minute
  message: "Too many messages sent. Please wait a moment before sending more.",
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID from session for rate limiting
  keyGenerator: (req, res) => {
    // Use authenticated user ID if available
    const userId = (req as any).session?.user?.id;
    return userId || 'anonymous';
  },
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// Rate limiter for auth-related endpoints (mitigate brute-force / enumeration)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many authentication attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const rawEmail = typeof req.body?.email === "string" ? req.body.email : "";
    const email = rawEmail ? normalizeEmail(rawEmail) : "";
    return `${ipKeyGenerator(req)}:${email}`;
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup session middleware
  const trustProxy = parseInt(process.env.TRUST_PROXY || "1", 10);
  app.set("trust proxy", Number.isFinite(trustProxy) ? trustProxy : 1);
  app.use(getSession());

  // ========== 新的邮箱验证码认证系统 ==========
  const isDevEnv = (process.env.NODE_ENV || "development") === "development";
  
  // 注册 - 发送验证码
  app.post('/api/auth/register', authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;
      
      // 验证输入
      if (!email || !password) {
        return res.status(400).json({ message: "邮箱和密码不能为空" });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ message: "密码长度至少为6位" });
      }
      
      // 检查邮箱是否已存在
      const normalizedEmail = normalizeEmail(email);
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser && existingUser.emailVerified) {
        // 如果用户已验证，拒绝注册
        return res.status(400).json({ message: "该邮箱已被注册" });
      }
      
      // 如果用户未验证，允许重新发送验证码（覆盖之前的验证码和密码）
      // 生成验证码
      const { generateVerificationCode, getVerificationCodeExpiry } = await import('./auth');
      const code = generateVerificationCode();
      const expiresAt = getVerificationCodeExpiry();
      
      // 临时保存验证码和密码到数据库（创建或更新未验证用户）
      const { hashPassword } = await import('./auth');
      const passwordHash = await hashPassword(password);
      
      await storage.createUnverifiedUser(normalizedEmail, passwordHash, code, expiresAt);
      
      // 发送验证码邮件
      const { sendVerificationEmail } = await import('./emailService');
      try {
        await sendVerificationEmail(normalizedEmail, code);
      } catch (emailErr: any) {
        // Dev-friendly: allow local testing even if email provider/network is unavailable
        if (isDevEnv) {
          console.warn("⚠️ [Register] 开发环境发送邮件失败，已返回devCode用于本机测试：", emailErr?.message || emailErr);
          const message = existingUser
            ? "验证码发送失败（开发环境），请使用返回的 devCode 继续验证"
            : "验证码发送失败（开发环境），请使用返回的 devCode 继续验证";
          return res.json({ message, devCode: code });
        }
        throw emailErr;
      }
      
      const message = existingUser 
        ? "验证码已重新发送到您的邮箱" 
        : "验证码已发送到您的邮箱";
      
      res.json({ message });
    } catch (error: any) {
      console.error("❌ [Register] 注册失败:", error);
      res.status(500).json({ message: error.message || "注册失败" });
    }
  });
  
  // 验证码验证 - 完成注册
  app.post('/api/auth/verify', authLimiter, async (req: any, res) => {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ message: "邮箱和验证码不能为空" });
      }
      const normalizedEmail = normalizeEmail(email);
      
      // 获取未验证用户
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user) {
        return res.status(404).json({ message: "用户不存在" });
      }
      
      if (user.emailVerified) {
        return res.status(400).json({ message: "该邮箱已验证" });
      }
      
      // 验证验证码
      const { isVerificationCodeValid } = await import('./auth');
      if (!isVerificationCodeValid(code, user.verificationCode, user.verificationCodeExpiresAt)) {
        return res.status(400).json({ message: "验证码无效或已过期" });
      }
      
      // 标记为已验证
      await storage.verifyUser(normalizedEmail);
      
      // 创建session
      const verifiedUser = await storage.getUserByEmail(normalizedEmail);
      req.session.user = { id: verifiedUser!.id };
      
      res.json({ 
        message: "注册成功",
        user: verifiedUser
      });
    } catch (error: any) {
      console.error("❌ [Verify] 验证失败:", error);
      res.status(500).json({ message: error.message || "验证失败" });
    }
  });
  
  // 登录
  app.post('/api/auth/login', authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "邮箱和密码不能为空" });
      }
      const normalizedEmail = normalizeEmail(email);
      
      // 查找用户
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user) {
        return res.status(401).json({ message: "邮箱或密码错误" });
      }
      
      if (!user.emailVerified) {
        return res.status(401).json({ message: "请先验证邮箱" });
      }
      
      if (!user.passwordHash) {
        return res.status(401).json({ message: "密码未设置" });
      }
      
      // 验证密码
      const { verifyPassword } = await import('./auth');
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "邮箱或密码错误" });
      }
      
      // 创建session
      req.session.user = { id: user.id };
      
      res.json({ 
        message: "登录成功",
        user
      });
    } catch (error: any) {
      console.error("❌ [Login] 登录失败:", error);
      res.status(500).json({ message: error.message || "登录失败" });
    }
  });
  
  // 登出
  app.post('/api/auth/logout', async (req: any, res) => {
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
  
  // 忘记密码 - 发送重置密码验证码
  app.post('/api/auth/forgot-password', authLimiter, async (req: any, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "邮箱不能为空" });
      }
      const normalizedEmail = normalizeEmail(email);
      
      // 检查用户是否存在
      const user = await storage.getUserByEmail(normalizedEmail);
      
      // Security: Always return success to prevent enumeration
      // Even if user doesn't exist or isn't verified, we pretend to send the email
      if (!user || !user.emailVerified) {
        return res.json({ message: "如果该邮箱已注册，重置密码验证码已发送" });
      }
      
      // 生成验证码
      const { generateVerificationCode, getVerificationCodeExpiry } = await import('./auth');
      const code = generateVerificationCode();
      const expiresAt = getVerificationCodeExpiry();
      
      // 保存验证码到数据库
      await storage.updatePasswordResetCode(normalizedEmail, code, expiresAt);
      
      // 发送重置密码邮件
      const { sendPasswordResetEmail } = await import('./emailService');
      try {
        await sendPasswordResetEmail(normalizedEmail, code);
      } catch (emailErr: any) {
        if (isDevEnv) {
          console.warn("⚠️ [Forgot Password] 开发环境发送邮件失败，已返回devCode用于本机测试：", emailErr?.message || emailErr);
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
  
  // 重置密码 - 验证码验证并更新密码
  app.post('/api/auth/reset-password', authLimiter, async (req: any, res) => {
    try {
      const { email, code, newPassword } = req.body;
      
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "邮箱、验证码和新密码不能为空" });
      }
      const normalizedEmail = normalizeEmail(email);
      
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "新密码长度至少为6位" });
      }
      
      // 获取用户
      const user = await storage.getUserByEmail(normalizedEmail);
      
      // Security: Always return the same error message to prevent enumeration
      // We cannot distinguish between "user doesn't exist", "user not verified", or "invalid code"
      if (!user || !user.emailVerified) {
        console.log(`[Security] Reset password attempt for non-existent/unverified user: ${normalizedEmail}`);
        return res.status(400).json({ message: "验证码无效或已过期" });
      }
      
      // 验证验证码
      const { isVerificationCodeValid } = await import('./auth');
      if (!isVerificationCodeValid(code, user.verificationCode, user.verificationCodeExpiresAt)) {
        console.log(`[Security] Invalid verification code for user: ${normalizedEmail}`);
        return res.status(400).json({ message: "验证码无效或已过期" });
      }
      
      // 更新密码
      const { hashPassword } = await import('./auth');
      const passwordHash = await hashPassword(newPassword);
      
      await storage.updateUserPassword(normalizedEmail, passwordHash);
      
      console.log(`[Auth] Password reset successful for user: ${normalizedEmail}`);
      res.json({ message: "密码重置成功，请使用新密码登录" });
    } catch (error: any) {
      console.error("❌ [Reset Password] 重置密码失败:", error);
      res.status(500).json({ message: error.message || "重置密码失败" });
    }
  });

  // Auth route - get current user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      // req.user已经由isAuthenticated中间件加载
      res.json(req.user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user profile route
  app.patch('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate request body
      const validatedData = updateUserProfileSchema.parse(req.body);
      
      // Update user profile
      const updatedUser = await storage.updateUserProfile(userId, validatedData);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "用户不存在" });
      }
      
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user profile:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "数据验证失败", errors: error.errors });
      }
      res.status(500).json({ message: "更新用户资料失败" });
    }
  });

  // Object Storage: Get presigned upload URL (S3-compatible)
  app.post('/api/objects/upload', isAuthenticated, async (req: any, res) => {
    const storageMode = process.env.OBJECT_STORAGE_MODE || "disabled";
    
    if (storageMode === "s3") {
      try {
        // Load S3 config from environment (set by config loader)
        const s3Config = {
          endpoint: process.env.S3_ENDPOINT!,
          region: process.env.S3_REGION!,
          bucket: process.env.S3_BUCKET!,
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        };

        // Validate required fields
        if (!s3Config.endpoint || !s3Config.region || !s3Config.bucket || 
            !s3Config.accessKeyId || !s3Config.secretAccessKey) {
          return res.status(500).json({ 
            message: "S3配置不完整。请在 config/app.config.json 中设置 s3.* 字段。" 
          });
        }

        const s3Service = new S3StorageService(s3Config);
        const contentType = req.body.contentType || "image/jpeg";
        const result = await s3Service.getPresignedUploadUrl(contentType);
        
        res.json({
          uploadUrl: result.uploadUrl,
          objectKey: result.objectKey,
          publicUrl: result.publicUrl,
        });
      } catch (error: any) {
        console.error("Error getting S3 presigned URL:", error);
        res.status(500).json({ message: error.message || "获取上传链接失败" });
      }
    } else if (storageMode === "replit") {
      // Legacy Replit object storage (for backward compatibility)
      try {
        const objectStorageService = new ObjectStorageService();
        const uploadURL = await objectStorageService.getObjectEntityUploadURL();
        res.json({ uploadURL });
      } catch (error: any) {
        console.error("Error getting upload URL:", error);
        res.status(500).json({ message: error.message || "获取上传链接失败" });
      }
    } else {
      // Disabled or unknown mode
      return res.status(501).json({ 
        message: "对象存储未启用。请在 config/app.config.json 中设置 objectStorage.mode 为 's3' 或使用本地上传方案。" 
      });
    }
  });

  // Avatar upload: For S3, we just return the public URL directly
  // For Replit, we normalize the path (legacy support)
  app.put('/api/avatars', isAuthenticated, async (req: any, res) => {
    if (!req.body.avatarURL) {
      return res.status(400).json({ error: "avatarURL is required" });
    }

    const storageMode = process.env.OBJECT_STORAGE_MODE || "disabled";
    const userId = req.user.id;

    if (storageMode === "s3") {
      // For S3, avatarURL should already be the public URL from upload
      // Just return it as-is (or validate it's a valid S3 URL)
      res.status(200).json({
        objectPath: req.body.avatarURL,
        publicUrl: req.body.avatarURL,
      });
    } else if (storageMode === "replit") {
      // Legacy Replit object storage
      try {
        const objectStorageService = new ObjectStorageService();
        const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
          req.body.avatarURL,
          {
            owner: userId,
            visibility: "public",
          },
        );
        res.status(200).json({
          objectPath: objectPath,
        });
      } catch (error) {
        console.error("Error setting avatar ACL:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    } else {
      // For local uploads or disabled storage, just return the URL as-is
      // (assuming it's a relative path like /uploads/...)
      res.status(200).json({
        objectPath: req.body.avatarURL,
        publicUrl: req.body.avatarURL,
      });
    }
  });

  // Object Storage: Download/serve objects
  // For S3: redirect to public URL or generate presigned download URL
  // For Replit: serve via sidecar (legacy)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const storageMode = process.env.OBJECT_STORAGE_MODE || "disabled";
    
    if (storageMode === "s3") {
      // For S3, objects should be accessed via public URL directly
      // This endpoint can redirect or generate presigned URL for private buckets
      const objectKey = req.params.objectPath;
      
      try {
        const s3Config = {
          endpoint: process.env.S3_ENDPOINT!,
          region: process.env.S3_REGION!,
          bucket: process.env.S3_BUCKET!,
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        };
        
        const s3Service = new S3StorageService(s3Config);
        
        // If bucket is public, redirect to public URL
        // Otherwise, generate presigned download URL
        if (s3Config.publicBaseUrl || process.env.S3_PUBLIC_BUCKET === "true") {
          const publicUrl = s3Service.getPublicUrl(objectKey);
          return res.redirect(302, publicUrl);
        } else {
          const downloadUrl = await s3Service.getPresignedDownloadUrl(objectKey);
          return res.redirect(302, downloadUrl);
        }
      } catch (error: any) {
        console.error("Error generating S3 download URL:", error);
        return res.status(500).json({ message: "获取文件链接失败" });
      }
    } else if (storageMode === "replit") {
      // Legacy Replit object storage
      const userId = req.user.id;
      const objectStorageService = new ObjectStorageService();
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(
          req.path,
        );
        const canAccess = await objectStorageService.canAccessObjectEntity({
          objectFile,
          userId: userId,
          requestedPermission: ObjectPermission.READ,
        });
        if (!canAccess) {
          return res.sendStatus(401);
        }
        objectStorageService.downloadObject(objectFile, res);
      } catch (error) {
        console.error("Error checking object access:", error);
        if (error instanceof ObjectNotFoundError) {
          return res.sendStatus(404);
        }
        return res.sendStatus(500);
      }
    } else {
      // Disabled or unknown mode
      return res.status(404).json({ message: "对象存储未启用" });
    }
  });

  // AI Personas routes (protected)
  app.get('/api/personas', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const personas = await storage.getPersonasByUser(userId);
      res.json(personas);
    } catch (error) {
      console.error("Error fetching personas:", error);
      res.status(500).json({ message: "Failed to fetch personas" });
    }
  });

  app.get('/api/personas/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const personaId = req.params.id;
      const persona = await storage.getPersona(personaId);
      
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      
      // Verify the persona belongs to the current user
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json(persona);
    } catch (error) {
      console.error("Error fetching persona:", error);
      res.status(500).json({ message: "Failed to fetch persona" });
    }
  });

  // AI Assistant: Generate persona configuration
  app.post('/api/ai/generate-persona', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { name, description } = req.body;
      
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "Name is required" });
      }
      
      // Import the generation function
      const { generatePersonaWithAI } = await import("./aiService");
      
      // Generate persona configuration using AI with user's custom API key (avatar generation disabled)
      const personaData = await generatePersonaWithAI(userId, name, description || "", false);
      
      res.json(personaData);
    } catch (error: any) {
      console.error("Error generating persona with AI:", error);
      res.status(500).json({ message: error.message || "Failed to generate persona" });
    }
  });

  app.post('/api/personas', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate using Zod schema
      const validatedData = insertAiPersonaSchema.parse({
        ...req.body,
        userId, // Set userId server-side for security
      });
      
      const persona = await storage.createPersona(validatedData);
      res.json(persona);
    } catch (error: any) {
      console.error("Error creating persona:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create persona" });
    }
  });

  app.patch('/api/personas/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { personaId } = req.params;
      
      // Verify ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // Validate using Zod schema (excludes userId and other protected fields)
      const validatedData = updateAiPersonaSchema.parse(req.body);
      
      const updatedPersona = await storage.updatePersona(personaId, validatedData);
      res.json(updatedPersona);
    } catch (error: any) {
      console.error("Error updating persona:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update persona" });
    }
  });

  app.delete('/api/personas/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { personaId } = req.params;
      
      // Verify ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      await storage.deletePersona(personaId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting persona:", error);
      res.status(500).json({ message: "Failed to delete persona" });
    }
  });

  // Conversations routes (protected)
  app.get('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const conversations = await storage.getConversationsByUser(userId);
      
      // Batch fetch all participants and personas first
      const allParticipants = await Promise.all(
        conversations.map(conv => storage.getConversationParticipants(conv.id))
      );
      
      // Get unique persona IDs
      const personaIds = new Set<string>();
      allParticipants.forEach(participants => {
        participants.forEach(p => personaIds.add(p.personaId));
      });
      
      // Batch fetch all personas
      const personasMap = new Map();
      await Promise.all(
        Array.from(personaIds).map(async (id) => {
          const persona = await storage.getPersona(id);
          if (persona) personasMap.set(id, persona);
        })
      );
      
      // Enrich conversations with stats and personas
      const enrichedConversations = await Promise.all(
        conversations.map(async (conv, index) => {
          const stats = await storage.getConversationStats(conv.id);
          const participants = allParticipants[index];
          const personas = participants.map(p => personasMap.get(p.personaId)).filter(Boolean);
          
          return {
            ...conv,
            unreadCount: stats.unreadCount,
            lastMessage: stats.lastMessage ? {
              content: stats.lastMessage.content,
              senderType: stats.lastMessage.senderType,
              createdAt: stats.lastMessage.createdAt,
            } : null,
            personas,
          };
        })
      );
      
      // Sort by lastMessageAt, newest first (conversations with messages first, then by creation time)
      enrichedConversations.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
        return bTime - aTime; // Descending order (newest first)
      });
      
      res.json(enrichedConversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { personaIds, ...conversationData } = req.body;
      
      // Validate personaIds format before processing
      if (personaIds !== undefined && (!Array.isArray(personaIds) || personaIds.some(id => typeof id !== 'string'))) {
        return res.status(400).json({ message: "Invalid personaIds: must be an array of strings" });
      }
      
      // Pre-validate all personas before creating conversation
      if (personaIds && personaIds.length > 0) {
        for (const personaId of personaIds) {
          const persona = await storage.getPersona(personaId);
          if (!persona) {
            return res.status(404).json({ message: `Persona with id ${personaId} not found` });
          }
          if (persona.userId !== userId) {
            return res.status(403).json({ message: "Forbidden: You don't own this persona" });
          }
        }
      }
      
      // Validate conversation data using Zod schema
      const validatedData = insertConversationSchema.parse({
        ...conversationData,
        userId, // Set userId server-side for security
      });
      
      // Create conversation
      const conversation = await storage.createConversation(validatedData);
      
      // Add AI persona participants with full rollback on error
      if (personaIds && personaIds.length > 0) {
        const addedParticipants: string[] = [];
        try {
          for (const personaId of personaIds) {
            await storage.addParticipant({
              conversationId: conversation.id,
              personaId: personaId,
            });
            addedParticipants.push(personaId);
          }
        } catch (participantError) {
          // Rollback: delete the conversation if participant creation fails
          console.error(`Failed to add participant after ${addedParticipants.length} successful inserts:`, participantError);
          try {
            await storage.deleteConversation(conversation.id);
            console.log(`Successfully rolled back conversation ${conversation.id}`);
          } catch (deleteError) {
            // Critical: rollback failed, log for manual cleanup
            console.error(`CRITICAL: Failed to rollback conversation ${conversation.id}. Manual cleanup required.`, deleteError);
            return res.status(500).json({ 
              message: "Failed to create conversation participants and rollback failed. Please contact support.",
              conversationId: conversation.id 
            });
          }
          return res.status(500).json({ 
            message: "Failed to add participants to conversation",
            error: participantError instanceof Error ? participantError.message : "Unknown error"
          });
        }
      }
      
      // Broadcast group creation if this is a group conversation
      if (conversation.isGroup) {
        broadcastGroupEvent(userId, 'created', conversation);
      }
      
      res.json(conversation);
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.delete('/api/conversations/:conversationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      
      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      await storage.deleteConversation(conversationId);
      // Multi-device sync: notify all devices for this user
      broadcastToUserEvent(userId, 'conversation_deleted', { conversationId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  // Update conversation (for avatar, title, etc.)
  app.patch('/api/conversations/:conversationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      const { avatarUrl, title } = req.body;
      
      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Update conversation
      const updated = await storage.updateConversation(conversationId, {
        avatarUrl,
        title,
      });
      
      // Broadcast update if this is a group conversation
      if (conversation.isGroup) {
        broadcastGroupEvent(userId, 'updated', updated);
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // Participant management
  app.post('/api/conversations/:conversationId/participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      const { personaId } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership (prevent cross-tenant data exposure)
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // Validate using Zod schema
      const validatedData = insertConversationParticipantSchema.parse({
        conversationId,
        personaId,
      });
      
      const participant = await storage.addParticipant(validatedData);
      
      // Broadcast participant added event if this is a group
      if (conversation.isGroup) {
        broadcastGroupEvent(userId, 'participant_added', { conversationId, personaId, participant });
      }
      
      res.json(participant);
    } catch (error: any) {
      console.error("Error adding participant:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add participant" });
    }
  });

  // Get single conversation details
  app.get('/api/conversations/:conversationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      
      // Get conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Get participants (personas)
      const participants = await storage.getConversationParticipants(conversationId);
      const personas = await Promise.all(
        participants.map(async (p) => {
          if (p.personaId) {
            const persona = await storage.getPersona(p.personaId);
            return persona
              ? {
                  id: persona.id,
                  name: persona.name,
                  avatarUrl: persona.avatarUrl,
                  responseDelay: persona.responseDelay,
                }
              : null;
          }
          return null;
        })
      );
      
      res.json({
        ...conversation,
        personas: personas.filter((p) => p !== null),
      });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.get('/api/conversations/:conversationId/participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      
      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      const participants = await storage.getConversationParticipants(conversationId);
      res.json(participants);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  app.delete('/api/conversations/:conversationId/participants/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId, personaId } = req.params;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership (prevent cross-tenant manipulation)
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      await storage.removeParticipant(conversationId, personaId);
      
      // Broadcast participant removed event if this is a group
      if (conversation.isGroup) {
        broadcastGroupEvent(userId, 'participant_removed', { conversationId, personaId });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing participant:", error);
      res.status(500).json({ message: "Failed to remove participant" });
    }
  });

  // Messages routes (protected)
  app.get('/api/conversations/:conversationId/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Verify user owns this conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't have access to this conversation" });
      }
      
      const messages = await storage.getMessagesByConversation(conversationId, limit, offset);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/messages', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.body;
      
      // Verify user owns this conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't have access to this conversation" });
      }
      
      // Validate using Zod schema
      const validatedData = insertMessageSchema.parse({
        ...req.body,
        senderId: null, // User messages have null senderId
        senderType: "user",
      });
      
      const message = await storage.createMessage(validatedData);
      
      // DEBUG: Log saved message with clientMessageId
      console.log('[POST /api/messages] Saved message:', {
        id: message.id,
        clientMessageId: message.clientMessageId,
        content: message.content?.substring(0, 20)
      });
      
      // Broadcast new message to all connected clients in the conversation
      broadcastNewMessage(conversationId, message);
      
      // Update conversation's last message timestamp
      await storage.updateConversationLastMessage(conversationId);
      
      // CRITICAL: Create AI reply job for background processing
      // This ensures AI responds even if user closes browser
      await storage.createAiReplyJob({
        conversationId,
        userMessageId: message.id,
        status: 'pending',
        attempts: 0,
      });
      
      res.json(message);
    } catch (error: any) {
      console.error("Error creating message:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  // Mark all messages in a conversation as read
  app.post('/api/conversations/:conversationId/read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      
      // Verify user owns this conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't have access to this conversation" });
      }
      
      await storage.markConversationMessagesAsRead(conversationId);
      // Multi-device sync: notify all devices for this user
      broadcastToUserEvent(userId, 'conversation_read', { conversationId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  // AI persona selection for group chats
  app.post('/api/ai/select-persona', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId, userMessage } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Select which persona should respond
      const personaId = await selectRespondingPersona({
        conversationId,
        userMessage,
      });
      
      res.json({ personaId });
    } catch (error: any) {
      console.error("Error selecting persona:", error);
      res.status(500).json({ message: "Failed to select responding persona" });
    }
  });

  // AI generation routes
  app.post('/api/ai/generate', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId, personaId, content } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // NOTE: User message is already saved via POST /api/messages before this endpoint is called
      // No need to save it again here - that would cause duplicate messages!
      
      // Generate AI response (conversation history includes the user message already in DB)
      const aiResponse = await generateAIResponse({
        conversationId,
        personaId,
        userMessage: content,
      });
      
      // Split AI response by backslash (\) and forward slash (/)
      // This creates multiple messages for more natural conversation flow
      const messageParts = aiResponse
        .split(/[\\\/]/)  // Split by both \ and /
        .map(part => part.trim())  // Trim whitespace
        .filter(part => part.length > 0);  // Remove empty parts
      
      // Save and broadcast AI messages with 2-3 second random delay between each
      const aiMessages = [];
      if (messageParts.length === 0) {
        // No parts after splitting - check if original response is empty
        const trimmedResponse = aiResponse.trim();
        if (trimmedResponse.length > 0) {
          // Save original response only if it's not empty
          const aiMessage = await storage.createMessage({
            conversationId,
            senderId: personaId,
            senderType: "ai",
            content: aiResponse,
            isRead: false,
            status: "sent",
          });
          
          // Add persona info for broadcast
          const messageWithPersona = {
            ...aiMessage,
            personaName: persona.name,
            personaAvatar: persona.avatarUrl
          };
          
          aiMessages.push(aiMessage);
          broadcastNewMessage(conversationId, messageWithPersona);
        }
      } else {
        // Save and broadcast each part with 2-3 second random delay
        for (let i = 0; i < messageParts.length; i++) {
          if (i > 0) {
            // Wait 2-3 seconds randomly before saving and sending next message
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
          }
          
          const aiMessage = await storage.createMessage({
            conversationId,
            senderId: personaId,
            senderType: "ai",
            content: messageParts[i],
            isRead: false,
            status: "sent",
          });
          
          // Add persona info for broadcast
          const messageWithPersona = {
            ...aiMessage,
            personaName: persona.name,
            personaAvatar: persona.avatarUrl
          };
          
          aiMessages.push(aiMessage);
          broadcastNewMessage(conversationId, messageWithPersona);
        }
      }
      
      // Update conversation's last message timestamp
      await storage.updateConversationLastMessage(conversationId);
      
      // Extract and store memories every 5 user messages (to reduce API calls)
      const userMessagesCount = await storage.countUserMessages(conversationId);
      
      if (userMessagesCount % 5 === 0 && userMessagesCount >= 5) {
        extractAndStoreMemories(conversationId, personaId, content, aiResponse)
          .catch(err => console.error("Memory extraction failed:", err));
      }
      
      res.json({ aiMessages, response: aiResponse });
    } catch (error: any) {
      console.error("Error generating AI response:", error);
      
      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: error.errors 
        });
      }
      
      // Handle classified AI errors
      if (error.name === 'AIError') {
        return res.status(500).json({ 
          message: error.message,
          errorType: error.type,
          canRetry: error.type === 'NETWORK_ERROR' || error.type === 'QUOTA_ERROR' || error.type === 'MODEL_ERROR'
        });
      }
      
      // Handle unknown errors
      res.status(500).json({ 
        message: "AI 服务出错，请稍后重试",
        errorType: "UNKNOWN_ERROR",
        canRetry: true
      });
    }
  });

  // MiniMax Speech-2.6-Turbo TTS (returns binary audio)
  app.post("/api/voice/tts", isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const userSettings = await storage.getAiSettings(userId);
      const { text, voiceId, format } = req.body || {};
      const { audio, contentType } = await minimaxTtsToBuffer({
        text,
        voiceId,
        format,
        apiKey: userSettings?.minimaxApiKey || undefined,
      });
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(audio);
    } catch (error: any) {
      console.error("[/api/voice/tts] error:", error);
      return res.status(400).json({ message: error?.message || "TTS failed" });
    }
  });

  // WebRTC configuration (STUN/TURN + MiniMax streaming URLs)
  app.get("/api/webrtc/config", isAuthenticated, async (_req: any, res) => {
    try {
      const cfg = loadAndApplyConfig();
      const webrtcConfig = {
        stunServers: cfg.webrtc?.stunServers || [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        turnServers: cfg.webrtc?.turnServers || [],
        minimax: {
          streamAsrUrl: cfg.minimax?.streamAsrUrl || process.env.MINIMAX_STREAM_ASR_URL || "wss://api.minimax.io/ws/v1/asr",
          streamTtsUrl: cfg.minimax?.streamTtsUrl || process.env.MINIMAX_STREAM_TTS_URL || "wss://api.minimax.io/ws/v1/t2a_v2",
        },
      };
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(webrtcConfig);
    } catch (error: any) {
      console.error("[/api/webrtc/config] error:", error);
      res.status(500).json({ message: error?.message || "Failed to load WebRTC config" });
    }
  });

  app.post('/api/ai/generate-stream', isAuthenticated, messageLimiter, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { conversationId, personaId, content } = req.body;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this conversation" });
      }
      
      // Verify persona ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // NOTE: User message is already saved via POST /api/messages before this endpoint is called
      // No need to save it again here - that would cause duplicate messages!
      
      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Generate AI response stream (conversation history includes the user message already in DB)
      const stream = await generateAIResponseStream({
        conversationId,
        personaId,
        userMessage: content,
      });
      
      let fullResponse = '';
      
      // Stream the response
      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || '';
        fullResponse += chunkContent;
        
        if (chunkContent) {
          res.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
        }
      }
      
      // Split AI response by backslash (\) and forward slash (/)
      const messageParts = fullResponse
        .split(/[\\\/]/)  // Split by both \ and /
        .map(part => part.trim())
        .filter(part => part.length > 0);
      
      // Save and broadcast AI messages with 2-3 second random delay between each
      const aiMessages = [];
      if (messageParts.length === 0) {
        // No parts after splitting - check if original response is empty
        const trimmedResponse = fullResponse.trim();
        if (trimmedResponse.length > 0) {
          // Save original response only if it's not empty
          const aiMessage = await storage.createMessage({
            conversationId,
            senderId: personaId,
            senderType: "ai",
            content: fullResponse,
            isRead: false,
            status: "sent",
          });
          aiMessages.push(aiMessage);
          broadcastNewMessage(conversationId, aiMessage);
        }
      } else {
        // Save and broadcast each part with 2-3 second random delay
        for (let i = 0; i < messageParts.length; i++) {
          if (i > 0) {
            // Wait 2-3 seconds randomly before saving and sending next message
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
          }
          
          const aiMessage = await storage.createMessage({
            conversationId,
            senderId: personaId,
            senderType: "ai",
            content: messageParts[i],
            isRead: false,
            status: "sent",
          });
          
          // Add persona info for broadcast
          const messageWithPersona = {
            ...aiMessage,
            personaName: persona.name,
            personaAvatar: persona.avatarUrl
          };
          
          aiMessages.push(aiMessage);
          broadcastNewMessage(conversationId, messageWithPersona);
        }
      }
      
      // Update conversation's last message timestamp
      await storage.updateConversationLastMessage(conversationId);
      
      // Extract and store memories every 5 user messages (to reduce API calls)
      const userMessagesCount = await storage.countUserMessages(conversationId);
      
      if (userMessagesCount % 5 === 0 && userMessagesCount >= 5) {
        extractAndStoreMemories(conversationId, personaId, content, fullResponse)
          .catch(err => console.error("Memory extraction failed:", err));
      }
      
      // Send final message with saved message data
      res.write(`data: ${JSON.stringify({ done: true, aiMessages })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Error generating AI response stream:", error);
      
      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        res.write(`data: ${JSON.stringify({ 
          error: "Invalid input", 
          details: error.errors 
        })}\n\n`);
      } 
      // Handle classified AI errors
      else if (error.name === 'AIError') {
        res.write(`data: ${JSON.stringify({ 
          error: error.message,
          errorType: error.type,
          canRetry: error.type === 'NETWORK_ERROR' || error.type === 'QUOTA_ERROR' || error.type === 'MODEL_ERROR'
        })}\n\n`);
      } 
      // Handle unknown errors
      else {
        res.write(`data: ${JSON.stringify({ 
          error: "AI 服务出错，请稍后重试",
          errorType: "UNKNOWN_ERROR",
          canRetry: true
        })}\n\n`);
      }
      res.end();
    }
  });

  // ==================== Memory Routes ====================
  
  // Get all memories for a specific persona
  app.get('/api/memories/persona/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { personaId } = req.params;
      
      // Verify persona ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "AI persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      const memories = await storage.getMemoriesByPersona(personaId, userId);
      res.json(memories);
    } catch (error) {
      console.error("Error fetching memories:", error);
      res.status(500).json({ message: "Failed to fetch memories" });
    }
  });

  // Create a new memory
  app.post('/api/memories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { personaId, key, value, context, importance } = req.body;
      
      // Verify persona ownership
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "AI persona not found" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this persona" });
      }
      
      // Validate using Zod schema
      const validatedData = insertMemorySchema.parse({
        personaId,
        userId,
        key,
        value,
        context: context || null,
        importance: importance || 5,
      });
      
      const memory = await storage.createMemory(validatedData);
      res.json(memory);
    } catch (error: any) {
      console.error("Error creating memory:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create memory" });
    }
  });

  // Update a memory
  app.patch('/api/memories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { key, value, context, importance } = req.body;
      
      // Verify memory ownership
      const existingMemory = await storage.getMemory(id);
      if (!existingMemory) {
        return res.status(404).json({ message: "Memory not found" });
      }
      if (existingMemory.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this memory" });
      }
      
      // Prepare update data (only include fields that were provided)
      const updates: any = {};
      if (key !== undefined) updates.key = key;
      if (value !== undefined) updates.value = value;
      if (context !== undefined) updates.context = context;
      if (importance !== undefined) updates.importance = importance;
      
      const memory = await storage.updateMemory(id, updates);
      if (!memory) {
        return res.status(404).json({ message: "Memory not found after update" });
      }
      
      res.json(memory);
    } catch (error: any) {
      console.error("Error updating memory:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update memory" });
    }
  });

  // Delete a memory
  app.delete('/api/memories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      // Verify memory ownership
      const memory = await storage.getMemory(id);
      if (!memory) {
        return res.status(404).json({ message: "Memory not found" });
      }
      if (memory.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this memory" });
      }
      
      await storage.deleteMemory(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting memory:", error);
      res.status(500).json({ message: "Failed to delete memory" });
    }
  });

  // ==================== Moments Routes ====================
  
  // Get moments for current user (only their own moments and their AI personas' moments)
  app.get('/api/moments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Get moments only for current user (user-isolated feed)
      const moments = await storage.getMomentsByUser(userId, limit, offset);
      
      // Fetch likes and comments for each moment
      const momentsWithDetails = await Promise.all(
        moments.map(async (moment) => {
          const [likes, comments] = await Promise.all([
            storage.getMomentLikes(moment.id),
            storage.getMomentComments(moment.id),
          ]);
          return {
            ...moment,
            likes,
            comments,
          };
        })
      );
      
      res.json(momentsWithDetails);
    } catch (error) {
      console.error("Error fetching moments:", error);
      res.status(500).json({ message: "Failed to fetch moments" });
    }
  });

  // Create a new moment
  app.post('/api/moments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate using Zod schema
      const validatedData = insertMomentSchema.parse({
        ...req.body,
        userId, // Always set to current user for security
        authorId: userId, // User is posting the moment
        authorType: 'user',
      });
      
      const moment = await storage.createMoment(validatedData);
      
      // Broadcast moment creation to all devices of this user (user-isolated)
      broadcastMomentEvent(userId, 'created', moment);
      
      // Trigger AI comments (async, non-blocking)
      triggerAICommentsOnMoment(
        moment.id,
        userId,
        moment.content,
        moment.images || undefined
      ).catch(err => {
        console.error("Error triggering AI comments:", err);
        // Don't fail the response if AI comments fail
      });
      
      res.json(moment);
    } catch (error: any) {
      console.error("Error creating moment:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create moment" });
    }
  });

  // Delete a moment
  app.delete('/api/moments/:momentId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { momentId } = req.params;
      
      // Verify ownership
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      if (moment.userId !== userId) {
        return res.status(403).json({ message: "Forbidden: You don't own this moment" });
      }
      
      await storage.deleteMoment(momentId);
      
      // Broadcast moment deletion to all devices of this user
      broadcastMomentEvent(userId, 'deleted', { id: momentId });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting moment:", error);
      res.status(500).json({ message: "Failed to delete moment" });
    }
  });

  // Toggle like on a moment
  app.post('/api/moments/:momentId/like', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { momentId } = req.params;
      
      // Verify moment exists (anyone can like any moment)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      const liked = await storage.toggleMomentLike(momentId, userId, 'user');
      
      // Broadcast like/unlike event to all devices of the moment owner (user-isolated)
      broadcastMomentEvent(moment.userId, 'liked', { momentId, userId, liked });
      
      res.json({ liked });
    } catch (error) {
      console.error("Error toggling moment like:", error);
      res.status(500).json({ message: "Failed to toggle like" });
    }
  });

  // Get likes for a moment
  app.get('/api/moments/:momentId/likes', isAuthenticated, async (req: any, res) => {
    try {
      const { momentId } = req.params;
      
      // Verify moment exists (anyone can view likes)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      const likes = await storage.getMomentLikes(momentId);
      res.json(likes);
    } catch (error) {
      console.error("Error fetching moment likes:", error);
      res.status(500).json({ message: "Failed to fetch likes" });
    }
  });

  // Create a comment on a moment
  app.post('/api/moments/:momentId/comments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { momentId } = req.params;
      const { content, parentCommentId } = req.body;
      
      // Verify moment exists (anyone can comment)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      // Log nesting level for debugging (no limit enforced - supports arbitrary depth)
      if (parentCommentId) {
        let nestingLevel = 1;
        let currentComment = await storage.getMomentCommentById(parentCommentId);
        
        while (currentComment && currentComment.parentCommentId) {
          nestingLevel++;
          currentComment = await storage.getMomentCommentById(currentComment.parentCommentId);
        }
        
        console.log(`[评论嵌套] 当前嵌套层级`, {
          parentCommentId,
          nestingLevel,
          supportsArbitraryDepth: true,
        });
        
        // No limit enforced - supports arbitrary-depth comment threading as per replit.md
      }
      
      // Server-side author derivation - prevent spoofing
      const validatedData = insertMomentCommentSchema.parse({
        momentId,
        authorId: userId, // Always use authenticated user
        authorType: 'user', // Always set to 'user' for authenticated users
        content,
        parentCommentId: parentCommentId || null,
      });
      
      const comment = await storage.createMomentComment(validatedData);
      
      // Broadcast comment creation to all devices of the moment owner (user-isolated)
      broadcastMomentEvent(moment.userId, 'commented', { momentId, comment });
      
      // Trigger AI reply in two scenarios:
      // 1. User directly comments on AI's moment (top-level comment)
      // 2. User replies to AI's comment (nested comment)
      
      if (parentCommentId) {
        // Scenario 2: User is replying to another comment
        const parentComment = await storage.getMomentCommentById(parentCommentId);
        if (parentComment && parentComment.authorType === 'ai') {
          // Reply with the same AI persona that made the parent comment
          triggerAIReplyToComment(comment.id, userId, parentComment.authorId).catch(err => {
            console.error("Error triggering AI reply:", err);
          });
        }
      } else {
        // Scenario 1: User is commenting directly on the moment (top-level)
        if (moment.authorType === 'ai') {
          // Reply with the same AI persona that posted the moment
          triggerAIReplyToComment(comment.id, userId, moment.authorId).catch(err => {
            console.error("Error triggering AI reply:", err);
          });
        }
      }
      
      res.json(comment);
    } catch (error: any) {
      console.error("Error creating comment:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // Get comments for a moment
  app.get('/api/moments/:momentId/comments', isAuthenticated, async (req: any, res) => {
    try {
      const { momentId } = req.params;
      
      // Verify moment exists (anyone can view comments)
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      const comments = await storage.getMomentComments(momentId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Mark moment comments as read
  app.post('/api/moments/:momentId/comments/mark-read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { momentId } = req.params;
      
      // Verify moment exists and user is the author
      const moment = await storage.getMoment(momentId);
      if (!moment) {
        return res.status(404).json({ message: "Moment not found" });
      }
      
      if (moment.authorId !== userId || moment.authorType !== 'user') {
        return res.status(403).json({ message: "只有动态作者可以标记评论为已读" });
      }
      
      await storage.markMomentCommentsAsRead(momentId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking comments as read:", error);
      res.status(500).json({ message: "Failed to mark comments as read" });
    }
  });

  // Delete a comment
  app.delete('/api/moments/comments/:commentId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { commentId } = req.params;
      
      // Note: We should verify comment ownership here, but we'll need to fetch it first
      // For now, we'll just delete it (in production, add ownership check)
      
      await storage.deleteMomentComment(commentId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Trigger AI to post a moment
  app.post('/api/ai/trigger-moment/:personaId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { personaId } = req.params;
      
      // Verify persona belongs to user
      const persona = await storage.getPersona(personaId);
      if (!persona) {
        return res.status(404).json({ message: "AI女友不存在" });
      }
      if (persona.userId !== userId) {
        return res.status(403).json({ message: "无权访问此AI女友" });
      }
      
      // Trigger AI to post moment
      const result = await triggerAIPostMoment(personaId, userId);
      
      if (result.success) {
        res.json(result.moment);
      } else {
        res.status(400).json({ message: result.error || "发送动态失败" });
      }
    } catch (error) {
      console.error("Error triggering AI moment:", error);
      res.status(500).json({ message: "发送动态失败" });
    }
  });

  // Check AI service availability
  app.get('/api/ai/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Check Replit AI Integrations environment variables (preferred method)
      const hasGeminiIntegration = !!(
        process.env.AI_INTEGRATIONS_GEMINI_API_KEY && 
        process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      );
      const hasOpenAIIntegration = !!(
        process.env.AI_INTEGRATIONS_OPENAI_API_KEY && 
        process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
      );
      
      // Check legacy/standalone API keys
      const hasGoogleKey = !!process.env.GOOGLE_AI_API_KEY;
      
      // Check user-specific AI settings
      const userSettings = await storage.getAiSettings(userId);
      const hasCustomKey = !!(userSettings?.customApiKey);
      
      // Determine which providers are available
      const hasGoogle = hasGeminiIntegration || hasGoogleKey;
      const hasOpenAI = hasOpenAIIntegration;
      
      // User is online if ANY API source is configured:
      // 1. Replit AI Integrations (Gemini or OpenAI), OR
      // 2. Legacy Google API key, OR
      // 3. Custom user API key
      const isOnline = hasGoogle || hasOpenAI || hasCustomKey;
      
      res.json({
        isOnline,
        providers: {
          openai: hasOpenAI,
          google: hasGoogle,
          custom: hasCustomKey,
        },
        message: isOnline 
          ? "AI服务已就绪" 
          : "AI服务未配置。请前往设置页面配置您的API密钥。"
      });
    } catch (error) {
      console.error("Error checking AI status:", error);
      res.status(500).json({ message: "Failed to check AI status" });
    }
  });

  // AI Settings routes (protected)
  app.get('/api/settings/ai', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const settings = await storage.getAiSettings(userId);
      res.json(settings);
    } catch (error: any) {
      console.error("Error fetching AI settings:", error);
      if (error?.code === "42703") {
        return res.status(500).json({
          message:
            "数据库未迁移：缺少 ai_settings.minimax_api_key 字段。请先运行 `npm run db:push`（或 drizzle-kit push）后再刷新页面。",
        });
      }
      res.status(500).json({ message: "Failed to fetch AI settings" });
    }
  });

  app.put('/api/settings/ai', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { provider, model, customApiKey, minimaxApiKey, ragEnabled, searchEnabled, language } = req.body;
      
      // Try to update existing settings
      let settings = await storage.updateAiSettings(userId, {
        provider,
        model,
        customApiKey,
        minimaxApiKey,
        ragEnabled,
        searchEnabled,
        language,
      });
      
      // If no settings exist, create new ones
      if (!settings) {
        settings = await storage.createAiSettings({
          userId,
          provider: provider || "google",
          model: model || "gemini-2.5-pro",
          customApiKey: customApiKey || null,
          minimaxApiKey: minimaxApiKey || null,
          ragEnabled: ragEnabled || false,
          searchEnabled: searchEnabled || false,
          language: language || "zh-CN",
        });
      }
      
      res.json(settings);
    } catch (error: any) {
      console.error("Error updating AI settings:", error);
      if (error?.code === "42703") {
        return res.status(500).json({
          message:
            "数据库未迁移：缺少 ai_settings.minimax_api_key 字段。请先运行 `npm run db:push`（或 drizzle-kit push）后再保存设置。",
        });
      }
      res.status(500).json({ message: "Failed to update AI settings" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket server for real-time messaging
  setupWebSocket(httpServer);
  setupVoiceWebSocket(httpServer);
  
  return httpServer;
}
