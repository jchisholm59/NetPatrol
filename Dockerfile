# Use a lightweight Node.js image
FROM node:20-slim

# Install nmap and clean up
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (will trigger prisma generate via postinstall)
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the Next.js app
RUN npm run build

# Port 8765
EXPOSE 8765

# Start the app
CMD ["npm", "start"]
