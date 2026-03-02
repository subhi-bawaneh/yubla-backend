# Backend Deployment Guide

This guide covers deploying the Yubla backend API to various hosting platforms.

## Prerequisites

- Git repository with backend code
- PostgreSQL database (Supabase recommended)
- Node.js 18+ compatible hosting

## Environment Variables

All platforms require these environment variables:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
PORT=3000
FRONTEND_ORIGIN=https://your-frontend-domain.com
```

Optional:
```env
NODE_OPTIONS=--dns-result-order=ipv4first  # If IPv6 issues
```

## Railway

### Via CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add environment variables
railway variables set DATABASE_URL="postgresql://..."
railway variables set FRONTEND_ORIGIN="https://your-frontend.com"

# Deploy
railway up
```

### Via Dashboard

1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository and `backend` directory
4. Add environment variables in Settings → Variables
5. Deploy automatically triggers

**Settings:**
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Port: 3000

## Render

### Via Dashboard

1. Go to [render.com](https://render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - Name: `yubla-backend`
   - Root Directory: `backend`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add environment variables
6. Click "Create Web Service"

**Environment Variables:**
```
DATABASE_URL=postgresql://...
FRONTEND_ORIGIN=https://your-frontend.onrender.com
```

## Heroku

### Via CLI

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create app
heroku create yubla-backend

# Set environment variables
heroku config:set DATABASE_URL="postgresql://..."
heroku config:set FRONTEND_ORIGIN="https://your-frontend.com"

# Deploy
git subtree push --prefix backend heroku main
```

### Via Dashboard

1. Go to [heroku.com](https://heroku.com)
2. Create new app
3. Connect GitHub repository
4. Enable automatic deploys from `main` branch
5. Add environment variables in Settings → Config Vars
6. Manual deploy or push to trigger

**Buildpack:** Node.js (auto-detected)

## DigitalOcean App Platform

1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Create → Apps → GitHub
3. Select repository
4. Configure:
   - Source Directory: `backend`
   - Build Command: `npm install`
   - Run Command: `npm start`
5. Add environment variables
6. Deploy

## AWS Elastic Beanstalk

```bash
# Install EB CLI
pip install awsebcli

# Initialize
cd backend
eb init -p node.js yubla-backend

# Create environment
eb create yubla-backend-env

# Set environment variables
eb setenv DATABASE_URL="postgresql://..." FRONTEND_ORIGIN="https://..."

# Deploy
eb deploy
```

## Google Cloud Run

```bash
# Install gcloud CLI
# https://cloud.google.com/sdk/docs/install

# Login
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Build and deploy
cd backend
gcloud run deploy yubla-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="postgresql://...",FRONTEND_ORIGIN="https://..."
```

## Docker Deployment

### Dockerfile

Create `backend/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### Build and Run

```bash
# Build
docker build -t yubla-backend .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e FRONTEND_ORIGIN="https://..." \
  yubla-backend
```

### Docker Compose

Create `backend/docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - FRONTEND_ORIGIN=${FRONTEND_ORIGIN}
    restart: unless-stopped
```

Run:
```bash
docker-compose up -d
```

## VPS Deployment (Ubuntu)

### Setup

```bash
# SSH into server
ssh user@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone repository
git clone https://github.com/yourusername/yubla.git
cd yubla/backend

# Install dependencies
npm install

# Create .env file
nano .env
# Add your environment variables

# Start with PM2
pm2 start src/server.js --name yubla-backend

# Save PM2 configuration
pm2 save
pm2 startup
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/yubla-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## Post-Deployment

### Verify Deployment

```bash
# Test health endpoint
curl https://your-backend-url.com/health

# Test API version
curl https://your-backend-url.com/api/v1/health

# Test login
curl -X POST https://your-backend-url.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"super.admin","password":"Admin@123"}'
```

### Monitor Logs

**Railway:** Dashboard → Deployments → Logs
**Render:** Dashboard → Logs
**Heroku:** `heroku logs --tail`
**PM2:** `pm2 logs yubla-backend`

### Database Initialization

The database schema is automatically created on first run. Check logs for:
```
PostgreSQL database initialized successfully
Backend server running on port 3000
```

## Troubleshooting

### Database Connection Issues

If deployment fails with database connection errors:

1. Check DATABASE_URL is correct
2. Verify database is accessible from hosting platform
3. Check firewall rules
4. Add `NODE_OPTIONS=--dns-result-order=ipv4first` if IPv6 issues

### CORS Issues

Update FRONTEND_ORIGIN to include your frontend URL:
```env
FRONTEND_ORIGIN=https://your-frontend.com,https://www.your-frontend.com
```

### Port Issues

Most platforms automatically set PORT. If not, ensure it's set to the platform's required port.

## Continuous Deployment

### GitHub Actions

Create `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd backend && npm ci
      - run: cd backend && npm test # if you have tests
      # Add deployment steps for your platform
```

## Scaling

### Horizontal Scaling

Most platforms support auto-scaling:
- **Railway:** Pro plan
- **Render:** Scale instances in dashboard
- **Heroku:** `heroku ps:scale web=2`

### Database Connection Pooling

Already configured in `backend/src/data/db.js`:
```javascript
max: 20,  // Maximum pool size
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 10000
```

Adjust based on your needs and database limits.

## Backup

### Database Backups

**Supabase:** Automatic daily backups (Pro plan)

**Manual backup:**
```bash
pg_dump $DATABASE_URL > backup.sql
```

**Restore:**
```bash
psql $DATABASE_URL < backup.sql
```

## Monitoring

### Health Checks

Set up health check monitoring:
- **UptimeRobot:** Free monitoring
- **Pingdom:** Paid monitoring
- **StatusCake:** Free tier available

Monitor: `https://your-backend-url.com/health`

### Application Monitoring

- **Sentry:** Error tracking
- **LogRocket:** Session replay
- **New Relic:** APM

## Cost Estimates

- **Railway:** $5-20/month (Hobby to Pro)
- **Render:** $7-25/month (Starter to Standard)
- **Heroku:** $7-25/month (Eco to Basic)
- **DigitalOcean:** $5-12/month (Basic to Professional)
- **VPS:** $5-20/month (varies by provider)

Plus database costs (Supabase free tier available).

## Support

For deployment issues:
- Check platform documentation
- Review application logs
- Verify environment variables
- Test database connection
- Check CORS configuration
