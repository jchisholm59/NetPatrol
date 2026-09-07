# Use a lightweight Node.js image
FROM node:20-slim

# Install nmap and clean up
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (will trigger prisma generate)
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the Next.js production app
RUN npm run build

# Port 8765
ENV PORT=8765
EXPOSE 8765

# Start the app: ensure the DB is initialized before starting the server
# Using --accept-data-loss to handle schema changes that require data cleanup
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx next start -p 8765"]
