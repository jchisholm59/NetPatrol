# Use a lightweight Node.js image
FROM node:20-slim

# Install nmap and clean up
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the Next.js production app
RUN npm run build

# Port 8765
ENV PORT=8765
EXPOSE 8765

# Start the app: Force Next.js to start on port 8765 explicitly
CMD ["sh", "-c", "npx prisma db push && npx next start -p 8765"]
