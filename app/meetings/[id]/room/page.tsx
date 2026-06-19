'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/supabase-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Mic,
  MicOff,
  PhoneOff,
  Users,
  MessageSquare,
  Settings,
  Clock,
  Wifi,
  AlertCircle,
  Loader2,
  UserCheck,
  UserX,
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
  profiles?: { name: string; email: string };
}

interface TranscriptSegment {
  id: string;
  speaker_name: string;
  speaker_confidence: number;
  is_unknown_speaker: boolean;
  text: string;
  start_offset_seconds: number;
}

interface ActiveSpeaker {
  name: string;
  confidence: number;
  isUnknown: boolean;
}

export default function MeetingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();

  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load meeting data
  useEffect(() => {
    async function loadMeeting() {
      try {
        const res = await fetch(`/api/meetings/${params.id}`);
        const data = await res.json();

        if (data.error) {
          router.push('/meetings');
          return;
        }

        setMeeting(data.meeting);

        // Create transcript if needed
        const transcriptRes = await fetch(`/api/transcripts?meetingId=${params.id}`);
        const transcriptData = await transcriptRes.json();
        if (transcriptData.transcript) {
          setTranscriptId(transcriptData.transcript.id);
          setTranscriptSegments(transcriptData.transcript.transcript_segments || []);
        }
      } catch (error) {
        console.error('Failed to load meeting:', error);
        router.push('/meetings');
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      loadMeeting();
    }
  }, [params.id, router]);

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptSegments]);

  // Request microphone access and setup
  const requestMicrophoneAccess = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;
      setConnectionStatus('connected');
      setMicEnabled(true);
      return stream;
    } catch (error) {
      console.error('Microphone access denied:', error);
      setConnectionStatus('error');
      return null;
    }
  }, []);

  // Start recording
  const startRecording = async () => {
    const stream = await requestMicrophoneAccess();
    if (!stream) return;

    try {
      setIsRecording(true);
      setConnectionStatus('connected');

      // Create WebSocket connection to Azure Speech Service (via our API)
      // In production, this would connect to Azure Speech SDK
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Process audio chunk via API
          await processAudioChunk(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect in 1-second chunks

      // Add initial transcript notification
      addTranscriptSegment('System', 'Meeting recording started', false);

    } catch (error) {
      console.error('Failed to start recording:', error);
      setConnectionStatus('error');
      setIsRecording(false);
    }
  };

  // Process audio chunk (simulated - would connect to Azure in production)
  const processAudioChunk = async (audioBlob: Blob) => {
    // In production, this would send audio to Azure Speech Services
    // and receive real-time transcription back

    // For now, simulate periodic transcription updates
    // This demonstrates the UI flow
  };

  // Add a transcript segment
  const addTranscriptSegment = async (
    speakerName: string,
    text: string,
    isUnknown: boolean,
    confidence: number = 0.95
  ) => {
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

    // Save to database
    try {
      await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptId,
          meetingId: params.id,
          speakerName,
          speakerConfidence: confidence,
          isUnknownSpeaker: isUnknown,
          text,
          startOffsetSeconds: elapsedTime,
          endOffsetSeconds: elapsedTime,
        }),
      });
    } catch (error) {
      console.error('Failed to save segment:', error);
    }
  };

  // Pause/Resume recording
  const togglePause = () => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
      } else {
        mediaRecorderRef.current.pause();
      }
      setIsPaused(!isPaused);
    }
  };

  // Toggle microphone
  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micEnabled;
        setMicEnabled(!micEnabled);
      }
    }
  };

  // End meeting
  const endMeeting = async () => {
    if (!confirm('Are you sure you want to end this meeting?')) return;

    try {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }

      // Stop all tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Add end message
      await addTranscriptSegment('System', 'Meeting recording ended', false);

      // End meeting in database
      await fetch(`/api/meetings/${params.id}/end`, { method: 'POST' });

      // Finalize transcript
      if (transcriptId) {
        await fetch(`/api/transcripts?transcriptId=${transcriptId}`, { method: 'PUT' });
      }

      router.push(`/meetings/${params.id}`);
    } catch (error) {
      console.error('Failed to end meeting:', error);
    }
  };

  // Format time
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format confidence
  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
    if (confidence >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
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
            <Button variant="link" onClick={() => router.push('/meetings')} className="mt-2">
              Back to meetings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
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
                  <Clock className="h-3 w-3" />
                  {formatTime(elapsedTime)}
                </span>
                <span className="flex items-center gap-1">
                  <Wifi className={cn(
                    'h-3 w-3',
                    connectionStatus === 'connected' ? 'text-green-500' :
                    connectionStatus === 'error' ? 'text-destructive' :
                    'text-muted-foreground'
                  )} />
                  {connectionStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRecording && (
              <>
                <Button
                  variant={isPaused ? 'default' : 'secondary'}
                  size="icon"
                  onClick={togglePause}
                  title={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
                <Button
                  variant={micEnabled ? 'secondary' : 'destructive'}
                  size="icon"
                  onClick={toggleMic}
                  title={micEnabled ? 'Mute' : 'Unmute'}
                >
                  {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
              </>
            )}
            {!isRecording ? (
              <Button onClick={startRecording}>
                <Mic className="h-4 w-4 mr-2" />
                Start Recording
              </Button>
            ) : (
              <Button variant="destructive" onClick={endMeeting}>
                <PhoneOff className="h-4 w-4 mr-2" />
                End Meeting
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Participants */}
        <aside className="w-64 border-r border-border bg-card hidden lg:block">
          <div className="p-4">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <Users className="h-4 w-4" />
              Participants ({meeting.participants?.length || 0})
            </h2>
            <div className="space-y-2">
              {meeting.participants?.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {participant.display_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{participant.display_name}</p>
                    {participant.is_host && (
                      <p className="text-xs text-muted-foreground">Host</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center - Transcript */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Active Speaker Indicator */}
          {activeSpeaker && (
            <div className="p-4 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-2">
                {activeSpeaker.isUnknown ? (
                  <UserX className="h-4 w-4 text-warning" />
                ) : (
                  <UserCheck className="h-4 w-4 text-green-500" />
                )}
                <span className="font-medium">{activeSpeaker.name}</span>
                <Badge variant={activeSpeaker.isUnknown ? 'secondary' : 'default'}>
                  {formatConfidence(activeSpeaker.confidence)} confidence
                </Badge>
              </div>
            </div>
          )}

          {/* Transcript */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {transcriptSegments.length === 0 && !isRecording && (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Click &quot;Start Recording&quot; to begin</p>
                  <p className="text-sm mt-1">Transcript will appear here in real-time</p>
                </div>
              )}
              {transcriptSegments.map((segment, index) => (
                <div
                  key={segment.id}
                  className={cn(
                    'transcript-line',
                    activeSpeaker?.name === segment.speaker_name && 'active',
                    segment.is_unknown_speaker && 'unknown-speaker'
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'speaker-badge',
                          segment.is_unknown_speaker ? 'unknown' : 'known'
                        )}
                      >
                        {segment.is_unknown_speaker ? (
                          <UserX className="h-3 w-3" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                        {segment.speaker_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(segment.start_offset_seconds)}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-xs font-medium flex items-center gap-1',
                        getConfidenceColor(segment.speaker_confidence)
                      )}
                    >
                      {formatConfidence(segment.speaker_confidence)}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed">{segment.text}</p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>
        </main>

        {/* Right Sidebar - Info (optional) */}
        <aside className="w-72 border-l border-border bg-card hidden xl:block">
          <div className="p-4 space-y-4">
            {/* Meeting Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Meeting Details</CardTitle>
              </CardHeader>
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

            {/* Recognition Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recognition Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Avg Confidence</span>
                    <span className="font-medium">
                      {transcriptSegments.length > 0
                        ? formatConfidence(
                            transcriptSegments.reduce((sum, s) => sum + s.speaker_confidence, 0) /
                              transcriptSegments.length
                          )
                        : '-'}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: '80%' }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-secondary/50 rounded-lg">
                    <div className="font-semibold">
                      {transcriptSegments.filter((s) => !s.is_unknown_speaker).length}
                    </div>
                    <div className="text-xs text-muted-foreground">Identified</div>
                  </div>
                  <div className="p-2 bg-secondary/50 rounded-lg">
                    <div className="font-semibold text-warning">
                      {transcriptSegments.filter((s) => s.is_unknown_speaker).length}
                    </div>
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
