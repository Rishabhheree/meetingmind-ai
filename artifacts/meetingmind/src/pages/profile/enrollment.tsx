import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/supabase-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, MicOff, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type EnrollmentStatus = 'idle' | 'initializing' | 'recording' | 'processing' | 'success' | 'error';

export default function VoiceEnrollmentPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<EnrollmentStatus>('idle');
  const [enrollmentProgress, setEnrollmentProgress] = useState(0);
  const [remainingEnrollments, setRemainingEnrollments] = useState(30);
  const [enrollmentStatus, setEnrollmentStatus] = useState<'enrolled' | 'enrolling' | 'pending' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    async function loadEnrollmentStatus() {
      try {
        const res = await fetch('/api/enrollment/status');
        const data = await res.json();
        if (data.profile) {
          setEnrollmentStatus(data.profile.enrollment_status);
          setEnrollmentProgress(data.profile.enrollment_count || 0);
          setRemainingEnrollments(30 - (data.profile.enrollment_count || 0));
        }
      } catch { /* ignore */ }
    }
    if (user) loadEnrollmentStatus();
  }, [user]);

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const initializeAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000, channelCount: 1 } });
      mediaStreamRef.current = stream;
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      const monitorLevel = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        setAudioLevel(dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length);
        animationFrameRef.current = requestAnimationFrame(monitorLevel);
      };
      monitorLevel();
      return stream;
    } catch {
      setError('Microphone access denied. Please enable microphone permissions.');
      throw new Error('Mic denied');
    }
  };

  const initializeEnrollment = async () => {
    setStatus('initializing');
    setError(null);
    try {
      const res = await fetch('/api/enrollment', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await startRecording();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize enrollment');
      setStatus('error');
    }
  };

  const startRecording = async () => {
    setStatus('recording');
    try {
      const stream = await initializeAudio();
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream!, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      const startTime = Date.now();
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        setStatus('processing');
        const duration = Date.now() - startTime;
        if (duration < 1000) { setError('Recording too short. Please speak for at least 1 second.'); setStatus('error'); return; }
        await submitEnrollment(new Blob(chunks, { type: 'audio/webm' }));
      };
      mediaRecorder.start();
      setTimeout(() => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setStatus('error');
    }
  };

  const submitEnrollment = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'enrollment.wav');
      const res = await fetch('/api/enrollment/submit', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEnrollmentProgress((prev) => prev + 1);
      setRemainingEnrollments(data.remainingEnrollments ?? remainingEnrollments - 1);
      setEnrollmentStatus(data.enrollmentStatus);
      setStatus('success');
      setTimeout(() => { setStatus('idle'); }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
      setStatus('error');
    }
  };

  const resetEnrollment = async () => {
    if (!confirm('This will delete your voice profile. Continue?')) return;
    try {
      await fetch('/api/enrollment/reset', { method: 'POST' });
      setEnrollmentProgress(0);
      setRemainingEnrollments(30);
      setEnrollmentStatus('pending');
      setStatus('idle');
    } catch { setError('Failed to reset enrollment'); }
  };

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voice Enrollment</h1>
          <p className="text-muted-foreground">Enroll your voice to enable speaker identification during meetings</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{enrollmentProgress}</div><p className="text-sm text-muted-foreground">Samples Recorded</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{remainingEnrollments}</div><p className="text-sm text-muted-foreground">Samples Remaining</p></CardContent></Card>
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
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Enrollment Progress</span>
              <Badge variant={enrollmentProgress >= 30 ? 'default' : 'secondary'}>{Math.round((enrollmentProgress / 30) * 100)}%</Badge>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (enrollmentProgress / 30) * 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice Recording</CardTitle>
            <CardDescription>Record multiple voice samples to complete your enrollment. Speak clearly and naturally.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="waveform-container">
              {[...Array(40)].map((_, i) => (
                <div
                  key={i}
                  className={cn('w-1 rounded-full transition-all duration-75', status === 'recording' ? 'bg-primary' : 'bg-secondary-foreground/20')}
                  style={{ height: status === 'recording' ? `${Math.min(100, audioLevel * 0.5 + Math.random() * 20)}%` : '20%' }}
                />
              ))}
            </div>

            {status === 'recording' && (
              <div className="text-center">
                <div className="recording-pulse mx-auto mb-4" />
                <p className="font-medium">Recording... Speak naturally</p>
                <p className="text-sm text-muted-foreground">Recording will stop automatically after 10 seconds</p>
              </div>
            )}
            {status === 'processing' && (
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="font-medium">Processing voice sample...</p>
              </div>
            )}
            {status === 'success' && (
              <div className="text-center">
                <CheckCircle className="h-8 w-8 mx-auto mb-4 text-green-500" />
                <p className="font-medium text-green-600">Voice sample recorded successfully!</p>
                <p className="text-sm text-muted-foreground">{remainingEnrollments > 0 ? `${remainingEnrollments} more samples needed` : 'Enrollment complete!'}</p>
              </div>
            )}

            <div className="flex items-center justify-center gap-4">
              {status === 'idle' && enrollmentStatus !== 'enrolled' && (
                <Button size="lg" onClick={initializeEnrollment} className="min-w-40">
                  <Mic className="h-5 w-5 mr-2" />
                  {enrollmentProgress === 0 ? 'Start Enrollment' : 'Record Next Sample'}
                </Button>
              )}
              {status === 'recording' && (
                <Button size="lg" variant="destructive" onClick={() => { if (mediaRecorderRef.current) mediaRecorderRef.current.stop(); }} className="min-w-40">
                  <MicOff className="h-5 w-5 mr-2" />Stop Recording
                </Button>
              )}
              {(status === 'error' || status === 'success') && (
                <Button size="lg" onClick={() => { setError(null); setStatus('idle'); }} className="min-w-40">
                  {status === 'error' ? 'Try Again' : 'Record Next Sample'}
                </Button>
              )}
            </div>

            {enrollmentProgress > 0 && (
              <div className="pt-4 border-t">
                <Button variant="outline" size="sm" onClick={resetEnrollment} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />Reset Enrollment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Enrollment Tips</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Speak naturally and at a normal pace</li>
              <li>Record in a quiet environment with minimal background noise</li>
              <li>Use a good quality microphone for best results</li>
              <li>Each sample should be at least 1 second long</li>
              <li>You need approximately 30 samples for optimal recognition</li>
              <li>You can record samples across multiple sessions</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
