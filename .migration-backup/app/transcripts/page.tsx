'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/components/providers/supabase-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Download, FileText, Clock, Users, Calendar, ArrowRight } from 'lucide-react';

interface Transcript {
  id: string;
  meeting_id: string;
  word_count: number;
  speaker_count: number;
  duration_seconds: number;
  status: string;
  created_at: string;
  meetings: {
    id: string;
    name: string;
    started_at: string | null;
    profiles: { name: string };
  };
  transcript_segments: { count: number };
}

export default function TranscriptsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [search, setSearch] = useState('');
  const [searchTranscript, setSearchTranscript] = useState('');
  const [loadingTranscripts, setLoadingTranscripts] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin');
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function fetchTranscripts() {
      try {
        const params = new URLSearchParams();
        params.append('limit', '50');
        params.append('order', 'created_at.desc');

        const res = await fetch(`/api/transcripts?${params.toString()}`);
        const data = await res.json();
        setTranscripts(data.transcripts || []);
      } catch (error) {
        console.error('Failed to fetch transcripts:', error);
      } finally {
        setLoadingTranscripts(false);
      }
    }

    if (user) {
      fetchTranscripts();
    }
  }, [user]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleDownload = async (transcript: Transcript, format: 'json' | 'txt' | 'srt') => {
    const res = await fetch(`/api/transcripts/${transcript.id}?format=${format}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${transcript.meeting_id}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTranscripts = transcripts.filter((t) =>
    t.meetings?.name?.toLowerCase().includes(search.toLowerCase())
  );

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
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transcripts</h1>
          <p className="text-muted-foreground">
            Access and export meeting transcripts
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transcripts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Transcripts Grid */}
        {loadingTranscripts ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : filteredTranscripts.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transcripts found</p>
              <p className="text-sm mt-1">
                Transcripts will appear here after you complete meetings
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredTranscripts.map((transcript) => (
              <Card
                key={transcript.id}
                className="hover:bg-secondary/30 transition-colors cursor-pointer"
                onClick={() => router.push(`/meetings/${transcript.meeting_id}`)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg truncate">
                          {transcript.meetings?.name || 'Untitled Meeting'}
                        </h3>
                        <Badge variant={transcript.status === 'completed' ? 'default' : 'secondary'}>
                          {transcript.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(transcript.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(transcript.duration_seconds)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {transcript.speaker_count} speakers
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {transcript.word_count} words
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(transcript, 'txt');
                        }}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        TXT
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(transcript, 'json');
                        }}
                      >
                        JSON
                      </Button>
                      <Button variant="ghost" size="sm">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
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
