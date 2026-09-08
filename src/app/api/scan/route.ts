import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scanSubnet } from '@/lib/scanner';
import { notifyDeviceDown, notifyDeviceUp } from '@/lib/alerts';

export async function POST(request: Request) {
  const { subnetId } = await request.json();
  const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });

  if (!subnet) return NextResponse.json({ error: 'Subnet not found' }, { status: 404 });

  try {
    // Fetch excluded devices for this subnet
    const excludedDevices = await prisma.device.findMany({
      where: { subnetId, isExcluded: true }
    });
    const excludeIps = excludedDevices.map(d => d.ip);

    const discovered = await scanSubnet(subnet.mask, excludeIps);
    const now = new Date();

    // Fetch existing devices to track status changes
    const existingDevices = await prisma.device.findMany({ where: { subnetId } });

    // 1. Process all currently known devices in the DB
    for (const device of existingDevices) {
      // If a device is excluded, we skip its status logic entirely
      if (device.isExcluded) continue;

      const idenfitier = device.mac; // This is our unique key
      const foundInScan = discovered.find(d => (d.mac || d.ip) === idenfitier);

      if (foundInScan) {
        // Device is UP
        await prisma.device.update({
          where: { id: device.id },
          data: {
            ip: foundInScan.ip, // Update IP in case it changed (DHCP)
            hostname: foundInScan.hostname || device.hostname,
            lastSeen: now,
            lastStatus: 'up',
            downCount: 0,
            vendor: foundInScan.vendor || device.vendor,
          }
        });

        // If it was down, notify recovery
        if (device.lastStatus === 'down' && device.alertEnabled) {
          await notifyDeviceUp(device.customName || device.ip, device.ip, {
            gmail: device.gmailAlert,
            slack: device.slackAlert
          });
        }
      } else {
        // Device is missing from this scan
        const newDownCount = device.downCount + 1;
        await prisma.device.update({
          where: { id: device.id },
          data: {
            lastStatus: 'down',
            downCount: newDownCount
          }
        });

        // Alert threshold: missing for 3 scans
        if (newDownCount === 3 && device.alertEnabled) {
          await notifyDeviceDown(device.customName || device.ip, device.ip, newDownCount, {
            gmail: device.gmailAlert,
            slack: device.slackAlert
          });
        }
      }
    }

    // 2. Add brand new devices found in this scan
    // We use a Set to track identifiers we've already processed in this loop
    const processedIdentifiers = new Set(existingDevices.map(ed => ed.mac));

    for (const d of discovered) {
      const identifier = d.mac || d.ip;

      if (!processedIdentifiers.has(identifier)) {
        await prisma.device.create({
          data: {
            ip: d.ip,
            mac: identifier,
            hostname: d.hostname,
            vendor: d.vendor,
            subnetId: subnet.id,
            lastStatus: 'up',
            firstDiscovered: now,
            lastSeen: now,
          }
        });
        processedIdentifiers.add(identifier);
      }
    }

    await prisma.subnet.update({
      where: { id: subnetId },
      data: { lastScanned: now }
    });

    return NextResponse.json({ success: true, count: discovered.length });
  } catch (error: any) {
    console.error('[Scan API] Error:', error);
    return NextResponse.json({ error: 'Scan failed: ' + error.message }, { status: 500 });
  }
}
