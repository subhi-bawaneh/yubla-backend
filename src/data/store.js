import { createSession, hashPassword } from '../utils/security.js';

// Legacy single-school data (kept for existing /api route compatibility)
const LOOKUPS = {
  teachers: ['Teacher A', 'Teacher B', 'Teacher C'],
  grades: ['10', '11', '12'],
  sections: ['A', 'B', 'C'],
  subjects: ['Math', 'Physics', 'Chemistry', 'Biology'],
  exams: ['First Trimester', 'Second Trimester', 'Final']
};

const STUDENTS = {
  '10-A': ['Reem', 'Dina', 'Sara', 'Lina'],
  '11-B': ['Nada', 'Nour', 'Rana'],
  '12-C': ['Mona', 'Rita', 'Dana']
};

const submissions = [];

const addSubmission = (row) => {
  submissions.push(row);
};

const getSubmissions = () => submissions;

// Multi-tenant in-memory store (phase 1 foundation)
const tenants = [
  { id: 't-yubla', code: 'YUBLA', name: 'مدرسة يبلا الثانوية للبنات', active: true },
  { id: 't-demo', code: 'DEMO', name: 'مدرسة تجريبية', active: true }
];

const tenantData = {
  't-yubla': {
    lookups: {
      teachers: ['Sujood Azzam', 'Altaf Ali'],
      grades: ['7', '8', '9', '10'],
      sections: ['A', 'B', 'C'],
      subjects: ['رياضيات', 'علوم', 'لغة عربية', 'لغة إنجليزية'],
      exams: ['نصفي أول', 'نصفي ثاني', 'نهائي']
    },
    students: {
      '8-A': ['ريم', 'دينا', 'سارة', 'لينا'],
      '8-B': ['نور', 'رنا', 'هنا']
    },
    submissions: []
  },
  't-demo': {
    lookups: {
      teachers: ['Teacher X', 'Teacher Y'],
      grades: ['10', '11', '12'],
      sections: ['A', 'B'],
      subjects: ['Math', 'Physics'],
      exams: ['Midterm', 'Final']
    },
    students: {
      '10-A': ['Student 1', 'Student 2']
    },
    submissions: []
  }
};

const users = [
  {
    id: 'u-super-1',
    username: 'super.admin',
    passwordHash: hashPassword('Admin@123'),
    role: 'super_admin',
    tenantId: null,
    active: true
  },
  {
    id: 'u-yubla-admin',
    username: 'admin.yubla',
    passwordHash: hashPassword('Admin@123'),
    role: 'school_admin',
    tenantId: 't-yubla',
    active: true
  },
  {
    id: 'u-yubla-teacher-1',
    username: 'teacher.yubla',
    passwordHash: hashPassword('Teacher@123'),
    role: 'teacher',
    tenantId: 't-yubla',
    active: true
  }
];

const sessions = new Map();

const findTenantById = (tenantId) => tenants.find((t) => t.id === tenantId) || null;

const findTenantByCode = (code) => {
  if (!code) return null;
  return tenants.find((t) => t.code.toLowerCase() === String(code).toLowerCase()) || null;
};

const listTenants = () => tenants;

const createTenant = ({ code, name }) => {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const normalizedName = String(name || '').trim();
  if (!normalizedCode || !normalizedName) return null;
  if (findTenantByCode(normalizedCode)) return null;

  const tenant = {
    id: `t-${Date.now()}`,
    code: normalizedCode,
    name: normalizedName,
    active: true
  };
  tenants.push(tenant);
  tenantData[tenant.id] = {
    lookups: { teachers: [], grades: [], sections: [], subjects: [], exams: [] },
    students: {},
    submissions: []
  };
  return tenant;
};

const findUserByUsername = (username) => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === normalizedUsername) || null;
};

const createUser = ({ username, password, role, tenantId }) => {
  if (!username || !password || !role) return null;
  if (findUserByUsername(username)) return null;
  const user = {
    id: `u-${Date.now()}`,
    username: String(username).trim(),
    passwordHash: hashPassword(password),
    role,
    tenantId: tenantId || null,
    active: true
  };
  users.push(user);
  return user;
};

const saveSession = (user) => {
  const session = createSession(user);
  sessions.set(session.id, session);
  return session;
};

const findSession = (sessionId) => sessions.get(sessionId) || null;
const deleteSession = (sessionId) => sessions.delete(sessionId);

const getTenantStore = (tenantId) => tenantData[tenantId] || null;

const getTenantLookups = (tenantId) => getTenantStore(tenantId)?.lookups || null;

const getTenantStudents = (tenantId, grade, section) => {
  const bucket = getTenantStore(tenantId);
  if (!bucket) return null;
  const key = `${grade}-${section}`;
  return bucket.students[key] || [];
};

const addTenantSubmission = (tenantId, row) => {
  const bucket = getTenantStore(tenantId);
  if (!bucket) return false;
  bucket.submissions.push(row);
  return true;
};

const getTenantSubmissions = (tenantId) => {
  const bucket = getTenantStore(tenantId);
  if (!bucket) return [];
  return bucket.submissions;
};

export {
  LOOKUPS,
  STUDENTS,
  addSubmission,
  getSubmissions,
  listTenants,
  createTenant,
  findTenantById,
  findTenantByCode,
  findUserByUsername,
  createUser,
  saveSession,
  findSession,
  deleteSession,
  getTenantLookups,
  getTenantStudents,
  addTenantSubmission,
  getTenantSubmissions
};
