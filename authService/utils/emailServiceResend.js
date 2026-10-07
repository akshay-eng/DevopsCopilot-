const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendVerificationEmail = async (user, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'DevOps Copilot <noreply@stallion-ai.in>',
      to: user.email,
      subject: 'Email Verification - DevOps Copilot',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content {
              padding: 40px 30px;
              background: #ffffff;
            }
            .content p {
              margin: 16px 0;
              font-size: 16px;
              color: #374151;
            }
            .button-container {
              text-align: center;
              margin: 30px 0;
            }
            .button {
              display: inline-block;
              padding: 16px 32px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
              box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
            }
            .button:hover {
              box-shadow: 0 6px 8px rgba(102, 126, 234, 0.4);
            }
            .link-text {
              word-break: break-all;
              color: #667eea;
              font-size: 14px;
              background-color: #f3f4f6;
              padding: 12px;
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              padding: 20px 30px;
              color: #6b7280;
              font-size: 14px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
            }
            .footer p {
              margin: 8px 0;
            }
            .warning {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 12px 16px;
              margin: 20px 0;
              border-radius: 4px;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to DevOps Copilot!</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${user.name}</strong>,</p>
              <p>Thank you for registering with DevOps Copilot! We're excited to have you on board.</p>
              <p>To complete your registration and start managing your Kubernetes clusters, please verify your email address by clicking the button below:</p>

              <div class="button-container">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>

              <p>Or copy and paste this link in your browser:</p>
              <div class="link-text">${verificationUrl}</div>

              <div class="warning">
                ⏱️ <strong>This link will expire in 24 hours</strong> for security reasons.
              </div>

              <p>If you didn't create an account with DevOps Copilot, you can safely ignore this email.</p>

              <p>Best regards,<br>The DevOps Copilot Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} DevOps Copilot. All rights reserved.</p>
              <p>Powered by stallion-ai.in</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      throw new Error(error.message);
    }

    console.log(`✅ Verification email sent to ${user.email} (ID: ${data?.id})`);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'DevOps Copilot <noreply@stallion-ai.in>',
      to: user.email,
      subject: 'Password Reset Request - DevOps Copilot',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content {
              padding: 40px 30px;
              background: #ffffff;
            }
            .content p {
              margin: 16px 0;
              font-size: 16px;
              color: #374151;
            }
            .button-container {
              text-align: center;
              margin: 30px 0;
            }
            .button {
              display: inline-block;
              padding: 16px 32px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
              box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
            }
            .button:hover {
              box-shadow: 0 6px 8px rgba(102, 126, 234, 0.4);
            }
            .link-text {
              word-break: break-all;
              color: #667eea;
              font-size: 14px;
              background-color: #f3f4f6;
              padding: 12px;
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              padding: 20px 30px;
              color: #6b7280;
              font-size: 14px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
            }
            .footer p {
              margin: 8px 0;
            }
            .warning {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 16px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning strong {
              color: #92400e;
              display: block;
              margin-bottom: 8px;
            }
            .warning ul {
              margin: 8px 0;
              padding-left: 20px;
              color: #78350f;
            }
            .warning li {
              margin: 4px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${user.name}</strong>,</p>
              <p>We received a request to reset your password for your DevOps Copilot account.</p>
              <p>Click the button below to choose a new password:</p>

              <div class="button-container">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>

              <p>Or copy and paste this link in your browser:</p>
              <div class="link-text">${resetUrl}</div>

              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul>
                  <li>This link will expire in <strong>1 hour</strong></li>
                  <li>If you didn't request this password reset, please ignore this email</li>
                  <li>Your password won't change until you click the link above and set a new one</li>
                  <li>For security reasons, we recommend using a strong, unique password</li>
                </ul>
              </div>

              <p>If you're having trouble with your account, please contact our support team.</p>

              <p>Best regards,<br>The DevOps Copilot Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} DevOps Copilot. All rights reserved.</p>
              <p>Powered by stallion-ai.in</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      throw new Error(error.message);
    }

    console.log(`✅ Password reset email sent to ${user.email} (ID: ${data?.id})`);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (user) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'DevOps Copilot <noreply@stallion-ai.in>',
      to: user.email,
      subject: 'Welcome to DevOps Copilot! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 32px;
              font-weight: 600;
            }
            .content {
              padding: 40px 30px;
              background: #ffffff;
            }
            .content p {
              margin: 16px 0;
              font-size: 16px;
              color: #374151;
            }
            .features {
              background-color: #f9fafb;
              border-radius: 8px;
              padding: 20px;
              margin: 24px 0;
            }
            .features h3 {
              color: #667eea;
              margin-top: 0;
              font-size: 18px;
            }
            .features ul {
              margin: 12px 0;
              padding-left: 24px;
            }
            .features li {
              margin: 8px 0;
              color: #4b5563;
            }
            .footer {
              text-align: center;
              padding: 20px 30px;
              color: #6b7280;
              font-size: 14px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
            }
            .footer p {
              margin: 8px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome Aboard!</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${user.name}</strong>,</p>
              <p>Your email has been verified successfully! Welcome to <strong>DevOps Copilot</strong>.</p>

              <div class="features">
                <h3>🚀 You're now ready to:</h3>
                <ul>
                  <li><strong>Connect your Kubernetes clusters</strong> - Monitor multiple clusters from one dashboard</li>
                  <li><strong>Real-time infrastructure monitoring</strong> - Stay on top of your cluster health</li>
                  <li><strong>Intelligent alerts</strong> - Get notified when issues arise</li>
                  <li><strong>Streamlined operations</strong> - Manage your clusters with ease</li>
                </ul>
              </div>

              <p><strong>Next Steps:</strong></p>
              <p>Complete your onboarding to register your first cluster and start monitoring your infrastructure.</p>

              <p>If you have any questions or need assistance, our support team is here to help!</p>

              <p>Best regards,<br>The DevOps Copilot Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} DevOps Copilot. All rights reserved.</p>
              <p>Powered by stallion-ai.in</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      // Don't throw - welcome email is optional
      return;
    }

    console.log(`✅ Welcome email sent to ${user.email} (ID: ${data?.id})`);
  } catch (error) {
    console.error('❌ Welcome email sending failed:', error);
    // Don't throw - welcome email is optional
  }
};

// Send an invite email to an externally-onboarded user with their credentials.
const sendInviteEmail = async (user, { tempPassword, role, loginUrl, inviterName }) => {
  const url = loginUrl || `${process.env.FRONTEND_URL}/login`;
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'DevOps Copilot <noreply@stallion-ai.in>',
      to: user.email,
      subject: `You've been invited to DevOps Copilot`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            .header { background: #111827; color: white; padding: 40px 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 26px; font-weight: 600; }
            .content { padding: 40px 30px; background: #ffffff; }
            .content p { margin: 16px 0; font-size: 16px; color: #374151; }
            .button-container { text-align: center; margin: 30px 0; }
            .button { display: inline-block; padding: 16px 32px; background: #2563eb; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
            .creds { background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0; font-size: 15px; }
            .creds div { margin: 6px 0; }
            .creds code { background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 8px; font-family: monospace; }
            .role-pill { display: inline-block; background: #dbeafe; color: #1d4ed8; border-radius: 6px; padding: 2px 10px; font-weight: 600; font-size: 13px; }
            .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
            .footer { text-align: center; padding: 20px 30px; color: #6b7280; font-size: 14px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>🚀 You've been invited to DevOps Copilot</h1></div>
            <div class="content">
              <p>Hi <strong>${user.name}</strong>,</p>
              <p>${inviterName ? `<strong>${inviterName}</strong> has` : 'You have been'} invited you to join the DevOps Copilot workspace with the role <span class="role-pill">${role}</span>.</p>
              <p>Use the credentials below to sign in:</p>
              <div class="creds">
                <div>🌐 <strong>URL:</strong> <a href="${url}">${url}</a></div>
                <div>📧 <strong>Email:</strong> <code>${user.email}</code></div>
                <div>🔑 <strong>Temporary password:</strong> <code>${tempPassword}</code></div>
                <div>🛡️ <strong>Role:</strong> ${role}</div>
              </div>
              <div class="button-container">
                <a href="${url}" class="button">Sign in to DevOps Copilot</a>
              </div>
              <div class="warning">🔒 For your security, please change this temporary password after your first sign-in (Settings → your profile, or "Forgot password").</div>
              <p>Best regards,<br>The DevOps Copilot Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} DevOps Copilot. All rights reserved.</p>
              <p>Powered by stallion-ai.in</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    if (error) { console.error('❌ Resend invite error:', error); throw new Error(error.message); }
    console.log(`✅ Invite email sent to ${user.email} (ID: ${data?.id})`);
    return { id: data?.id };
  } catch (error) {
    console.error('❌ Invite email sending failed:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendInviteEmail
};
