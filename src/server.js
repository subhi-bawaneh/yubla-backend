import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import apiRouter from './routes/api.js';
import v1Router from './routes/v1.js';
import { initDb } from './data/db.js';

const app = express();
const frontendOrigin = String(process.env.FRONTEND_ORIGIN || '').trim();
const allowedOrigins = frontendOrigin 
  ? frontendOrigin.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://yubla-frontend.vercel.app'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      // Allow all origins if FRONTEND_ORIGIN is not set or is '*'
      if (!frontendOrigin || frontendOrigin === '*') return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', apiRouter);
app.use('/api/v1', v1Router);

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
