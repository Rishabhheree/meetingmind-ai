import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  department: string | null;
  designation: string | null;
  avatar_url: string | null;
}

export interface AuthSession {
  user: AuthUser | null;
  accessToken: string | null;
}

export const getSession = cache(async (): Promise<AuthSession | null> => {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;

  if (!accessToken) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    // Get profile data
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      user: {
        id: user.id,
        email: user.email || '',
        name: profile?.name || user.user_metadata?.name || 'User',
        role: profile?.role || 'user',
        department: profile?.department,
        designation: profile?.designation,
        avatar_url: profile?.avatar_url,
      },
      accessToken,
    };
  } catch {
    return null;
  }
});

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id || null;
}

export async function requireAuth(): Promise<AuthUser> {
  const session = await getSession();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }
  return user;
}
