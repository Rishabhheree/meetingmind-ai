import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import { getMeetings, deleteMeeting, getProfileById, type MeetingRecord } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, Plus, Search, MoreHorizontal, Play, Eye, Trash2, Clock, Users, Filter } from 'lucide-react';
import { toast } from 'sonner';

export default function MeetingsPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [meetings, setMeetings] = useState<(MeetingRecord & { hostName?: string })[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    setLoadingMeetings(true);
    getMeetings({ search: search || undefined, status: statusFilter || undefined }).then(async (list) => {
      const enriched = await Promise.all(list.map(async (m) => {
        const host = await getProfileById(m.created_by);
        return { ...m, hostName: host?.name };
      }));
      setMeetings(enriched);
      setLoadingMeetings(false);
    });
  }, [user, search, statusFilter]);

  const handleDelete = async (meetingId: string) => {
    if (!confirm('Delete this meeting?')) return;
    await deleteMeeting(meetingId);
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    toast.success('Meeting deleted');
  };

  const formatDuration = (s: number | null) => !s ? '-' : `${Math.floor(s / 60)}m ${s % 60}s`;
  const formatDate = (d: string | null) => !d ? '-' : new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Meetings</h1>
            <p className="text-muted-foreground">Manage and access your recorded meetings</p>
          </div>
          <Button onClick={() => navigate('/meetings/new')}><Plus className="h-4 w-4 mr-2" />New Meeting</Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search meetings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline"><Filter className="h-4 w-4 mr-2" />{statusFilter || 'All Status'}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {['All Status', 'active', 'completed', 'scheduled'].map((s) => (
                    <DropdownMenuItem key={s} onClick={() => setStatusFilter(s === 'All Status' ? null : s)}>{s}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loadingMeetings ? (
              <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></div>
            ) : meetings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No meetings found</p>
                <Button variant="link" onClick={() => navigate('/meetings/new')} className="mt-2">Start your first meeting</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meeting Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.map((meeting) => (
                    <TableRow key={meeting.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => navigate(`/meetings/${meeting.id}`)}>
                      <TableCell><div className="font-medium">{meeting.name}</div></TableCell>
                      <TableCell>
                        <Badge variant={meeting.status === 'active' ? 'default' : meeting.status === 'completed' ? 'secondary' : 'outline'}>{meeting.status}</Badge>
                      </TableCell>
                      <TableCell><div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />{meeting.hostName || 'Unknown'}</div></TableCell>
                      <TableCell><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{formatDate(meeting.started_at)}</div></TableCell>
                      <TableCell>{formatDuration(meeting.duration_seconds)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${meeting.id}`); }}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                            {meeting.status !== 'completed' && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${meeting.id}/room`); }}><Play className="h-4 w-4 mr-2" />Open Room</DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id); }}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
