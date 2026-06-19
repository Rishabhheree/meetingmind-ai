import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  getMeetingById, getTranscriptByMeeting, getTranscriptSegments, getActionItems,
  getMeetingSummary, deleteMeeting, exportTranscriptAsText,
  type MeetingRecord, type TranscriptRecord, type TranscriptSegmentRecord,
  type ActionItemRecord, type MeetingSummaryRecord,
} from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Play, Download, Clock, Users, FileText, CheckCircle, ListTodo, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function MeetingDetailsPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRecord | null>(null);
  const [segments, setSegments] = useState<TranscriptSegmentRecord[]>([]);
  const [actionItems, setActionItems] = useState<ActionItemRecord[]>([]);
  const [summary, setSummary] = useState<MeetingSummaryRecord | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!params.id || !user) return;
    Promise.all([
      getMeetingById(params.id),
      getTranscriptByMeeting(params.id),
      getActionItems(params.id),
      getMeetingSummary(params.id),
    ]).then(async ([m, t, a, s]) => {
      if (!m) { navigate('/meetings'); return; }
      setMeeting(m);
      setTranscript(t || null);
      setActionItems(a);
      setSummary(s || null);
      if (t) setSegments(await getTranscriptSegments(t.id));
      setLoadingData(false);
    });
  }, [params.id, user, navigate]);

  const handleDelete = async () => {
    if (!params.id || !confirm('Delete this meeting?')) return;
    await deleteMeeting(params.id);
    toast.success('Meeting deleted');
    navigate('/meetings');
  };

  const handleDownload = async (format: 'txt' | 'json') => {
    if (!transcript) { toast.error('No transcript available'); return; }
    let content: string;
    let mime: string;
    if (format === 'txt') {
      content = await exportTranscriptAsText(transcript.id);
      mime = 'text/plain';
    } else {
      content = JSON.stringify({ meeting, segments }, null, 2);
      mime = 'application/json';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting?.name || 'transcript'}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const formatDuration = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m} min`; };

  if (loadingData || !meeting) {
    return <AppLayout><div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/meetings')} className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />Back to Meetings
            </Button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{meeting.name}</h1>
              <Badge variant={meeting.status === 'active' ? 'default' : meeting.status === 'completed' ? 'secondary' : 'outline'}>{meeting.status}</Badge>
            </div>
            {meeting.description && <p className="text-muted-foreground mt-2">{meeting.description}</p>}
          </div>
          <div className="flex gap-2">
            {meeting.status !== 'completed' && (
              <Button onClick={() => navigate(`/meetings/${meeting.id}/room`)}><Play className="h-4 w-4 mr-2" />Open Room</Button>
            )}
            {transcript && (
              <Button variant="outline" onClick={() => handleDownload('txt')}><Download className="h-4 w-4 mr-2" />Export</Button>
            )}
            <Button variant="outline" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Duration', icon: Clock, value: meeting.duration_seconds ? formatDuration(meeting.duration_seconds) : '-' },
            { label: 'Words', icon: MessageSquare, value: transcript?.word_count ?? 0 },
            { label: 'Speakers', icon: Users, value: transcript?.speaker_count ?? 0 },
            { label: 'Action Items', icon: CheckCircle, value: actionItems.length },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground"><item.icon className="h-4 w-4" /><span className="text-sm">{item.label}</span></div>
                <div className="text-2xl font-bold mt-1">{item.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="transcript" className="space-y-4">
          <TabsList>
            <TabsTrigger value="transcript"><FileText className="h-4 w-4 mr-2" />Transcript</TabsTrigger>
            <TabsTrigger value="summary"><MessageSquare className="h-4 w-4 mr-2" />Summary</TabsTrigger>
            <TabsTrigger value="actions"><ListTodo className="h-4 w-4 mr-2" />Actions ({actionItems.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="transcript">
            <Card>
              <CardContent className="pt-6">
                <ScrollArea className="h-[500px]">
                  {segments.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No transcript available</p>
                      {meeting.status !== 'completed' && (
                        <Button variant="link" onClick={() => navigate(`/meetings/${meeting.id}/room`)} className="mt-2">Open meeting room to record</Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {segments.map((seg) => (
                        <div key={seg.id} className={cn('p-3 rounded-lg transition-colors', seg.is_unknown_speaker ? 'bg-warning/10' : 'bg-secondary/30 hover:bg-secondary/50')}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={cn('speaker-badge', seg.is_unknown_speaker ? 'unknown' : 'known')}>{seg.speaker_name}</span>
                              <span className="text-xs text-muted-foreground">[{formatTime(seg.start_offset_seconds)}]</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{Math.round(seg.speaker_confidence * 100)}%</Badge>
                          </div>
                          <p className="text-sm">{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {transcript && (
                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => handleDownload('txt')}><Download className="h-4 w-4 mr-1" />TXT</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDownload('json')}>JSON</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary">
            {summary ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
                  <CardContent><p className="text-muted-foreground leading-relaxed">{summary.summary}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Key Topics</CardTitle></CardHeader>
                  <CardContent><div className="flex flex-wrap gap-2">{summary.key_topics.map((t, i) => <Badge key={i} variant="secondary">{t}</Badge>)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Decisions</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summary.decisions.map((d, i) => (
                        <li key={i} className="flex items-start gap-2"><CheckCircle className="h-4 w-4 mt-0.5 text-green-500" /><span>{d}</span></li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="pt-6 text-center text-muted-foreground py-12"><MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No summary available</p></CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="actions">
            <Card>
              <CardHeader><CardTitle>Action Items</CardTitle><CardDescription>Tasks extracted from the meeting</CardDescription></CardHeader>
              <CardContent>
                {actionItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground"><ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No action items extracted</p></div>
                ) : (
                  <div className="space-y-2">
                    {actionItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.priority === 'high' ? 'destructive' : 'secondary'}>{item.priority}</Badge>
                          <Badge variant={item.status === 'completed' ? 'default' : 'outline'}>{item.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
