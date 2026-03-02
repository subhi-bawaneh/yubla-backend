# Yubla Backend API

Express.js REST API server for the Yubla School Grades Management System.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL (Supabase)
- **Database Client**: node-postgres (pg)
- **Authentication**: Session-based with bcrypt

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- PostgreSQL database (Supabase account)

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the backend directory:

```env
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173,http://192.168.1.15:5173
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.qgivldlsyinxbeujrmzz.supabase.co:5432/postgres
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `FRONTEND_ORIGIN` - Comma-separated list of allowed CORS origins
- `DATABASE_URL` - PostgreSQL connection string

## Development

```bash
npm run dev
```

The server will start on `http://localhost:3000` with auto-reload enabled.

## Production

```bash
npm start
```

## Project Structure

```
backend/
├── src/
│   ├── server.js          # Main server file
│   ├── routes/
│   │   ├── api.js         # Legacy API routes
│   │   └── v1.js          # V1 API routes
│   ├── data/
│   │   ├── db.js          # PostgreSQL database layer
│   │   └── store.js       # Legacy in-memory store
│   └── utils/
│       └── security.js    # Password hashing & sessions
├── .env                   # Environment variables (create this)
└── package.json
```

## API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

### Public Endpoints

#### Health Check
```http
GET /health
```

#### List Tenants
```http
GET /api/v1/public/tenants
```

### Authentication Endpoints

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "super.admin",
  "password": "Admin@123",
  "tenantCode": "YUBLA" // optional, required for non-super admins
}
```

#### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

#### Get Current User
```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

#### Update Account
```http
PATCH /api/v1/auth/account
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "current",
  "newPassword": "new",
  "newUsername": "newusername",
  "newDisplayName": "New Name"
}
```

### Super Admin Endpoints

#### System Overview
```http
GET /api/v1/super/overview
Authorization: Bearer <token>
```

#### Manage Tenants
```http
GET /api/v1/super/tenants?page=1&pageSize=20&search=query
POST /api/v1/super/tenants
PATCH /api/v1/super/tenants/:tenantId
POST /api/v1/super/tenants/:tenantId/bootstrap
```

#### Manage Users
```http
GET /api/v1/super/users?tenantId=xxx&role=teacher&search=query
POST /api/v1/super/users
PATCH /api/v1/super/users/:userId
```

#### Manage Teachers
```http
GET /api/v1/super/teachers?tenantId=xxx&search=query
DELETE /api/v1/super/teachers/:userId
```

#### Manage Students
```http
GET /api/v1/super/students?tenantId=xxx&search=query
DELETE /api/v1/super/students/:studentId
```

#### Import Data
```http
POST /api/v1/super/import/teachers
POST /api/v1/super/import/students
```

#### System Management
```http
POST /api/v1/super/system/reset-schools
```

### School Admin Endpoints

#### Manage Users
```http
GET /api/v1/admin/users
POST /api/v1/admin/users
```

#### Manage Assignments
```http
GET /api/v1/admin/assignments
POST /api/v1/admin/assignments/replace
```

#### Manage Students
```http
POST /api/v1/admin/students/replace
```

### Teacher & School Admin Endpoints

#### Get Lookups
```http
GET /api/v1/lookups
```

#### Get Students
```http
GET /api/v1/students?grade=xxx&section=xxx
```

#### Manage Submissions
```http
POST /api/v1/submissions
GET /api/v1/submissions
```

## Database Schema

### Tables

- `app_meta` - Application metadata
- `tenants` - Schools/organizations
- `users` - System users (super_admin, school_admin, teacher)
- `sessions` - User sessions
- `lookups` - Dynamic lookup values (grades, sections, subjects, etc.)
- `students` - Student records
- `teacher_assignments` - Teacher-to-class assignments
- `submissions` - Grade submissions

### Default Credentials

**Super Admin:**
- Username: `super.admin`
- Password: `Admin@123`

## Database Initialization

The database schema is automatically created on first run. The system will:
1. Create all required tables
2. Create indexes
3. Seed the super admin user

## Error Handling

All API responses follow this format:

**Success:**
```json
{
  "ok": true,
  "data": {...}
}
```

**Error:**
```json
{
  "ok": false,
  "error": "Error message"
}
```

## CORS Configuration

CORS is configured to allow requests from origins specified in `FRONTEND_ORIGIN` environment variable. Multiple origins can be specified as comma-separated values.

## Security

- Passwords are hashed using bcrypt
- Sessions expire after 24 hours
- All sensitive endpoints require authentication
- Role-based access control (RBAC)

## Deployment

### Environment Variables

Set these in your hosting platform:
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port
- `FRONTEND_ORIGIN` - Allowed CORS origins

### Hosting Platforms

**Railway:**
```bash
railway login
railway init
railway up
```

**Render:**
1. Connect GitHub repository
2. Set environment variables
3. Deploy

**Heroku:**
```bash
heroku create
heroku config:set DATABASE_URL=xxx
git push heroku main
```

## Troubleshooting

### Database Connection Issues

If you see `ENETUNREACH` error, add to `.env`:
```env
NODE_OPTIONS=--dns-result-order=ipv4first
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Module Not Found

```bash
npm install
```

## Development Tips

- Use `npm run dev` for development (auto-reload with nodemon)
- Check logs for database initialization messages
- Test endpoints with curl or Postman
- Use PostgreSQL client to inspect database

## Testing

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"super.admin","password":"Admin@123"}'
```

## License

Private - All rights reserved
