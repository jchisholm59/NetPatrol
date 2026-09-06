import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scanSubnet } from '@/lib/scanner';
import { notifyDeviceDown, notifyDeviceUp } from '@/lib/alerts';

export async function POST(request: Request) {
  const { subnetId } = await request.json();
  const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });

  if (!subnet) return NextResponse.json({ error: 'Subnet not found' }, { status: 404 });

  try {
    const discovered = await scanSubnet(subnet.mask);
    const now = new Date();

    // Mark all current devices as potentially down
    const existingDevices = await prisma.device.findMany({ where: { subnetId } });
    const discoveredIps = new Set(discovered.map(d => d.ip));

    for (const device of existingDevices) {
      const isStillUp = discoveredIps.has(device.ip);

      if (isStillUp) {
        const found = discovered.find(d => d.ip === device.ip);
        await prisma.device.update({
          where: { id: device.id },
          data: {
            lastSeen: now,
            lastStatus: 'up',
            downCount: 0,
            vendor: found?.vendor || device.vendor,
            mac: found?.mac || device.mac,
          }
        });

        if (device.lastStatus === 'down' && device.alertEnabled) {
          await notifyDeviceUp(device.customName || device.ip, device.ip, {
            gmail: device.gmailAlert,
            slack: device.slackAlert
          });
        }
      } else {
        const newDownCount = device.downCount + 1;
        await prisma.device.update({
          where: { id: device.id },
          data: {
            lastStatus: 'down',
            downCount: newDownCount
          }
        });

        // Simple threshold: alert after 3 scans down (adjustable)
        if (newDownCount === 3 && device.alertEnabled) {
          await notifyDeviceDown(device.customName || device.ip, device.ip, newDownCount, {
            gmail: device.gmailAlert,
            slack: device.slackAlert
          });
        }
      }
    }

    // Add new devices
    for (const d of discovered) {
      if (!existingDevices.some(ed => ed.ip === d.ip)) {
        await prisma.device.create({
          data: {
            ip: d.ip,
            mac: d.mac,
            vendor: d.vendor,
            subnetId: subnet.id,
            lastStatus: 'up',
            firstDiscovered: now,
            lastSeen: now,
          }
        });
      }
    }

    await prisma.subnet.update({
      where: { id: subnetId },
      data: { lastScanned: now }
    });

    return NextResponse.json({ success: true, count: discovered.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
