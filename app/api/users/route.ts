import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUsers } from '@/lib/api/users';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getUsers({
      search: searchParams.get('search') || undefined,
      department: searchParams.get('department') || undefined,
      role: searchParams.get('role') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page') as string) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit') as string) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const result = await createUser(formData);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
