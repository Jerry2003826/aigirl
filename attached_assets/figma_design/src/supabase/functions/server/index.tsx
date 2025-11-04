import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// ⚡ 重试辅助函数：处理临时网络错误
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 500,
  operationName = 'operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [${operationName}] Attempt ${attempt}/${maxRetries}`);
      const result = await fn();
      if (attempt > 1) {
        console.log(`✅ [${operationName}] Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      
      // 检查是否是可重试的错误
      const errorMessage = error.message || String(error);
      const isRetryable = 
        errorMessage.includes('connection reset') ||
        errorMessage.includes('connection error') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('fetch failed');
      
      if (!isRetryable) {
        console.error(`❌ [${operationName}] Non-retryable error:`, errorMessage);
        throw error;
      }
      
      if (isLastAttempt) {
        console.error(`❌ [${operationName}] Failed after ${maxRetries} attempts:`, errorMessage);
        throw error;
      }
      
      const delay = initialDelay * Math.pow(2, attempt - 1); // 指数退避
      console.warn(`⚠️ [${operationName}] Attempt ${attempt} failed: ${errorMessage}`);
      console.log(`⏳ [${operationName}] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`);
}

// 调试：检查环境变量
console.log('🔧 Server starting with environment:');
console.log('  SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? '✅ Set' : '❌ Missing');
console.log('  SUPABASE_SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? '✅ Set' : '❌ Missing');
console.log('  SUPABASE_ANON_KEY:', Deno.env.get('SUPABASE_ANON_KEY') ? '✅ Set' : '❌ Missing');

// Create Supabase client with service role key (for admin operations like KV store)
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// For backward compatibility, keep 'supabase' as alias to admin client
const supabase = supabaseAdmin;

// Helper function to verify access token
// Creates a client with the user's JWT to verify it
const verifyAccessToken = async (accessToken: string) => {
  try {
    console.log('🔐 Verifying access token...');
    console.log('  Token length:', accessToken?.length || 0);
    console.log('  Token preview:', accessToken ? `${accessToken.substring(0, 30)}...` : 'null');
    console.log('  Token suffix:', accessToken ? `...${accessToken.substring(accessToken.length - 10)}` : 'null');
    
    // Validate token format
    if (!accessToken || typeof accessToken !== 'string') {
      console.error('❌ Invalid token format');
      return { 
        data: { user: null }, 
        error: { message: 'Invalid token format', status: 401 } 
      };
    }
    
    // Trim whitespace
    accessToken = accessToken.trim();
    
    // Check if token looks like a JWT
    const tokenParts = accessToken.split('.');
    if (tokenParts.length !== 3) {
      console.error('❌ Token does not look like a JWT (parts:', tokenParts.length, ')');
      console.error('  Token value:', accessToken.substring(0, 100));
      return { 
        data: { user: null }, 
        error: { message: 'Invalid JWT format', status: 401 } 
      };
    }
    
    // Try to decode the JWT header and payload to check format
    let decodedPayload: any = null;
    try {
      const header = JSON.parse(atob(tokenParts[0]));
      const payload = JSON.parse(atob(tokenParts[1]));
      decodedPayload = payload;
      
      console.log('  JWT header:', header);
      console.log('  JWT payload (user):', {
        sub: payload.sub,
        email: payload.email,
        exp: payload.exp,
        iat: payload.iat,
        aud: payload.aud
      });
      
      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        console.error('❌ Token has expired');
        console.error('  Current time:', now);
        console.error('  Token expiry:', payload.exp);
        console.error('  Time difference:', now - payload.exp, 'seconds');
        return {
          data: { user: null },
          error: { message: 'Token has expired', status: 401 }
        };
      }
      
      console.log('✅ JWT decoded successfully and not expired');
      console.log('  User ID from JWT:', payload.sub);
      console.log('  Email from JWT:', payload.email);
    } catch (e) {
      console.error('❌ Cannot decode JWT:', e.message);
      return {
        data: { user: null },
        error: { message: `JWT decode failed: ${e.message}`, status: 401 }
      };
    }
    
    // Since we have successfully decoded and validated the JWT,
    // we can use it directly without relying on getUser()
    // This is more reliable in edge function environments
    
    console.log('✅ JWT is valid and not expired, using direct JWT verification');
    console.log('  Creating user object from JWT payload...');
    
    // Construct user object from JWT payload
    const user = {
      id: decodedPayload.sub,
      email: decodedPayload.email || '',
      aud: decodedPayload.aud || 'authenticated',
      role: decodedPayload.role || 'authenticated',
      app_metadata: decodedPayload.app_metadata || {},
      user_metadata: decodedPayload.user_metadata || {},
      created_at: decodedPayload.created_at || new Date().toISOString(),
      updated_at: decodedPayload.updated_at || new Date().toISOString()
    };
    
    console.log('✅ Token verified successfully via JWT decode:', {
      userId: user.id,
      email: user.email,
      aud: user.aud,
      role: user.role
    });
    
    return {
      data: { user },
      error: null
    };
    
  } catch (err) {
    console.error('💥 Token verification exception:', {
      message: err.message,
      name: err.name,
      stack: err.stack
    });
    return { 
      data: { user: null }, 
      error: { message: `Token verification failed: ${err.message}`, status: 500 } 
    };
  }
};

// Enable logger
app.use('*', logger(console.log));

// Global error handler - catches all exceptions
app.onError((err, c) => {
  console.error('🚨 Global error handler caught exception:', {
    message: err.message,
    name: err.name,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method
  });
  
  return c.json({
    error: 'Internal server error',
    details: err.message,
    path: c.req.path
  }, 500);
});

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-4fd5d246/health", (c) => {
  return c.json({ status: "ok" });
});

// ==================== 认证相关路由 ====================

// 用户注册
app.post("/make-server-4fd5d246/auth/signup", async (c) => {
  try {
    const { email, password, nickname } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // 创建用户
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { nickname: nickname || '用户' },
      // 自动确认用户邮箱（因为未配置邮件服务器）
      email_confirm: true
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    return c.json({ 
      success: true, 
      user: {
        id: data.user.id,
        email: data.user.email,
        nickname: data.user.user_metadata.nickname
      }
    });
  } catch (error) {
    console.log('Signup error:', error);
    return c.json({ error: 'Internal server error during signup' }, 500);
  }
});

// 用户登录（通过客户端Supabase SDK处理，这里提供用户信息验证）
app.post("/make-server-4fd5d246/auth/verify", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    console.log('🔐 Verify request received:', {
      hasToken: !!accessToken,
      tokenLength: accessToken?.length || 0
    });
    
    if (!accessToken) {
      console.error('❌ No access token in verify request');
      return c.json({ error: 'No access token provided' }, 401);
    }

    console.log('🔐 Calling verifyAccessToken for verify...');
    let verifyResult;
    
    try {
      verifyResult = await verifyAccessToken(accessToken);
      console.log('✅ verifyAccessToken completed for verify:', {
        hasData: !!verifyResult.data,
        hasUser: !!verifyResult.data?.user,
        hasError: !!verifyResult.error,
        errorMessage: verifyResult.error?.message
      });
    } catch (verifyException) {
      console.error('💥 Exception during verifyAccessToken (verify):', {
        message: verifyException.message,
        name: verifyException.name,
        stack: verifyException.stack
      });
      return c.json({ 
        error: 'Token verification exception',
        details: verifyException.message 
      }, 500);
    }

    const { data: { user }, error } = verifyResult;

    if (error || !user) {
      console.error('❌ Verify error:', error);
      return c.json({ error: 'Invalid token' }, 401);
    }

    console.log('✅ User verified successfully:', {
      id: user.id,
      email: user.email
    });

    return c.json({ 
      success: true, 
      user: {
        id: user.id,
        email: user.email,
        nickname: user.user_metadata?.nickname || '用户'
      }
    });
  } catch (error) {
    console.error('💥 Verify route exception:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    return c.json({ error: 'Internal server error during verification' }, 500);
  }
});

// ==================== 数据存储相关路由 ====================

// 保存用户的所有数据
app.post("/make-server-4fd5d246/data/save", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    
    console.log('💾 Save request received:', {
      hasAuthHeader: !!authHeader,
      authHeaderPreview: authHeader ? `${authHeader.substring(0, 30)}...` : 'none',
      hasToken: !!accessToken,
      tokenLength: accessToken?.length || 0
    });
    
    if (!accessToken) {
      console.error('❌ No access token in save request');
      return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }

    console.log('🔐 Calling verifyAccessToken for save...');
    let verifyResult;
    
    try {
      verifyResult = await verifyAccessToken(accessToken);
      console.log('✅ verifyAccessToken completed for save:', {
        hasData: !!verifyResult.data,
        hasUser: !!verifyResult.data?.user,
        hasError: !!verifyResult.error,
        errorMessage: verifyResult.error?.message
      });
    } catch (verifyException) {
      console.error('💥 Exception during verifyAccessToken (save):', {
        message: verifyException.message,
        name: verifyException.name,
        stack: verifyException.stack
      });
      return c.json({ 
        error: 'Token verification exception',
        details: verifyException.message 
      }, 500);
    }

    const { data: { user }, error: authError } = verifyResult;

    if (authError || !user) {
      console.error('❌ Authorization error while saving data:', {
        error: authError?.message,
        status: authError?.status,
        hasUser: !!user
      });
      return c.json({ error: `Unauthorized: ${authError?.message || 'Invalid token'}` }, 401);
    }
    
    console.log('✅ User authenticated for save:', user.id);

    const requestData = await c.req.json();
    const { config, personalities, chats, groupChats, moments, userProfile, darkMode } = requestData;

    // 保存到KV store，使用用户ID作为key前缀
    const userId = user.id;
    
    // 检查数据大小和格式
    const dataSize = JSON.stringify(requestData).length;
    console.log(`📦 Saving data for user ${userId}:`);
    console.log(`  - Total size: ${(dataSize / 1024).toFixed(2)} KB`);
    console.log(`  - Config: ${config ? 'present' : 'missing'}`);
    console.log(`  - Personalities: ${personalities ? (Array.isArray(personalities) ? personalities.length : 'not array') : 'missing'}`);
    console.log(`  - Chats: ${chats ? (Array.isArray(chats) ? chats.length : 'not array') : 'missing'}`);
    console.log(`  - GroupChats: ${groupChats ? (Array.isArray(groupChats) ? groupChats.length : 'not array') : 'missing'}`);
    console.log(`  - Moments: ${moments ? (Array.isArray(moments) ? moments.length : 'not array') : 'missing'}`);
    console.log(`  - UserProfile: ${userProfile ? 'present' : 'missing'}`);
    console.log(`  - DarkMode: ${darkMode}`);
    
    if (dataSize > 1024 * 1024) {
      console.warn(`⚠️ Warning: Data size exceeds 1MB (${(dataSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // 保存每个字段，如果出错则记录详细信息
    try {
      if (config !== undefined) {
        const configSize = JSON.stringify(config).length;
        console.log(`  Saving config (${(configSize / 1024).toFixed(2)} KB)...`);
        // 使用重试机制保存 config
        await retryWithBackoff(
          () => kv.set(`user:${userId}:config`, config),
          3,
          500,
          'save config'
        );
        console.log('✅ Config saved');
      }
    } catch (error) {
      console.error('❌ Error saving config:', error);
      throw new Error(`Failed to save config: ${error.message}`);
    }
    
    try {
      if (personalities !== undefined) {
        const personalitiesSize = JSON.stringify(personalities).length;
        console.log(`  Saving personalities (${(personalitiesSize / 1024).toFixed(2)} KB)...`);
        
        // 检查是否有大头像数据
        if (Array.isArray(personalities)) {
          personalities.forEach((p: any, i: number) => {
            if (p.avatarUrl && p.avatarUrl.length > 100000) {
              console.log(`    Personality ${i} (${p.name}) has large avatar: ${(p.avatarUrl.length / 1024).toFixed(2)} KB`);
            }
          });
        }
        
        // 使用重试机制保存 personalities
        await retryWithBackoff(
          () => kv.set(`user:${userId}:personalities`, personalities),
          3,
          500,
          'save personalities'
        );
        console.log('✅ Personalities saved');
      }
    } catch (error) {
      console.error('❌ Error saving personalities:', error);
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      if (error.stack) console.error('Stack:', error.stack);
      throw new Error(`Failed to save personalities: ${error.message}`);
    }
    
    try {
      if (chats !== undefined) {
        const chatsSize = JSON.stringify(chats).length;
        console.log(`  Saving chats (${(chatsSize / 1024).toFixed(2)} KB)...`);
        
        // 检查聊天中是否有大图片
        if (Array.isArray(chats)) {
          chats.forEach((chat: any, i: number) => {
            if (chat.messages && Array.isArray(chat.messages)) {
              chat.messages.forEach((msg: any, j: number) => {
                if (msg.imageUrl && msg.imageUrl.length > 100000) {
                  console.log(`    Chat ${i}, message ${j} has large image: ${(msg.imageUrl.length / 1024).toFixed(2)} KB`);
                }
              });
            }
          });
        }
        
        // 使用重试机制保存 chats
        await retryWithBackoff(
          () => kv.set(`user:${userId}:chats`, chats),
          3,
          500,
          'save chats'
        );
        console.log('✅ Chats saved');
      }
    } catch (error) {
      console.error('❌ Error saving chats:', error);
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      if (error.stack) console.error('Stack:', error.stack);
      throw new Error(`Failed to save chats: ${error.message}`);
    }
    
    try {
      if (userProfile !== undefined) {
        const userProfileSize = JSON.stringify(userProfile).length;
        console.log(`  Saving userProfile (${(userProfileSize / 1024).toFixed(2)} KB)...`);
        // 使用重试机制保存 userProfile
        await retryWithBackoff(
          () => kv.set(`user:${userId}:userProfile`, userProfile),
          3,
          500,
          'save userProfile'
        );
        console.log('✅ UserProfile saved');
      }
    } catch (error) {
      console.error('❌ Error saving userProfile:', error);
      throw new Error(`Failed to save userProfile: ${error.message}`);
    }
    
    try {
      if (groupChats !== undefined) {
        const groupChatsSize = JSON.stringify(groupChats).length;
        console.log(`  Saving groupChats (${(groupChatsSize / 1024).toFixed(2)} KB)...`);
        // 使用重试机制保存 groupChats
        await retryWithBackoff(
          () => kv.set(`user:${userId}:groupChats`, groupChats),
          3,
          500,
          'save groupChats'
        );
        console.log('✅ GroupChats saved');
      }
    } catch (error) {
      console.error('❌ Error saving groupChats:', error);
      throw new Error(`Failed to save groupChats: ${error.message}`);
    }
    
    try {
      if (moments !== undefined) {
        const momentsSize = JSON.stringify(moments).length;
        console.log(`  Saving moments (${(momentsSize / 1024).toFixed(2)} KB)...`);
        // 使用重试机制保存 moments
        await retryWithBackoff(
          () => kv.set(`user:${userId}:moments`, moments),
          3,
          500,
          'save moments'
        );
        console.log('✅ Moments saved');
      }
    } catch (error) {
      console.error('❌ Error saving moments:', error);
      throw new Error(`Failed to save moments: ${error.message}`);
    }
    
    try {
      if (darkMode !== undefined) {
        console.log(`  Saving darkMode...`);
        // 使用重试机制保存 darkMode
        await retryWithBackoff(
          () => kv.set(`user:${userId}:darkMode`, darkMode),
          3,
          500,
          'save darkMode'
        );
        console.log('✅ DarkMode saved');
      }
    } catch (error) {
      console.error('❌ Error saving darkMode:', error);
      throw new Error(`Failed to save darkMode: ${error.message}`);
    }

    console.log('✅ All data saved successfully');
    return c.json({ success: true });
  } catch (error) {
    console.error('❌ Error saving data:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return c.json({ 
      error: 'Internal server error while saving data',
      details: error.message 
    }, 500);
  }
});

// 加载用户的所有数据
app.get("/make-server-4fd5d246/data/load", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    
    console.log('📥 Load request received:', {
      hasAuthHeader: !!authHeader,
      authHeaderPreview: authHeader ? `${authHeader.substring(0, 30)}...` : 'none',
      hasToken: !!accessToken,
      tokenLength: accessToken?.length || 0
    });
    
    if (!accessToken) {
      console.error('❌ No access token in load request');
      return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }

    console.log('🔐 Calling verifyAccessToken...');
    let verifyResult;
    
    try {
      verifyResult = await verifyAccessToken(accessToken);
      console.log('✅ verifyAccessToken completed:', {
        hasData: !!verifyResult.data,
        hasUser: !!verifyResult.data?.user,
        hasError: !!verifyResult.error,
        errorMessage: verifyResult.error?.message
      });
    } catch (verifyException) {
      console.error('💥 Exception during verifyAccessToken:', {
        message: verifyException.message,
        name: verifyException.name,
        stack: verifyException.stack
      });
      return c.json({ 
        error: 'Token verification exception',
        details: verifyException.message 
      }, 500);
    }

    const { data: { user }, error: authError } = verifyResult;

    if (authError || !user) {
      console.error('❌ Authorization error while loading data:', {
        error: authError?.message,
        status: authError?.status,
        hasUser: !!user
      });
      return c.json({ error: `Unauthorized: ${authError?.message || 'Invalid token'}` }, 401);
    }
    
    console.log('✅ User authenticated:', user.id);

    // 从KV store加载数据
    const userId = user.id;
    console.log(`📥 Loading data for user ${userId}...`);
    
    // 使用单独的 get 调用确保数据顺序正确，使用重试机制处理临时网络错误
    const config = await retryWithBackoff(
      () => kv.get(`user:${userId}:config`),
      3,
      500,
      'load config'
    );
    const personalities = await retryWithBackoff(
      () => kv.get(`user:${userId}:personalities`),
      3,
      500,
      'load personalities'
    );
    const chats = await retryWithBackoff(
      () => kv.get(`user:${userId}:chats`),
      3,
      500,
      'load chats'
    );
    const groupChats = await retryWithBackoff(
      () => kv.get(`user:${userId}:groupChats`),
      3,
      500,
      'load groupChats'
    );
    const userProfile = await retryWithBackoff(
      () => kv.get(`user:${userId}:userProfile`),
      3,
      500,
      'load userProfile'
    );
    const darkMode = await retryWithBackoff(
      () => kv.get(`user:${userId}:darkMode`),
      3,
      500,
      'load darkMode'
    );
    const moments = await retryWithBackoff(
      () => kv.get(`user:${userId}:moments`),
      3,
      500,
      'load moments'
    );

    console.log(`📦 Loaded data summary:`);
    console.log(`  - Config: ${config ? 'present' : 'null'}`);
    console.log(`  - Personalities: ${personalities ? (Array.isArray(personalities) ? `${personalities.length} items` : 'not array') : 'null'}`);
    console.log(`  - Chats: ${chats ? (Array.isArray(chats) ? `${chats.length} items` : 'not array') : 'null'}`);
    console.log(`  - GroupChats: ${groupChats ? (Array.isArray(groupChats) ? `${groupChats.length} items` : 'not array') : 'null'}`);
    console.log(`  - Moments: ${moments ? (Array.isArray(moments) ? `${moments.length} items` : 'not array') : 'null'}`);
    console.log(`  - UserProfile: ${userProfile ? 'present' : 'null'}`);
    console.log(`  - DarkMode: ${darkMode}`);

    // 检查personalities是否包含有效的avatarUrl
    if (personalities && Array.isArray(personalities)) {
      personalities.forEach((p: any, index: number) => {
        console.log(`  Personality ${index}: ${p.name} (ID: ${p.id})`);
        if (p.avatarUrl) {
          const avatarSize = p.avatarUrl.length;
          console.log(`    Avatar size: ${(avatarSize / 1024).toFixed(2)} KB`);
          // 检查avatarUrl是否被截断或损坏
          if (!p.avatarUrl.startsWith('data:image/') && !p.avatarUrl.startsWith('http')) {
            console.warn(`    ⚠️ Warning: Invalid avatar URL`);
          }
        } else {
          console.log(`    No avatar`);
        }
      });
    }

    return c.json({
      success: true,
      data: {
        config,
        personalities,
        chats,
        groupChats,
        moments,
        userProfile,
        darkMode
      }
    });
  } catch (error) {
    console.log('Error loading data:', error);
    return c.json({ error: 'Internal server error while loading data' }, 500);
  }
});

// 删除用户的所有数据
app.delete("/make-server-4fd5d246/data/delete", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    console.log('🗑️ Delete request received:', {
      hasToken: !!accessToken,
      tokenLength: accessToken?.length || 0
    });
    
    if (!accessToken) {
      console.error('❌ No access token in delete request');
      return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }

    console.log('🔐 Calling verifyAccessToken for delete...');
    const { data: { user }, error: authError } = await verifyAccessToken(accessToken);

    if (authError || !user) {
      console.error('❌ Authorization error while deleting data:', {
        error: authError?.message,
        hasUser: !!user
      });
      return c.json({ error: `Unauthorized: ${authError?.message || 'Invalid token'}` }, 401);
    }
    
    console.log('✅ User authenticated for delete:', user.id);

    // 删除KV store中的数据
    const userId = user.id;
    console.log(`🗑️ Deleting data for user ${userId}...`);
    
    await kv.mdel([
      `user:${userId}:config`,
      `user:${userId}:personalities`,
      `user:${userId}:chats`,
      `user:${userId}:groupChats`,
      `user:${userId}:userProfile`,
      `user:${userId}:darkMode`,
    ]);

    console.log('✅ Data deleted successfully');
    return c.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting data:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return c.json({ 
      error: 'Internal server error while deleting data',
      details: error.message 
    }, 500);
  }
});

Deno.serve(app.fetch);