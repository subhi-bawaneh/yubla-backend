import pg from 'pg';
import { hashPassword, verifyPassword } from '../utils/security.js';

const { Pool } = pg;

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
};

const stripWrappingQuotes = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const hasDoubleQuotes = text.startsWith('"') && text.endsWith('"');
  const hasSingleQuotes = text.startsWith("'") && text.endsWith("'");
  return hasDoubleQuotes || hasSingleQuotes ? text.slice(1, -1).trim() : text;
};

const isValidPostgresUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  } catch {
    return false;
  }
};

const parsePort = (value, fallback = 5432) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const rawDatabaseUrl = readEnv('DATABASE_URL', 'DATABASE_PRIVATE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL');
const databaseUrl = stripWrappingQuotes(rawDatabaseUrl);
const pgHost = readEnv('PGHOST', 'POSTGRES_HOST');
const pgUser = readEnv('PGUSER', 'POSTGRES_USER');
const pgPassword = readEnv('PGPASSWORD', 'POSTGRES_PASSWORD');
const pgDatabase = readEnv('PGDATABASE', 'POSTGRES_DB');
const pgPort = parsePort(readEnv('PGPORT', 'POSTGRES_PORT'), 5432);

const hasPgParts = pgHost && pgUser && pgDatabase;
const hasValidDatabaseUrl = isValidPostgresUrl(databaseUrl);
if (rawDatabaseUrl && !hasValidDatabaseUrl && hasPgParts) {
  console.warn('DATABASE_URL is invalid; falling back to PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.');
}

const poolConnectionConfig = hasValidDatabaseUrl
  ? { connectionString: databaseUrl }
  : hasPgParts
    ? {
        host: pgHost,
        port: pgPort,
        user: pgUser,
        password: pgPassword,
        database: pgDatabase
      }
    : null;

if (!poolConnectionConfig) {
  throw new Error(
    'Database config missing or invalid. Set DATABASE_URL as a valid postgres:// URL (no wrapping quotes) or set PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.'
  );
}

// Supabase PostgreSQL connection
const pool = new Pool({
  ...poolConnectionConfig,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const SCHEMA_VERSION = '2026.02.platform.v1';
const SEED_VERSION = '2026.03.empty.v3';

const ROLE_VALUES = ['super_admin', 'school_admin', 'teacher'];
const GRADE_VALUES = ['سابع', 'ثامن', 'تاسع', 'عاشر', 'أول ثانوي', 'ثاني ثانوي'];
const SECTION_VALUES = ['أ', 'ب', 'ج'];
const SUBJECT_VALUES = [
  'لغة عربية',
  'لغة إنجليزية',
  'رياضيات',
  'علوم',
  'فيزياء',
  'كيمياء',
  'أحياء',
  'تربية إسلامية',
  'تاريخ',
  'جغرافيا'
];
const EXAM_VALUES = ['أول', 'ثاني', 'نهائي'];

const CITY_VALUES = [
  'عمّان',
  'إربد',
  'الزرقاء',
  'العقبة',
  'السلط',
  'مادبا',
  'الكرك',
  'معان',
  'جرش',
  'عجلون',
  'المفرق',
  'الطفيلة'
];

let initialized = false;

// Helper functions
const nowIso = () => new Date().toISOString();
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeCode = (code) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');

const normalizeUsername = (username) => String(username || '').trim().toLowerCase();
const cleanText = (value) => String(value || '').trim();
const sanitizeUsernamePart = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');

const mapTenant = (row) =>
  row
    ? {
        id: row.id,
        code: row.code,
        name: row.name,
        city: row.city || '',
        active: Boolean(row.active),
        createdAt: row.created_at
      }
    : null;

const mapUser = (row) =>
  row
    ? {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        employeeNo: row.employee_no || '',
        passwordPlain: row.password_plain || '',
        passwordHash: row.password_hash,
        role: row.role,
        tenantId: row.tenant_id,
        active: Boolean(row.active),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    : null;

// Database schema creation
const createSchema = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      employee_no TEXT NOT NULL DEFAULT '',
      password_plain TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'school_admin', 'teacher')),
      tenant_id TEXT NULL REFERENCES tenants(id),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NULL,
      role TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS lookups (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('teachers', 'grades', 'sections', 'subjects', 'exams')),
      value TEXT NOT NULL,
      UNIQUE (tenant_id, type, value)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_no TEXT NOT NULL DEFAULT '',
      student_name TEXT NOT NULL,
      grade TEXT NOT NULL,
      section TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      section TEXT NOT NULL,
      subject TEXT NOT NULL,
      UNIQUE (tenant_id, user_id, grade, section, subject)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      batch_id TEXT NOT NULL,
      teacher_name TEXT NOT NULL,
      grade TEXT NOT NULL,
      section TEXT NOT NULL,
      subject TEXT NOT NULL,
      exam TEXT NOT NULL,
      max_recall REAL NOT NULL,
      max_understand REAL NOT NULL,
      max_hots REAL NOT NULL,
      total_max REAL NOT NULL,
      student_name TEXT NOT NULL,
      recall REAL,
      understand REAL,
      hots REAL,
      total REAL,
      plan TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '-'
    );
  `);

  // Create indexes
  await client.query('CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users (tenant_id, role)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_students_tenant_grade_section ON students (tenant_id, grade, section)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_submissions_tenant ON submissions (tenant_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_assignments_tenant_user ON teacher_assignments (tenant_id, user_id)');
};

const applySchemaMigrations = async (client) => {
  await client.query(`
    ALTER TABLE submissions
      ALTER COLUMN recall DROP NOT NULL,
      ALTER COLUMN understand DROP NOT NULL,
      ALTER COLUMN hots DROP NOT NULL,
      ALTER COLUMN total DROP NOT NULL
  `);
  await client.query(`UPDATE submissions SET plan = '' WHERE plan IS NULL`);
};

// Meta functions
const getMetaValue = async (key) => {
  const result = await pool.query('SELECT value FROM app_meta WHERE key = $1', [key]);
  return result.rows[0] ? String(result.rows[0].value) : null;
};

const setMetaValue = async (key, value) => {
  await pool.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
};

// Seed platform with super admin
const seedPlatformIfNeeded = async () => {
  const currentSeedVersion = await getMetaValue('seed_version');
  if (currentSeedVersion === SEED_VERSION) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear all data
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM submissions');
    await client.query('DELETE FROM teacher_assignments');
    await client.query('DELETE FROM students');
    await client.query('DELETE FROM lookups');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM tenants');

    // Create super admin
    const userId = 'u-super-1';
    const username = 'super.admin';
    const displayName = 'مديرة النظام';
    const password = 'Admin@123';
    const passwordHash = hashPassword(password);

    await client.query(
      `INSERT INTO users (id, username, display_name, employee_no, password_hash, password_plain, role, tenant_id, active)
       VALUES ($1, $2, $3, '', $4, $5, 'super_admin', NULL, true)`,
      [userId, username, displayName, passwordHash, password]
    );

    await setMetaValue('seed_version', SEED_VERSION);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Initialize database
export const initDb = async () => {
  if (initialized) return;
  
  try {
    const client = await pool.connect();
    try {
      await createSchema(client);
      await applySchemaMigrations(client);
    } finally {
      client.release();
    }
    
    await setMetaValue('schema_version', SCHEMA_VERSION);
    await seedPlatformIfNeeded();
    await deleteExpiredSessionsDb();
    
    initialized = true;
    console.log('PostgreSQL database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// Tenant functions
export const listTenantsDb = async () => {
  const result = await pool.query('SELECT * FROM tenants ORDER BY name');
  return result.rows.map(mapTenant);
};

export const findTenantByIdDb = async (id) => {
  const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [id]);
  return mapTenant(result.rows[0]);
};

export const findTenantByCodeDb = async (code) => {
  const result = await pool.query('SELECT * FROM tenants WHERE LOWER(code) = LOWER($1)', [normalizeCode(code)]);
  return mapTenant(result.rows[0]);
};

export const findTenantByNameDb = async (name) => {
  const cleanName = cleanText(name);
  if (!cleanName) return null;
  
  let result = await pool.query('SELECT * FROM tenants WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [cleanName]);
  if (result.rows[0]) return mapTenant(result.rows[0]);
  
  result = await pool.query(
    `SELECT * FROM tenants WHERE LOWER(name) LIKE $1 ORDER BY LENGTH(name) ASC LIMIT 1`,
    [`%${cleanName.toLowerCase()}%`]
  );
  return mapTenant(result.rows[0]);
};

export const createTenantDb = async ({ code, name, city = '', active = true }) => {
  const normalizedCode = normalizeCode(code);
  const cleanName = cleanText(name);
  if (!normalizedCode || !cleanName) return null;
  
  const existing = await findTenantByCodeDb(normalizedCode);
  if (existing) return null;

  const id = `t-${normalizedCode.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    await pool.query(
      `INSERT INTO tenants (id, code, name, city, active) VALUES ($1, $2, $3, $4, $5)`,
      [id, normalizedCode, cleanName, cleanText(city), active]
    );
    return await findTenantByIdDb(id);
  } catch {
    return null;
  }
};

export const updateTenantDb = async (tenantId, payload = {}) => {
  const existing = await findTenantByIdDb(tenantId);
  if (!existing) return null;

  const nextCode = payload.code !== undefined ? normalizeCode(payload.code) : existing.code;
  const nextName = payload.name !== undefined ? cleanText(payload.name) : existing.name;
  const nextCity = payload.city !== undefined ? cleanText(payload.city) : existing.city;
  const nextActive = payload.active !== undefined ? Boolean(payload.active) : existing.active;

  if (!nextCode || !nextName) return null;

  const conflict = await pool.query('SELECT id FROM tenants WHERE LOWER(code) = LOWER($1) AND id <> $2', [nextCode, tenantId]);
  if (conflict.rows[0]) return null;

  try {
    await pool.query(
      `UPDATE tenants SET code = $1, name = $2, city = $3, active = $4 WHERE id = $5`,
      [nextCode, nextName, nextCity, nextActive, tenantId]
    );
    return await findTenantByIdDb(tenantId);
  } catch {
    return null;
  }
};

// User functions
export const findUserByUsernameDb = async (username) => {
  const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [normalizeUsername(username)]);
  return mapUser(result.rows[0]);
};

export const findUserByIdDb = async (id) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return mapUser(result.rows[0]);
};

export const listUsersDb = async ({ tenantId = null, role = null, search = '' } = {}) => {
  const where = [];
  const params = [];
  let paramIndex = 1;

  if (tenantId) {
    where.push(`tenant_id = $${paramIndex++}`);
    params.push(tenantId);
  }
  if (role) {
    where.push(`role = $${paramIndex++}`);
    params.push(role);
  }
  if (search) {
    const pattern = `%${String(search).trim().toLowerCase()}%`;
    where.push(`(LOWER(username) LIKE $${paramIndex} OR LOWER(display_name) LIKE $${paramIndex + 1})`);
    params.push(pattern, pattern);
    paramIndex += 2;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(`SELECT * FROM users ${whereSql} ORDER BY role, display_name, username`, params);
  return result.rows.map(mapUser);
};

export const createUserDb = async ({
  username,
  displayName = '',
  employeeNo = '',
  passwordPlain = '',
  passwordHash,
  role,
  tenantId,
  active = true
}) => {
  const normalizedUsername = normalizeUsername(username);
  const normalizedRole = cleanText(role);
  const normalizedEmployeeNo = cleanText(employeeNo);

  if (!normalizedUsername || !passwordHash) return null;
  if (!ROLE_VALUES.includes(normalizedRole)) return null;
  if (normalizedRole !== 'super_admin' && !tenantId) return null;
  if (normalizedRole !== 'super_admin' && !(await findTenantByIdDb(tenantId))) return null;
  if (await findUserByUsernameDb(normalizedUsername)) return null;

  const id = makeId('u');

  try {
    await pool.query(
      `INSERT INTO users (id, username, display_name, employee_no, password_hash, password_plain, role, tenant_id, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        normalizedUsername,
        cleanText(displayName) || normalizedUsername,
        normalizedEmployeeNo,
        passwordHash,
        cleanText(passwordPlain),
        normalizedRole,
        normalizedRole === 'super_admin' ? null : tenantId,
        active
      ]
    );

    if (normalizedRole === 'teacher' && tenantId) {
      await syncTeacherLookupFromUsersInternal(tenantId);
    }

    return await findUserByIdDb(id);
  } catch {
    return null;
  }
};

export const updateUserDb = async (userId, payload = {}) => {
  const existing = await findUserByIdDb(userId);
  if (!existing) return null;

  const nextUsername = payload.username !== undefined ? normalizeUsername(payload.username) : existing.username;
  const nextDisplayName = payload.displayName !== undefined ? cleanText(payload.displayName) : existing.displayName || existing.username;
  const nextRole = payload.role !== undefined ? cleanText(payload.role) : existing.role;
  const nextTenantId = payload.tenantId !== undefined ? payload.tenantId || null : existing.tenantId;
  const nextPasswordHash = payload.passwordHash !== undefined ? payload.passwordHash : existing.passwordHash;
  const nextPasswordPlain = payload.passwordPlain !== undefined ? cleanText(payload.passwordPlain) : existing.passwordPlain || '';
  const nextEmployeeNo = payload.employeeNo !== undefined ? cleanText(payload.employeeNo) : existing.employeeNo || '';
  const nextActive = payload.active !== undefined ? Boolean(payload.active) : existing.active;

  if (!nextUsername || !nextPasswordHash || !ROLE_VALUES.includes(nextRole)) return null;
  if (nextRole !== 'super_admin' && !nextTenantId) return null;
  if (nextRole !== 'super_admin' && !(await findTenantByIdDb(nextTenantId))) return null;

  const conflict = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2', [nextUsername, userId]);
  if (conflict.rows[0]) return null;

  try {
    await pool.query(
      `UPDATE users SET username = $1, display_name = $2, employee_no = $3, password_hash = $4, password_plain = $5, 
       role = $6, tenant_id = $7, active = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9`,
      [
        nextUsername,
        nextDisplayName || nextUsername,
        nextEmployeeNo,
        nextPasswordHash,
        nextPasswordPlain,
        nextRole,
        nextRole === 'super_admin' ? null : nextTenantId,
        nextActive,
        userId
      ]
    );

    if (existing.tenantId) {
      await syncTeacherLookupFromUsersInternal(existing.tenantId);
    }
    if (nextTenantId && nextRole === 'teacher') {
      await syncTeacherLookupFromUsersInternal(nextTenantId);
    }

    return await findUserByIdDb(userId);
  } catch {
    return null;
  }
};

// Session functions
export const saveSessionDb = async (session) => {
  await pool.query(
    `INSERT INTO sessions (id, user_id, tenant_id, role, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [session.id, session.userId, session.tenantId, session.role, session.expiresAt]
  );
  return session;
};

export const findSessionDb = async (id) => {
  const result = await pool.query('SELECT id, user_id, tenant_id, role, expires_at FROM sessions WHERE id = $1', [id]);
  return result.rows[0] || null;
};

export const deleteSessionDb = async (id) => {
  await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
};

export const deleteExpiredSessionsDb = async () => {
  await pool.query('DELETE FROM sessions WHERE expires_at <= $1', [Date.now()]);
};

// Lookup functions
const syncTeacherLookupFromUsersInternal = async (tenantId) => {
  const result = await pool.query(
    `SELECT display_name FROM users WHERE tenant_id = $1 AND role = 'teacher' AND active = true ORDER BY display_name`,
    [tenantId]
  );
  const teacherNames = result.rows.map((row) => cleanText(row.display_name));
  await replaceLookupValuesInternal(tenantId, 'teachers', teacherNames);
};

const replaceLookupValuesInternal = async (tenantId, type, values) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lookups WHERE tenant_id = $1 AND type = $2', [tenantId, type]);
    const uniqueValues = [...new Set((values || []).map((v) => cleanText(v)).filter(Boolean))];
    for (const value of uniqueValues) {
      await client.query('INSERT INTO lookups (tenant_id, type, value) VALUES ($1, $2, $3)', [tenantId, type, value]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getTenantLookupsDb = async (tenantId) => {
  const lookups = { teachers: [], grades: [], sections: [], subjects: [], exams: [] };
  const result = await pool.query(
    `SELECT type, value FROM lookups WHERE tenant_id = $1 ORDER BY id`,
    [tenantId]
  );
  result.rows.forEach((row) => {
    if (lookups[row.type]) {
      lookups[row.type].push(String(row.value));
    }
  });
  const existingExams = lookups.exams.map((value) => cleanText(value)).filter(Boolean);
  lookups.exams = [...new Set([...EXAM_VALUES, ...existingExams])];
  return lookups;
};

export const getTeacherAssignmentsDb = async (tenantId, userId) => {
  const result = await pool.query(
    `SELECT grade, section, subject FROM teacher_assignments 
     WHERE tenant_id = $1 AND user_id = $2 ORDER BY grade, section, subject`,
    [tenantId, userId]
  );
  return result.rows.map((row) => ({
    grade: String(row.grade),
    section: String(row.section),
    subject: String(row.subject)
  }));
};

export const buildTeacherScopedLookupsDb = async (tenantId, user) => {
  if (!tenantId || !user) return { teachers: [], grades: [], sections: [], subjects: [], exams: [] };
  const assignments = await getTeacherAssignmentsDb(tenantId, user.id);
  const all = await getTenantLookupsDb(tenantId);
  return {
    teachers: [user.displayName || user.username],
    grades: [...new Set(assignments.map((row) => row.grade))],
    sections: [...new Set(assignments.map((row) => row.section))],
    subjects: [...new Set(assignments.map((row) => row.subject))],
    exams: all.exams || []
  };
};

export const canTeacherAccessDb = async (tenantId, userId, grade, section, subject = null) => {
  const cleanGrade = cleanText(grade);
  const cleanSection = cleanText(section);
  if (!tenantId || !userId || !cleanGrade || !cleanSection) return false;

  if (subject) {
    const result = await pool.query(
      `SELECT 1 AS ok FROM teacher_assignments 
       WHERE tenant_id = $1 AND user_id = $2 AND grade = $3 AND section = $4 AND subject = $5 LIMIT 1`,
      [tenantId, userId, cleanGrade, cleanSection, cleanText(subject)]
    );
    return Boolean(result.rows[0]?.ok);
  }

  const result = await pool.query(
    `SELECT 1 AS ok FROM teacher_assignments 
     WHERE tenant_id = $1 AND user_id = $2 AND grade = $3 AND section = $4 LIMIT 1`,
    [tenantId, userId, cleanGrade, cleanSection]
  );
  return Boolean(result.rows[0]?.ok);
};

// Student functions
export const getTenantStudentsDb = async (tenantId, grade, section) => {
  const result = await pool.query(
    `SELECT student_name FROM students 
     WHERE tenant_id = $1 AND grade = $2 AND section = $3 AND active = true 
     ORDER BY student_name`,
    [tenantId, cleanText(grade), cleanText(section)]
  );
  return result.rows.map((row) => String(row.student_name));
};

export const getTenantAssignmentsDb = async (tenantId) => {
  const result = await pool.query(
    `SELECT a.user_id, u.display_name AS teacher_name, a.grade, a.section, a.subject
     FROM teacher_assignments a
     JOIN users u ON u.id = a.user_id
     WHERE a.tenant_id = $1
     ORDER BY u.display_name, a.grade, a.section, a.subject`,
    [tenantId]
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    teacherName: row.teacher_name,
    grade: row.grade,
    section: row.section,
    subject: row.subject
  }));
};

export const listTeachersForSuperDb = async ({ tenantId = null, search = '' } = {}) => {
  const where = ["u.role = 'teacher'", 'u.active = true'];
  const params = [];
  let paramIndex = 1;

  if (tenantId) {
    where.push(`u.tenant_id = $${paramIndex++}`);
    params.push(tenantId);
  }
  if (search) {
    const pattern = `%${search.trim().toLowerCase()}%`;
    where.push(
      `(LOWER(u.display_name) LIKE $${paramIndex} OR LOWER(u.username) LIKE $${paramIndex + 1} OR 
        LOWER(u.employee_no) LIKE $${paramIndex + 2} OR LOWER(t.name) LIKE $${paramIndex + 3})`
    );
    params.push(pattern, pattern, pattern, pattern);
    paramIndex += 4;
  }

  const result = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.employee_no, u.tenant_id, t.name AS school_name
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.name, u.display_name, u.username`,
    params
  );
  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    employeeNo: row.employee_no || '',
    tenantId: row.tenant_id,
    schoolName: row.school_name || ''
  }));
};

export const listStudentsForSuperDb = async ({ tenantId = null, search = '' } = {}) => {
  const where = ['s.active = true'];
  const params = [];
  let paramIndex = 1;

  if (tenantId) {
    where.push(`s.tenant_id = $${paramIndex++}`);
    params.push(tenantId);
  }
  if (search) {
    const pattern = `%${search.trim().toLowerCase()}%`;
    where.push(`(LOWER(s.student_name) LIKE $${paramIndex} OR LOWER(s.student_no) LIKE $${paramIndex + 1} OR LOWER(t.name) LIKE $${paramIndex + 2})`);
    params.push(pattern, pattern, pattern);
    paramIndex += 3;
  }

  const result = await pool.query(
    `SELECT s.id, s.student_no, s.student_name, s.grade, s.section, s.tenant_id, t.name AS school_name
     FROM students s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.name, s.grade, s.section, s.student_name`,
    params
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    studentNo: row.student_no || '',
    studentName: row.student_name,
    grade: row.grade,
    section: row.section,
    tenantId: row.tenant_id,
    schoolName: row.school_name || ''
  }));
};

export const deactivateTeacherDb = async (userId) => {
  const user = await findUserByIdDb(userId);
  if (!user || user.role !== 'teacher') return false;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE users SET active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND role = 'teacher'", [userId]);
    await client.query('DELETE FROM teacher_assignments WHERE user_id = $1', [userId]);
    if (user.tenantId) await syncTeacherLookupFromUsersInternal(user.tenantId);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateStudentDb = async (studentId) => {
  const result = await pool.query('SELECT id FROM students WHERE id = $1', [studentId]);
  if (!result.rows[0]?.id) return false;
  await pool.query('UPDATE students SET active = false WHERE id = $1', [studentId]);
  return true;
};

// Admin functions
export const purgeSchoolDataDb = async ({ keepSessionId = null, includeCounts = false } = {}) => {
  const client = await pool.connect();
  try {
    const report = {
      deletedTenants: null,
      deletedSchoolAdmins: null,
      deletedTeachers: null,
      deletedStudents: null,
      deletedAssignments: null,
      deletedSubmissions: null,
      deletedLookups: null,
      countsIncluded: Boolean(includeCounts)
    };
    if (includeCounts) {
      report.deletedTenants = (await client.query('SELECT COUNT(*) AS c FROM tenants')).rows[0].c;
      report.deletedSchoolAdmins = (await client.query("SELECT COUNT(*) AS c FROM users WHERE role = 'school_admin'")).rows[0].c;
      report.deletedTeachers = (await client.query("SELECT COUNT(*) AS c FROM users WHERE role = 'teacher'")).rows[0].c;
      report.deletedStudents = (await client.query('SELECT COUNT(*) AS c FROM students')).rows[0].c;
      report.deletedAssignments = (await client.query('SELECT COUNT(*) AS c FROM teacher_assignments')).rows[0].c;
      report.deletedSubmissions = (await client.query('SELECT COUNT(*) AS c FROM submissions')).rows[0].c;
      report.deletedLookups = (await client.query('SELECT COUNT(*) AS c FROM lookups')).rows[0].c;
    }

    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE submissions, teacher_assignments, students, lookups RESTART IDENTITY');
    await client.query("DELETE FROM users WHERE role <> 'super_admin'");
    await client.query('DELETE FROM tenants');
    if (keepSessionId) {
      await client.query('DELETE FROM sessions WHERE id <> $1', [keepSessionId]);
    } else {
      await client.query('DELETE FROM sessions');
    }
    await client.query('COMMIT');

    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const replaceTenantStudentsDb = async (tenantId, rows) => {
  const cleanRows = (rows || [])
    .map((row) => ({
      studentName: cleanText(row.studentName || row.student_name),
      grade: cleanText(row.grade),
      section: cleanText(row.section)
    }))
    .filter((row) => row.studentName && row.grade && row.section);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM students WHERE tenant_id = $1', [tenantId]);
    for (const row of cleanRows) {
      await client.query(
        `INSERT INTO students (tenant_id, student_name, grade, section, active) VALUES ($1, $2, $3, $4, true)`,
        [tenantId, row.studentName, row.grade, row.section]
      );
    }
    await client.query('COMMIT');
    return cleanRows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const replaceTenantAssignmentsDb = async (tenantId, rows) => {
  const cleanRows = (rows || [])
    .map((row) => ({
      userId: cleanText(row.userId || row.user_id),
      grade: cleanText(row.grade),
      section: cleanText(row.section),
      subject: cleanText(row.subject)
    }))
    .filter((row) => row.userId && row.grade && row.section && row.subject);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM teacher_assignments WHERE tenant_id = $1', [tenantId]);
    for (const row of cleanRows) {
      await client.query(
        `INSERT INTO teacher_assignments (tenant_id, user_id, grade, section, subject) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, user_id, grade, section, subject) DO NOTHING`,
        [tenantId, row.userId, row.grade, row.section, row.subject]
      );
    }
    await syncTeacherLookupFromUsersInternal(tenantId);
    await client.query('COMMIT');
    return cleanRows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Import functions
const ensureTenantBySchoolNameInternal = async (schoolName) => {
  const cleanName = cleanText(schoolName);
  if (!cleanName) return null;
  const existing = await findTenantByNameDb(cleanName);
  if (existing) return existing;
  
  const code = await buildTenantCodeFromSchoolNameInternal(cleanName);
  const tenantId = `t-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
  
  await pool.query(
    `INSERT INTO tenants (id, code, name, city, active) VALUES ($1, $2, $3, '', true)`,
    [tenantId, code, cleanName]
  );
  return await findTenantByIdDb(tenantId);
};

const buildTenantCodeFromSchoolNameInternal = async (schoolName) => {
  const raw = cleanText(schoolName);
  const normalized = normalizeCode(raw)
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = (normalized || 'SCHOOL').slice(0, 18);
  let candidate = base;
  let i = 1;
  while (await findTenantByCodeDb(candidate)) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return candidate;
};

const ensureSchoolAdminForTenantInternal = async (tenant) => {
  if (!tenant?.id) return null;
  const result = await pool.query(
    `SELECT id FROM users WHERE tenant_id = $1 AND role = 'school_admin' ORDER BY created_at LIMIT 1`,
    [tenant.id]
  );
  if (result.rows[0]?.id) return await findUserByIdDb(result.rows[0].id);

  const base = `admin.${sanitizeUsernamePart(tenant.code) || 'school'}`;
  let username = base;
  let i = 1;
  while (await findUserByUsernameDb(username)) {
    username = `${base}.${i}`;
    i += 1;
  }

  const userId = makeId('u');
  await pool.query(
    `INSERT INTO users (id, username, display_name, employee_no, password_hash, password_plain, role, tenant_id, active)
     VALUES ($1, $2, $3, '', $4, 'Admin@123', 'school_admin', $5, true)`,
    [userId, username, `مديرة ${tenant.name}`, hashPassword('Admin@123'), tenant.id]
  );
  return await findUserByIdDb(userId);
};

const resolveTenantForImportInternal = async (schoolName, defaultTenantId = null) => {
  if (defaultTenantId) {
    const tenant = await findTenantByIdDb(defaultTenantId);
    if (tenant) return tenant;
  }
  const key = cleanText(schoolName);
  if (!key) return null;
  return (await findTenantByCodeDb(key)) || (await findTenantByNameDb(key)) || (await ensureTenantBySchoolNameInternal(key));
};

const ensureLookupValueInternal = async (tenantId, type, value) => {
  const cleanValue = cleanText(value);
  if (!tenantId || !cleanValue) return;
  await pool.query(
    `INSERT INTO lookups (tenant_id, type, value) VALUES ($1, $2, $3) ON CONFLICT (tenant_id, type, value) DO NOTHING`,
    [tenantId, type, cleanValue]
  );
};

export const findTeacherByEmployeeNoDb = async (tenantId, employeeNo) => {
  const result = await pool.query(
    `SELECT * FROM users WHERE tenant_id = $1 AND role = 'teacher' AND employee_no = $2 LIMIT 1`,
    [tenantId, cleanText(employeeNo)]
  );
  return mapUser(result.rows[0]);
};

const buildTeacherImportUsernameInternal = async ({ teacherNo }) => {
  const numPart = String(teacherNo || '')
    .replace(/\D+/g, '')
    .slice(-6);
  const base = numPart ? `t${numPart}` : `t${Date.now().toString(36).slice(-6)}`;
  let candidate = base;
  let i = 1;
  while (await findUserByUsernameDb(candidate)) {
    candidate = `${base}${i}`;
    i += 1;
  }
  return candidate;
};

const resolveTenantForImportWithClientInternal = async (client, tenantCache, schoolName, defaultTenantId = null) => {
  if (defaultTenantId) {
    const cacheKey = `default:${defaultTenantId}`;
    if (tenantCache.has(cacheKey)) return tenantCache.get(cacheKey);
    const result = await client.query('SELECT * FROM tenants WHERE id = $1 LIMIT 1', [defaultTenantId]);
    const tenant = mapTenant(result.rows[0]);
    tenantCache.set(cacheKey, tenant);
    return tenant;
  }

  const key = cleanText(schoolName);
  if (!key) return null;
  const cacheKey = `school:${key.toLowerCase()}`;
  if (tenantCache.has(cacheKey)) return tenantCache.get(cacheKey);

  let result = await client.query(
    `SELECT * FROM tenants
     WHERE LOWER(code) = LOWER($1) OR LOWER(TRIM(name)) = LOWER(TRIM($1))
     ORDER BY CASE WHEN LOWER(code) = LOWER($1) THEN 0 ELSE 1 END
     LIMIT 1`,
    [key]
  );
  let row = result.rows[0];

  if (!row) {
    result = await client.query(
      `SELECT * FROM tenants WHERE LOWER(name) LIKE $1 ORDER BY LENGTH(name) ASC LIMIT 1`,
      [`%${key.toLowerCase()}%`]
    );
    row = result.rows[0];
  }

  if (!row) {
    const normalized = normalizeCode(key)
      .replace(/[^A-Z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const base = (normalized || 'SCHOOL').slice(0, 18);
    let code = base;
    let i = 1;
    while (true) {
      const exists = await client.query('SELECT 1 AS ok FROM tenants WHERE LOWER(code) = LOWER($1) LIMIT 1', [code]);
      if (!exists.rows[0]?.ok) break;
      code = `${base}-${i}`;
      i += 1;
    }

    const tenantId = `t-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
    const inserted = await client.query(
      `INSERT INTO tenants (id, code, name, city, active) VALUES ($1, $2, $3, '', true) RETURNING *`,
      [tenantId, code, key]
    );
    row = inserted.rows[0];
  }

  const tenant = mapTenant(row);
  tenantCache.set(cacheKey, tenant);
  return tenant;
};

const ensureSchoolAdminForTenantWithClientInternal = async (client, tenant, ensuredTenantIds) => {
  if (!tenant?.id) return;
  if (ensuredTenantIds.has(tenant.id)) return;

  const existing = await client.query(
    `SELECT 1 AS ok FROM users WHERE tenant_id = $1 AND role = 'school_admin' LIMIT 1`,
    [tenant.id]
  );
  if (existing.rows[0]?.ok) {
    ensuredTenantIds.add(tenant.id);
    return;
  }

  const base = `admin.${sanitizeUsernamePart(tenant.code) || 'school'}`;
  const displayName = `مديرة ${tenant.name}`;
  const passwordHash = hashPassword('Admin@123');
  for (let attempt = 0; attempt < 100; attempt++) {
    const username = attempt === 0 ? base : `${base}.${attempt}`;
    const inserted = await client.query(
      `INSERT INTO users (id, username, display_name, employee_no, password_hash, password_plain, role, tenant_id, active)
       VALUES ($1, $2, $3, '', $4, 'Admin@123', 'school_admin', $5, true)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [makeId('u'), username, displayName, passwordHash, tenant.id]
    );
    if (inserted.rows[0]?.id) {
      ensuredTenantIds.add(tenant.id);
      return;
    }
  }

  // Best-effort fallback in race cases.
  ensuredTenantIds.add(tenant.id);
};

const insertLookupValuesBatchWithClientInternal = async (client, tenantId, type, valuesSet) => {
  const values = [...(valuesSet || [])].map((value) => cleanText(value)).filter(Boolean);
  if (!tenantId || !values.length) return;
  await client.query(
    `INSERT INTO lookups (tenant_id, type, value)
     SELECT $1, $2, UNNEST($3::text[])
     ON CONFLICT (tenant_id, type, value) DO NOTHING`,
    [tenantId, type, values]
  );
};

const syncTeacherLookupForTenantWithClientInternal = async (client, tenantId) => {
  const result = await client.query(
    `SELECT display_name FROM users WHERE tenant_id = $1 AND role = 'teacher' AND active = true ORDER BY display_name`,
    [tenantId]
  );
  const teacherNames = [...new Set(result.rows.map((row) => cleanText(row.display_name)).filter(Boolean))];
  await client.query(`DELETE FROM lookups WHERE tenant_id = $1 AND type = 'teachers'`, [tenantId]);
  if (!teacherNames.length) return;
  await client.query(
    `INSERT INTO lookups (tenant_id, type, value)
     SELECT $1, 'teachers', UNNEST($2::text[])
     ON CONFLICT (tenant_id, type, value) DO NOTHING`,
    [tenantId, teacherNames]
  );
};

export const importStudentsRowsDb = async (rows, { defaultTenantId = null } = {}) => {
  const report = {
    total: Array.isArray(rows) ? rows.length : 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };
  if (!Array.isArray(rows) || !rows.length) return report;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenantCache = new Map();
    const ensuredTenantAdmins = new Set();
    const tenantStates = new Map();
    const getTenantState = async (tenantId) => {
      if (tenantStates.has(tenantId)) return tenantStates.get(tenantId);
      const studentsResult = await client.query(
        `SELECT id, student_no, student_name, grade, section FROM students WHERE tenant_id = $1`,
        [tenantId]
      );
      const studentsByNo = new Map();
      const studentsByComposite = new Map();
      for (const row of studentsResult.rows) {
        const entity = {
          id: row.id,
          studentNo: cleanText(row.student_no),
          studentName: cleanText(row.student_name),
          grade: cleanText(row.grade),
          section: cleanText(row.section)
        };
        if (entity.studentNo) studentsByNo.set(entity.studentNo, entity);
        studentsByComposite.set(`${entity.studentName.toLowerCase()}|${entity.grade}|${entity.section}`, entity);
      }
      const state = {
        studentsByNo,
        studentsByComposite,
        grades: new Set(),
        sections: new Set()
      };
      tenantStates.set(tenantId, state);
      return state;
    };

    for (let index = 0; index < rows.length; index++) {
      const rawRow = rows[index];
      const line = index + 2;
      const schoolName = cleanText(rawRow.schoolName || rawRow.school || rawRow.tenantName);
      const studentNo = cleanText(rawRow.studentNo || rawRow.student_no || rawRow.idNo);
      const studentName = cleanText(rawRow.studentName || rawRow.student_name || rawRow.name);
      const grade = cleanText(rawRow.grade);
      const section = cleanText(rawRow.section);

      try {
        const tenant = await resolveTenantForImportWithClientInternal(client, tenantCache, schoolName, defaultTenantId);
        if (tenant) await ensureSchoolAdminForTenantWithClientInternal(client, tenant, ensuredTenantAdmins);

        if (!tenant) {
          report.errors.push(`السطر ${line}: تعذر تحديد المدرسة (${schoolName || 'بدون اسم'})`);
          continue;
        }
        if (!studentName || !grade || !section) {
          report.errors.push(`السطر ${line}: البيانات ناقصة للطالبة`);
          continue;
        }

        const state = await getTenantState(tenant.id);
        let existing = null;
        if (studentNo) existing = state.studentsByNo.get(studentNo) || null;
        if (!existing) {
          existing = state.studentsByComposite.get(`${studentName.toLowerCase()}|${grade}|${section}`) || null;
        }

        if (existing?.id) {
          await client.query(
            `UPDATE students
             SET student_no = CASE WHEN $1 <> '' THEN $1 ELSE student_no END,
                 student_name = $2, grade = $3, section = $4, active = true
             WHERE id = $5`,
            [studentNo, studentName, grade, section, existing.id]
          );
          report.updated += 1;

          if (existing.studentNo && existing.studentNo !== studentNo) state.studentsByNo.delete(existing.studentNo);
          if (studentNo) state.studentsByNo.set(studentNo, { ...existing, studentNo, studentName, grade, section });
          state.studentsByComposite.set(`${studentName.toLowerCase()}|${grade}|${section}`, {
            ...existing,
            studentNo,
            studentName,
            grade,
            section
          });
        } else {
          const inserted = await client.query(
            `INSERT INTO students (tenant_id, student_no, student_name, grade, section, active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id`,
            [tenant.id, studentNo, studentName, grade, section]
          );
          const studentId = inserted.rows[0]?.id;
          report.inserted += 1;
          if (studentNo) state.studentsByNo.set(studentNo, { id: studentId, studentNo, studentName, grade, section });
          state.studentsByComposite.set(`${studentName.toLowerCase()}|${grade}|${section}`, {
            id: studentId,
            studentNo,
            studentName,
            grade,
            section
          });
        }

        state.grades.add(grade);
        state.sections.add(section);
      } catch (error) {
        report.errors.push(`السطر ${line}: ${error.message}`);
      }
    }

    for (const [tenantId, state] of tenantStates.entries()) {
      await insertLookupValuesBatchWithClientInternal(client, tenantId, 'grades', state.grades);
      await insertLookupValuesBatchWithClientInternal(client, tenantId, 'sections', state.sections);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return report;
};

export const importTeachersRowsDb = async (rows, { defaultTenantId = null, defaultPassword = 'Teacher@123' } = {}) => {
  const report = {
    total: Array.isArray(rows) ? rows.length : 0,
    teachersCreated: 0,
    teachersUpdated: 0,
    assignmentsInserted: 0,
    assignmentsSkipped: 0,
    errors: []
  };
  if (!Array.isArray(rows) || !rows.length) return report;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const touchedTenantIds = new Set();
    const tenantCache = new Map();
    const ensuredTenantAdmins = new Set();
    const tenantStates = new Map();

    const usernamesResult = await client.query(`SELECT LOWER(username) AS username FROM users`);
    const takenUsernames = new Set(usernamesResult.rows.map((row) => cleanText(row.username)).filter(Boolean));
    const reserveTeacherUsername = (teacherNo) => {
      const numPart = String(teacherNo || '')
        .replace(/\D+/g, '')
        .slice(-6);
      const base = numPart ? `t${numPart}` : `t${Date.now().toString(36).slice(-6)}`;
      let candidate = base;
      let i = 1;
      while (takenUsernames.has(candidate.toLowerCase())) {
        candidate = `${base}${i}`;
        i += 1;
      }
      takenUsernames.add(candidate.toLowerCase());
      return candidate;
    };
    const pendingTeacherCreates = [];
    const pendingAssignments = [];
    const insertTeacherRow = async (teacher) => {
      await client.query(
        `INSERT INTO users (id, username, display_name, employee_no, password_hash, password_plain, role, tenant_id, active)
         VALUES ($1, $2, $3, $4, $5, $6, 'teacher', $7, true)`,
        [teacher.id, teacher.username, teacher.displayName, teacher.employeeNo, teacher.passwordHash, teacher.passwordPlain, teacher.tenantId]
      );
    };
    const flushTeachers = async () => {
      if (!pendingTeacherCreates.length) return;
      const BATCH_SIZE = 250;
      for (let i = 0; i < pendingTeacherCreates.length; i += BATCH_SIZE) {
        const chunk = pendingTeacherCreates.slice(i, i + BATCH_SIZE);
        try {
          const values = [];
          const placeholders = chunk.map((teacher, index) => {
            const start = index * 7;
            values.push(
              teacher.id,
              teacher.username,
              teacher.displayName,
              teacher.employeeNo,
              teacher.passwordHash,
              teacher.passwordPlain,
              teacher.tenantId
            );
            return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, 'teacher', $${start + 7}, true)`;
          });
          await client.query(
            `INSERT INTO users (id, username, display_name, employee_no, password_hash, password_plain, role, tenant_id, active)
             VALUES ${placeholders.join(', ')}`,
            values
          );
        } catch (error) {
          if (error?.code !== '23505') throw error;
          // Retry row-by-row only for conflicting chunks.
          for (const teacher of chunk) {
            let inserted = false;
            for (let attempt = 0; attempt < 30; attempt++) {
              try {
                await insertTeacherRow(teacher);
                inserted = true;
                break;
              } catch (insertError) {
                if (insertError?.code !== '23505') throw insertError;
                teacher.username = reserveTeacherUsername(teacher.employeeNo);
              }
            }
            if (!inserted) throw new Error(`تعذر إنشاء اسم مستخدم فريد للمعلمة ${teacher.displayName}`);
          }
        }
      }
    };
    const flushAssignments = async () => {
      if (!pendingAssignments.length) return;
      const BATCH_SIZE = 500;
      let insertedCount = 0;
      for (let i = 0; i < pendingAssignments.length; i += BATCH_SIZE) {
        const chunk = pendingAssignments.slice(i, i + BATCH_SIZE);
        const values = [];
        const placeholders = chunk.map((row, index) => {
          const start = index * 5;
          values.push(row.tenantId, row.userId, row.grade, row.section, row.subject);
          return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5})`;
        });
        const result = await client.query(
          `INSERT INTO teacher_assignments (tenant_id, user_id, grade, section, subject)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (tenant_id, user_id, grade, section, subject) DO NOTHING`,
          values
        );
        insertedCount += result.rowCount || 0;
      }
      report.assignmentsInserted += insertedCount;
      report.assignmentsSkipped += pendingAssignments.length - insertedCount;
    };

    const getTenantState = async (tenantId) => {
      if (tenantStates.has(tenantId)) return tenantStates.get(tenantId);

      const teachersResult = await client.query(
        `SELECT * FROM users WHERE tenant_id = $1 AND role = 'teacher'`,
        [tenantId]
      );
      const teachersByEmployeeNo = new Map();
      const teachersByName = new Map();
      for (const row of teachersResult.rows) {
        const teacher = mapUser(row);
        if (teacher?.employeeNo) teachersByEmployeeNo.set(cleanText(teacher.employeeNo), teacher);
        if (teacher?.displayName) teachersByName.set(cleanText(teacher.displayName).toLowerCase(), teacher);
      }

      const assignmentsResult = await client.query(
        `SELECT user_id, grade, section, subject FROM teacher_assignments WHERE tenant_id = $1`,
        [tenantId]
      );
      const assignmentKeys = new Set(
        assignmentsResult.rows.map((row) => `${row.user_id}|${cleanText(row.grade)}|${cleanText(row.section)}|${cleanText(row.subject)}`)
      );

      const state = {
        teachersByEmployeeNo,
        teachersByName,
        assignmentKeys,
        grades: new Set(),
        sections: new Set(),
        subjects: new Set()
      };
      tenantStates.set(tenantId, state);
      return state;
    };

    for (let index = 0; index < rows.length; index++) {
      const rawRow = rows[index];
      const line = index + 2;
      const schoolName = cleanText(rawRow.schoolName || rawRow.school || rawRow.tenantName);
      const teacherNo = cleanText(rawRow.teacherNo || rawRow.teacher_no || rawRow.employeeNo || rawRow.employee_no);
      const teacherName = cleanText(rawRow.teacherName || rawRow.teacher_name || rawRow.name);
      const grade = cleanText(rawRow.grade);
      const section = cleanText(rawRow.section);
      const subject = cleanText(rawRow.subject);

      try {
        const tenant = await resolveTenantForImportWithClientInternal(client, tenantCache, schoolName, defaultTenantId);
        if (tenant) await ensureSchoolAdminForTenantWithClientInternal(client, tenant, ensuredTenantAdmins);

        if (!tenant) {
          report.errors.push(`السطر ${line}: تعذر تحديد المدرسة (${schoolName || 'بدون اسم'})`);
          continue;
        }
        if (!teacherName || !grade || !section || !subject) {
          report.errors.push(`السطر ${line}: البيانات ناقصة للمعلمة أو المادة/الصف/الشعبة`);
          continue;
        }

        const state = await getTenantState(tenant.id);
        let teacher = null;
        if (teacherNo) teacher = state.teachersByEmployeeNo.get(teacherNo) || null;
        if (!teacher) teacher = state.teachersByName.get(teacherName.toLowerCase()) || null;

        if (!teacher) {
          const autoPassword = teacherNo ? `T@${teacherNo.slice(-6)}` : defaultPassword;
          teacher = {
            id: makeId('u'),
            username: reserveTeacherUsername(teacherNo),
            displayName: teacherName,
            employeeNo: teacherNo,
            passwordHash: hashPassword(autoPassword),
            passwordPlain: autoPassword,
            tenantId: tenant.id,
            role: 'teacher',
            active: true
          };
          pendingTeacherCreates.push({
            id: teacher.id,
            username: teacher.username,
            displayName: teacher.displayName,
            employeeNo: teacher.employeeNo,
            passwordHash: teacher.passwordHash,
            passwordPlain: teacher.passwordPlain,
            tenantId: teacher.tenantId
          });
          report.teachersCreated += 1;
        } else {
          const nextEmployeeNo = teacherNo || teacher.employeeNo || '';
          const needsUpdate = cleanText(teacher.displayName) !== teacherName || cleanText(teacher.employeeNo) !== nextEmployeeNo;
          if (needsUpdate) {
            const updated = await client.query(
              `UPDATE users
               SET display_name = $1,
                   employee_no = $2,
                   active = true,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $3
               RETURNING *`,
              [teacherName, nextEmployeeNo, teacher.id]
            );
            teacher = mapUser(updated.rows[0] || teacher);
            report.teachersUpdated += 1;
          }
        }

        if (teacher?.employeeNo) state.teachersByEmployeeNo.set(cleanText(teacher.employeeNo), teacher);
        state.teachersByName.set(cleanText(teacher.displayName || teacherName).toLowerCase(), teacher);

        const assignmentKey = `${teacher.id}|${grade}|${section}|${subject}`;
        if (state.assignmentKeys.has(assignmentKey)) {
          report.assignmentsSkipped += 1;
        } else {
          pendingAssignments.push({
            tenantId: tenant.id,
            userId: teacher.id,
            grade,
            section,
            subject
          });
          state.assignmentKeys.add(assignmentKey);
        }

        state.grades.add(grade);
        state.sections.add(section);
        state.subjects.add(subject);
        touchedTenantIds.add(tenant.id);
      } catch (error) {
        report.errors.push(`السطر ${line}: ${error.message}`);
      }
    }

    await flushTeachers();
    await flushAssignments();

    for (const [tenantId, state] of tenantStates.entries()) {
      await insertLookupValuesBatchWithClientInternal(client, tenantId, 'grades', state.grades);
      await insertLookupValuesBatchWithClientInternal(client, tenantId, 'sections', state.sections);
      await insertLookupValuesBatchWithClientInternal(client, tenantId, 'subjects', state.subjects);
    }
    for (const tenantId of touchedTenantIds) {
      await syncTeacherLookupForTenantWithClientInternal(client, tenantId);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return report;
};

export const bootstrapTenantDemoDb = async ({ tenantId, tenantCode, tenantName }) => {
  if (!tenantId || !tenantCode || !tenantName) return false;
  // For now, just return true - demo data generation can be added later if needed
  return true;
};

export const addTenantSubmissionDb = async (tenantId, record) => {
  await pool.query(
    `INSERT INTO submissions (
      tenant_id, timestamp, batch_id, teacher_name, grade, section, subject, exam,
      max_recall, max_understand, max_hots, total_max,
      student_name, recall, understand, hots, total, plan, level
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      tenantId,
      record.timestamp,
      record.batchId,
      record.teacherName,
      record.grade,
      record.section,
      record.subject,
      record.exam,
      record.maxRecall,
      record.maxUnderstand,
      record.maxHots,
      record.totalMax,
      record.studentName,
      record.recall,
      record.understand,
      record.hots,
      record.total,
      record.plan,
      record.level
    ]
  );
  return true;
};

export const addTenantSubmissionsBatchDb = async (tenantId, records = []) => {
  if (!tenantId || !Array.isArray(records) || !records.length) return 0;

  const values = [];
  const placeholders = records.map((record, index) => {
    const start = index * 19;
    values.push(
      tenantId,
      record.timestamp,
      record.batchId,
      record.teacherName,
      record.grade,
      record.section,
      record.subject,
      record.exam,
      record.maxRecall,
      record.maxUnderstand,
      record.maxHots,
      record.totalMax,
      record.studentName,
      record.recall,
      record.understand,
      record.hots,
      record.total,
      record.plan,
      record.level
    );
    return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9}, $${start + 10}, $${start + 11}, $${start + 12}, $${start + 13}, $${start + 14}, $${start + 15}, $${start + 16}, $${start + 17}, $${start + 18}, $${start + 19})`;
  });

  const result = await pool.query(
    `INSERT INTO submissions (
      tenant_id, timestamp, batch_id, teacher_name, grade, section, subject, exam,
      max_recall, max_understand, max_hots, total_max,
      student_name, recall, understand, hots, total, plan, level
    ) VALUES ${placeholders.join(', ')}`,
    values
  );

  return result.rowCount || 0;
};

export const replaceTenantSubmissionsBatchDb = async (tenantId, groupKey = {}, records = []) => {
  if (!tenantId) return 0;
  const teacherName = cleanText(groupKey.teacherName);
  const grade = cleanText(groupKey.grade);
  const section = cleanText(groupKey.section);
  const subject = cleanText(groupKey.subject);
  const exam = cleanText(groupKey.exam);
  if (!teacherName || !grade || !section || !subject || !exam) {
    throw new Error('teacherName, grade, section, subject and exam are required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM submissions
       WHERE tenant_id = $1
         AND teacher_name = $2
         AND grade = $3
         AND section = $4
         AND subject = $5
         AND exam = $6`,
      [tenantId, teacherName, grade, section, subject, exam]
    );

    let inserted = 0;
    if (Array.isArray(records) && records.length) {
      const values = [];
      const placeholders = records.map((record, index) => {
        const start = index * 19;
        values.push(
          tenantId,
          record.timestamp,
          record.batchId,
          record.teacherName,
          record.grade,
          record.section,
          record.subject,
          record.exam,
          record.maxRecall,
          record.maxUnderstand,
          record.maxHots,
          record.totalMax,
          record.studentName,
          record.recall,
          record.understand,
          record.hots,
          record.total,
          record.plan,
          record.level
        );
        return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9}, $${start + 10}, $${start + 11}, $${start + 12}, $${start + 13}, $${start + 14}, $${start + 15}, $${start + 16}, $${start + 17}, $${start + 18}, $${start + 19})`;
      });

      const result = await client.query(
        `INSERT INTO submissions (
          tenant_id, timestamp, batch_id, teacher_name, grade, section, subject, exam,
          max_recall, max_understand, max_hots, total_max,
          student_name, recall, understand, hots, total, plan, level
        ) VALUES ${placeholders.join(', ')}`,
        values
      );
      inserted = result.rowCount || 0;
    }

    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const dedupeSubmissionsDb = async ({ tenantId = null } = {}) => {
  const normalizedTenantId = cleanText(tenantId) || null;
  const whereSql = normalizedTenantId ? 'WHERE tenant_id = $1' : '';
  const params = normalizedTenantId ? [normalizedTenantId] : [];

  const duplicateCountResult = await pool.query(
    `SELECT COUNT(*) AS c
     FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY tenant_id, teacher_name, grade, section, subject, exam, student_name
                ORDER BY id DESC
              ) AS rn
       FROM submissions
       ${whereSql}
     ) ranked
     WHERE rn > 1`,
    params
  );
  const duplicatesBefore = Number(duplicateCountResult.rows[0]?.c || 0);

  if (!duplicatesBefore) {
    const totalResult = await pool.query(`SELECT COUNT(*) AS c FROM submissions ${whereSql}`, params);
    return {
      tenantId: normalizedTenantId,
      duplicatesBefore: 0,
      deleted: 0,
      totalAfter: Number(totalResult.rows[0]?.c || 0)
    };
  }

  const deleteResult = await pool.query(
    `WITH ranked AS (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY tenant_id, teacher_name, grade, section, subject, exam, student_name
                ORDER BY id DESC
              ) AS rn
       FROM submissions
       ${whereSql}
     )
     DELETE FROM submissions target
     USING ranked
     WHERE target.id = ranked.id
       AND ranked.rn > 1`,
    params
  );

  const totalResult = await pool.query(`SELECT COUNT(*) AS c FROM submissions ${whereSql}`, params);
  return {
    tenantId: normalizedTenantId,
    duplicatesBefore,
    deleted: deleteResult.rowCount || 0,
    totalAfter: Number(totalResult.rows[0]?.c || 0)
  };
};

export const getTenantSubmissionsDb = async (tenantId) => {
  const result = await pool.query(
    `SELECT timestamp, batch_id, teacher_name, grade, section, subject, exam,
            max_recall, max_understand, max_hots, total_max,
            student_name, recall, understand, hots, total, plan
     FROM submissions
     WHERE tenant_id = $1
     ORDER BY id DESC`,
    [tenantId]
  );
  const markOrEmpty = (value) => (value === null || value === undefined ? '' : value);
  return result.rows.map((row) => [
    row.timestamp,
    row.batch_id,
    row.teacher_name,
    row.grade,
    row.section,
    row.subject,
    row.exam,
    row.max_recall,
    row.max_understand,
    row.max_hots,
    row.total_max,
    row.student_name,
    markOrEmpty(row.recall),
    markOrEmpty(row.understand),
    markOrEmpty(row.hots),
    markOrEmpty(row.total),
    row.plan ?? ''
  ]);
};

export const getSystemStatsDb = async () => {
  const toNumber = (row) => Number(row?.c || 0);
  const tenants = await pool.query('SELECT COUNT(*) AS c FROM tenants');
  const users = await pool.query('SELECT COUNT(*) AS c FROM users');
  const students = await pool.query('SELECT COUNT(*) AS c FROM students');
  const assignments = await pool.query('SELECT COUNT(*) AS c FROM teacher_assignments');
  const submissions = await pool.query('SELECT COUNT(*) AS c FROM submissions');
  const sessions = await pool.query('SELECT COUNT(*) AS c FROM sessions');
  
  return {
    tenants: toNumber(tenants.rows[0]),
    users: toNumber(users.rows[0]),
    students: toNumber(students.rows[0]),
    assignments: toNumber(assignments.rows[0]),
    submissions: toNumber(submissions.rows[0]),
    sessions: toNumber(sessions.rows[0])
  };
};

// Export pool for cleanup
export { pool };
export const DB_PATH = 'PostgreSQL (Supabase)';

