import { NextResponse } from 'next/server';
import { probeDevice } from '@/lib/scanner';

export async function POST(request: Request) {
  const { ip } = await request.json();
  try {
    const details = await probeDevice(ip);
    return NextResponse.json(details);
  } catch (error: any) {
    console.error('Probe API route error:', error);
    return NextResponse.json({ error: error.message || 'Probe failed' }, { status: 500 });
  }
}
