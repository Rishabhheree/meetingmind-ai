import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/supabase-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Mic2,
  Calendar,
  TrendingUp,
  Clock,
  FileText,
  CheckCircle,
  Play,
  ArrowRight,
} from 'lucide-react';

function SimpleProgress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={`h-1 rounded-full bg-secondary overflow-hidden ${className || ''}`}>
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

interface DashboardStats {
  totalUsers: number;
  enrolledSpeakers: number;
  totalMeetings: number;
  activeMeetings: number;
  pendingActionItems: number;
  overdueActionItems: number;
  recognitionAccuracy: number;
}

interface RecentMeeting {
  id: string;
  name: string;
  status: string;
  started_at: string | null;
  duration_seconds: number | null;
  profiles: { name: string } | null;
}

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentMeetings, setRecentMeetings] = useState<RecentMeeting[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/signin');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [statsRes, meetingsRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/recent'),
        ]);
        const statsData = await statsRes.json();
        const meetingsData = await meetingsRes.json();
        setStats(statsData);
        setRecentMeetings(meetingsData.meetings || []);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setStatsLoading(false);
      }
    }

    if (user) {
      fetchStats();
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const recognitionAccuracy = stats?.recognitionAccuracy
    ? Math.round(stats.recognitionAccuracy * 100)
    : 0;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {profile?.name || 'User'}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/meetings/new')}>
              <Play className="h-4 w-4 mr-2" />
              Start Meeting
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/90 to-primary hover:from-primary hover:to-primary/90 text-primary-foreground transition-all cursor-pointer" onClick={() => navigate('/meetings/new')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary-foreground/20 rounded-xl">
                  <Mic2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">Start Meeting</p>
                  <p className="text-sm text-primary-foreground/80">Begin recording</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => navigate('/admin/users')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-secondary rounded-xl">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">Enroll Speaker</p>
                  <p className="text-sm text-muted-foreground">Add voice profile</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => navigate('/transcripts')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-secondary rounded-xl">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">View Transcripts</p>
                  <p className="text-sm text-muted-foreground">Access recordings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => navigate('/analytics')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-secondary rounded-xl">
                  <TrendingUp className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">Analytics</p>
                  <p className="text-sm text-muted-foreground">View insights</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? '...' : stats?.totalUsers || 0}</div>
              <p className="text-xs text-muted-foreground">{stats?.enrolledSpeakers || 0} enrolled speakers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Meetings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? '...' : stats?.totalMeetings || 0}</div>
              <p className="text-xs text-muted-foreground">{stats?.activeMeetings || 0} currently active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recognition Accuracy</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? '...' : recognitionAccuracy}%</div>
              <SimpleProgress value={recognitionAccuracy} className="mt-2 h-1" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Action Items</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? '...' : stats?.pendingActionItems || 0}</div>
              <p className="text-xs text-muted-foreground">
                {!!stats?.overdueActionItems ? (
                  <span className="text-destructive font-medium">{stats.overdueActionItems} overdue</span>
                ) : 'All on track'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Meetings & System Status */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Meetings</CardTitle>
                  <CardDescription>Your latest recorded sessions</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/meetings')}>
                  View all
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentMeetings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No meetings yet</p>
                  <Button variant="link" onClick={() => navigate('/meetings/new')} className="mt-2">
                    Start your first meeting
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentMeetings.slice(0, 5).map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors"
                      onClick={() => navigate(`/meetings/${meeting.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-lg">
                          {meeting.status === 'active' ? (
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-subtle" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{meeting.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {meeting.profiles?.name || 'Unknown'} -{' '}
                            {meeting.started_at
                              ? new Date(meeting.started_at).toLocaleDateString()
                              : 'Scheduled'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={meeting.status === 'active' ? 'default' : 'secondary'}>
                          {meeting.status}
                        </Badge>
                        {meeting.duration_seconds && (
                          <span className="text-sm text-muted-foreground">
                            {Math.floor(meeting.duration_seconds / 60)}m
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>Azure services health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm">Speech Services</span>
                </div>
                <span className="text-xs text-green-600 font-medium">Operational</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm">Speaker Recognition</span>
                </div>
                <span className="text-xs text-green-600 font-medium">Operational</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm">Blob Storage</span>
                </div>
                <span className="text-xs text-green-600 font-medium">Operational</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span className="text-sm">AI Summaries</span>
                </div>
                <span className="text-xs text-yellow-600 font-medium">Config Required</span>
              </div>
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Enrollment Status</span>
                  <span className="font-medium">{profile ? 'Active' : 'Setup Required'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
