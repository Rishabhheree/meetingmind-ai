import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/providers/auth-provider';
import { createMeeting, startMeeting, addParticipant } from '@/lib/db';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Mic2, Users } from 'lucide-react';

export default function NewMeetingPage() {
  const { user, profile } = useAuth();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
  const [speakerIdEnabled, setSpeakerIdEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setLoading(true);
    try {
      const meeting = await createMeeting({
        name,
        description: description || undefined,
        created_by: user.id,
        speaker_id_enabled: speakerIdEnabled,
        transcription_enabled: transcriptionEnabled,
      });
      await startMeeting(meeting.id);
      await addParticipant({ meeting_id: meeting.id, user_id: user.id, display_name: profile?.name || 'Host', is_host: true });
      navigate(`/meetings/${meeting.id}/room`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">New Meeting</h1>
          <p className="text-muted-foreground">Configure and start a new meeting session</p>
        </div>
        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mic2 className="h-5 w-5" />Meeting Details</CardTitle>
              <CardDescription>Set up your meeting with real-time transcription and speaker identification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label htmlFor="name">Meeting Name *</Label>
                <Input id="name" placeholder="e.g., Weekly Team Standup" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Optional meeting description or agenda..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="space-y-6 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Real-time Transcription</Label>
                    <p className="text-sm text-muted-foreground">Enable live speech-to-text transcription</p>
                  </div>
                  <Switch checked={transcriptionEnabled} onCheckedChange={setTranscriptionEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label>Speaker Identification</Label>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">AI Powered</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Identify enrolled speakers during transcription</p>
                  </div>
                  <Switch checked={speakerIdEnabled} onCheckedChange={setSpeakerIdEnabled} />
                </div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" />Meeting Host</div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                    {profile?.name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <div className="font-medium">{profile?.name || 'User'}</div>
                    <div className="text-sm text-muted-foreground">{profile?.email || user?.email}</div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/meetings')}>Cancel</Button>
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Start Meeting
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
