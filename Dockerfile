FROM node:22-bookworm-slim

# Install curl-impersonate (Chrome TLS fingerprint)
RUN apt-get update && apt-get install -y wget ca-certificates && \
    wget -q https://github.com/lwthiker/curl-impersonate/releases/download/v0.6.1/curl-impersonate-v0.6.1.x86_64-linux-gnu.tar.gz -O /tmp/curl-imp.tar.gz && \
    tar xzf /tmp/curl-imp.tar.gz -C /usr/local/bin/ && \
    rm /tmp/curl-imp.tar.gz && \
    chmod +x /usr/local/bin/curl_* && \
    ln -sf /usr/local/bin/curl_chrome116 /usr/local/bin/curl-impersonate && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
