FROM node:20-slim

# Install dependencies needed by Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libu2f-udev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the full bot source code
COPY ./src ./src

# Puppeteer expects this env
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Default start command
CMD ["node", "."]
