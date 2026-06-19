import { NextRequest, NextResponse } from 'next/server';
import { createMeeting, getMeetings } from '@/lib/api/meetings';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getMeetings({
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page') as string) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit') as string) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Get meetings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await createMeeting(body);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Create meeting error:', error);
    return NextResponse.json(
      { error: 'Failed to create meeting' },
      { status: 500 }
    );
  }
}
