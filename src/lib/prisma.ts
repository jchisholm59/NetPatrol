import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

/**
 * NetPatrol Prisma Client
 * Explicitly logging the connection URL to debug environment issues on Linux.
 */
console.log('[Prisma] Connecting to DATABASE_URL:', process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
