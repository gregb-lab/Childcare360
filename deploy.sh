#!/bin/bash
# ─── Childcare360 v1.2.0 — Deploy Script ──────────────────────────────────────
set -e

echo "╔══════════════════════════════════════════╗"
echo "║  Childcare360 v1.2.0 — Deploy             ║"
echo "╚══════════════════════════════════════════╝"

cd "$(dirname "$0")"

# Create .env if not exists
if [ ! -f .env ]; then
  echo "  → Creating .env from template..."
  JWT_SECRET=$(openssl rand -hex 32)
  cat > .env << ENVEOF
PORT=3003
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
ENVEOF
  echo "  ✓ .env created with random JWT secret"
fi

# Install dependencies
echo "  → Installing dependencies..."
npm install --production 2>&1 | tail -3

# Build frontend
echo "  → Building frontend..."
npx vite build 2>&1 | tail -3

# Create data directory
mkdir -p data
echo "  ✓ Data directory ready"

echo ""
echo "  ✓ Deploy complete!"
echo ""
echo "  Start with:  npm start"
echo "  Or:           node server/index.js"
echo "  Access:       http://localhost:3003"
echo ""
