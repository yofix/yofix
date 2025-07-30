FROM node:18-slim

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright dependencies
RUN npx -y playwright@1.54.1 install-deps chromium

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json yarn.lock ./
RUN yarn install --production

# Copy built application
COPY dist ./dist
COPY test-local.js ./

# Install Playwright browser
RUN npx -y playwright@1.54.1 install chromium

# Create output directory
RUN mkdir -p /app/test-results

# Set entrypoint
ENTRYPOINT ["node", "test-local.js"]