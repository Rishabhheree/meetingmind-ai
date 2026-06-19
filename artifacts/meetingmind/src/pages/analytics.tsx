import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/supabase-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BarChart3, Clock, CheckCircle, TrendingUp, Calendar, FileText, AlertCircle } from 'lucide-react';

function SimpleProgress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={`h-1 rounded-full bg-secondary overflow-hidden ${className || ''}`}>
      <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

interface Analytics {
  period: 'day' | 'week' | 'month' | 'year';
  meetings: { total: number; totalDuration: number; avgDuration: number; byDay: { date: string; count: number }[] };
  transcriptions: { total: number; totalWords: number; avgWordsPerMeeting: number };
  speakers: { total: number; enrolled: number; recognitionRate: number; avgConfidence: number };
  actionItems: { total: number; completed: number; pending: number; overdue: number; completionRate: number };
}

export default function AnalyticsPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch(`/api/dashboard/analytics?period=${period}`);
        const data = await res.json();
        setAnalytics(data);
      } catch { /* ignore */ } finally {
        setLoadingAnalytics(false);
      }
    }
    if (user) fetchAnalytics();
  }, [user, period]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins} minutes`;
  };

  const fmt = (value: number) => `${Math.round(value * 100)}%`;

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">Insights and metrics across your meetings and transcriptions</p>
          </div>
          <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Last 24 Hours</SelectItem>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loadingAnalytics ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : analytics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Meetings</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.meetings.total}</div>
                  <p className="text-xs text-muted-foreground">Avg. {formatDuration(analytics.meetings.avgDuration)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Meeting Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatDuration(analytics.meetings.totalDuration)}</div>
                  <p className="text-xs text-muted-foreground">Total recording time</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transcribed Words</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.transcriptions.totalWords.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{Math.round(analytics.transcriptions.avgWordsPerMeeting)} avg/meeting</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recognition Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmt(analytics.speakers.recognitionRate)}</div>
                  <SimpleProgress value={analytics.speakers.recognitionRate * 100} className="mt-2 h-1" />
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Speaker Recognition</CardTitle>
                  <CardDescription>Voice enrollment and identification metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-secondary/30 rounded-lg">
                      <div className="text-3xl font-bold">{analytics.speakers.enrolled}</div>
                      <p className="text-sm text-muted-foreground">Enrolled Speakers</p>
                    </div>
                    <div className="p-4 bg-secondary/30 rounded-lg">
                      <div className="text-3xl font-bold">{fmt(analytics.speakers.avgConfidence)}</div>
                      <p className="text-sm text-muted-foreground">Avg Confidence</p>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Recognition Rate</span>
                      <span className="font-medium">{fmt(analytics.speakers.recognitionRate)}</span>
                    </div>
                    <SimpleProgress value={analytics.speakers.recognitionRate * 100} className="mt-2 h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Action Items</CardTitle>
                  <CardDescription>Extracted tasks completion status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-secondary/30 rounded-lg text-center">
                      <div className="text-2xl font-bold">{analytics.actionItems.completed}</div>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                    <div className="p-3 bg-secondary/30 rounded-lg text-center">
                      <div className="text-2xl font-bold">{analytics.actionItems.pending}</div>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                    <div className="p-3 bg-destructive/10 rounded-lg text-center">
                      <div className="text-2xl font-bold text-destructive">{analytics.actionItems.overdue}</div>
                      <p className="text-xs text-muted-foreground">Overdue</p>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Completion Rate</span>
                      <span className="font-medium">{fmt(analytics.actionItems.completionRate)}</span>
                    </div>
                    <SimpleProgress value={analytics.actionItems.completionRate * 100} className="mt-2 h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Meeting Activity</CardTitle>
                <CardDescription>Number of meetings per day over the period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-end justify-between gap-1 px-4">
                  {analytics.meetings.byDay.length > 0 ? (
                    analytics.meetings.byDay.slice(-30).map((day, i) => {
                      const maxCount = Math.max(...analytics.meetings.byDay.map((d) => d.count));
                      const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary" style={{ height: `${height}%` }} title={`${day.date}: ${day.count} meetings`} />
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No data for this period</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p>No analytics data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
