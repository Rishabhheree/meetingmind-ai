import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import { getSpeakerProfile, updateSpeakerProfile, resetSpeakerProfile } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, MicOff, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Status = 'idle' | 'recording' | 'processing' | 'success' | 'error';

export default function VoiceEnrollmentPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [enrollmentStatus, setEnrollmentStatus] = useState<'pending' | 'enrolling' | 'enrolled'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    getSpeakerProfile(user.id).then((sp) => {
      if (sp) {
        setProgress(sp.enrollment_count);
        setEnrollmentStatus(sp.enrollment_status);
      }
    });
  }, [user]);

  useEffect(() => () => {
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const startRecording = async () => {
    setStatus('recording');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const monitor = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length);
        animFrameRef.current = requestAnimationFrame(monitor);
      };
      monitor();

      const chunks: Blob[] = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        setStatus('processing');
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        stream.getTracks().forEach((t) => t.stop());

        // Simulate submission — increment count
        if (!user) return;
        const sp = await getSpeakerProfile(user.id);
        const newCount = (sp?.enrollment_count || 0) + 1;
        const newStatus = newCount >= 30 ? 'enrolled' : newCount >= 5 ? 'enrolling' : 'pending';
        await updateSpeakerProfile(user.id, { enrollment_count: newCount, enrollment_status: newStatus, confidence: Math.min(0.95, 0.5 + newCount * 0.015) });
        setProgress(newCount);
        setEnrollmentStatus(newStatus);
        setStatus('success');
        setTimeout(() => setStatus('idle'), 2000);
      };

      recorder.start();
      setTimeout(() => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); }, 10000);
    } catch {
      setError('Microphone access denied. Please enable microphone permissions.');
      setStatus('error');
    }
  };

  const handleReset = async () => {
    if (!user || !confirm('Reset your voice enrollment? This will delete all samples.')) return;
    await resetSpeakerProfile(user.id);
    setProgress(0);
    setEnrollmentStatus('pending');
    setStatus('idle');
    toast.success('Voice enrollment reset');
  };

  const remaining = Math.max(0, 30 - progress);

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voice Enrollment</h1>
          <p className="text-muted-foreground">Enroll your voice to enable speaker identification during meetings</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{progress}</div><p className="text-sm text-muted-foreground">Samples Recorded</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{remaining}</div><p className="text-sm text-muted-foreground">Samples Remaining</p></CardContent></Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {enrollmentStatus === 'enrolled' ? <span className="text-green-600">Enrolled</span> : enrollmentStatus === 'enrolling' ? <span className="text-yellow-600">In Progress</span> : <span>Pending</span>}
              </div>
              <p className="text-sm text-muted-foreground">Status</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Enrollment Progress</span>
              <Badge variant={progress >= 30 ? 'default' : 'secondary'}>{Math.round((progress / 30) * 100)}%</Badge>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (progress / 30) * 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice Recording</CardTitle>
            <CardDescription>Record multiple voice samples. Speak clearly and naturally for 1–10 seconds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="waveform-container">
              {[...Array(40)].map((_, i) => (
                <div
                  key={i}
                  className={cn('w-1 rounded-full transition-all duration-75', status === 'recording' ? 'bg-primary' : 'bg-muted-foreground/20')}
                  style={{ height: status === 'recording' ? `${Math.min(100, audioLevel * 0.5 + Math.random() * 20)}%` : '20%' }}
                />
              ))}
            </div>

            <div className="text-center space-y-2">
              {status === 'recording' && (
                <>
                  <div className="recording-pulse mx-auto" />
                  <p className="font-medium">Recording… speak naturally</p>
                  <p className="text-sm text-muted-foreground">Auto-stops after 10 seconds</p>
                </>
              )}
              {status === 'processing' && (
                <><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /><p className="font-medium">Processing sample…</p></>
              )}
              {status === 'success' && (
                <><CheckCircle className="h-8 w-8 mx-auto text-green-500" /><p className="font-medium text-green-600">Sample recorded!</p><p className="text-sm text-muted-foreground">{remaining > 0 ? `${remaining} more needed` : 'Enrollment complete!'}</p></>
              )}
            </div>

            <div className="flex items-center justify-center gap-4">
              {(status === 'idle' || status === 'success' || status === 'error') && enrollmentStatus !== 'enrolled' && (
                <Button size="lg" onClick={() => { setError(null); startRecording(); }} className="min-w-40">
                  <Mic className="h-5 w-5 mr-2" />{progress === 0 ? 'Start Enrollment' : 'Record Next Sample'}
                </Button>
              )}
              {status === 'recording' && (
                <Button size="lg" variant="destructive" onClick={() => mediaRecorderRef.current?.stop()} className="min-w-40">
                  <MicOff className="h-5 w-5 mr-2" />Stop Recording
                </Button>
              )}
              {enrollmentStatus === 'enrolled' && status !== 'recording' && (
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
                  <p className="font-medium text-green-600">Voice enrollment complete!</p>
                  <p className="text-sm text-muted-foreground">You will be identified in meetings automatically.</p>
                </div>
              )}
            </div>

            {progress > 0 && (
              <div className="pt-4 border-t">
                <Button variant="outline" size="sm" onClick={handleReset} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />Reset Enrollment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tips for Best Results</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {['Speak naturally at a normal pace', 'Record in a quiet environment', 'Use a quality microphone', 'Each sample should be at least 1 second', 'You need ~30 samples for best recognition', 'You can record across multiple sessions'].map((tip) => (
                <li key={tip} className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{tip}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
