import cron from 'node-cron';
import { prisma } from './prisma';

// Subnets with a scan in progress. A /24 scan takes over a minute, longer than the cron tick, and
// lastScanned is only written when it finishes, so without this a second scan of the same subnet
// would start on top of the first (double the pings, and both racing to write the same devices).
const scanning = new Set<string>();

export function initScheduler() {
  console.log('Initializing NetPatrol Scheduler...');

  // Run every minute to check which subnets need scanning
  cron.schedule('* * * * *', async () => {
    const subnets = await prisma.subnet.findMany();
    const now = new Date();

    for (const subnet of subnets) {
      const lastScanned = subnet.lastScanned ? new Date(subnet.lastScanned) : new Date(0);
      const diffSeconds = (now.getTime() - lastScanned.getTime()) / 1000;

      if (diffSeconds >= subnet.scanPeriod && !scanning.has(subnet.id)) {
        console.log(`Scheduled scan triggered for ${subnet.mask}`);
        // We can't easily call our own API route from here without a URL
        // So we call the internal logic. But to avoid duplication,
        // I should have moved the scan logic to a lib function.
        // For now, I'll just log it and suggest moving the logic.
        // Actually, let's call the scanSubnet and update DB directly.
        triggerBackgroundScan(subnet.id);
      }
    }
  });
}

async function triggerBackgroundScan(subnetId: string) {
  // In a real app, I'd import the logic from the API route
  // For now, I'll keep it simple as this is a demonstration
  scanning.add(subnetId);
  try {
    // We can't import the API route logic easily due to Next.js constraints
    // but we can fetch the local API if we know the port
    await fetch(`http://localhost:${process.env.PORT || 8765}/api/scan`, {
      method: 'POST',
      body: JSON.stringify({ subnetId }),
    });
  } catch (e) {
    console.error('Background scan failed', e);
  } finally {
    scanning.delete(subnetId);
  }
}
