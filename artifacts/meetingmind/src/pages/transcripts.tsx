import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import { getAllTranscripts, exportTranscriptAsText } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Download, FileText, Clock, Users, Calendar, ArrowRight } from 'lucide-react';

type TranscriptWithMeeting = Awaited<ReturnType<typeof getAllTranscripts>>[number];

export default function TranscriptsPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [transcripts, setTranscripts] = useState<TranscriptWithMeeting[]>([]);
  const [search, setSearch] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    getAllTranscripts(50).then((data) => { setTranscripts(data); setLoadingData(false); });
  }, [user]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const handleDownload = async (t: TranscriptWithMeeting, format: 'txt' | 'json') => {
    let content: string;
    if (format === 'txt') {
      content = await exportTranscriptAsText(t.id);
    } else {
      content = JSON.stringify(t, null, 2);
    }
    const blob = new Blob([content], { type: format === 'txt' ? 'text/plain' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.meeting?.name || 'transcript'}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = transcripts.filter((t) => t.meeting?.name?.toLowerCase().includes(search.toLowerCase()));

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transcripts</h1>
          <p className="text-muted-foreground">Access and export meeting transcripts</p>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search transcripts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        {loadingData ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>{transcripts.length === 0 ? 'No transcripts yet' : 'No results'}</p><p className="text-sm mt-1">Transcripts appear after completed meetings</p></CardContent></Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((t) => (
              <Card key={t.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/meetings/${t.meeting_id}`)}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg truncate">{t.meeting?.name || 'Untitled Meeting'}</h3>
                        <Badge variant={t.status === 'completed' ? 'default' : 'secondary'}>{t.status}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(t.created_at)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(t.duration_seconds)}</span>
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t.speaker_count} speakers</span>
                        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{t.word_count} words</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(t, 'txt'); }}><Download className="h-4 w-4 mr-1" />TXT</Button>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(t, 'json'); }}>JSON</Button>
                      <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
