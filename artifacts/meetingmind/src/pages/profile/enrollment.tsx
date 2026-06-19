import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  getAllVoiceUsers,
  addVoiceUser,
  deleteVoiceUser,
  getSpeakerProfile,
  updateSpeakerProfile,
  type VoiceUserRecord,
  type SpeakerProfileRecord,
} from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Mic, MicOff, Trash2, CheckCircle, Loader2, Plus, UserCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const SAMPLES_NEEDED = 5;

interface UserEntry {
  voiceUser: VoiceUserRecord;
  profile: SpeakerProfileRecord | undefined;
}

export default function VoiceEnrollmentPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    loadUsers();
  }, [user]);

  useEffect(() => () => stopHardware(), []);

  async function loadUsers() {
    setLoadingUsers(true);
    const vus = await getAllVoiceUsers();
    const entries = await Promise.all(
      vus.map(async (vu) => ({ voiceUser: vu, profile: await getSpeakerProfile(vu.id) }))
    );
    entries.sort((a, b) => a.voiceUser.name.localeCompare(b.voiceUser.name));
    setUsers(entries);
    setLoadingUsers(false);
  }

  function stopHardware() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  const selectedEntry = users.find((e) => e.voiceUser.id === selectedId);
  const sampleCount = selectedEntry?.profile?.enrollment_count ?? 0;
  const isEnrolled = (selectedEntry?.profile?.enrollment_status ?? 'pending') === 'enrolled';

  async function handleAddUser() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const vu = await addVoiceUser(name);
      const entry: UserEntry = { voiceUser: vu, profile: undefined };
      setUsers((prev) => [...prev, entry].sort((a, b) => a.voiceUser.name.localeCompare(b.voiceUser.name)));
      setNewName('');
      setSelectedId(vu.id);
      toast.success(`${name} added`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteUser(id: string, name: string) {
    await deleteVoiceUser(id);
    setUsers((prev) => prev.filter((e) => e.voiceUser.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast.success(`${name} removed`);
  }

  async function startRecording() {
    if (!selectedId || isEnrolled) return;
    setRecording(true);
    setRecordingTime(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000, channelCount: 1 },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;

      const tick = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

      const chunks: Blob[] = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => saveSample();
      recorder.start(100);
    } catch {
      toast.error('Microphone access denied');
      setRecording(false);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setRecording(false);
    setAudioLevel(0);
    setRecordingTime(0);
    setProcessing(true);
  }

  async function saveSample() {
    if (!selectedId) { setProcessing(false); return; }

    const existing = await getSpeakerProfile(selectedId);
    const newCount = (existing?.enrollment_count ?? 0) + 1;
    const enrolled = newCount >= SAMPLES_NEEDED;
    const newStatus = enrolled ? 'enrolled' : newCount >= 1 ? 'enrolling' : 'pending';

    await updateSpeakerProfile(selectedId, {
      enrollment_count: newCount,
      enrollment_status: newStatus,
      azure_profile_id: null,
      confidence: Math.min(0.95, newCount / SAMPLES_NEEDED),
    });

    const updated = await getSpeakerProfile(selectedId);
    setUsers((prev) =>
      prev.map((e) => e.voiceUser.id === selectedId ? { ...e, profile: updated } : e)
    );

    setProcessing(false);

    if (enrolled) {
      const name = users.find((e) => e.voiceUser.id === selectedId)?.voiceUser.name ?? 'User';
      toast.success(`${name} is now enrolled!`);
    } else {
      toast.success(`Sample ${newCount}/${SAMPLES_NEEDED} saved`);
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Voice Enrollment</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Add people and record 5 voice samples each so the system can identify them in meetings.
          </p>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">

          {/* ── Left: People list ── */}
          <div className="space-y-3">

            {/* Add user form */}
            <div className="flex gap-2">
              <Input
                placeholder="Person's name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                className="flex-1"
              />
              <Button onClick={handleAddUser} disabled={!newName.trim() || adding} size="icon" className="flex-shrink-0">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>

            {/* List */}
            {loadingUsers ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <UserCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Add a person to get started
              </div>
            ) : (
              <div className="space-y-1.5">
                {users.map(({ voiceUser, profile }) => {
                  const count = profile?.enrollment_count ?? 0;
                  const enrolled = profile?.enrollment_status === 'enrolled';
                  const isSelected = voiceUser.id === selectedId;
                  return (
                    <div
                      key={voiceUser.id}
                      onClick={() => setSelectedId(voiceUser.id)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                        enrolled ? 'bg-green-100 text-green-700' : isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}>
                        {voiceUser.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{voiceUser.name}</p>
                        <p className={cn(
                          'text-xs',
                          enrolled ? 'text-green-600 font-medium' : 'text-muted-foreground'
                        )}>
                          {enrolled ? '✓ Enrolled' : `${count}/${SAMPLES_NEEDED} samples`}
                        </p>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteUser(voiceUser.id, voiceUser.name); }}
                        className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1 rounded"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: Recorder ── */}
          <div>
            {!selectedEntry ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground rounded-xl border border-dashed border-border">
                <UserCircle2 className="h-10 w-10 mb-3 opacity-25" />
                <p className="text-sm">Select a person to start recording</p>
              </div>
            ) : isEnrolled ? (
              <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-green-200 bg-green-50">
                <CheckCircle className="h-14 w-14 text-green-500 mb-3" />
                <p className="text-lg font-semibold text-green-700">{selectedEntry.voiceUser.name} is enrolled</p>
                <p className="text-sm text-green-600 mt-1">All 5 samples recorded. Ready for speaker ID.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 text-destructive border-destructive/30"
                  onClick={() => handleDeleteUser(selectedEntry.voiceUser.id, selectedEntry.voiceUser.name)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />Remove
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Person header */}
                <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{selectedEntry.voiceUser.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Have them speak clearly into the mic for 5–15 seconds per sample
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteUser(selectedEntry.voiceUser.id, selectedEntry.voiceUser.name)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded"
                    title="Remove user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Progress: X / 5 */}
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {Array.from({ length: SAMPLES_NEEDED }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            'h-2.5 flex-1 rounded-full transition-all',
                            i < sampleCount ? 'bg-primary' : 'bg-muted'
                          )}
                          style={{ minWidth: 28 }}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                      {sampleCount} / {SAMPLES_NEEDED}
                    </span>
                  </div>

                  {/* Waveform */}
                  <div className="h-20 flex items-center justify-center gap-0.5 px-3 bg-muted/40 rounded-lg overflow-hidden">
                    {Array.from({ length: 40 }).map((_, i) => {
                      const live = recording && audioLevel > 2;
                      const phase = (i / 40) * Math.PI * 4;
                      const height = live
                        ? Math.max(8, Math.abs(Math.sin(phase + Date.now() / 300) * audioLevel * 0.7) + Math.random() * 12)
                        : 5;
                      return (
                        <div
                          key={i}
                          className={cn('w-1.5 rounded-full transition-all', recording ? 'bg-primary duration-75' : 'bg-muted-foreground/25 duration-300')}
                          style={{ height: `${Math.min(100, height)}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Status line */}
                  <div className="text-center text-sm text-muted-foreground min-h-[20px]">
                    {recording && (
                      <span className="flex items-center justify-center gap-2 text-foreground font-medium">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                        Recording… {recordingTime}s
                      </span>
                    )}
                    {processing && (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving sample…
                      </span>
                    )}
                    {!recording && !processing && sampleCount === 0 && (
                      <span>Press Start Recording when {selectedEntry.voiceUser.name} is ready to speak</span>
                    )}
                    {!recording && !processing && sampleCount > 0 && (
                      <span>{SAMPLES_NEEDED - sampleCount} more sample{SAMPLES_NEEDED - sampleCount !== 1 ? 's' : ''} needed</span>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex justify-center">
                    {!recording && !processing && (
                      <Button size="lg" onClick={startRecording} className="min-w-44 gap-2">
                        <Mic className="h-5 w-5" />
                        {sampleCount === 0 ? 'Start Recording' : 'Record Next Sample'}
                      </Button>
                    )}
                    {recording && (
                      <Button size="lg" variant="destructive" onClick={stopRecording} className="min-w-44 gap-2">
                        <MicOff className="h-5 w-5" />
                        Stop Recording
                      </Button>
                    )}
                    {processing && (
                      <Button size="lg" disabled className="min-w-44 gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Saving…
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
