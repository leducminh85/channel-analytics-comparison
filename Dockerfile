FROM node:22-bookworm-slim

# Install OpenSSL for Prisma and CA certificates for outbound API calls
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install

# Copy the full source tree
COPY . .

# Generate the Prisma client
RUN npx prisma generate

# Build the Next.js application
RUN npm run build

EXPOSE 3000

# Sync the database schema and start the app after a short delay
CMD ["sh", "-c", "sleep 10 && npx prisma db push && npm start"]
