import { NextRequest, NextResponse } from 'next/server';
import { saveTranscriptSegment, getTranscriptSegments, finalizeTranscript } from '@/lib/api/transcripts';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await saveTranscriptSegment(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Save transcript error:', error);
    return NextResponse.json(
      { error: 'Failed to save transcript' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getTranscriptSegments({
      meetingId: searchParams.get('meetingId') || undefined,
      transcriptId: searchParams.get('transcriptId') || undefined,
      speakerId: searchParams.get('speakerId') || undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset') as string) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit') as string) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Get transcripts error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transcriptId = searchParams.get('transcriptId');
    if (!transcriptId) {
      return NextResponse.json({ error: 'Transcript ID required' }, { status: 400 });
    }
    const result = await finalizeTranscript(transcriptId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Finalize transcript error:', error);
    return NextResponse.json(
      { error: 'Failed to finalize transcript' },
      { status: 500 }
    );
  }
}
