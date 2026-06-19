import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/supabase-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Play,
  Download,
  Clock,
  Users,
  FileText,
  CheckCircle,
  ListTodo,
  MessageSquare,
  Trash2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Meeting {
  id: string;
  name: string;
  description: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  profiles: { id: string; name: string; email: string } | null;
  meeting_participants: Array<{ id: string; display_name: string; is_host: boolean }>;
  transcripts: Array<{
    id: string;
    duration_seconds: number;
    word_count: number;
    speaker_count: number;
    transcript_segments: TranscriptSegment[];
  }>;
  meeting_summaries: Array<{
    id: string;
    summary: string;
    key_topics: string[];
    decisions: string[];
    action_items: Array<{ title: string; description?: string; priority: string }>;
  }>;
  action_items: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
  }>;
}

interface TranscriptSegment {
  id: string;
  speaker_name: string;
  text: string;
  speaker_confidence: number;
  is_unknown_speaker: boolean;
  start_offset_seconds: number;
}

export default function MeetingDetailsPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    async function fetchMeeting() {
      try {
        const res = await fetch(`/api/meetings/${params.id}`);
        const data = await res.json();
        if (data.error) navigate('/meetings');
        else setMeeting(data.meeting);
      } catch {
        navigate('/meetings');
      } finally {
        setLoadingMeeting(false);
      }
    }
    if (params.id && user) fetchMeeting();
  }, [params.id, user, navigate]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} minutes`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    try {
      await fetch(`/api/meetings/${params.id}`, { method: 'DELETE' });
      toast.success('Meeting deleted');
      navigate('/meetings');
    } catch {
      toast.error('Failed to delete meeting');
    }
  };

  const handleDownload = async (format: 'json' | 'txt' | 'srt') => {
    const transcript = meeting?.transcripts?.[0];
    if (!transcript) { toast.error('No transcript available'); return; }
    try {
      const res = await fetch(`/api/transcripts/${transcript.id}?format=${format}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meeting?.name || 'transcript'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  if (loadingMeeting || !meeting) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const transcript = meeting.transcripts?.[0];
  const segments = transcript?.transcript_segments || [];
  const summary = meeting.meeting_summaries?.[0];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/meetings')} className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />Back to Meetings
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{meeting.name}</h1>
              <Badge variant={meeting.status === 'active' ? 'default' : meeting.status === 'completed' ? 'secondary' : 'outline'}>
                {meeting.status}
              </Badge>
            </div>
            {meeting.description && <p className="text-muted-foreground mt-2">{meeting.description}</p>}
          </div>
          <div className="flex gap-2">
            {meeting.status === 'active' && (
              <Button onClick={() => navigate(`/meetings/${meeting.id}/room`)}>
                <Play className="h-4 w-4 mr-2" />Join Meeting
              </Button>
            )}
            {transcript && (
              <Button variant="outline" onClick={() => handleDownload('txt')}>
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /><span className="text-sm">Duration</span></div>
              <div className="text-2xl font-bold mt-1">{meeting.duration_seconds ? formatDuration(meeting.duration_seconds) : '-'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /><span className="text-sm">Participants</span></div>
              <div className="text-2xl font-bold mt-1">{meeting.meeting_participants?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground"><MessageSquare className="h-4 w-4" /><span className="text-sm">Words</span></div>
              <div className="text-2xl font-bold mt-1">{transcript?.word_count || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle className="h-4 w-4" /><span className="text-sm">Action Items</span></div>
              <div className="text-2xl font-bold mt-1">{meeting.action_items?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="transcript" className="space-y-4">
          <TabsList>
            <TabsTrigger value="transcript"><FileText className="h-4 w-4 mr-2" />Transcript</TabsTrigger>
            <TabsTrigger value="summary"><MessageSquare className="h-4 w-4 mr-2" />Summary</TabsTrigger>
            <TabsTrigger value="actions"><ListTodo className="h-4 w-4 mr-2" />Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="transcript">
            <Card>
              <CardContent className="pt-6">
                <ScrollArea className="h-[500px]">
                  {segments.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No transcript available</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {segments.map((segment) => (
                        <div key={segment.id} className="transcript-line p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={cn('speaker-badge', segment.is_unknown_speaker ? 'unknown' : 'known')}>
                                {segment.speaker_name}
                              </span>
                              <span className="text-xs text-muted-foreground">[{formatTime(segment.start_offset_seconds)}]</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{Math.round(segment.speaker_confidence * 100)}%</Badge>
                          </div>
                          <p className="text-sm">{segment.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{summary?.summary || 'No summary available'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Key Topics</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(summary?.key_topics || []).map((topic, i) => (
                      <Badge key={i} variant="secondary">{topic}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Decisions</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(summary?.decisions || []).map((decision, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 mt-0.5 text-green-500" />
                        <span>{decision}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="actions">
            <Card>
              <CardHeader>
                <CardTitle>Action Items</CardTitle>
                <CardDescription>Tasks extracted from the meeting</CardDescription>
              </CardHeader>
              <CardContent>
                {meeting.action_items?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No action items extracted</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {meeting.action_items?.map((item) => (
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
