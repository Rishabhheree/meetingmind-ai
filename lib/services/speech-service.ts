import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

const speechKey = process.env.AZURE_SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastus';

export interface TranscriptionConfig {
  language?: string;
  enableSpeakerId?: boolean;
  enableProfanityFilter?: boolean;
  onRecognizing?: (result: RecognitionResult) => void;
  onRecognized?: (result: RecognitionResult) => void;
  onError?: (error: string) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onSpeakerChanged?: (speakerId: string | null, confidence: number) => void;
}

export interface RecognitionResult {
  text: string;
  confidence: number;
  speakerId?: string;
  speakerName?: string;
  speakerConfidence?: number;
  isUnknownSpeaker?: boolean;
  offset: number;
  duration: number;
}

export interface SpeechServiceConfig {
  language: string;
  enableSpeakerDiarization: boolean;
}

export function createSpeechConfig(): SpeechSDK.SpeechConfig {
  if (!speechKey) {
    throw new Error('Azure Speech key not configured. Please set AZURE_SPEECH_KEY');
  }

  const config = SpeechSDK.SpeechConfig.fromSubscription(speechKey, speechRegion);
  config.speechRecognitionLanguage = 'en-US';
  return config;
}

export function createConversationTranscriber(
  config: TranscriptionConfig,
  audioStream?: MediaStream
): SpeechSDK.ConversationTranscriber {
  const speechConfig = createSpeechConfig();

  let audioConfig: SpeechSDK.AudioConfig;

  if (audioStream) {
    audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  } else {
    audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  }

  const transcriber = new SpeechSDK.ConversationTranscriber(speechConfig, audioConfig);

  transcriber.transcribing = (s, e) => {
    if (e.result.text && config.onRecognizing) {
      config.onRecognizing({
        text: e.result.text,
        confidence: 0,
        offset: e.result.offset / 10000,
        duration: e.result.duration / 10000,
        speakerId: e.result.speakerId || undefined,
      });
    }
  };

  transcriber.transcribed = (s, e) => {
    if (e.result.text && config.onRecognized) {
      config.onRecognized({
        text: e.result.text,
        confidence: 0,
        offset: e.result.offset / 10000,
        duration: e.result.duration / 10000,
        speakerId: e.result.speakerId || undefined,
        speakerName: e.result.speakerId || 'Unknown Speaker',
        isUnknownSpeaker: !e.result.speakerId,
      });
    }
  };

  transcriber.canceled = (s, e) => {
    if (config.onError) {
      config.onError(e.errorDetails || 'Transcription canceled');
    }
  };

  transcriber.sessionStarted = () => {
    if (config.onSessionStart) {
      config.onSessionStart();
    }
  };

  return transcriber;
}

// Speech recognition for enrollment audio processing
export async function processAudioBuffer(
  audioBuffer: ArrayBuffer,
  language: string = 'en-US'
): Promise<{ text: string; duration: number }> {
  const speechConfig = createSpeechConfig();

  const pushStream = SpeechSDK.AudioInputStream.createPushStream();
  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);

  pushStream.write(audioBuffer);
  pushStream.close();

  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        if (result.text) {
          resolve({
            text: result.text,
            duration: result.duration / 10000,
          });
        } else {
          reject(new Error('No speech detected'));
        }
      },
      (error) => {
        recognizer.close();
        reject(new Error(error));
      }
    );
  });
}

// Real-time transcription wrapper for meeting sessions
export class RealTimeTranscriber {
  private transcriber: SpeechSDK.ConversationTranscriber | null = null;
  private isActive = false;

  async start(config: TranscriptionConfig): Promise<void> {
    this.transcriber = createConversationTranscriber(config);
    this.isActive = true;
    await this.transcriber.startTranscribingAsync();
  }

  async stop(): Promise<void> {
    if (this.transcriber && this.isActive) {
      await this.transcriber.stopTranscribingAsync();
      this.transcriber.close();
      this.transcriber = null;
      this.isActive = false;
    }
  }

  isActiveState(): boolean {
    return this.isActive;
  }
}

// Validate speech services connection
export async function validateSpeechConnection(): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const config = createSpeechConfig();
    const recognizer = new SpeechSDK.SpeechRecognizer(config);
    recognizer.close();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
