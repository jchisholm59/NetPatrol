import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  console.log('Fetching subnets from database...');
  const subnets = await prisma.subnet.findMany({
    include: { _count: { select: { devices: true } } },
  });
  console.log(`Found ${subnets.length} subnets.`);
  return NextResponse.json(subnets);
}

export async function POST(request: Request) {
  const { mask, name, scanPeriod } = await request.json();
  try {
    const subnet = await prisma.subnet.create({
      data: { mask, name, scanPeriod: parseInt(scanPeriod) || 3600 },
    });
    return NextResponse.json(subnet);
  } catch (error) {
    return NextResponse.json({ error: 'Subnet already exists or invalid data' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const { id, scanPeriod, name } = await request.json();
  const subnet = await prisma.subnet.update({
    where: { id },
    data: { scanPeriod, name },
  });
  return NextResponse.json(subnet);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

  try {
    await prisma.subnet.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete subnet' }, { status: 500 });
  }
}
