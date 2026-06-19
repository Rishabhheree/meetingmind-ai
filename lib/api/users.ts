import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '@/lib/auth/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  department: z.string().optional(),
  designation: z.string().optional(),
  employee_id: z.string().optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  employee_id: z.string().optional(),
  role: z.enum(['admin', 'user']).optional(),
});

export async function createUser(formData: FormData) {
  await requireAdmin();

  const data = {
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    department: formData.get('department') as string || null,
    designation: formData.get('designation') as string || null,
    employee_id: formData.get('employee_id') as string || null,
    role: (formData.get('role') as 'admin' | 'user') || 'user',
  };

  const validated = createUserSchema.parse(data);
  const supabase = getServerClient();

  // Check if user exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', validated.email)
    .single();

  if (existing) {
    return { error: 'User with this email already exists' };
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: validated.email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { name: validated.name },
  });

  if (authError || !authData.user) {
    return { error: authError?.message || 'Failed to create user' };
  }

  // Create profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      name: validated.name,
      email: validated.email,
      department: validated.department,
      designation: validated.designation,
      employee_id: validated.employee_id || authData.user.id,
      role: validated.role,
    })
    .select()
    .single();

  if (profileError) {
    return { error: profileError.message };
  }

  return { success: true, profile };
}

export async function getUserById(userId: string) {
  await requireAuth();

  const supabase = getServerClient();
  const { data: user, error } = await supabase
    .from('profiles')
    .select('*, speaker_profiles(*)')
    .eq('id', userId)
    .single();

  if (error) return { error: error.message };
  return { user };
}

export async function getCurrentUser() {
  const user = await requireAuth();
  return user;
}

export async function updateUser(userId: string, formData: FormData) {
  const currentUser = await requireAuth();
  // Only admin or self can update
  if (currentUser.role !== 'admin' && currentUser.id !== userId) {
    return { error: 'Unauthorized' };
  }

  const updates: Record<string, unknown> = {};
  const name = formData.get('name') as string;
  const department = formData.get('department') as string;
  const designation = formData.get('designation') as string;
  const role = formData.get('role') as 'admin' | 'user';

  if (currentUser.role === 'admin') {
    updates.name = name || currentUser.name;
    updates.department = department || null;
    updates.designation = designation || null;
    updates.role = role || currentUser.role;
  } else {
    updates.name = name || currentUser.name;
  }

  const validated = updateUserSchema.partial().parse(updates);
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from('profiles')
    .update(validated)
    .eq('id', userId)
    .select()
    .single();

  if (error) return { error: error.message };

  return { success: true, user: data };
}

export async function deleteUser(userId: string) {
  await requireAdmin();

  const supabase = getServerClient();

  // Delete auth user (this cascades to profiles via FK)
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function getUsers(options?: {
  search?: string;
  department?: string;
  role?: string;
  page?: number;
  limit?: number;
}) {
  await requireAuth();

  const supabase = getServerClient();
  let query = supabase.from('profiles').select('*, speaker_profiles(*)', { count: 'exact' });

  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,email.ilike.%${options.search}%`);
  }

  if (options?.department) {
    query = query.eq('department', options.department);
  }

  if (options?.role) {
    query = query.eq('role', options.role);
  }

  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const from = (page - 1) * limit;

  const { data, error, count } = await query.range(from, from + limit - 1).order('created_at', { ascending: false });

  if (error) return { error: error.message };

  return { users: data, total: count || 0, page, limit };
}

export async function getDepartments() {
  await requireAuth();

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('department')
    .not('department', 'is', null)
    .not('department', 'eq', '');

  if (error) return { error: error.message };

  const departments = Array.from(new Set(data?.map((u) => u.department).filter((d): d is string => d !== null)));
  return { departments };
}
