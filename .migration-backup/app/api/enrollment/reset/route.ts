import { NextRequest, NextResponse } from 'next/server';
import { restartEnrollment } from '@/lib/api/enrollment';

export async function POST(request: NextRequest) {
  try {
    const result = await restartEnrollment();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Reset enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to reset enrollment' },
      { status: 500 }
    );
  }
}
