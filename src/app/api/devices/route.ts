import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subnetId = searchParams.get('subnetId');

  if (!subnetId) {
    return NextResponse.json({ error: 'subnetId is required' }, { status: 400 });
  }

  const devices = await prisma.device.findMany({
    where: { subnetId },
    orderBy: { ip: 'asc' },
  });

  return NextResponse.json(devices);
}

export async function PATCH(request: Request) {
  const { id, customName, alertEnabled, gmailAlert, slackAlert } = await request.json();
  const device = await prisma.device.update({
    where: { id },
    data: { customName, alertEnabled, gmailAlert, slackAlert },
  });
  return NextResponse.json(device);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

  try {
    await prisma.device.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
