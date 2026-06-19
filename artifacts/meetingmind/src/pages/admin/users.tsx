import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import { getAllUsers, deleteUser, getSpeakerProfile, createUser, type ProfileRecord } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Search, Plus, Trash2, Building, Shield, Mic2, CheckCircle, UserX, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type UserWithProfile = ProfileRecord & { enrollmentStatus?: string };

export default function UsersPage() {
  const { user: currentUser, profile: currentProfile, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', department: '', designation: '', role: 'user' as 'admin' | 'user', employeeId: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !currentUser) navigate('/auth/signin');
    if (!authLoading && currentProfile?.role !== 'admin') navigate('/dashboard');
  }, [currentUser, currentProfile, authLoading, navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    const list = await getAllUsers({ search: search || undefined, role: roleFilter });
    const enriched = await Promise.all(list.map(async (u) => {
      const sp = await getSpeakerProfile(u.id);
      return { ...u, enrollmentStatus: sp?.enrollment_status };
    }));
    setUsers(enriched);
    setLoading(false);
  };

  useEffect(() => { if (currentUser && currentProfile?.role === 'admin') fetchUsers(); }, [search, roleFilter, currentUser, currentProfile]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createUser({ name: newUser.name, email: newUser.email, password: newUser.password || 'Welcome123!', role: newUser.role, department: newUser.department || undefined, designation: newUser.designation || undefined, employee_id: newUser.employeeId || undefined });
      toast.success('User created successfully');
      setNewUser({ name: '', email: '', password: '', department: '', designation: '', role: 'user', employeeId: '' });
      setCreateOpen(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (id === currentUser?.id) { toast.error("You can't delete yourself"); return; }
    if (!confirm(`Delete ${name}?`)) return;
    await deleteUser(id);
    toast.success('User deleted');
    fetchUsers();
  };

  if (authLoading || !currentUser || currentProfile?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">Manage users and voice enrollments</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add User</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>Add a new local user account.</DialogDescription>
              </DialogHeader>
              {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="space-y-4 py-4">
                {[
                  { id: 'name', label: 'Full Name *', placeholder: 'John Doe', key: 'name' },
                  { id: 'email', label: 'Email *', placeholder: 'john@company.com', key: 'email' },
                  { id: 'password', label: 'Password', placeholder: 'Leave blank for default', key: 'password' },
                  { id: 'department', label: 'Department', placeholder: 'Engineering', key: 'department' },
                  { id: 'designation', label: 'Designation', placeholder: 'Senior Engineer', key: 'designation' },
                  { id: 'employeeId', label: 'Employee ID', placeholder: 'EMP001', key: 'employeeId' },
                ].map((f) => (
                  <div key={f.id} className="space-y-2">
                    <Label htmlFor={f.id}>{f.label}</Label>
                    <Input id={f.id} type={f.key === 'password' ? 'password' : f.key === 'email' ? 'email' : 'text'} placeholder={f.placeholder} value={(newUser as any)[f.key]} onChange={(e) => setNewUser({ ...newUser, [f.key]: e.target.value })} />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newUser.role} onValueChange={(v: 'admin' | 'user') => setNewUser({ ...newUser, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || !newUser.name || !newUser.email}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={roleFilter} onValueChange={(v: 'all' | 'admin' | 'user') => setRoleFilter(v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="user">Users</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><Users className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No users found</p></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Voice Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar><AvatarFallback className="bg-primary text-primary-foreground">{u.name?.charAt(0) || 'U'}</AvatarFallback></Avatar>
                          <div>
                            <div className="font-medium">{u.name}</div>
                            <div className="text-sm text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? <Shield className="h-3 w-3 mr-1" /> : <Users className="h-3 w-3 mr-1" />}{u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.department ? <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5 text-muted-foreground" />{u.department}</span> : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {u.enrollmentStatus === 'enrolled' ? (
                          <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Enrolled</Badge>
                        ) : u.enrollmentStatus === 'enrolling' ? (
                          <Badge variant="secondary"><Mic2 className="h-3 w-3 mr-1" />In Progress</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground"><UserX className="h-3 w-3 mr-1" />Not Enrolled</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(u.id, u.name)} disabled={u.id === currentUser?.id}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
