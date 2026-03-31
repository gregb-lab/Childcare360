FROM node:20-alpine

# Install build tools needed for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install ALL deps (need vite for build)
RUN npm install

# Copy source
COPY . .

# Build the frontend (Railway serves at /)
RUN VITE_BASE_PATH=/ npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Create data directory
RUN mkdir -p /app/data /app/uploads /app/logs

EXPOSE 3003

ENV NODE_ENV=production
ENV PORT=3003

CMD ["node", "server/index.js"]
