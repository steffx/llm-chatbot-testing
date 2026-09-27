import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getCustomer } from './data/customers.js';
import { answer, guardrailsEnabled, modelName } from './assistant/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGE_LENGTH = 500;

const app = express();
app.use(express.json({ limit: '20kb' }));

const sessions = new Map(); // token -> { username, history: [] }

function readCookie(req, name) {
  const match = (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function requireAuth(req, res, next) {
  const session = sessions.get(readCookie(req, 'sid'));
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  req.session = session;
  req.customer = getCustomer(session.username);
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const customer = getCustomer(String(username || '').toLowerCase());
  if (!customer || customer.password !== password) return res.status(401).json({ error: 'Invalid username or password' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username: customer.username, history: [] });
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/`);
  res.json({ name: customer.name });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(readCookie(req, 'sid'));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ name: req.customer.name }));

app.post('/api/chat', requireAuth, async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Message is required' });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
  }
  try {
    const result = await answer({ customer: req.customer, message, history: req.session.history });
    req.session.history.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'The assistant is unavailable right now. Please try again.' });
  }
});

app.post('/api/chat/reset', requireAuth, (req, res) => {
  req.session.history = [];
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', model: modelName(), guardrails: guardrailsEnabled() }));

app.get('/', (_req, res) => res.redirect('/login'));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`NovaPay assistant on http://localhost:${PORT} (model: ${modelName()}, guardrails: ${guardrailsEnabled() ? 'on' : 'OFF'})`);
});
