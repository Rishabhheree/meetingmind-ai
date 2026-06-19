import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/api/dashboard';

export async function GET(request: NextRequest) {
  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
