import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

console.log('[Email] RESEND_API_KEY 前缀:', apiKey?.slice(0, 10)); // 调试用，看是不是 re_test_ 之类

const resend = new Resend(apiKey);

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  try {
    console.log('[Email] 准备发送到:', email);

    const { data, error } = await resend.emails.send({
      from: 'AI伴侣 <noreply@ai-girlchat.com>', // 已绑定域名
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
