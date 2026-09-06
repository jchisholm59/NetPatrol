import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * NetPatrol Subnet API
 * Improved error handling to unmask "Read Only" or "Permission Denied" issues.
 */

export async function GET() {
  console.log('Fetching subnets from database...');
  try {
    const subnets = await prisma.subnet.findMany({
      include: { _count: { select: { devices: true } } },
    });
    console.log(`Found ${subnets.length} subnets.`);
    return NextResponse.json(subnets);
  } catch (error: any) {
    console.error('Database Fetch Error:', error.message);
    return NextResponse.json({ error: 'Database access failed: ' + error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { mask, name, scanPeriod } = await request.json();
  try {
    const subnet = await prisma.subnet.create({
      data: { mask, name, scanPeriod: parseInt(scanPeriod) || 3600 },
    });
    return NextResponse.json(subnet);
  } catch (error: any) {
    console.error('Database Write Error:', error.message);
    // Returning the actual error so the UI can show the truth
    return NextResponse.json({
      error: 'Failed to create subnet: ' + error.message,
      code: error.code
    }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const { id, scanPeriod, name } = await request.json();
  try {
    const subnet = await prisma.subnet.update({
      where: { id },
      data: { scanPeriod, name },
    });
    return NextResponse.json(subnet);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
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
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete subnet: ' + error.message }, { status: 500 });
  }
}
