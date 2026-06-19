import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/providers/auth-provider';
import {
  getMeetingById, endMeeting, getTranscriptByMeeting, addTranscriptSegment,
  getParticipants, getAllUsers, getSpeakerProfile,
  type MeetingRecord, type MeetingParticipantRecord, type TranscriptSegmentRecord,
} from '@/lib/db';
import {
  AZURE_CONFIGURED,
  createAzureTranscriber,
  createFallbackTranscriber,
  type AzureTranscriber,
  type EnrolledParticipant,
  type TranscribedSegment,
} from '@/lib/azure-speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Mic, MicOff, PhoneOff, Users, MessageSquare, Clock, Wifi,
  WifiOff, AlertCircle, Loader2, UserCheck, UserX, Cloud, HardDrive,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface LiveSegment extends TranscribedSegment {
  id: string;
}

export default function MeetingRoomPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, profile } = useAuth();

  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'stopped' | 'error'>('idle');
  const [liveSegments, setLiveSegments] = useState<LiveSegment[]>([]);
  const [savedSegments, setSavedSegments] = useState<TranscriptSegmentRecord[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [azureError, setAzureError] = useState<string | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriberRef = useRef<AzureTranscriber | null>(null);
  const elapsedRef = useRef(0);
  const transcriptIdRef = useRef<string | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const interimSegmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    meetingIdRef.current = params.id;
    Promise.all([
      getMeetingById(params.id),
      getParticipants(params.id),
      getTranscriptByMeeting(params.id),
    ]).then(([m, p, t]) => {
      if (!m) { navigate('/meetings'); return; }
      setMeeting(m);
      setParticipants(p);
      if (t) { setTranscriptId(t.id); transcriptIdRef.current = t.id; }
      setLoading(false);
    });
  }, [params.id, navigate]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedTime(elapsedRef.current);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveSegments, savedSegments]);

  useEffect(() => {
    return () => {
      transcriberRef.current?.stop().catch(() => {});
    };
  }, []);

  const saveSegment = useCallback(async (seg: LiveSegment) => {
    const txId = transcriptIdRef.current;
    const meetingId = meetingIdRef.current;
    if (!txId || !meetingId) return;
    const saved = await addTranscriptSegment({
      transcript_id: txId,
      meeting_id: meetingId,
      speaker_name: seg.speakerName,
      speaker_confidence: seg.confidence,
      is_unknown_speaker: seg.isUnknown,
      text: seg.text,
      start_offset_seconds: seg.offsetSeconds,
      end_offset_seconds: seg.offsetSeconds,
    });
    setSavedSegments((prev) => [...prev, saved]);
  }, []);

  const handleSegment = useCallback((segment: TranscribedSegment) => {
    const id = interimSegmentIdRef.current || crypto.randomUUID();

    if (!segment.isFinal) {
      interimSegmentIdRef.current = id;
      setLiveSegments((prev) => {
        const withoutInterim = prev.filter((s) => s.id !== id);
        return [...withoutInterim, { ...segment, id }];
      });
    } else {
      interimSegmentIdRef.current = null;
      const finalSeg: LiveSegment = { ...segment, id };
      setLiveSegments((prev) => prev.filter((s) => s.id !== id));
      saveSegment(finalSeg);
    }
  }, [saveSegment]);

  const startRecording = async () => {
    setAzureError(null);
    setConnectionStatus('connecting');

    // Gather enrolled participants for speaker identification
    const enrolledParticipants: EnrolledParticipant[] = [];
    if (AZURE_CONFIGURED) {
      try {
        const allUsers = await getAllUsers();
        for (const u of allUsers) {
          const sp = await getSpeakerProfile(u.id);
          if (sp?.azure_profile_id && sp.enrollment_status === 'enrolled') {
            enrolledParticipants.push({
              name: u.name,
              azureProfileId: sp.azure_profile_id,
            });
          }
        }
      } catch {
        // continue even if we can't load participants
      }
    }

    const onStatusChange = (s: 'connecting' | 'connected' | 'stopped' | 'error') => {
      setConnectionStatus(s);
      if (s === 'connected') setIsRecording(true);
      if (s === 'stopped' || s === 'error') setIsRecording(false);
    };

    const onError = (err: string) => {
      setAzureError(err);
    };

    let transcriber: AzureTranscriber;
    if (AZURE_CONFIGURED) {
      transcriber = createAzureTranscriber({
        participants: enrolledParticipants,
        onSegment: handleSegment,
        onError,
        onStatusChange,
      });
    } else {
      transcriber = createFallbackTranscriber({
        displayName: profile?.name || 'Speaker',
        onSegment: handleSegment,
        onError,
        onStatusChange,
      });
    }

    transcriberRef.current = transcriber;
    await transcriber.start();
  };

  const toggleMic = () => {
    const muted = !micMuted;
    setMicMuted(muted);
    transcriberRef.current?.toggleMute(muted);
  };

  const handleEndMeeting = async () => {
    if (!confirm('End this meeting and save the transcript?')) return;
    await transcriberRef.current?.stop().catch(() => {});
    setIsRecording(false);
    if (params.id) await endMeeting(params.id);
    navigate(`/meetings/${params.id}`);
  };

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const allDisplaySegments = [
    ...savedSegments.map((s) => ({ ...s, isFinal: true, speakerName: s.speaker_name, isUnknown: s.is_unknown_speaker, confidence: s.speaker_confidence })),
    ...liveSegments,
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p>Meeting not found</p>
            <Button variant="link" onClick={() => navigate('/meetings')}>Back to meetings</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              {isRecording
                ? <><div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" /><Badge variant="destructive">Recording</Badge></>
                : connectionStatus === 'connecting'
                ? <><Loader2 className="h-3 w-3 animate-spin" /><Badge variant="outline">Connecting…</Badge></>
                : <Badge variant="outline">Ready</Badge>}
              <Badge variant="outline" className="hidden sm:flex items-center gap-1">
                {AZURE_CONFIGURED
                  ? <><Cloud className="h-3 w-3" />Azure STT</>
                  : <><HardDrive className="h-3 w-3" />Web Speech</>}
              </Badge>
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold truncate">{meeting.name}</h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />{formatTime(elapsedTime)}
                </span>
                <span className="flex items-center gap-1">
                  {connectionStatus === 'connected'
                    ? <Wifi className="h-3 w-3 text-green-500" />
                    : connectionStatus === 'error'
                    ? <WifiOff className="h-3 w-3 text-destructive" />
                    : <Wifi className="h-3 w-3 text-muted-foreground" />}
                  {connectionStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isRecording && (
              <Button
                variant={micMuted ? 'destructive' : 'secondary'}
                size="icon"
                onClick={toggleMic}
                title={micMuted ? 'Unmute mic' : 'Mute mic'}
              >
                {micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            {!isRecording && connectionStatus !== 'connecting' ? (
              <Button onClick={startRecording}>
                <Mic className="h-4 w-4 mr-2" />Start Recording
              </Button>
            ) : isRecording ? (
              <Button variant="destructive" onClick={handleEndMeeting}>
                <PhoneOff className="h-4 w-4 mr-2" />End Meeting
              </Button>
            ) : null}
          </div>
        </div>

        {azureError && (
          <div className="px-4 pb-3">
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{azureError}</AlertDescription>
            </Alert>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Participants sidebar */}
        <aside className="w-56 border-r border-border bg-card hidden lg:flex flex-col p-4 gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />Participants ({participants.length})
          </h2>
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {p.display_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.display_name}</p>
                {p.is_host && <p className="text-xs text-muted-foreground">Host</p>}
              </div>
            </div>
          ))}
        </aside>

        {/* Transcript main area */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2 pb-8">
              {allDisplaySegments.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">Transcript will appear here in real-time</p>
                  <p className="text-sm mt-1">
                    {AZURE_CONFIGURED
                      ? 'Using Azure Speech-to-Text with speaker identification'
                      : 'Using browser Web Speech API (add Azure credentials for speaker ID)'}
                  </p>
                  <Button variant="outline" onClick={startRecording} className="mt-4" disabled={isRecording || connectionStatus === 'connecting'}>
                    <Mic className="h-4 w-4 mr-2" />Start Recording
                  </Button>
                </div>
              )}

              {allDisplaySegments.map((seg, i) => {
                const isFinal = 'isFinal' in seg ? seg.isFinal : true;
                return (
                  <div
                    key={'id' in seg ? seg.id : i}
                    className={cn(
                      'p-3 rounded-lg transition-all',
                      !isFinal && 'opacity-60 italic',
                      seg.isUnknown ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30' : 'bg-secondary/30 hover:bg-secondary/50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                          seg.isUnknown
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                            : 'bg-primary/10 text-primary'
                        )}>
                          {seg.isUnknown
                            ? <UserX className="h-3 w-3" />
                            : <UserCheck className="h-3 w-3" />}
                          {seg.speakerName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(Math.floor('offsetSeconds' in seg ? seg.offsetSeconds : (seg as any).start_offset_seconds || 0))}
                        </span>
                        {!isFinal && <Badge variant="outline" className="text-xs py-0 px-1">live</Badge>}
                      </div>
                      {seg.confidence > 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs flex-shrink-0',
                            seg.confidence >= 0.8 ? 'border-green-500 text-green-600' : seg.confidence >= 0.5 ? 'border-yellow-500 text-yellow-600' : 'border-red-400 text-red-500'
                          )}
                        >
                          {Math.round(seg.confidence * 100)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{seg.text}</p>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>
        </main>

        {/* Stats sidebar */}
        <aside className="w-56 border-l border-border bg-card hidden xl:flex flex-col p-4 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Session</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono font-medium">{formatTime(elapsedTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Segments</span>
                <span className="font-medium">{savedSegments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Speakers</span>
                <span className="font-medium">{new Set(savedSegments.map((s) => s.speaker_name)).size}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Recognition</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Engine</span>
                <span className="font-medium">{AZURE_CONFIGURED ? 'Azure' : 'Browser'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Speaker ID</span>
                <span className={cn('font-medium', AZURE_CONFIGURED ? 'text-green-600' : 'text-muted-foreground')}>
                  {AZURE_CONFIGURED ? 'Active' : 'Off'}
                </span>
              </div>
              {savedSegments.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg conf.</span>
                  <span className="font-medium">
                    {Math.round(savedSegments.filter((s) => s.speaker_confidence > 0).reduce((a, s) => a + s.speaker_confidence, 0) / Math.max(1, savedSegments.filter((s) => s.speaker_confidence > 0).length) * 100)}%
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
