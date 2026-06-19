import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

// ── Environment ───────────────────────────────────────────────────────────────
// Set these in your Replit Secrets (or .env file for local dev)
const SPEECH_KEY = import.meta.env.VITE_AZURE_SPEECH_KEY as string | undefined;
const SPEECH_REGION = import.meta.env.VITE_AZURE_SPEECH_REGION as string | undefined;

export const AZURE_CONFIGURED = Boolean(SPEECH_KEY && SPEECH_REGION);

function requireEnv() {
  if (!SPEECH_KEY || !SPEECH_REGION) {
    throw new Error(
      'Azure Speech Services not configured. Set VITE_AZURE_SPEECH_KEY and VITE_AZURE_SPEECH_REGION in Replit Secrets.'
    );
  }
  return { key: SPEECH_KEY, region: SPEECH_REGION };
}

// ── WAV Converter ─────────────────────────────────────────────────────────────
// Azure Speaker Recognition requires PCM WAV at 16 kHz mono 16-bit

export async function convertToWav(audioBlob: Blob, targetSampleRate = 16000): Promise<Blob> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: targetSampleRate });
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }

  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetSampleRate), targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();

  const pcm = rendered.getChannelData(0);
  const wavBuffer = encodeWavPcm(pcm, targetSampleRate);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function encodeWavPcm(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);     // chunk size
  view.setUint16(20, 1, true);      // PCM
  view.setUint16(22, 1, true);      // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);      // block align
  view.setUint16(34, 16, true);     // bits per sample
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return buffer;
}

// ── Speaker Recognition REST API ──────────────────────────────────────────────

const SPEAKER_BASE = (region: string) =>
  `https://${region}.api.cognitive.microsoft.com/speaker/identification/v2.0/text-independent/profiles`;

export interface SpeakerProfileStatus {
  profileId: string;
  locale: string;
  enrollmentsCount: number;
  enrollmentsSpeechLength: number;
  remainingEnrollmentsCount: number;
  remainingEnrollmentsSpeechLength: number;
  enrollmentStatus: 'Enrolling' | 'Training' | 'Enrolled';
}

export async function createSpeakerProfile(locale = 'en-us'): Promise<string> {
  const { key, region } = requireEnv();
  const res = await fetch(SPEAKER_BASE(region), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ locale }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure create profile failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.profileId as string;
}

export async function enrollSpeakerProfile(
  profileId: string,
  audioBlob: Blob
): Promise<SpeakerProfileStatus> {
  const { key, region } = requireEnv();
  const wavBlob = await convertToWav(audioBlob);
  const res = await fetch(`${SPEAKER_BASE(region)}/${profileId}/enrollments`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
    },
    body: wavBlob,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure enrollment failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SpeakerProfileStatus>;
}

export async function getSpeakerProfileStatus(profileId: string): Promise<SpeakerProfileStatus> {
  const { key, region } = requireEnv();
  const res = await fetch(`${SPEAKER_BASE(region)}/${profileId}`, {
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  if (!res.ok) throw new Error(`Azure get profile failed (${res.status})`);
  return res.json() as Promise<SpeakerProfileStatus>;
}

export async function deleteSpeakerProfile(profileId: string): Promise<void> {
  const { key, region } = requireEnv();
  await fetch(`${SPEAKER_BASE(region)}/${profileId}`, {
    method: 'DELETE',
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
}

// ── Real-time Transcription with Speaker Identification ───────────────────────

export interface EnrolledParticipant {
  name: string;
  azureProfileId: string;
  language?: string;
}

export interface TranscribedSegment {
  speakerName: string;
  speakerId: string;
  text: string;
  confidence: number;
  isUnknown: boolean;
  offsetSeconds: number;
  isFinal: boolean;
}

export interface AzureTranscriber {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggleMute: (muted: boolean) => void;
}

export function createAzureTranscriber(params: {
  participants: EnrolledParticipant[];
  language?: string;
  onSegment: (segment: TranscribedSegment) => void;
  onError: (error: string) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'stopped' | 'error') => void;
}): AzureTranscriber {
  const { key, region } = requireEnv();
  const { participants, language = 'en-US', onSegment, onError, onStatusChange } = params;

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = language;
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceResponse_DiarizeIntermediateResults,
    'true'
  );

  const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();

  let conversationTranscriber: sdk.ConversationTranscriber | null = null;
  let conversation: sdk.Conversation | null = null;
  let stream: MediaStream | null = null;

  const buildSpeakerMap = () => {
    const map: Record<string, string> = {};
    for (const p of participants) {
      map[p.azureProfileId] = p.name;
    }
    return map;
  };

  return {
    async start() {
      onStatusChange('connecting');
      try {
        // Request mic permissions first (shows browser prompt)
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
        });

        const speakerMap = buildSpeakerMap();

        if (participants.length > 0) {
          // ConversationTranscriber mode — with enrolled speaker profiles
          conversation = await sdk.Conversation.createConversationAsync(
            speechConfig,
            `meetingmind_${Date.now()}`
          );

          for (const p of participants) {
            const participant = sdk.Participant.From(p.name, p.language || language, p.azureProfileId);
            await conversation.addParticipantAsync(participant);
          }

          conversationTranscriber = new sdk.ConversationTranscriber(speechConfig, audioConfig);
          await conversationTranscriber.joinConversationAsync(conversation);

          let startTime = Date.now();

          conversationTranscriber.transcribing = (_s, e) => {
            if (!e.result.text) return;
            const speakerName = speakerMap[e.result.speakerId] || e.result.speakerId || 'Unknown Speaker';
            onSegment({
              speakerName,
              speakerId: e.result.speakerId || '',
              text: e.result.text,
              confidence: 0,
              isUnknown: !speakerMap[e.result.speakerId],
              offsetSeconds: (Date.now() - startTime) / 1000,
              isFinal: false,
            });
          };

          conversationTranscriber.transcribed = (_s, e) => {
            if (e.result.reason !== sdk.ResultReason.RecognizedSpeech || !e.result.text) return;
            const speakerName = speakerMap[e.result.speakerId] || e.result.speakerId || 'Unknown Speaker';
            const confidence = e.result.properties
              ? parseFloat(e.result.properties.getProperty('Confidence') || '0')
              : 0;
            onSegment({
              speakerName,
              speakerId: e.result.speakerId || '',
              text: e.result.text,
              confidence: isNaN(confidence) ? 0.9 : confidence,
              isUnknown: !speakerMap[e.result.speakerId],
              offsetSeconds: e.result.offset / 10_000_000,
              isFinal: true,
            });
          };

          conversationTranscriber.canceled = (_s, e) => {
            if (e.reason === sdk.CancellationReason.Error) {
              onError(`Azure Speech error: ${e.errorDetails}`);
              onStatusChange('error');
            }
          };

          await conversationTranscriber.startTranscribingAsync();
        } else {
          // SpeechRecognizer mode — no enrolled profiles, show diarization labels
          const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
          const startTime = Date.now();
          const guestMap: Record<string, string> = {};
          let guestCount = 0;

          recognizer.recognizing = (_s, e) => {
            if (!e.result.text) return;
            onSegment({
              speakerName: 'Transcribing…',
              speakerId: '',
              text: e.result.text,
              confidence: 0,
              isUnknown: true,
              offsetSeconds: (Date.now() - startTime) / 1000,
              isFinal: false,
            });
          };

          recognizer.recognized = (_s, e) => {
            if (e.result.reason !== sdk.ResultReason.RecognizedSpeech || !e.result.text) return;
            onSegment({
              speakerName: 'Speaker',
              speakerId: '',
              text: e.result.text,
              confidence: 0.9,
              isUnknown: false,
              offsetSeconds: e.result.offset / 10_000_000,
              isFinal: true,
            });
          };

          recognizer.canceled = (_s, e) => {
            if (e.reason === sdk.CancellationReason.Error) {
              onError(`Azure Speech error: ${e.errorDetails}`);
              onStatusChange('error');
            }
          };

          await recognizer.startContinuousRecognitionAsync();
          (conversationTranscriber as any) = recognizer as any;
        }

        onStatusChange('connected');
      } catch (err) {
        stream?.getTracks().forEach((t) => t.stop());
        onError(err instanceof Error ? err.message : 'Failed to start transcription');
        onStatusChange('error');
      }
    },

    async stop() {
      try {
        if (conversation && conversationTranscriber && 'stopTranscribingAsync' in conversationTranscriber) {
          await conversationTranscriber.stopTranscribingAsync();
        } else if (conversationTranscriber && 'stopContinuousRecognitionAsync' in conversationTranscriber) {
          await (conversationTranscriber as any).stopContinuousRecognitionAsync();
        }
        conversationTranscriber?.close();
        stream?.getTracks().forEach((t) => t.stop());
        onStatusChange('stopped');
      } catch {
        // ignore stop errors
      }
    },

    toggleMute(muted: boolean) {
      stream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    },
  };
}

// ── Fallback (no Azure keys) ──────────────────────────────────────────────────
// Returns a mock transcriber that uses the Web Speech API

export function createFallbackTranscriber(params: {
  displayName: string;
  onSegment: (segment: TranscribedSegment) => void;
  onError: (error: string) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'stopped' | 'error') => void;
}): AzureTranscriber {
  const { displayName, onSegment, onError, onStatusChange } = params;
  let recognition: SpeechRecognition | null = null;
  let stream: MediaStream | null = null;
  let startTime = 0;

  const SpeechRecognitionImpl =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  return {
    async start() {
      onStatusChange('connecting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!SpeechRecognitionImpl) {
          onError('Web Speech API not supported in this browser. Add Azure credentials for real transcription.');
          onStatusChange('error');
          return;
        }
        recognition = new SpeechRecognitionImpl();
        recognition!.continuous = true;
        recognition!.interimResults = true;
        recognition!.lang = 'en-US';
        startTime = Date.now();

        recognition!.onresult = (e: SpeechRecognitionEvent) => {
          const result = e.results[e.resultIndex];
          const text = result[0].transcript;
          const isFinal = result.isFinal;
          onSegment({
            speakerName: displayName,
            speakerId: 'local',
            text,
            confidence: result[0].confidence || 0.9,
            isUnknown: false,
            offsetSeconds: (Date.now() - startTime) / 1000,
            isFinal,
          });
        };

        recognition!.onerror = (e: SpeechRecognitionErrorEvent) => {
          if (e.error !== 'no-speech') {
            onError(`Speech recognition error: ${e.error}`);
          }
        };

        recognition!.start();
        onStatusChange('connected');
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Microphone access denied');
        onStatusChange('error');
      }
    },

    async stop() {
      recognition?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      onStatusChange('stopped');
    },

    toggleMute(muted: boolean) {
      stream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    },
  };
}
