FROM node:22-bookworm-slim

# Install minimal deps (no Chromium needed anymore — UV handles everything)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
