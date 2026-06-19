import { NextRequest, NextResponse } from 'next/server';
import { startMeeting } from '@/lib/api/meetings';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await startMeeting(params.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Start meeting error:', error);
    return NextResponse.json(
      { error: 'Failed to start meeting' },
      { status: 500 }
    );
  }
}
