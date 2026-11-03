/**
 * Servidor Backend Principal · Katio Design SaaS
 * Express API REST con SQLite Nativo y Nodemailer.
 * Listo para despliegue en Easypanel o ejecución local.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { db, hashPassword, getSetting, setSetting, getAllSettings } = require('./database');
const { testSmtpConnection, sendWelcomeEmail } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname)));

// Middleware simple de autenticación por Token
function getAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/, '').trim();
  if (!token) return null;

  try {
    const [userId, sign] = token.split(':');
    if (!userId || !sign) return null;
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(userId);
    return user || null;
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Sesión no válida o expirada' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'Admin') {
    return res.status(403).json({ error: 'Acceso restringido para Administradores' });
  }
  req.user = user;
  next();
}

function makeToken(user) {
  const sign = crypto.createHmac('sha256', 'katio-secret-key').update(user.id + user.email).digest('hex').slice(0, 16);
  return `${user.id}:${sign}`;
}

// ==========================================
// 1. AUTENTICACIÓN & CONFIGURACIÓN INICIAL
// ==========================================

// Estado inicial del sistema (detecta si es primera instalación sin usuarios)
app.get('/api/auth/status', (req, res) => {
  const countRow = db.prepare('SELECT COUNT(*) AS total FROM users').get();
  res.json({
    initialized: countRow.total > 0,
    totalUsers: countRow.total
  });
});

// Setup Inicial: Crea el Administrador Principal si no hay usuarios
app.post('/api/auth/setup', (req, res) => {
  const countRow = db.prepare('SELECT COUNT(*) AS total FROM users').get();
  if (countRow.total > 0) {
    return res.status(400).json({ error: 'El sistema ya fue inicializado' });
  }

  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña (mínimo 6 caracteres) son requeridos' });
  }

  const id = 'usr_' + Date.now();
  const emailClean = email.toLowerCase().trim();
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, 'Admin', ?)
  `).run(id, name.trim(), emailClean, passwordHash, now);

  const user = { id, name: name.trim(), email: emailClean, role: 'Admin', created_at: now };
  const token = makeToken(user);

  res.status(201).json({ user, token, message: 'Administrador configurado exitosamente' });
});

// Iniciar Sesión
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  }

  const emailClean = email.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(emailClean);

  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at };
  const token = makeToken(safeUser);

  res.json({ user: safeUser, token });
});

// Perfil actual
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ==========================================
// 2. GESTIÓN DE USUARIOS & ENVÍO DE CORREOS
// ==========================================

app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
  }

  const emailClean = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(emailClean);
  if (existing) {
    return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado' });
  }

  const id = 'usr_' + Date.now();
  const roleName = role === 'Admin' ? 'Admin' : 'Usuario Estándar';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), emailClean, hashPassword(password), roleName, now);

  const newUser = { id, name: name.trim(), email: emailClean, role: roleName, created_at: now };

  // Construir URL base de la app para el correo
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const appUrl = `${protocol}://${req.get('host')}`;

  // Intentar enviar correo con credenciales
  const emailResult = await sendWelcomeEmail(newUser, password, appUrl);

  res.status(201).json({
    user: newUser,
    emailResult,
    message: emailResult.sent 
      ? `Usuario creado y credenciales enviadas a ${emailClean}`
      : `Usuario creado. No se pudo enviar el correo automático: ${emailResult.reason}`
  });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario administrador' });
  }

  const totalAdmins = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'Admin'").get();
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
  if (target && target.role === 'Admin' && totalAdmins.total <= 1) {
    return res.status(400).json({ error: 'No se puede eliminar el único administrador del sistema' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true, message: 'Usuario eliminado' });
});

// ==========================================
// 3. CONFIGURACIÓN & SMTP
// ==========================================

app.get('/api/settings', requireAuth, (req, res) => {
  res.json(getAllSettings());
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const updates = req.body;
  for (const [key, val] of Object.entries(updates)) {
    setSetting(key, val);
  }
  res.json({ success: true, settings: getAllSettings() });
});

app.post('/api/settings/test-smtp', requireAdmin, async (req, res) => {
  try {
    await testSmtpConnection(req.body);
    res.json({ success: true, message: '¡Conexión SMTP exitosa! El servidor de correos está listo para enviar.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. CATEGORÍAS & CATÁLOGO DE SERVICIOS
// ==========================================

app.get('/api/categories', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json(rows);
});

app.post('/api/categories', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
  }
  const cleanName = name.trim();
  const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(cleanName);
  if (existing) {
    return res.status(400).json({ error: 'Esta categoría ya existe' });
  }

  const id = 'cat_' + Date.now();
  db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)').run(id, cleanName, new Date().toISOString());
  res.status(201).json({ id, name: cleanName });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/services', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY position ASC, created_at ASC').all();
  res.json(rows);
});

app.post('/api/services', requireAuth, (req, res) => {
  const { category_name, name, description, hours, price } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del servicio es requerido' });
  }

  const id = 'srv_' + Date.now();
  const cat = (category_name || 'General').trim();
  const h = Number(hours) || 0;
  const p = Number(price) || 0;
  const countRow = db.prepare('SELECT COUNT(*) AS total FROM services').get();

  db.prepare(`
    INSERT INTO services (id, category_name, name, description, hours, price, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, cat, name.trim(), (description || '').trim(), h, p, countRow.total, new Date().toISOString());

  // Asegurar que la categoría exista
  const catExist = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(cat);
  if (!catExist && cat) {
    db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)').run('cat_' + Date.now(), cat, new Date().toISOString());
  }

  const newSrv = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  res.status(201).json(newSrv);
});

app.put('/api/services/:id', requireAuth, (req, res) => {
  const { category_name, name, description, hours, price } = req.body;
  db.prepare(`
    UPDATE services 
    SET category_name = ?, name = ?, description = ?, hours = ?, price = ?
    WHERE id = ?
  `).run((category_name || 'General').trim(), (name || '').trim(), (description || '').trim(), Number(hours) || 0, Number(price) || 0, req.params.id);

  res.json({ success: true });
});

app.delete('/api/services/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/services/batch', requireAuth, (req, res) => {
  const { services } = req.body;
  if (!Array.isArray(services)) {
    return res.status(400).json({ error: 'Array de servicios requerido' });
  }

  let imported = 0;
  for (const s of services) {
    if (s.name && s.name.trim()) {
      const id = 'srv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      const cat = (s.category || s.category_name || 'General').trim();
      const count = db.prepare('SELECT COUNT(*) AS total FROM services').get().total;

      db.prepare(`
        INSERT INTO services (id, category_name, name, description, hours, price, position, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, cat, s.name.trim(), (s.description || '').trim(), Number(s.hours) || 0, Number(s.price) || 0, count, new Date().toISOString());

      // Auto-insertar categoría si no existe
      const catExist = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(cat);
      if (!catExist) {
        db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)').run('cat_' + Date.now(), cat, new Date().toISOString());
      }
      imported++;
    }
  }

  res.json({ success: true, count: imported });
});

app.post('/api/services/reorder', requireAuth, (req, res) => {
  const { ids } = req.body; // array ordenado de IDs
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Array de IDs requerido' });

  ids.forEach((id, idx) => {
    db.prepare('UPDATE services SET position = ? WHERE id = ?').run(idx, id);
  });
  res.json({ success: true });
});

// ==========================================
// 5. COTIZACIONES / OFERTA MERCANTIL
// ==========================================

app.get('/api/quotes', requireAuth, (req, res) => {
  const q = req.query.search ? `%${req.query.search.toLowerCase()}%` : '%';
  const rows = db.prepare(`
    SELECT id, consecutive, doc_type, client_name, client_nit, client_email, emission_date, total, status, created_at
    FROM quotes
    WHERE LOWER(consecutive) LIKE ? OR LOWER(client_name) LIKE ?
    ORDER BY created_at DESC
  `).all(q, q);
  res.json(rows);
});

app.get('/api/quotes/consecutive/next', requireAuth, (req, res) => {
  const seq = parseInt(getSetting('quote_seq') || '1', 10);
  const consecutive = `COT-${String(seq).padStart(5, '0')}`;
  res.json({ seq, consecutive });
});

app.get('/api/quotes/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM quotes WHERE id = ? OR consecutive = ?').get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Cotización no encontrada' });
  try {
    row.items = JSON.parse(row.items_json);
  } catch (e) {
    row.items = [];
  }
  res.json(row);
});

app.post('/api/quotes', requireAuth, (req, res) => {
  const b = req.body;
  if (!b.consecutive || !b.client_name) {
    return res.status(400).json({ error: 'Consecutivo y Nombre de cliente son obligatorios' });
  }

  const existing = db.prepare('SELECT id FROM quotes WHERE consecutive = ?').get(b.consecutive);
  const id = b.id || (existing ? existing.id : 'q_' + Date.now());
  const now = new Date().toISOString();
  const itemsJson = JSON.stringify(b.items || []);

  if (existing && existing.id === id) {
    // Actualizar
    db.prepare(`
      UPDATE quotes SET
        doc_type = ?, client_name = ?, client_nit = ?, client_phone = ?, client_email = ?, client_address = ?,
        emission_date = ?, validity_days = ?, complexity_percent = ?, apply_iva = ?, subtotal = ?, iva_value = ?,
        total = ?, items_json = ?, notes = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      b.doc_type || 'Cotización', b.client_name, b.client_nit || '', b.client_phone || '', b.client_email || '', b.client_address || '',
      b.emission_date || now.slice(0, 10), Number(b.validity_days) || 15, Number(b.complexity_percent) || 0, b.apply_iva ? 1 : 0,
      Number(b.subtotal) || 0, Number(b.iva_value) || 0, Number(b.total) || 0, itemsJson, b.notes || '', b.status || 'Borrador', now, id
    );
  } else {
    // Crear nuevo
    db.prepare(`
      INSERT INTO quotes (
        id, consecutive, doc_type, client_name, client_nit, client_phone, client_email, client_address,
        emission_date, validity_days, complexity_percent, apply_iva, subtotal, iva_value, total, items_json, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, b.consecutive, b.doc_type || 'Cotización', b.client_name, b.client_nit || '', b.client_phone || '', b.client_email || '', b.client_address || '',
      b.emission_date || now.slice(0, 10), Number(b.validity_days) || 15, Number(b.complexity_percent) || 0, b.apply_iva ? 1 : 0,
      Number(b.subtotal) || 0, Number(b.iva_value) || 0, Number(b.total) || 0, itemsJson, b.notes || '', b.status || 'Borrador', now, now
    );

    // Incrementar consecutivo si coincide
    const numPart = parseInt(b.consecutive.replace(/\D/g, ''), 10);
    if (!isNaN(numPart)) {
      setSetting('quote_seq', numPart + 1);
    }
  }

  const saved = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
  res.json(saved);
});

app.delete('/api/quotes/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==========================================
// 6. FACTURACIÓN COMERCIAL / CUENTAS DE COBRO
// ==========================================

app.get('/api/invoices', requireAuth, (req, res) => {
  const q = req.query.search ? `%${req.query.search.toLowerCase()}%` : '%';
  const rows = db.prepare(`
    SELECT id, consecutive, doc_type, client_name, client_nit, client_email, emission_date, due_date, total, status, created_at
    FROM invoices
    WHERE LOWER(consecutive) LIKE ? OR LOWER(client_name) LIKE ?
    ORDER BY created_at DESC
  `).all(q, q);
  res.json(rows);
});

app.get('/api/invoices/consecutive/next', requireAuth, (req, res) => {
  const seq = parseInt(getSetting('invoice_seq') || '1', 10);
  const consecutive = `FACT-${String(seq).padStart(5, '0')}`;
  res.json({ seq, consecutive });
});

app.get('/api/invoices/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM invoices WHERE id = ? OR consecutive = ?').get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Factura / Cuenta de cobro no encontrada' });
  try {
    row.items = JSON.parse(row.items_json);
  } catch (e) {
    row.items = [];
  }
  res.json(row);
});

app.post('/api/invoices', requireAuth, (req, res) => {
  const b = req.body;
  if (!b.consecutive || !b.client_name) {
    return res.status(400).json({ error: 'Consecutivo y Nombre de cliente son obligatorios' });
  }

  const existing = db.prepare('SELECT id FROM invoices WHERE consecutive = ?').get(b.consecutive);
  const id = b.id || (existing ? existing.id : 'inv_' + Date.now());
  const now = new Date().toISOString();
  const itemsJson = JSON.stringify(b.items || []);

  if (existing && existing.id === id) {
    db.prepare(`
      UPDATE invoices SET
        doc_type = ?, client_name = ?, client_nit = ?, client_phone = ?, client_email = ?, client_address = ?,
        emission_date = ?, due_date = ?, complexity_percent = ?, apply_iva = ?, subtotal = ?, iva_value = ?,
        total = ?, items_json = ?, payment_method = ?, notes = ?, status = ?, quote_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      b.doc_type || 'Cuenta de Cobro', b.client_name, b.client_nit || '', b.client_phone || '', b.client_email || '', b.client_address || '',
      b.emission_date || now.slice(0, 10), b.due_date || now.slice(0, 10), Number(b.complexity_percent) || 0, b.apply_iva ? 1 : 0,
      Number(b.subtotal) || 0, Number(b.iva_value) || 0, Number(b.total) || 0, itemsJson, b.payment_method || 'Nequi / Bre-B',
      b.notes || '', b.status || 'Pendiente', b.quote_id || null, now, id
    );
  } else {
    db.prepare(`
      INSERT INTO invoices (
        id, consecutive, doc_type, client_name, client_nit, client_phone, client_email, client_address,
        emission_date, due_date, complexity_percent, apply_iva, subtotal, iva_value, total, items_json, payment_method, notes, status, quote_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, b.consecutive, b.doc_type || 'Cuenta de Cobro', b.client_name, b.client_nit || '', b.client_phone || '', b.client_email || '', b.client_address || '',
      b.emission_date || now.slice(0, 10), b.due_date || now.slice(0, 10), Number(b.complexity_percent) || 0, b.apply_iva ? 1 : 0,
      Number(b.subtotal) || 0, Number(b.iva_value) || 0, Number(b.total) || 0, itemsJson, b.payment_method || 'Nequi / Bre-B',
      b.notes || '', b.status || 'Pendiente', b.quote_id || null, now, now
    );

    const numPart = parseInt(b.consecutive.replace(/\D/g, ''), 10);
    if (!isNaN(numPart)) {
      setSetting('invoice_seq', numPart + 1);
    }
  }

  // Si proviene de una cotización, marcar la cotización como 'Facturada'
  if (b.quote_id) {
    db.prepare("UPDATE quotes SET status = 'Facturada' WHERE id = ?").run(b.quote_id);
  }

  const saved = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  res.json(saved);
});

app.delete('/api/invoices/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==========================================
// 7. RESTABLECER SISTEMA (LIMPIEZA TOTAL)
// ==========================================

app.post('/api/system/reset', requireAdmin, (req, res) => {
  db.exec(`
    DELETE FROM quotes;
    DELETE FROM invoices;
    DELETE FROM services;
    DELETE FROM categories;
  `);
  setSetting('quote_seq', '1');
  setSetting('invoice_seq', '1');
  res.json({ success: true, message: 'Todos los datos operativos han sido eliminados. El sistema está 100% limpio.' });
});

// Enrutamiento SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Katio Design SaaS Server corriendo en puerto ${PORT}`);
  console.log(`  Base de datos activa en: ${path.resolve(process.env.DATABASE_PATH || './data/katio.db')}`);
  console.log(`=======================================================`);
});
