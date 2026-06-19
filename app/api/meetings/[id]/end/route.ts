import { NextRequest, NextResponse } from 'next/server';
import { endMeeting } from '@/lib/api/meetings';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await endMeeting(params.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('End meeting error:', error);
    return NextResponse.json(
      { error: 'Failed to end meeting' },
      { status: 500 }
    );
  }
}
