import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/providers/auth-provider';
import {
  getMeetingById, endMeeting, getTranscriptByMeeting, addTranscriptSegment,
  getParticipants, type MeetingRecord, type MeetingParticipantRecord, type TranscriptSegmentRecord,
} from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mic, MicOff, PhoneOff, Users, MessageSquare, Clock, Wifi, AlertCircle, Loader2, UserCheck, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MeetingRoomPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, profile } = useAuth();

  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [segments, setSegments] = useState<TranscriptSegmentRecord[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!params.id) return;
    Promise.all([getMeetingById(params.id), getParticipants(params.id), getTranscriptByMeeting(params.id)]).then(([m, p, t]) => {
      if (!m) { navigate('/meetings'); return; }
      setMeeting(m);
      setParticipants(p);
      if (t) setTranscriptId(t.id);
      setLoading(false);
    });
  }, [params.id, navigate]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedTime(elapsedRef.current);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const addSegment = useCallback(async (speakerName: string, text: string, isUnknown = false, confidence = 0.95) => {
    const txId = transcriptId;
    if (!txId || !params.id) return;
    const seg = await addTranscriptSegment({
      transcript_id: txId,
      meeting_id: params.id,
      speaker_name: speakerName,
      speaker_confidence: confidence,
      is_unknown_speaker: isUnknown,
      text,
      start_offset_seconds: elapsedRef.current,
      end_offset_seconds: elapsedRef.current,
    });
    setSegments((prev) => [...prev, seg]);
  }, [transcriptId, params.id]);

  const startRecording = async () => {
    setConnectionStatus('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
      mediaStreamRef.current = stream;
      setConnectionStatus('connected');
      setIsRecording(true);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      await addSegment(profile?.name || 'Host', 'Meeting recording started.', false, 1.0);
    } catch {
      setConnectionStatus('error');
    }
  };

  const toggleMic = () => {
    const track = mediaStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !micEnabled; setMicEnabled(!micEnabled); }
  };

  const handleEndMeeting = async () => {
    if (!confirm('End this meeting?')) return;
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    await addSegment(profile?.name || 'Host', 'Meeting ended.', false, 1.0);
    if (params.id) await endMeeting(params.id);
    navigate(`/meetings/${params.id}`);
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!meeting) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md"><CardContent className="pt-6 text-center"><AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><p>Meeting not found</p><Button variant="link" onClick={() => navigate('/meetings')}>Back to meetings</Button></CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isRecording ? (
              <div className="flex items-center gap-2"><div className="recording-pulse" /><Badge variant="destructive">Recording</Badge></div>
            ) : (
              <Badge variant="outline">Ready</Badge>
            )}
            <div>
              <h1 className="font-semibold">{meeting.name}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(elapsedTime)}</span>
                <span className="flex items-center gap-1">
                  <Wifi className={cn('h-3 w-3', connectionStatus === 'connected' ? 'text-green-500' : connectionStatus === 'error' ? 'text-destructive' : 'text-muted-foreground')} />
                  {connectionStatus}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRecording && (
              <Button variant={micEnabled ? 'secondary' : 'destructive'} size="icon" onClick={toggleMic} title={micEnabled ? 'Mute mic' : 'Unmute mic'}>
                {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
            )}
            {!isRecording ? (
              <Button onClick={startRecording}><Mic className="h-4 w-4 mr-2" />Start Recording</Button>
            ) : (
              <Button variant="destructive" onClick={handleEndMeeting}><PhoneOff className="h-4 w-4 mr-2" />End Meeting</Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Participants sidebar */}
        <aside className="w-64 border-r border-border bg-card hidden lg:block p-4 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" />Participants ({participants.length})</h2>
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
              <Avatar className="h-8 w-8"><AvatarFallback>{p.display_name?.charAt(0) || 'U'}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.display_name}</p>
                {p.is_host && <p className="text-xs text-muted-foreground">Host</p>}
              </div>
            </div>
          ))}
        </aside>

        {/* Transcript */}
        <main className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {segments.length === 0 && !isRecording && (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Click &ldquo;Start Recording&rdquo; to begin</p>
                  <p className="text-sm mt-1">Transcript will appear here in real-time</p>
                </div>
              )}
              {segments.map((seg) => (
                <div key={seg.id} className={cn('transcript-line p-3 rounded-lg', seg.is_unknown_speaker ? 'bg-warning/10' : 'bg-secondary/30 hover:bg-secondary/50')}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('speaker-badge', seg.is_unknown_speaker ? 'unknown' : 'known')}>
                        {seg.is_unknown_speaker ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                        {seg.speaker_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(seg.start_offset_seconds)}</span>
                    </div>
                    <span className="text-xs font-medium">{Math.round(seg.speaker_confidence * 100)}%</span>
                  </div>
                  <p className="text-sm leading-relaxed">{seg.text}</p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>
        </main>

        {/* Stats sidebar */}
        <aside className="w-64 border-l border-border bg-card hidden xl:block p-4 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Meeting Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium capitalize">{meeting.status}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{formatTime(elapsedTime)}</span></div>
              {meeting.speaker_id_enabled && <div className="flex justify-between"><span className="text-muted-foreground">Speaker ID</span><Badge className="text-xs">Enabled</Badge></div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Transcript Stats</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-secondary/50 rounded-lg text-center">
                  <div className="font-semibold">{segments.length}</div>
                  <div className="text-xs text-muted-foreground">Segments</div>
                </div>
                <div className="p-2 bg-secondary/50 rounded-lg text-center">
                  <div className="font-semibold">{new Set(segments.map((s) => s.speaker_name)).size}</div>
                  <div className="text-xs text-muted-foreground">Speakers</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
