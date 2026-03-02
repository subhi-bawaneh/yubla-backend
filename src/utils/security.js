import crypto from 'crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const hashedCandidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashedCandidate, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

const createSession = (user) => ({
  id: generateSessionToken(),
  userId: user.id,
  tenantId: user.tenantId || null,
  role: user.role,
  expiresAt: Date.now() + SESSION_TTL_MS
});

const isSessionExpired = (session) => !session || session.expiresAt <= Date.now();

export { SESSION_TTL_MS, hashPassword, verifyPassword, createSession, isSessionExpired };
