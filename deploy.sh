#!/bin/bash
# ==========================================================
# AWS EC2 Deployment Script for WillSub Automation
# ==========================================================
# Run this script ON the EC2 instance after SSH-ing in.
#
# Usage:
#   Option A (Docker - recommended):
#     ./deploy.sh docker
#
#   Option B (PM2 - lightweight):
#     ./deploy.sh pm2
# ==========================================================

set -e

DEPLOY_MODE="${1:-docker}"
APP_DIR="/home/ubuntu/willsub"
REPO_URL="${GITHUB_REPO_URL:-https://github.com/YOUR_USERNAME/willsub.git}"

echo "🚀 WillSub Automation - EC2 Deployment"
echo "   Mode: $DEPLOY_MODE"
echo "=============================================="

# ----------------------------------------------------------
# Step 1: System updates
# ----------------------------------------------------------
echo ""
echo "📦 Step 1: Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

# ----------------------------------------------------------
# Step 2: Clone or pull the repo
# ----------------------------------------------------------
echo ""
echo "📥 Step 2: Getting latest code..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# ----------------------------------------------------------
# Step 3: Set up environment file
# ----------------------------------------------------------
if [ ! -f "$APP_DIR/.env" ]; then
    echo ""
    echo "⚙️  Step 3: Creating .env file..."
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env with your credentials before running!"
    echo "   nano $APP_DIR/.env"
    echo ""
    echo "   Set these values:"
    echo "   - WILLSUB_USERNAME=your-email@example.com"
    echo "   - WILLSUB_PASSWORD=your-password"
    echo ""
fi

# ----------------------------------------------------------
# Deploy with Docker
# ----------------------------------------------------------
if [ "$DEPLOY_MODE" = "docker" ]; then
    echo ""
    echo "🐳 Installing Docker..."

    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker ubuntu
        rm get-docker.sh
        echo "   ✓ Docker installed"
    else
        echo "   ✓ Docker already installed"
    fi

    # Install Docker Compose if not present
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        sudo apt-get install -y docker-compose-plugin
        echo "   ✓ Docker Compose installed"
    else
        echo "   ✓ Docker Compose already installed"
    fi

    echo ""
    echo "🔨 Building and starting container..."
    cd "$APP_DIR"

    # Use docker compose (v2) or docker-compose (v1)
    if docker compose version &> /dev/null 2>&1; then
        docker compose up -d --build
    else
        docker-compose up -d --build
    fi

    echo ""
    echo "✅ Deployment complete! Container is running."
    echo ""
    echo "📋 Useful commands:"
    echo "   docker compose logs -f          # View live logs"
    echo "   docker compose restart           # Restart the app"
    echo "   docker compose down              # Stop the app"
    echo "   docker compose up -d --build     # Rebuild and restart"

# ----------------------------------------------------------
# Deploy with PM2 (no Docker)
# ----------------------------------------------------------
elif [ "$DEPLOY_MODE" = "pm2" ]; then
    echo ""
    echo "📦 Installing Node.js 20..."

    # Install Node.js if not present
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        echo "   ✓ Node.js $(node -v) installed"
    else
        echo "   ✓ Node.js $(node -v) already installed"
    fi

    echo ""
    echo "🌐 Installing Chromium for Puppeteer..."
    sudo apt-get install -y chromium-browser fonts-liberation \
        libappindicator3-1 libasound2 libatk-bridge2.0-0 \
        libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 \
        libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
        libxdamage1 libxrandr2 xdg-utils --no-install-recommends

    # Set Puppeteer to use system Chromium
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    export PUPPETEER_EXECUTABLE_PATH=$(which chromium-browser || which chromium)

    echo ""
    echo "📦 Installing dependencies..."
    cd "$APP_DIR"
    npm install

    echo ""
    echo "🔨 Building TypeScript..."
    npm run build

    echo ""
    echo "🔧 Installing PM2..."
    sudo npm install -g pm2

    echo ""
    echo "🚀 Starting with PM2..."

    # Load .env into the environment
    set -a
    source "$APP_DIR/.env"
    set +a

    pm2 start ecosystem.config.json
    pm2 save
    pm2 startup systemd -u ubuntu --hp /home/ubuntu

    echo ""
    echo "✅ Deployment complete! App is running with PM2."
    echo ""
    echo "📋 Useful commands:"
    echo "   pm2 logs willsub-automation     # View live logs"
    echo "   pm2 restart willsub-automation   # Restart the app"
    echo "   pm2 stop willsub-automation      # Stop the app"
    echo "   pm2 status                       # Check status"
    echo "   pm2 monit                        # Monitor dashboard"

else
    echo "❌ Unknown deploy mode: $DEPLOY_MODE"
    echo "   Usage: ./deploy.sh [docker|pm2]"
    exit 1
fi

echo ""
echo "=============================================="
echo "🎉 WillSub Automation deployed on EC2!"
echo "=============================================="
