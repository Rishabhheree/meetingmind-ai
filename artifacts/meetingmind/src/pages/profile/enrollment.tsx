import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import { getSpeakerProfile, updateSpeakerProfile, resetSpeakerProfile } from '@/lib/db';
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
import { Mic, MicOff, Trash2, CheckCircle, AlertCircle, Loader2, Info, Cloud, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Status = 'idle' | 'recording' | 'processing' | 'success' | 'error';

export default function VoiceEnrollmentPage() {
  const { user, profile, loading } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>('idle');
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

  useEffect(() => {
    if (!user) return;
    getSpeakerProfile(user.id).then(async (sp) => {
      if (sp) {
        setEnrollmentCount(sp.enrollment_count);
        setEnrollmentStatus(sp.enrollment_status);
        setAzureProfileId(sp.azure_profile_id);

        if (sp.azure_profile_id && AZURE_CONFIGURED) {
          try {
            const azStatus = await getSpeakerProfileStatus(sp.azure_profile_id);
            setAzureStatus(azStatus);
          } catch {
            // profile might not exist yet on Azure side
          }
        }
      }
    });
  }, [user]);

  useEffect(() => () => {
    cleanup();
  }, []);

  function cleanup() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
  }

  const startRecording = async () => {
    setStatus('recording');
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
        setStatus('processing');
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        if (audioContextRef.current) { await audioContextRef.current.close(); audioContextRef.current = null; }
        stream.getTracks().forEach((t) => t.stop());

        if (!user) return;
        const audioBlob = new Blob(chunks, { type: mimeType });

        try {
          if (AZURE_CONFIGURED) {
            await submitToAzure(audioBlob);
          } else {
            await submitLocal(audioBlob);
          }
          setStatus('success');
          setTimeout(() => setStatus('idle'), 2000);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Enrollment failed');
          setStatus('error');
        }
      };

      recorder.start(100);
      // Auto-stop after 15s
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      }, 15000);
    } catch {
      setError('Microphone access denied. Please enable microphone permissions.');
      setStatus('error');
    }
  };

  const submitToAzure = async (audioBlob: Blob) => {
    if (!user) return;
    let profileId = azureProfileId;

    // Create Azure voice profile if not already created
    if (!profileId) {
      profileId = await createSpeakerProfile('en-us');
      setAzureProfileId(profileId);
    }

    const result = await enrollSpeakerProfile(profileId, audioBlob);
    setAzureStatus(result);

    const newCount = result.enrollmentsCount;
    const isEnrolled = result.enrollmentStatus === 'Enrolled';
    const newStatus: 'pending' | 'enrolling' | 'enrolled' = isEnrolled
      ? 'enrolled'
      : newCount > 0
      ? 'enrolling'
      : 'pending';

    await updateSpeakerProfile(user.id, {
      enrollment_count: newCount,
      enrollment_status: newStatus,
      azure_profile_id: profileId,
      confidence: isEnrolled ? 0.95 : Math.min(0.9, 0.5 + newCount * 0.05),
    });

    setEnrollmentCount(newCount);
    setEnrollmentStatus(newStatus);
    toast.success(isEnrolled ? 'Voice enrollment complete!' : `Sample ${newCount} recorded (${result.remainingEnrollmentsCount} more needed)`);
  };

  const submitLocal = async (audioBlob: Blob) => {
    if (!user) return;
    const sp = await getSpeakerProfile(user.id);
    const newCount = (sp?.enrollment_count || 0) + 1;
    const newStatus: 'pending' | 'enrolling' | 'enrolled' = newCount >= 30 ? 'enrolled' : newCount >= 3 ? 'enrolling' : 'pending';
    await updateSpeakerProfile(user.id, {
      enrollment_count: newCount,
      enrollment_status: newStatus,
      azure_profile_id: null,
      confidence: Math.min(0.95, 0.5 + newCount * 0.015),
    });
    setEnrollmentCount(newCount);
    setEnrollmentStatus(newStatus);
    toast.success(`Sample ${newCount} saved locally`);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const handleReset = async () => {
    if (!user || !confirm('Reset your voice enrollment? This will delete all your voice samples.')) return;

    if (azureProfileId && AZURE_CONFIGURED) {
      try {
        await deleteSpeakerProfile(azureProfileId);
      } catch {
        // ignore if already deleted
      }
    }

    await resetSpeakerProfile(user.id);
    setEnrollmentCount(0);
    setEnrollmentStatus('pending');
    setAzureProfileId(null);
    setAzureStatus(null);
    setStatus('idle');
    toast.success('Voice enrollment reset');
  };

  // Azure requires at least enough speech seconds (usually ~20s worth of samples)
  const NEEDED = AZURE_CONFIGURED ? (azureStatus?.remainingEnrollmentsCount ?? 3) : Math.max(0, 30 - enrollmentCount);
  const progressPct = enrollmentStatus === 'enrolled'
    ? 100
    : AZURE_CONFIGURED
    ? Math.min(99, Math.round(((azureStatus?.enrollmentsCount ?? 0) / ((azureStatus?.enrollmentsCount ?? 0) + (azureStatus?.remainingEnrollmentsCount ?? 1))) * 100))
    : Math.min(99, Math.round((enrollmentCount / 30) * 100));

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Voice Enrollment</h1>
            <p className="text-muted-foreground">Enroll your voice to enable speaker identification in meetings</p>
          </div>
          <Badge variant={AZURE_CONFIGURED ? 'default' : 'secondary'} className="mt-1">
            {AZURE_CONFIGURED ? <><Cloud className="h-3 w-3 mr-1" />Azure Active</> : <><HardDrive className="h-3 w-3 mr-1" />Local Mode</>}
          </Badge>
        </div>

        {!AZURE_CONFIGURED && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Azure not configured.</strong> Add <code className="bg-secondary px-1 rounded">VITE_AZURE_SPEECH_KEY</code> and <code className="bg-secondary px-1 rounded">VITE_AZURE_SPEECH_REGION</code> to Replit Secrets for real speaker recognition. Currently saving samples locally.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{enrollmentCount}</div>
              <p className="text-sm text-muted-foreground">Samples Recorded</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{NEEDED > 0 ? NEEDED : '—'}</div>
              <p className="text-sm text-muted-foreground">{enrollmentStatus === 'enrolled' ? 'Complete' : 'Samples Remaining'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className={cn('text-2xl font-bold', enrollmentStatus === 'enrolled' ? 'text-green-600' : enrollmentStatus === 'enrolling' ? 'text-yellow-600' : '')}>
                {enrollmentStatus === 'enrolled' ? 'Enrolled' : enrollmentStatus === 'enrolling' ? 'In Progress' : 'Pending'}
              </div>
              <p className="text-sm text-muted-foreground">Azure Status</p>
            </CardContent>
          </Card>
        </div>

        {/* Progress bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Enrollment Progress</span>
              <Badge variant={progressPct >= 100 ? 'default' : 'secondary'}>{progressPct}%</Badge>
            </div>
            <Progress value={progressPct} className="h-2" />
            {azureStatus && (
              <p className="text-xs text-muted-foreground mt-2">
                Azure: {azureStatus.enrollmentStatus} · {Math.round(azureStatus.enrollmentsSpeechLength)}s of speech enrolled
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recorder */}
        <Card>
          <CardHeader>
            <CardTitle>Voice Recording</CardTitle>
            <CardDescription>
              {AZURE_CONFIGURED
                ? 'Speak clearly for 5–15 seconds per sample. Azure needs at least a few samples to train your voice profile.'
                : 'Record voice samples. These will be stored locally until Azure credentials are configured.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Waveform visualizer */}
            <div className="h-16 flex items-center justify-center gap-0.5 px-4 bg-secondary/30 rounded-lg overflow-hidden">
              {[...Array(48)].map((_, i) => {
                const phase = ((i / 48) * Math.PI * 4) + (Date.now() / 500);
                const base = status === 'recording' ? Math.abs(Math.sin(phase) * audioLevel * 0.6) : 4;
                return (
                  <div
                    key={i}
                    className={cn(
                      'w-1 rounded-full transition-all',
                      status === 'recording' ? 'bg-primary duration-75' : 'bg-muted-foreground/30 duration-300'
                    )}
                    style={{ height: `${Math.min(100, Math.max(4, base + (status === 'recording' ? Math.random() * 10 : 0)))}%` }}
                  />
                );
              })}
            </div>

            {/* Status message */}
            <div className="text-center space-y-1">
              {status === 'recording' && (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="font-medium">Recording — {recordingTime}s</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Speak naturally and clearly · Auto-stops at 15s</p>
                </>
              )}
              {status === 'processing' && (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="font-medium">{AZURE_CONFIGURED ? 'Uploading to Azure Speech Services…' : 'Processing sample…'}</span>
                </div>
              )}
              {status === 'success' && (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">{enrollmentStatus === 'enrolled' ? 'Enrollment complete!' : 'Sample recorded!'}</span>
                </div>
              )}
              {status === 'idle' && enrollmentStatus !== 'enrolled' && (
                <p className="text-sm text-muted-foreground">
                  {enrollmentCount === 0 ? 'Click Start Enrollment to begin.' : `${enrollmentCount} sample${enrollmentCount !== 1 ? 's' : ''} recorded. Record more for better accuracy.`}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-4">
              {(status === 'idle' || status === 'success' || status === 'error') && enrollmentStatus !== 'enrolled' && (
                <Button size="lg" onClick={startRecording} className="min-w-44">
                  <Mic className="h-5 w-5 mr-2" />
                  {enrollmentCount === 0 ? 'Start Enrollment' : 'Record Next Sample'}
                </Button>
              )}
              {status === 'recording' && (
                <Button size="lg" variant="destructive" onClick={stopRecording} className="min-w-44">
                  <MicOff className="h-5 w-5 mr-2" />Stop Recording
                </Button>
              )}
              {enrollmentStatus === 'enrolled' && status === 'idle' && (
                <div className="text-center space-y-2">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                  <p className="font-semibold text-green-600">Voice enrollment complete!</p>
                  <p className="text-sm text-muted-foreground">You will be identified by name in all future meetings.</p>
                </div>
              )}
            </div>

            {/* Azure Profile ID (for reference) */}
            {azureProfileId && (
              <div className="pt-2 text-xs text-muted-foreground bg-secondary/30 rounded p-3 font-mono break-all">
                Azure Profile ID: {azureProfileId}
              </div>
            )}

            {/* Reset */}
            {enrollmentCount > 0 && (
              <div className="pt-4 border-t flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {azureProfileId ? 'Voice profile stored in Azure Speaker Recognition' : 'Voice samples stored locally'}
                </span>
                <Button variant="outline" size="sm" onClick={handleReset} className="text-destructive border-destructive/30">
                  <Trash2 className="h-4 w-4 mr-2" />Reset Enrollment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tips */}
        <Card>
          <CardHeader><CardTitle className="text-base">Tips for Best Recognition</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-2 text-sm text-muted-foreground">
              {[
                'Speak at a natural pace and volume',
                'Record in a quiet environment',
                'Read aloud — articles, emails, or documents work great',
                'Each sample should be at least 5 seconds of speech',
                'Multiple short samples are better than one long one',
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
      </div>
    </AppLayout>
  );
}
