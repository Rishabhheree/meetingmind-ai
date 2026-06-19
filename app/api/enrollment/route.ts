import { NextRequest, NextResponse } from 'next/server';
import { initializeEnrollment, getEnrollmentStatus, deleteEnrollment } from '@/lib/api/enrollment';

export async function POST(request: NextRequest) {
  try {
    const result = await initializeEnrollment();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Enrollment init error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize enrollment' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const result = await getEnrollmentStatus();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Get enrollment status error:', error);
    return NextResponse.json(
      { error: 'Failed to get enrollment status' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const result = await deleteEnrollment();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Delete enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to delete enrollment' },
      { status: 500 }
    );
  }
}
