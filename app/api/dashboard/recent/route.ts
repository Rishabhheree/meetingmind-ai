import { NextRequest, NextResponse } from 'next/server';
import { getRecentMeetings } from '@/lib/api/dashboard';

export async function GET(request: NextRequest) {
  try {
    const result = await getRecentMeetings(10);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Recent meetings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent meetings' },
      { status: 500 }
    );
  }
}
