#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# edvu.in Proxy Server Setup Script
# Run this on your Oracle Cloud VPS (Ubuntu/Debian)
# ═══════════════════════════════════════════════════════════════

set -e

echo "══════════════════════════════════════"
echo "  edvu.in Proxy Server Setup"
echo "══════════════════════════════════════"

# 1. Update system
echo "[1/6] Updating system..."
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 22
echo "[2/6] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install Caddy
echo "[3/6] Installing Caddy..."
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudflare.com/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudflare.com/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# 4. Clone and install the app
echo "[4/6] Setting up the application..."
cd /home/ubuntu
if [ -d "proxy" ]; then
    cd proxy && git pull
else
    git clone YOUR_GITHUB_REPO_URL proxy
    cd proxy
fi
npm install --production

# 5. Create systemd service for the Node.js app
echo "[5/6] Creating systemd services..."
sudo tee /etc/systemd/system/proxy.service > /dev/null <<EOF
[Unit]
Description=edvu Proxy Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/proxy
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=PROXY_DOMAIN=edvu.in
Environment=GROQ_API_KEY=YOUR_GROQ_KEY_HERE

[Install]
WantedBy=multi-user.target
EOF

# 6. Configure Caddy
echo "[6/6] Configuring Caddy..."
sudo cp /home/ubuntu/proxy/Caddyfile /etc/caddy/Caddyfile

# Start services
sudo systemctl daemon-reload
sudo systemctl enable proxy
sudo systemctl start proxy
sudo systemctl restart caddy

echo ""
echo "══════════════════════════════════════"
echo "  Setup Complete!"
echo "══════════════════════════════════════"
echo "  Node.js app: http://localhost:3000"
echo "  Caddy: https://edvu.in (auto-SSL)"
echo ""
echo "  Check status:"
echo "    sudo systemctl status proxy"
echo "    sudo systemctl status caddy"
echo ""
echo "  View logs:"
echo "    sudo journalctl -u proxy -f"
echo "    sudo journalctl -u caddy -f"
echo "══════════════════════════════════════"
