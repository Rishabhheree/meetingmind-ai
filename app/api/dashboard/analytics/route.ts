import { NextRequest, NextResponse } from 'next/server';
import { getAnalytics } from '@/lib/api/dashboard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') as 'day' | 'week' | 'month' | 'year' | null;
    const result = await getAnalytics({ period: period || 'month' });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
