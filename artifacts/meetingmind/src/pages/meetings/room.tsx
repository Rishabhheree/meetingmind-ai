import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/providers/auth-provider';
import {
  getMeetingById, endMeeting, getTranscriptByMeeting, addTranscriptSegment,
  getParticipants, getAllVoiceUsers, getSpeakerProfile,
  type MeetingRecord, type MeetingParticipantRecord, type TranscriptSegmentRecord, type VoiceUserRecord,
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
  Mic, MicOff, PhoneOff, Users, MessageSquare, Clock,
  AlertCircle, Loader2, UserCheck, UserX,
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
  const [enrolledUsers, setEnrolledUsers] = useState<VoiceUserRecord[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const activeSpeakerRef = useRef<string>('Speaker');

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

  // Load meeting + enrolled voice users
  useEffect(() => {
    if (!params.id) return;
    meetingIdRef.current = params.id;
    Promise.all([
      getMeetingById(params.id),
      getParticipants(params.id),
      getTranscriptByMeeting(params.id),
      getAllVoiceUsers(),
    ]).then(async ([m, p, t, voiceUsers]) => {
      if (!m) { navigate('/meetings'); return; }
      setMeeting(m);
      setParticipants(p);
      if (t) { setTranscriptId(t.id); transcriptIdRef.current = t.id; }

      // Filter to only enrolled users
      const enrolled: VoiceUserRecord[] = [];
      for (const vu of voiceUsers) {
        const sp = await getSpeakerProfile(vu.id);
        if (sp?.enrollment_status === 'enrolled') enrolled.push(vu);
      }
      setEnrolledUsers(enrolled);

      // Default active speaker = first enrolled user, or logged-in user's name
      if (enrolled.length > 0) {
        setActiveSpeakerId(enrolled[0].id);
        activeSpeakerRef.current = enrolled[0].name;
      } else {
        activeSpeakerRef.current = profile?.name || 'Speaker';
      }

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
    return () => { transcriberRef.current?.stop().catch(() => {}); };
  }, []);

  // Keep ref in sync whenever activeSpeakerId changes
  const handleSelectSpeaker = (vu: VoiceUserRecord) => {
    setActiveSpeakerId(vu.id);
    activeSpeakerRef.current = vu.name;
  };

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
        const without = prev.filter((s) => s.id !== id);
        return [...without, { ...segment, id }];
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

    const onStatusChange = (s: 'connecting' | 'connected' | 'stopped' | 'error') => {
      setConnectionStatus(s);
      if (s === 'connected') setIsRecording(true);
      if (s === 'stopped' || s === 'error') setIsRecording(false);
    };
    const onError = (err: string) => setAzureError(err);

    let transcriber: AzureTranscriber;

    if (AZURE_CONFIGURED) {
      const enrolledParticipants: EnrolledParticipant[] = [];
      try {
        for (const vu of enrolledUsers) {
          const sp = await getSpeakerProfile(vu.id);
          if (sp?.azure_profile_id) {
            enrolledParticipants.push({ name: vu.name, azureProfileId: sp.azure_profile_id });
          }
        }
      } catch { }
      transcriber = createAzureTranscriber({ participants: enrolledParticipants, onSegment: handleSegment, onError, onStatusChange });
    } else {
      transcriber = createFallbackTranscriber({
        getDisplayName: () => activeSpeakerRef.current,
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

  // Unique speaker colors
  const speakerColors: Record<string, string> = {};
  const palette = ['bg-blue-100 text-blue-800', 'bg-purple-100 text-purple-800', 'bg-green-100 text-green-800', 'bg-orange-100 text-orange-800', 'bg-pink-100 text-pink-800', 'bg-teal-100 text-teal-800'];
  let colorIdx = 0;
  allDisplaySegments.forEach((s) => {
    if (!s.isUnknown && !speakerColors[s.speakerName]) {
      speakerColors[s.speakerName] = palette[colorIdx++ % palette.length];
    }
  });
  enrolledUsers.forEach((u) => {
    if (!speakerColors[u.name]) speakerColors[u.name] = palette[colorIdx++ % palette.length];
  });

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
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold truncate">{meeting.name}</h1>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />{formatTime(elapsedTime)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isRecording && (
              <Button variant={micMuted ? 'destructive' : 'secondary'} size="icon" onClick={toggleMic} title={micMuted ? 'Unmute mic' : 'Mute mic'}>
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
        {/* Left sidebar — Active Speaker */}
        <aside className="w-56 border-r border-border bg-card hidden lg:flex flex-col gap-4 p-4">

          {/* Active Speaker selector */}
          {!AZURE_CONFIGURED && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Who's Speaking?
              </p>
              {enrolledUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No enrolled voices yet. Go to <strong>Voice Enrollment</strong> to add people.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {enrolledUsers.map((vu) => {
                    const isActive = vu.id === activeSpeakerId;
                    const color = speakerColors[vu.name] ?? 'bg-muted text-foreground';
                    return (
                      <button
                        key={vu.id}
                        onClick={() => handleSelectSpeaker(vu)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-sm transition-all',
                          isActive
                            ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-sm'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40 text-foreground'
                        )}
                      >
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          isActive ? 'bg-primary-foreground/20 text-primary-foreground' : color
                        )}>
                          {vu.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{vu.name}</span>
                        {isActive && (
                          <div className="ml-auto w-2 h-2 rounded-full bg-primary-foreground/80 animate-pulse flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {enrolledUsers.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  Tap a name before they speak — transcript will use that name.
                </p>
              )}
            </div>
          )}

          {/* Participants */}
          {participants.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />Participants
              </h2>
              <div className="space-y-1.5">
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
              </div>
            </div>
          )}
        </aside>

        {/* Transcript */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2 pb-8">

              {/* Mobile: active speaker bar */}
              {!AZURE_CONFIGURED && enrolledUsers.length > 0 && (
                <div className="lg:hidden flex items-center gap-2 flex-wrap pb-2 border-b border-border mb-3">
                  <span className="text-xs text-muted-foreground font-medium flex-shrink-0">Speaking:</span>
                  {enrolledUsers.map((vu) => (
                    <button
                      key={vu.id}
                      onClick={() => handleSelectSpeaker(vu)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        vu.id === activeSpeakerId
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {vu.name}
                    </button>
                  ))}
                </div>
              )}

              {allDisplaySegments.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">Transcript will appear here</p>
                  <p className="text-sm mt-1 max-w-xs mx-auto">
                    {enrolledUsers.length > 0
                      ? 'Select who\'s speaking on the left, then click Start Recording.'
                      : 'Click Start Recording to begin. Enroll voices to label speakers by name.'}
                  </p>
                  <Button variant="outline" onClick={startRecording} className="mt-4" disabled={isRecording || connectionStatus === 'connecting'}>
                    <Mic className="h-4 w-4 mr-2" />Start Recording
                  </Button>
                </div>
              )}

              {allDisplaySegments.map((seg, i) => {
                const isFinal = 'isFinal' in seg ? seg.isFinal : true;
                const colorClass = seg.isUnknown
                  ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30'
                  : 'bg-secondary/30 hover:bg-secondary/50';
                const badgeColor = speakerColors[seg.speakerName] ?? 'bg-primary/10 text-primary';

                return (
                  <div
                    key={'id' in seg ? seg.id : i}
                    className={cn('p-3 rounded-lg transition-all', !isFinal && 'opacity-60 italic', colorClass)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', seg.isUnknown ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : badgeColor)}>
                          {seg.isUnknown ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                          {seg.speakerName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(Math.floor('offsetSeconds' in seg ? seg.offsetSeconds : (seg as any).start_offset_seconds || 0))}
                        </span>
                        {!isFinal && <Badge variant="outline" className="text-xs py-0 px-1">live</Badge>}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed">{seg.text}</p>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>
        </main>

        {/* Right: session stats */}
        <aside className="w-52 border-l border-border bg-card hidden xl:flex flex-col p-4 gap-4">
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

          {/* Speaker breakdown */}
          {savedSegments.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Speakers</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {Array.from(new Set(savedSegments.map((s) => s.speaker_name))).map((name) => {
                  const count = savedSegments.filter((s) => s.speaker_name === name).length;
                  const color = speakerColors[name] ?? 'bg-muted text-muted-foreground';
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', color)}>
                        {name.charAt(0)}
                      </div>
                      <span className="text-xs truncate flex-1">{name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
