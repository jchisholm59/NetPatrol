import { NextResponse } from 'next/server';
import { testNotifications } from '@/lib/alerts';

export async function POST() {
  try {
    await testNotifications();
    return NextResponse.json({ success: true, message: 'Test notification sent. Check your Slack and Gmail.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to send test alert' }, { status: 500 });
  }
}
