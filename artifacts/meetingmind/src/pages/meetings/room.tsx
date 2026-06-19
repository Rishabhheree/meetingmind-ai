import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/providers/supabase-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Mic, MicOff, PhoneOff, Users, MessageSquare, Clock, Wifi, AlertCircle, Loader2, UserCheck, UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MeetingInfo {
  id: string;
  name: string;
  status: string;
  started_at: string;
  speaker_id_enabled: boolean;
  participants: Participant[];
}

interface Participant {
  id: string;
  user_id: string | null;
  display_name: string;
  is_host: boolean;
}

interface TranscriptSegment {
  id: string;
  speaker_name: string;
  speaker_confidence: number;
  is_unknown_speaker: boolean;
  text: string;
  start_offset_seconds: number;
}

export default function MeetingRoomPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, profile } = useAuth();

  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    async function loadMeeting() {
      try {
        const res = await fetch(`/api/meetings/${params.id}`);
        const data = await res.json();
        if (data.error) { navigate('/meetings'); return; }
        setMeeting(data.meeting);
        const transcriptRes = await fetch(`/api/transcripts?meetingId=${params.id}`);
        const transcriptData = await transcriptRes.json();
        if (transcriptData.transcript) {
          setTranscriptId(transcriptData.transcript.id);
          setTranscriptSegments(transcriptData.transcript.transcript_segments || []);
        }
      } catch {
        navigate('/meetings');
      } finally {
        setLoading(false);
      }
    }
    if (params.id) loadMeeting();
  }, [params.id, navigate]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => setElapsedTime((prev) => prev + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, isPaused]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptSegments]);

  const requestMicrophoneAccess = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
      mediaStreamRef.current = stream;
      setConnectionStatus('connected');
      return stream;
    } catch {
      setConnectionStatus('error');
      return null;
    }
  }, []);

  const addTranscriptSegment = useCallback(async (speakerName: string, text: string, isUnknown: boolean, confidence = 0.95) => {
    if (!transcriptId || !meeting) return;
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(),
      speaker_name: speakerName,
      speaker_confidence: confidence,
      is_unknown_speaker: isUnknown,
      text,
      start_offset_seconds: elapsedTime,
    };
    setTranscriptSegments((prev) => [...prev, segment]);
    try {
      await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptId, meetingId: params.id, speakerName, speakerConfidence: confidence, isUnknownSpeaker: isUnknown, text, startOffsetSeconds: elapsedTime, endOffsetSeconds: elapsedTime }),
      });
    } catch { /* ignore */ }
  }, [transcriptId, meeting, elapsedTime, params.id]);

  const startRecording = async () => {
    const stream = await requestMicrophoneAccess();
    if (!stream) return;
    try {
      setIsRecording(true);
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      addTranscriptSegment('System', 'Meeting recording started', false);
    } catch {
      setConnectionStatus('error');
      setIsRecording(false);
    }
  };

  const togglePause = () => {
    if (mediaRecorderRef.current) {
      if (isPaused) mediaRecorderRef.current.resume();
      else mediaRecorderRef.current.pause();
      setIsPaused(!isPaused);
    }
  };

  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !micEnabled; setMicEnabled(!micEnabled); }
    }
  };

  const endMeeting = async () => {
    if (!confirm('Are you sure you want to end this meeting?')) return;
    try {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      await addTranscriptSegment('System', 'Meeting recording ended', false);
      await fetch(`/api/meetings/${params.id}/end`, { method: 'POST' });
      if (transcriptId) await fetch(`/api/transcripts?transcriptId=${transcriptId}`, { method: 'PUT' });
      navigate(`/meetings/${params.id}`);
    } catch { /* ignore */ }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium">Meeting not found</p>
            <Button variant="link" onClick={() => navigate('/meetings')} className="mt-2">Back to meetings</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isRecording && !isPaused ? (
                <div className="flex items-center gap-2">
                  <div className="recording-pulse" />
                  <Badge variant="destructive">Recording</Badge>
                </div>
              ) : isPaused ? (
                <Badge variant="secondary">Paused</Badge>
              ) : (
                <Badge variant="outline">Ready</Badge>
              )}
            </div>
            <div>
              <h1 className="font-semibold">{meeting.name}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />{formatTime(elapsedTime)}
                </span>
                <span className="flex items-center gap-1">
                  <Wifi className={cn('h-3 w-3', connectionStatus === 'connected' ? 'text-green-500' : connectionStatus === 'error' ? 'text-destructive' : 'text-muted-foreground')} />
                  {connectionStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRecording && (
              <>
                <Button variant={isPaused ? 'default' : 'secondary'} size="icon" onClick={togglePause}>
                  {isPaused ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
                <Button variant={micEnabled ? 'secondary' : 'destructive'} size="icon" onClick={toggleMic}>
                  {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
              </>
            )}
            {!isRecording ? (
              <Button onClick={startRecording}>
                <Mic className="h-4 w-4 mr-2" />Start Recording
              </Button>
            ) : (
              <Button variant="destructive" onClick={endMeeting}>
                <PhoneOff className="h-4 w-4 mr-2" />End Meeting
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r border-border bg-card hidden lg:block">
          <div className="p-4">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <Users className="h-4 w-4" />Participants ({meeting.participants?.length || 0})
            </h2>
            <div className="space-y-2">
              {meeting.participants?.map((participant) => (
                <div key={participant.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{participant.display_name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{participant.display_name}</p>
                    {participant.is_host && <p className="text-xs text-muted-foreground">Host</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {transcriptSegments.length === 0 && !isRecording && (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Click &quot;Start Recording&quot; to begin</p>
                  <p className="text-sm mt-1">Transcript will appear here in real-time</p>
                </div>
              )}
              {transcriptSegments.map((segment) => (
                <div key={segment.id} className={cn('transcript-line', segment.is_unknown_speaker && 'unknown-speaker')}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('speaker-badge', segment.is_unknown_speaker ? 'unknown' : 'known')}>
                        {segment.is_unknown_speaker ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                        {segment.speaker_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(segment.start_offset_seconds)}</span>
                    </div>
                    <span className="text-xs font-medium">{Math.round(segment.speaker_confidence * 100)}%</span>
                  </div>
                  <p className="text-sm leading-relaxed">{segment.text}</p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>
        </main>

        <aside className="w-72 border-l border-border bg-card hidden xl:block">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Meeting Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium capitalize">{meeting.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{formatTime(elapsedTime)}</span>
                </div>
                {meeting.speaker_id_enabled && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Speaker ID</span>
                    <Badge variant="default" className="text-xs">Enabled</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Recognition Stats</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-secondary/50 rounded-lg">
                    <div className="font-semibold">{transcriptSegments.filter((s) => !s.is_unknown_speaker).length}</div>
                    <div className="text-xs text-muted-foreground">Identified</div>
                  </div>
                  <div className="p-2 bg-secondary/50 rounded-lg">
                    <div className="font-semibold">{transcriptSegments.filter((s) => s.is_unknown_speaker).length}</div>
                    <div className="text-xs text-muted-foreground">Unknown</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
