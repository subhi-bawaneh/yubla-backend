import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import apiRouter from './routes/api.js';
import v1Router from './routes/v1.js';
import { initDb } from './data/db.js';

const app = express();
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '').toLowerCase();
const parseOriginList = (value) =>
  String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const configuredOrigins = parseOriginList(process.env.FRONTEND_ORIGIN);
const defaultOrigins =
  process.env.NODE_ENV === 'production'
    ? ['https://yubla-frontend.vercel.app']
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://yubla-frontend.vercel.app'];
const allowAnyOrigin = configuredOrigins.includes('*');
const wildcardOriginPatterns = configuredOrigins
  .map(normalizeOrigin)
  .filter((origin) => origin.includes('*'))
  .map((origin) => new RegExp(`^${origin.split('*').map(escapeRegex).join('.*')}$`, 'i'));
const allowedOrigins = new Set(
  [...defaultOrigins, ...configuredOrigins]
    .map(normalizeOrigin)
    .filter((origin) => origin && origin !== '*')
);
const isOriginAllowed = (origin) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.has(normalizedOrigin)) return true;
  return wildcardOriginPatterns.some((pattern) => pattern.test(normalizedOrigin));
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowAnyOrigin || isOriginAllowed(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', apiRouter);
app.use('/api/v1', v1Router);
app.use((error, _req, res, next) => {
  if (!error) return next();
  if (res.headersSent) return next(error);
  if (error?.message === 'Not allowed by CORS') {
    return res.status(403).json({ ok: false, error: 'Not allowed by CORS' });
  }

  console.error('Unhandled request error:', error);
  return res.status(500).json({ ok: false, error: 'Internal server error' });
});

const toPort = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const BASE_PORT = toPort(process.env.PORT, 3000);
const MAX_PORT_RETRIES = 10;

const startServer = (port, retriesLeft) => {
  const server = app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE' && retriesLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use, retrying on ${nextPort}...`);
      startServer(nextPort, retriesLeft - 1);
      return;
    }

    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  });
};

initDb()
  .then(() => {
    startServer(BASE_PORT, MAX_PORT_RETRIES);
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
