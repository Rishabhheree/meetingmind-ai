import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  getAllUsers,
  getSpeakerProfile,
  updateSpeakerProfile,
  resetSpeakerProfile,
  type ProfileRecord,
  type SpeakerProfileRecord,
} from '@/lib/db';
import {
  AZURE_CONFIGURED,
  createSpeakerProfile,
  enrollSpeakerProfile,
  deleteSpeakerProfile,
  getSpeakerProfileStatus,
  type SpeakerProfileStatus,
} from '@/lib/azure-speech';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mic, MicOff, Trash2, CheckCircle, AlertCircle, Loader2, Info, Cloud, HardDrive, User, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type RecordStatus = 'idle' | 'recording' | 'processing' | 'success' | 'error';

interface UserWithProfile {
  user: ProfileRecord;
  speakerProfile: SpeakerProfileRecord | undefined;
}

export default function VoiceEnrollmentPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  // Person selection
  const [allUsers, setAllUsers] = useState<UserWithProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Recording state for the selected person
  const [recordStatus, setRecordStatus] = useState<RecordStatus>('idle');
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [enrollmentStatus, setEnrollmentStatus] = useState<'pending' | 'enrolling' | 'enrolled'>('pending');
  const [azureProfileId, setAzureProfileId] = useState<string | null>(null);
  const [azureStatus, setAzureStatus] = useState<SpeakerProfileStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  // Load all users + their speaker profiles
  useEffect(() => {
    if (!user) return;
    setLoadingUsers(true);
    getAllUsers().then(async (users) => {
      const withProfiles = await Promise.all(
        users.map(async (u) => ({
          user: u,
          speakerProfile: await getSpeakerProfile(u.id),
        }))
      );
      setAllUsers(withProfiles);
      setLoadingUsers(false);

      // Default: select the logged-in user
      if (!selectedUserId) {
        const self = withProfiles.find((wp) => wp.user.id === user.id);
        if (self) selectPerson(self);
      }
    });
  }, [user]);

  useEffect(() => () => cleanup(), []);

  const selectPerson = useCallback(async (wp: UserWithProfile) => {
    cleanup();
    setSelectedUserId(wp.user.id);
    setRecordStatus('idle');
    setError(null);
    setAudioLevel(0);
    setRecordingTime(0);

    const sp = wp.speakerProfile ?? (await getSpeakerProfile(wp.user.id));
    setEnrollmentCount(sp?.enrollment_count ?? 0);
    setEnrollmentStatus(sp?.enrollment_status ?? 'pending');
    setAzureProfileId(sp?.azure_profile_id ?? null);

    if (sp?.azure_profile_id && AZURE_CONFIGURED) {
      try {
        const azStatus = await getSpeakerProfileStatus(sp.azure_profile_id);
        setAzureStatus(azStatus);
      } catch {
        setAzureStatus(null);
      }
    } else {
      setAzureStatus(null);
    }
  }, []);

  function cleanup() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  const startRecording = async () => {
    if (!selectedUserId) return;
    setRecordStatus('recording');
    setError(null);
    setRecordingTime(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000, channelCount: 1 },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;

      const monitorAudio = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length);
        animFrameRef.current = requestAnimationFrame(monitorAudio);
      };
      monitorAudio();

      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

      const chunks: Blob[] = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        setRecordStatus('processing');
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        if (audioContextRef.current) { await audioContextRef.current.close(); audioContextRef.current = null; }
        stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(chunks, { type: mimeType });
        try {
          if (AZURE_CONFIGURED) {
            await submitToAzure(audioBlob);
          } else {
            await submitLocal(audioBlob);
          }
          setRecordStatus('success');

          // Refresh the user list to show updated status
          const updated = await getSpeakerProfile(selectedUserId);
          setAllUsers((prev) =>
            prev.map((wp) =>
              wp.user.id === selectedUserId ? { ...wp, speakerProfile: updated } : wp
            )
          );

          setTimeout(() => setRecordStatus('idle'), 2000);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Enrollment failed');
          setRecordStatus('error');
        }
      };

      recorder.start(100);
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      }, 15000);
    } catch {
      setError('Microphone access denied. Please enable microphone permissions.');
      setRecordStatus('error');
    }
  };

  const submitToAzure = async (audioBlob: Blob) => {
    let profileId = azureProfileId;
    if (!profileId) {
      profileId = await createSpeakerProfile('en-us');
      setAzureProfileId(profileId);
    }

    const result = await enrollSpeakerProfile(profileId, audioBlob);
    setAzureStatus(result);

    const newCount = result.enrollmentsCount;
    const isEnrolled = result.enrollmentStatus === 'Enrolled';
    const newStatus: 'pending' | 'enrolling' | 'enrolled' = isEnrolled ? 'enrolled' : newCount > 0 ? 'enrolling' : 'pending';

    await updateSpeakerProfile(selectedUserId!, {
      enrollment_count: newCount,
      enrollment_status: newStatus,
      azure_profile_id: profileId,
      confidence: isEnrolled ? 0.95 : Math.min(0.9, 0.5 + newCount * 0.05),
    });

    setEnrollmentCount(newCount);
    setEnrollmentStatus(newStatus);

    const selectedName = allUsers.find((wp) => wp.user.id === selectedUserId)?.user.name ?? 'User';
    toast.success(
      isEnrolled
        ? `${selectedName}'s voice enrolled successfully!`
        : `Sample ${newCount} recorded for ${selectedName} (${result.remainingEnrollmentsCount} more needed)`
    );
  };

  const submitLocal = async (audioBlob: Blob) => {
    const sp = await getSpeakerProfile(selectedUserId!);
    const newCount = (sp?.enrollment_count ?? 0) + 1;
    const newStatus: 'pending' | 'enrolling' | 'enrolled' =
      newCount >= 30 ? 'enrolled' : newCount >= 3 ? 'enrolling' : 'pending';

    await updateSpeakerProfile(selectedUserId!, {
      enrollment_count: newCount,
      enrollment_status: newStatus,
      azure_profile_id: null,
      confidence: Math.min(0.95, 0.5 + newCount * 0.015),
    });

    setEnrollmentCount(newCount);
    setEnrollmentStatus(newStatus);

    const selectedName = allUsers.find((wp) => wp.user.id === selectedUserId)?.user.name ?? 'User';
    toast.success(`Sample ${newCount} saved for ${selectedName}`);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const handleReset = async () => {
    if (!selectedUserId) return;
    const name = allUsers.find((wp) => wp.user.id === selectedUserId)?.user.name ?? 'this user';
    if (!confirm(`Reset voice enrollment for ${name}? All their voice samples will be deleted.`)) return;

    if (azureProfileId && AZURE_CONFIGURED) {
      try { await deleteSpeakerProfile(azureProfileId); } catch { }
    }

    await resetSpeakerProfile(selectedUserId);
    setEnrollmentCount(0);
    setEnrollmentStatus('pending');
    setAzureProfileId(null);
    setAzureStatus(null);
    setRecordStatus('idle');

    setAllUsers((prev) =>
      prev.map((wp) =>
        wp.user.id === selectedUserId
          ? { ...wp, speakerProfile: { ...wp.speakerProfile!, enrollment_count: 0, enrollment_status: 'pending', azure_profile_id: null, confidence: 0 } }
          : wp
      )
    );

    toast.success(`Voice enrollment reset for ${name}`);
  };

  const NEEDED = enrollmentStatus === 'enrolled'
    ? 0
    : AZURE_CONFIGURED
    ? (azureStatus?.remainingEnrollmentsCount ?? 3)
    : Math.max(0, 30 - enrollmentCount);

  const progressPct = enrollmentStatus === 'enrolled'
    ? 100
    : AZURE_CONFIGURED
    ? Math.min(99, Math.round(((azureStatus?.enrollmentsCount ?? 0) / Math.max(1, (azureStatus?.enrollmentsCount ?? 0) + (azureStatus?.remainingEnrollmentsCount ?? 1))) * 100))
    : Math.min(99, Math.round((enrollmentCount / 30) * 100));

  const selectedUserData = allUsers.find((wp) => wp.user.id === selectedUserId);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Voice Enrollment</h1>
            <p className="text-muted-foreground">
              Select a person, then record their voice so the system can identify them in meetings
            </p>
          </div>
          <Badge variant={AZURE_CONFIGURED ? 'default' : 'secondary'} className="mt-1">
            {AZURE_CONFIGURED
              ? <><Cloud className="h-3 w-3 mr-1" />Azure Active</>
              : <><HardDrive className="h-3 w-3 mr-1" />Local Mode</>}
          </Badge>
        </div>

        {!AZURE_CONFIGURED && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Azure not configured.</strong> Add{' '}
              <code className="bg-secondary px-1 rounded">VITE_AZURE_SPEECH_KEY</code> and{' '}
              <code className="bg-secondary px-1 rounded">VITE_AZURE_SPEECH_REGION</code> to Replit
              Secrets for real speaker recognition. Currently counting samples locally.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
          {/* Left: Person picker */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Select Person
            </h2>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : allUsers.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                  No users found
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {allUsers.map(({ user: u, speakerProfile: sp }) => {
                  const isSelected = u.id === selectedUserId;
                  const status = sp?.enrollment_status ?? 'pending';
                  const count = sp?.enrollment_count ?? 0;
                  return (
                    <button
                      key={u.id}
                      onClick={() => selectPerson({ user: u, speakerProfile: sp })}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-secondary/40'
                      )}
                    >
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarFallback className={cn(
                          'text-sm font-semibold',
                          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}>
                          {u.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate text-sm">{u.name}</span>
                          {u.id === user.id && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">You</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn(
                            'text-xs font-medium',
                            status === 'enrolled' ? 'text-green-600' :
                            status === 'enrolling' ? 'text-yellow-600' :
                            'text-muted-foreground'
                          )}>
                            {status === 'enrolled' ? '✓ Enrolled' :
                             status === 'enrolling' ? `${count} samples` :
                             'Not enrolled'}
                          </span>
                        </div>
                      </div>
                      {isSelected && <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Enrollment panel */}
          <div className="space-y-4">
            {!selectedUserData ? (
              <Card>
                <CardContent className="pt-12 pb-12 flex flex-col items-center text-center text-muted-foreground gap-3">
                  <User className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Select a person on the left to start enrolling their voice</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Selected person header */}
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-14 w-14">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                          {selectedUserData.user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold">{selectedUserData.user.name}</h2>
                          {selectedUserData.user.id === user.id && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{selectedUserData.user.email}</p>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          'text-lg font-bold',
                          enrollmentStatus === 'enrolled' ? 'text-green-600' :
                          enrollmentStatus === 'enrolling' ? 'text-yellow-600' :
                          'text-muted-foreground'
                        )}>
                          {enrollmentStatus === 'enrolled' ? 'Enrolled' :
                           enrollmentStatus === 'enrolling' ? 'In Progress' : 'Pending'}
                        </div>
                        <p className="text-xs text-muted-foreground">{enrollmentCount} sample{enrollmentCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Progress */}
                <Card>
                  <CardContent className="pt-5 pb-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Enrollment Progress</span>
                      <Badge variant={progressPct >= 100 ? 'default' : 'secondary'}>{progressPct}%</Badge>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {enrollmentStatus === 'enrolled'
                        ? `${selectedUserData.user.name} will be identified by name in meetings.`
                        : NEEDED > 0
                        ? `${NEEDED} more sample${NEEDED !== 1 ? 's' : ''} needed to complete enrollment`
                        : 'Recording samples…'}
                      {azureStatus && ` · ${Math.round(azureStatus.enrollmentsSpeechLength)}s of speech enrolled`}
                    </p>
                  </CardContent>
                </Card>

                {/* Recorder */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Recording{' '}
                      <span className="text-primary">{selectedUserData.user.name}</span>'s Voice
                    </CardTitle>
                    <CardDescription>
                      Have {selectedUserData.user.id === user.id ? 'yourself' : selectedUserData.user.name} speak
                      clearly for 5–15 seconds per sample. Read aloud from a document, email, or article.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {/* Waveform */}
                    <div className="h-16 flex items-center justify-center gap-0.5 px-4 bg-secondary/30 rounded-lg overflow-hidden">
                      {[...Array(48)].map((_, i) => {
                        const phase = ((i / 48) * Math.PI * 4) + (Date.now() / 500);
                        const base = recordStatus === 'recording' ? Math.abs(Math.sin(phase) * audioLevel * 0.6) : 4;
                        return (
                          <div
                            key={i}
                            className={cn(
                              'w-1 rounded-full transition-all',
                              recordStatus === 'recording' ? 'bg-primary duration-75' : 'bg-muted-foreground/30 duration-300'
                            )}
                            style={{ height: `${Math.min(100, Math.max(4, base + (recordStatus === 'recording' ? Math.random() * 10 : 0)))}%` }}
                          />
                        );
                      })}
                    </div>

                    {/* Status text */}
                    <div className="text-center space-y-1">
                      {recordStatus === 'recording' && (
                        <>
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="font-medium">Recording — {recordingTime}s</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {selectedUserData.user.id === user.id ? 'Speak naturally and clearly' : `Have ${selectedUserData.user.name} speak now`} · Auto-stops at 15s
                          </p>
                        </>
                      )}
                      {recordStatus === 'processing' && (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span className="font-medium">
                            {AZURE_CONFIGURED ? 'Uploading to Azure…' : 'Processing sample…'}
                          </span>
                        </div>
                      )}
                      {recordStatus === 'success' && (
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <CheckCircle className="h-5 w-5" />
                          <span className="font-medium">
                            {enrollmentStatus === 'enrolled' ? 'Enrollment complete!' : 'Sample recorded!'}
                          </span>
                        </div>
                      )}
                      {recordStatus === 'idle' && enrollmentStatus !== 'enrolled' && (
                        <p className="text-sm text-muted-foreground">
                          {enrollmentCount === 0
                            ? `Click the button below to start recording ${selectedUserData.user.name}'s voice.`
                            : `${enrollmentCount} sample${enrollmentCount !== 1 ? 's' : ''} recorded. Add more for better accuracy.`}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-4">
                      {(recordStatus === 'idle' || recordStatus === 'success' || recordStatus === 'error') && enrollmentStatus !== 'enrolled' && (
                        <Button size="lg" onClick={startRecording} className="min-w-48">
                          <Mic className="h-5 w-5 mr-2" />
                          {enrollmentCount === 0 ? `Start Recording` : 'Record Next Sample'}
                        </Button>
                      )}
                      {recordStatus === 'recording' && (
                        <Button size="lg" variant="destructive" onClick={stopRecording} className="min-w-48">
                          <MicOff className="h-5 w-5 mr-2" />Stop Recording
                        </Button>
                      )}
                      {enrollmentStatus === 'enrolled' && recordStatus === 'idle' && (
                        <div className="text-center space-y-2">
                          <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                          <p className="font-semibold text-green-600">
                            {selectedUserData.user.name}'s voice is fully enrolled!
                          </p>
                          <p className="text-sm text-muted-foreground">
                            They will be identified by name in all future meetings.
                          </p>
                        </div>
                      )}
                    </div>

                    {azureProfileId && (
                      <div className="pt-1 text-xs text-muted-foreground bg-secondary/30 rounded p-3 font-mono break-all">
                        Azure Profile ID: {azureProfileId}
                      </div>
                    )}

                    {enrollmentCount > 0 && (
                      <div className="pt-4 border-t flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          {azureProfileId ? 'Stored in Azure Speaker Recognition' : 'Stored locally'}
                        </span>
                        <Button variant="outline" size="sm" onClick={handleReset} className="text-destructive border-destructive/30">
                          <Trash2 className="h-4 w-4 mr-2" />Reset
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tips */}
                <Card>
                  <CardHeader><CardTitle className="text-sm font-semibold">Tips for Best Recognition</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                      {[
                        'Speak at a natural pace and volume',
                        'Record in a quiet environment',
                        'Read aloud — articles, emails, or reports work great',
                        'Each sample should be at least 5 seconds of speech',
                        'Multiple short samples beat one long one',
                        'Re-record if there was background noise',
                      ].map((tip) => (
                        <div key={tip} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
