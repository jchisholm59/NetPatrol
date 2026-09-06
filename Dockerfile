# Use a lightweight Node.js image
FROM node:20-slim

# Install nmap and clean up
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .

# Generate Prisma client and build the Next.js app
RUN npx prisma generate
RUN npm run build

# Port 8765
EXPOSE 8765

# Start the app
CMD ["npm", "start"]
