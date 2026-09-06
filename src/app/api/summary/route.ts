import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateNetworkSummary } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subnetId = searchParams.get('subnetId');

  if (!subnetId) return NextResponse.json({ error: 'subnetId required' }, { status: 400 });

  const devices = await prisma.device.findMany({
    where: { subnetId },
  });

  const summary = await generateNetworkSummary(devices);
  return NextResponse.json({ summary });
}
