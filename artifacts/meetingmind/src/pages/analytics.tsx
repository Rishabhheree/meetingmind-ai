import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import { getAnalytics } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Clock, TrendingUp, Calendar, FileText, AlertCircle } from 'lucide-react';

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

function SimpleProgress({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-secondary overflow-hidden mt-2">
      <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => { if (!loading && !user) navigate('/auth/signin'); }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    getAnalytics(period).then((data) => { setAnalytics(data); setLoadingData(false); });
  }, [user, period]);

  const fmt = (v: number) => `${Math.round(v * 100)}%`;
  const fmtDuration = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m} min`; };

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">Insights and metrics across your meetings</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Last 24 Hours</SelectItem>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loadingData ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></div>
        ) : analytics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Meetings', icon: Calendar, value: analytics.meetings.total, sub: `Avg. ${fmtDuration(analytics.meetings.avgDuration)}` },
                { label: 'Meeting Time', icon: Clock, value: fmtDuration(analytics.meetings.totalDuration), sub: 'Total recording time' },
                { label: 'Transcribed Words', icon: FileText, value: analytics.transcriptions.totalWords.toLocaleString(), sub: `${Math.round(analytics.transcriptions.avgWordsPerMeeting)} avg/meeting` },
                { label: 'Recognition Rate', icon: TrendingUp, value: fmt(analytics.speakers.recognitionRate), progress: analytics.speakers.recognitionRate * 100 },
              ].map((item) => (
                <Card key={item.label}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{item.value}</div>
                    {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
                    {item.progress !== undefined && <SimpleProgress value={item.progress} />}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Speaker Recognition</CardTitle><CardDescription>Voice enrollment and identification metrics</CardDescription></CardHeader>
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
                    <SimpleProgress value={analytics.speakers.recognitionRate * 100} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Action Items</CardTitle><CardDescription>Task completion status</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Completed', value: analytics.actionItems.completed, cls: 'bg-secondary/30' },
                      { label: 'Pending', value: analytics.actionItems.pending, cls: 'bg-secondary/30' },
                      { label: 'Overdue', value: analytics.actionItems.overdue, cls: 'bg-destructive/10' },
                    ].map((item) => (
                      <div key={item.label} className={`p-3 ${item.cls} rounded-lg text-center`}>
                        <div className={`text-2xl font-bold ${item.label === 'Overdue' ? 'text-destructive' : ''}`}>{item.value}</div>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Completion Rate</span>
                      <span className="font-medium">{fmt(analytics.actionItems.completionRate)}</span>
                    </div>
                    <SimpleProgress value={analytics.actionItems.completionRate * 100} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Meeting Activity</CardTitle><CardDescription>Meetings per day over the period</CardDescription></CardHeader>
              <CardContent>
                <div className="h-48 flex items-end justify-center gap-1 px-4">
                  {analytics.meetings.byDay.length > 0 ? (
                    analytics.meetings.byDay.slice(-30).map((day, i) => {
                      const maxCount = Math.max(...analytics.meetings.byDay.map((d) => d.count), 1);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center">
                          <div
                            className="w-full bg-primary/80 rounded-t hover:bg-primary transition-all min-h-[2px]"
                            style={{ height: `${(day.count / maxCount) * 100}%` }}
                            title={`${day.date}: ${day.count} meetings`}
                          />
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center justify-center text-muted-foreground">
                      <div className="text-center"><BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No data for this period</p></div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card><CardContent className="pt-6 text-center"><AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><p>No analytics data available</p></CardContent></Card>
        )}
      </div>
    </AppLayout>
  );
}
