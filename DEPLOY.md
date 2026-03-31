# Childcare360 — Production Deployment Guide
## Target: www.learninstitute.online/childcare360

---

## 1. Server Requirements
- Ubuntu 22.04 / 24.04
- Node.js 20+ (`curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs`)
- Nginx
- (Recommended) PM2 for process management

---

## 2. Upload & Extract

```bash
# Upload tar to server
scp childcare360-v1.9.4-20260222.tar.gz user@learninstitute.online:~/

# On server
mkdir -p /var/www/childcare360
cd /var/www/childcare360
tar -xzf ~/childcare360-v1.9.4-20260222.tar.gz --strip-components=1

# Install dependencies
npm install --production

# Create data dir
mkdir -p data uploads
chmod 755 data uploads
```

---

## 3. Environment Variables

Create `/var/www/childcare360/.env`:

```env
NODE_ENV=production
PORT=3003
BASE_PATH=/childcare360
JWT_SECRET=change-this-to-a-long-random-secret-at-least-64-chars
ENCRYPTION_KEY=change-this-to-a-32-char-hex-key
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4. Build Frontend

```bash
cd /var/www/childcare360
VITE_BASE_PATH=/childcare360/ npm run build
```

---

## 5. Nginx Configuration

Create `/etc/nginx/sites-available/learninstitute`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.learninstitute.online learninstitute.online;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.learninstitute.online learninstitute.online;

    ssl_certificate     /etc/letsencrypt/live/learninstitute.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/learninstitute.online/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_session_cache   shared:SSL:10m;

    # Gzip
    gzip on;
    gzip_types text/plain application/javascript application/json text/css;
    gzip_min_length 1024;

    # ── Childcare360 App ──────────────────────────────────────────────────────
    location /childcare360/ {
        # Strip /childcare360 prefix before passing to express
        proxy_pass         http://127.0.0.1:3003/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        client_max_body_size 20M;
    }

    # Exact match for /childcare360 (no trailing slash)
    location = /childcare360 {
        return 301 /childcare360/;
    }

    # Optional: root redirect
    location = / {
        return 302 /childcare360/;
    }
}
```

Enable and test:
```bash
ln -sf /etc/nginx/sites-available/learninstitute /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

SSL (Let's Encrypt):
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d learninstitute.online -d www.learninstitute.online
```

---

## 6. PM2 Process Manager

```bash
npm install -g pm2

cat > /var/www/childcare360/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'childcare360',
    script: 'server/index.js',
    cwd: '/var/www/childcare360',
    interpreter: 'node',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3003,
      BASE_PATH: '/childcare360',
    },
    watch: false,
    max_memory_restart: '512M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
EOF

mkdir -p /var/www/childcare360/logs

cd /var/www/childcare360
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # follow printed instructions to enable on boot
```

---

## 7. Update (for future versions)

```bash
cd /var/www/childcare360
pm2 stop childcare360

# Clear build and extract new tar
rm -rf dist src/.next 2>/dev/null
tar -xzf ~/childcare360-vX.X.X-YYYYMMDD.tar.gz --strip-components=1

npm install --production
VITE_BASE_PATH=/childcare360/ npm run build

pm2 start childcare360
pm2 logs childcare360 --lines 20
```

---

## 8. Demo Credentials

After first start, the database is seeded automatically.

| Role | Email | Password |
|------|-------|----------|
| Admin / Director | admin@littleexplorers.edu.au | Admin2024! |
| Educator | sarah@littleexplorers.edu.au | Educator2024! |
| Parent (Wei Chen — Olivia) | wei.chen@gmail.com | Parent2024! |
| Parent (Raj Patel — Liam) | raj.patel@email.com | Parent2024! |
| Parent (Kate Williams — Noah) | kate.williams@email.com | Parent2024! |

---

## 9. AI Provider Setup (in-app)

1. Log in as admin
2. Go to **Settings → AI Providers**
3. Configure at least one provider:
   - **OpenAI**: get key at https://platform.openai.com — recommend GPT-4o Mini ($0.015/1k tokens)
   - **Anthropic**: get key at https://console.anthropic.com — recommend Claude Haiku ($0.025/1k)
   - **Google Gemini**: get key at https://aistudio.google.com — Gemini Flash is free tier eligible
4. Set as default and click **Test Connection**

All AI features (learning story enhancement, rostering suggestions, child focus profiles) use the configured provider automatically.

---

## 10. Health Check

```
https://www.learninstitute.online/childcare360/health
```

Expected response:
```json
{"status":"ok","version":"1.9.4","uptime":42.3}
```
