import { NextRequest, NextResponse } from 'next/server';
import { processVoiceEnrollment } from '@/lib/api/enrollment';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const result = await processVoiceEnrollment(formData);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Process enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to process enrollment' },
      { status: 500 }
    );
  }
}
