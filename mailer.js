/**
 * Módulo de Correo Electrónico (Nodemailer)
 * Envía credenciales e invitaciones a usuarios creados por el administrador.
 */

const nodemailer = require('nodemailer');
const { getSetting } = require('./database');

function getTransporter(overrideConfig = null) {
  const host = overrideConfig ? overrideConfig.smtp_host : getSetting('smtp_host');
  const port = parseInt(overrideConfig ? overrideConfig.smtp_port : getSetting('smtp_port'), 10) || 587;
  const secure = (overrideConfig ? overrideConfig.smtp_secure : getSetting('smtp_secure')) === '1';
  const user = overrideConfig ? overrideConfig.smtp_user : getSetting('smtp_user');
  const pass = overrideConfig ? overrideConfig.smtp_pass : getSetting('smtp_pass');

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

async function testSmtpConnection(config) {
  const transporter = getTransporter(config);
  if (!transporter) {
    throw new Error('Debes diligenciar Host, Usuario y Contraseña para el servidor SMTP.');
  }
  return await transporter.verify();
}

async function sendWelcomeEmail(user, rawPassword, appUrl = 'http://localhost') {
  const transporter = getTransporter();
  const from = getSetting('smtp_from') || 'Katio Design <kattioshop@gmail.com>';

  if (!transporter) {
    return {
      sent: false,
      reason: 'El servidor SMTP no está configurado aún. Las credenciales deben entregarse manualmente.'
    };
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #1a1c23; margin: 0; padding: 24px; }
      .container { max-width: 540px; margin: auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e9f0; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
      .header { border-bottom: 2px solid #4a72ff; padding-bottom: 16px; margin-bottom: 24px; }
      .brand { font-size: 22px; font-weight: 800; color: #4a72ff; letter-spacing: 1px; }
      .creds-box { background: #f8fafc; border: 1px solid #e1e8f5; border-radius: 8px; padding: 18px; margin: 20px 0; }
      .creds-row { margin: 8px 0; font-size: 14px; }
      .btn { display: inline-block; background: #4a72ff; color: #ffffff !important; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; margin-top: 14px; }
      .footer { font-size: 11px; color: #8e96aa; margin-top: 28px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="brand">ΚΛΤΙO DESIGN</div>
        <div style="font-size: 12px; color: #8e96aa; margin-top: 4px;">Sistema Comercial de Cotizaciones & Facturación</div>
      </div>
      <h2 style="font-size: 18px; margin-top: 0;">¡Hola, ${user.name}!</h2>
      <p style="font-size: 14px; line-height: 1.5; color: #444;">
        Has sido dado de alta como usuario en la plataforma de <strong>Katio Design</strong> con el rol de <strong>${user.role}</strong>.
      </p>
      
      <div class="creds-box">
        <div class="creds-row"><strong>Acceso:</strong> <a href="${appUrl}">${appUrl}</a></div>
        <div class="creds-row"><strong>Correo electrónico:</strong> ${user.email}</div>
        <div class="creds-row"><strong>Contraseña temporal:</strong> <span style="font-family: monospace; background:#eef2ff; padding:2px 6px; border-radius:4px; font-weight:bold; color:#4a72ff;">${rawPassword}</span></div>
      </div>

      <p style="font-size: 13px; color: #666;">
        Te recomendamos iniciar sesión y cambiar tu contraseña en tu primer ingreso.
      </p>

      <div style="text-align: center;">
        <a href="${appUrl}" class="btn">Ingresar al Sistema</a>
      </div>

      <div class="footer">
        Este es un correo automático generado por el sistema de Katio Design.
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    const info = await transporter.sendMail({
      from,
      to: user.email,
      subject: `Tus accesos a Katio Design SaaS · Rol: ${user.role}`,
      html
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('Error enviando correo de bienvenida:', err);
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  testSmtpConnection,
  sendWelcomeEmail
};
