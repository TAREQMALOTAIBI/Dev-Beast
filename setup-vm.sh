#!/bin/bash
# One-line Setup script for Debian/Ubuntu GCP VM
# Run this once inside your VM terminal (SSH)

set -e

echo "=== 1. Updating packages ==="
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential

echo "=== 2. Installing Node.js 22 LTS ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

echo "=== 3. Installing PM2 Process Manager ==="
sudo npm install -g pm2

# Enable PM2 on system boot
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

echo "=== 4. Setting up 1GB Swap memory for stability ==="
if [ ! -f /swapfile ]; then
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "Swap memory created successfully."
fi

echo "=== Setup complete! Your VM is ready for GitHub Actions ==="
