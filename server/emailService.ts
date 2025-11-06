import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  try {
    await resend.emails.send({
      from: 'AI伴侣 <onboarding@resend.dev>',
      to: email,
      subject: '验证您的邮箱 - AI伴侣',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 30px;
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
              }
              .header h1 {
                color: #10b981;
                margin: 0;
              }
              .code-container {
                background: white;
                border: 2px dashed #10b981;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                margin: 30px 0;
              }
              .code {
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #10b981;
                font-family: 'Courier New', monospace;
              }
              .note {
                color: #666;
                font-size: 14px;
                text-align: center;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                color: #999;
                font-size: 12px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #ddd;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>AI伴侣</h1>
                <p>欢迎注册！请验证您的邮箱</p>
              </div>
              
              <p>您好，</p>
              <p>感谢您注册AI伴侣！请使用以下验证码完成注册：</p>
              
              <div class="code-container">
                <div class="code">${code}</div>
              </div>
              
              <p class="note">验证码将在15分钟后过期。</p>
              <p class="note">如果您没有请求此验证码，请忽略此邮件。</p>
              
              <div class="footer">
                <p>此邮件由AI伴侣自动发送，请勿回复。</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });
    console.log(`✅ [Email] 验证码已发送至 ${email}`);
  } catch (error) {
    console.error('❌ [Email] 发送失败:', error);
    throw new Error('发送验证邮件失败');
  }
}
