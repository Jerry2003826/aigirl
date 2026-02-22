import { Resend } from 'resend';

// NOTE: 按你的要求恢复“硬编码 key”为默认回退方案（优先使用环境变量）。
// 生产环境仍建议用 RESEND_API_KEY 覆盖，避免泄露密钥。
const apiKey = (() => {
  const k = process.env.RESEND_API_KEY;
  if (!k || k.trim() === '') {
    throw new Error('RESEND_API_KEY is required. Set in config/env. Never commit keys.');
  }
  return k;
})();
const from = process.env.RESEND_FROM || 'AI伴侣 <noreply@ai-girlchat.com>';

const resend = new Resend(apiKey);

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  try {
    console.log('[Email] 准备发送到:', email);

    const { data, error } = await resend.emails.send({
      from,
      to: [email],
      subject: '验证您的邮箱 - AI伴侣',
      html: `
        <!DOCTYPE html>
        <html lang="zh-CN">
          <body>
            <p>您好，</p>
            <p>您正在注册 <b>AI伴侣</b>，本次验证码为：</p>
            <h2>${code}</h2>
            <p>请在 10 分钟内完成验证。如非本人操作，请忽略本邮件。</p>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('❌ [Email] Resend API 错误:', error);
      throw new Error(`发送验证邮件失败: ${error.message}`);
    }

    console.log('✅ [Email] 发送成功, data:', data);
  } catch (error: any) {
    console.error('❌ [Email] 发送失败 Catch:', error);
    throw new Error(error?.message || '发送验证邮件失败');
  }
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  try {
    console.log('[Email] 准备发送重置密码邮件到:', email);

    const { data, error } = await resend.emails.send({
      from,
      to: [email],
      subject: '重置您的密码 - AI伴侣',
      html: `
        <!DOCTYPE html>
        <html lang="zh-CN">
          <body>
            <p>您好，</p>
            <p>您正在重置 <b>AI伴侣</b> 账户的密码，本次验证码为：</p>
            <h2>${code}</h2>
            <p>请在 10 分钟内使用此验证码重置密码。如非本人操作，请立即联系客服。</p>
            <p style="color: #666; font-size: 12px;">为保护您的账户安全，请勿向任何人透露此验证码。</p>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('❌ [Email] Resend API 错误:', error);
      throw new Error(`发送重置密码邮件失败: ${error.message}`);
    }

    console.log('✅ [Email] 重置密码邮件发送成功, data:', data);
  } catch (error: any) {
    console.error('❌ [Email] 发送重置密码邮件失败 Catch:', error);
    throw new Error(error?.message || '发送重置密码邮件失败');
  }
}
