# Railway Deployment Guide (Nixpacks)

This guide covers deploying the Yubla backend to Railway using automatic Nixpacks detection (no Docker required).

## ✅ Pre-Deployment Checklist

The backend is already configured for Railway deployment:

- ✅ `package.json` has `"start": "node src/server.js"` script
- ✅ Server uses dynamic port: `process.env.PORT || 3000`
- ✅ Node.js version specified: `"engines": { "node": ">=18" }`
- ✅ No Dockerfile (Nixpacks auto-detection)
- ✅ ES modules configured: `"type": "module"`

## 🚀 Deployment Steps

### Option 1: Deploy via Railway Dashboard (Recommended)

#### Step 1: Prepare Repository

1. Ensure your code is pushed to GitHub:
```bash
git add .
git commit -m "Configure for Railway deployment"
git push origin main
```

#### Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account
5. Select your repository: `yubla`

#### Step 3: Configure Root Directory

Since the backend is in a subdirectory:

1. After selecting the repository, Railway will detect the project
2. Click on the service settings (gear icon)
3. Go to **"Settings"** tab
4. Under **"Build"** section, set:
   - **Root Directory**: `backend`
   - **Build Command**: (leave empty, Nixpacks auto-detects)
   - **Start Command**: (leave empty, uses `npm start`)

#### Step 4: Add Environment Variables

1. Go to **"Variables"** tab
2. Click **"New Variable"**
3. Add the following variables:

```env
DATABASE_URL=postgresql://postgres:Yubla_sc@123@db.qgivldlsyinxbeujrmzz.supabase.co:5432/postgres
FRONTEND_ORIGIN=https://your-frontend-domain.com
NODE_OPTIONS=--dns-result-order=ipv4first
```

**Important Variables:**
- `DATABASE_URL` - PostgreSQL connection string (required)
- `FRONTEND_ORIGIN` - Allowed CORS origins (required)
- `NODE_OPTIONS` - Fix IPv6 connection issues (optional but recommended)
- `PORT` - Automatically set by Railway (do not set manually)

#### Step 5: Deploy

1. Click **"Deploy"**
2. Railway will:
   - Detect Node.js project automatically
   - Run `npm install` (Nixpacks)
   - Execute `npm start`
   - Assign a public URL

#### Step 6: Monitor Deployment

1. Go to **"Deployments"** tab
2. Click on the latest deployment
3. View build logs
4. Wait for "Success" status

Expected logs:
```
Building with Nixpacks
Installing dependencies
Running npm install
Build completed
Starting server
Backend server running on port XXXX
PostgreSQL database initialized successfully
```

#### Step 7: Get Public URL

1. Go to **"Settings"** tab
2. Under **"Domains"** section
3. Copy the Railway-provided URL: `https://your-app.up.railway.app`
4. Or add a custom domain

### Option 2: Deploy via Railway CLI

#### Install Railway CLI

```bash
npm install -g @railway/cli
```

#### Login

```bash
railway login
```

#### Initialize Project

```bash
cd backend
railway init
```

Select:
- Create new project
- Name: `yubla-backend`

#### Set Environment Variables

```bash
railway variables set DATABASE_URL="postgresql://postgres:Yubla_sc@123@db.qgivldlsyinxbeujrmzz.supabase.co:5432/postgres"
railway variables set FRONTEND_ORIGIN="https://your-frontend-domain.com"
railway variables set NODE_OPTIONS="--dns-result-order=ipv4first"
```

#### Deploy

```bash
railway up
```

Railway will:
1. Detect Node.js project
2. Build with Nixpacks
3. Deploy automatically

#### View Logs

```bash
railway logs
```

#### Open in Browser

```bash
railway open
```

## 🔧 Configuration Details

### Nixpacks Detection

Railway automatically detects Node.js projects by finding `package.json`. Nixpacks will:

1. **Detect**: Node.js project
2. **Install**: Run `npm install` (or `yarn install` if `yarn.lock` exists)
3. **Build**: No build step needed (Express doesn't require compilation)
4. **Start**: Execute `npm start` → `node src/server.js`

### Port Configuration

Railway automatically sets the `PORT` environment variable. The server listens on:

```javascript
const PORT = process.env.PORT || 3000;
```

**Do NOT set PORT manually in Railway variables** - it's automatically assigned.

### Environment Variables

#### Required Variables

```env
DATABASE_URL=postgresql://user:password@host:5432/database
FRONTEND_ORIGIN=https://your-frontend.com
```

#### Optional Variables

```env
NODE_OPTIONS=--dns-result-order=ipv4first  # Fix IPv6 issues
NODE_ENV=production                         # Set environment
```

#### Multiple Frontend Origins

For multiple allowed origins:

```env
FRONTEND_ORIGIN=https://app.example.com,https://www.example.com,https://admin.example.com
```

### Build Configuration

Railway uses Nixpacks with these defaults:

```toml
# Automatically detected, no nixpacks.toml needed
[phases.setup]
nixPkgs = ["nodejs-18_x"]

[phases.install]
cmds = ["npm install"]

[phases.build]
# No build phase needed for Express

[start]
cmd = "npm start"
```

## 🌐 Custom Domain Setup

### Add Custom Domain

1. Go to **"Settings"** → **"Domains"**
2. Click **"Custom Domain"**
3. Enter your domain: `api.yourdomain.com`
4. Railway provides DNS instructions

### Configure DNS

Add CNAME record:

```
Type: CNAME
Name: api (or your subdomain)
Value: your-app.up.railway.app
TTL: 3600
```

### SSL Certificate

Railway automatically provisions SSL certificates via Let's Encrypt.

## 📊 Monitoring & Logs

### View Logs

**Dashboard:**
1. Go to your project
2. Click **"Deployments"**
3. Select deployment
4. View logs in real-time

**CLI:**
```bash
railway logs
railway logs --follow  # Follow logs in real-time
```

### Health Check

Test your deployment:

```bash
# Health endpoint
curl https://your-app.up.railway.app/health

# API version
curl https://your-app.up.railway.app/api/v1/health

# Login test
curl -X POST https://your-app.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"super.admin","password":"Admin@123"}'
```

### Metrics

Railway provides:
- CPU usage
- Memory usage
- Network traffic
- Request count
- Response times

Access via **"Metrics"** tab in dashboard.

## 🔄 Continuous Deployment

### Automatic Deployments

Railway automatically deploys when you push to GitHub:

1. Push code to GitHub:
```bash
git push origin main
```

2. Railway detects changes
3. Automatically builds and deploys
4. Zero downtime deployment

### Manual Deployments

**Dashboard:**
1. Go to **"Deployments"**
2. Click **"Deploy"**

**CLI:**
```bash
railway up
```

### Rollback

**Dashboard:**
1. Go to **"Deployments"**
2. Find previous successful deployment
3. Click **"Redeploy"**

**CLI:**
```bash
railway rollback
```

## 🐛 Troubleshooting

### Build Fails

**Check logs:**
```bash
railway logs
```

**Common issues:**
- Missing dependencies in `package.json`
- Node version incompatibility
- Build script errors

**Solution:**
- Ensure `package.json` is correct
- Verify Node version: `"engines": { "node": ">=18" }`
- Check for syntax errors

### Database Connection Fails

**Error:** `ENETUNREACH` or `ETIMEDOUT`

**Solution:**
Add to Railway variables:
```env
NODE_OPTIONS=--dns-result-order=ipv4first
```

**Verify DATABASE_URL:**
```bash
railway variables
```

### Port Issues

**Error:** `EADDRINUSE` or port binding errors

**Solution:**
- Ensure server uses `process.env.PORT`
- Do NOT set PORT in Railway variables
- Railway assigns port automatically

### CORS Errors

**Error:** Frontend can't connect

**Solution:**
Update `FRONTEND_ORIGIN` in Railway:
```env
FRONTEND_ORIGIN=https://your-frontend-domain.com
```

### Application Crashes

**Check logs:**
```bash
railway logs --follow
```

**Common causes:**
- Database connection issues
- Missing environment variables
- Uncaught exceptions
- Memory limits exceeded

**Solution:**
- Verify all environment variables
- Check database connectivity
- Review error logs
- Upgrade Railway plan if needed

## 💰 Pricing

### Hobby Plan (Free)
- $5 free credit per month
- Suitable for development/testing
- Shared resources

### Developer Plan ($5/month)
- $5 credit + usage-based pricing
- Better for production
- More resources

### Team Plan ($20/month)
- $20 credit + usage-based pricing
- Team collaboration
- Priority support

**Estimated costs for Yubla backend:**
- Small traffic: $0-5/month (Hobby plan)
- Medium traffic: $5-15/month (Developer plan)
- High traffic: $20+/month (Team plan)

## 🔒 Security Best Practices

### Environment Variables

- ✅ Store secrets in Railway variables
- ✅ Never commit `.env` files
- ✅ Use strong database passwords
- ✅ Rotate credentials regularly

### Database Security

- ✅ Use SSL connections (already configured)
- ✅ Restrict database access by IP (if possible)
- ✅ Use connection pooling (already configured)
- ✅ Regular backups (Supabase handles this)

### CORS Configuration

- ✅ Specify exact frontend origins
- ✅ Don't use `*` in production
- ✅ Enable credentials: true (already configured)

## 📈 Scaling

### Vertical Scaling

Railway automatically scales resources based on usage.

### Horizontal Scaling

For high traffic:
1. Upgrade to Team plan
2. Enable multiple instances
3. Railway handles load balancing

### Database Scaling

- Supabase handles database scaling
- Consider upgrading Supabase plan for more connections
- Current pool size: 20 connections (configured in code)

## 🔗 Integration with Frontend

After deploying backend, update frontend:

**Frontend `.env`:**
```env
VITE_API_BASE=https://your-app.up.railway.app
```

**Backend Railway variables:**
```env
FRONTEND_ORIGIN=https://your-frontend-domain.com
```

## 📝 Post-Deployment Checklist

- [ ] Backend deployed successfully
- [ ] Health endpoint returns `{"ok":true}`
- [ ] Database connection working
- [ ] Login endpoint working
- [ ] All API endpoints accessible
- [ ] CORS configured correctly
- [ ] Frontend can connect to backend
- [ ] Custom domain configured (optional)
- [ ] Monitoring set up
- [ ] Logs accessible

## 🆘 Support

### Railway Support

- Documentation: [docs.railway.app](https://docs.railway.app)
- Discord: [Railway Discord](https://discord.gg/railway)
- Twitter: [@Railway](https://twitter.com/Railway)

### Common Commands

```bash
# View logs
railway logs

# View variables
railway variables

# Open dashboard
railway open

# Deploy
railway up

# Rollback
railway rollback

# Link to project
railway link

# Status
railway status
```

## ✅ Success Indicators

Your deployment is successful when:

1. ✅ Build completes without errors
2. ✅ Server starts and logs appear
3. ✅ Health endpoint returns 200 OK
4. ✅ Database initializes successfully
5. ✅ Public URL is accessible
6. ✅ API endpoints respond correctly
7. ✅ Frontend can connect (after CORS setup)

## 🎉 Next Steps

After successful deployment:

1. Update frontend `VITE_API_BASE` with Railway URL
2. Test all API endpoints
3. Configure custom domain (optional)
4. Set up monitoring/alerts
5. Document the deployment URL
6. Share with team

---

**Deployment Status:** ✅ Ready for Railway Nixpacks Deployment

**Last Updated:** March 3, 2026
