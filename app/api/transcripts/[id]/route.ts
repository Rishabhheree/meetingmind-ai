import { NextRequest, NextResponse } from 'next/server';
import { getTranscript, exportTranscript } from '@/lib/api/transcripts';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') as 'json' | 'txt' | 'srt' | null;

    if (format) {
      const result = await exportTranscript(params.id, format);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return new NextResponse(result.content, {
        headers: {
          'Content-Type': format === 'json' ? 'application/json' : 'text/plain',
          'Content-Disposition': `attachment; filename="${result.filename}"`,
        },
      });
    }

    const result = await getTranscript(params.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Get transcript error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript' },
      { status: 500 }
    );
  }
}
