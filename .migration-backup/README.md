# MeetingMind AI

Enterprise meeting intelligence platform with real-time transcription, speaker identification, and AI-powered summaries.

## Features

- **Real-time Transcription** - Live speech-to-text using Azure Speech Services
- **Speaker Identification** - AI-powered voice recognition for enrolled speakers
- **Unknown Speaker Detection** - Automatic detection of unidentified speakers with confidence scores
- **AI Summaries** - Automated meeting summaries, key topics, and action item extraction
- **Voice Enrollment** - User voice profile creation for identification
- **Transcript Storage** - Cloud storage in Azure Blob Storage
- **Analytics Dashboard** - Insights into meeting metrics and recognition accuracy
- **User Management** - Admin controls for user enrollment and permissions

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS, ShadCN UI
- **Backend**: Next.js API Routes, Server Actions
- **Database**: Supabase (PostgreSQL with RLS)
- **Cloud Services**:
  - Azure Speech Services (transcription & speaker recognition)
  - Azure Blob Storage (transcript archival)
  - Azure OpenAI / OpenAI (AI summaries)

## Getting Started

### Prerequisites

1. Azure account with Speech Services and Storage
2. Supabase account (or self-hosted PostgreSQL)
3. OpenAI or Azure OpenAI access

### Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
# Azure Speech Services
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=eastus

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string
AZURE_STORAGE_CONTAINER=meetingmind-transcripts

# Azure OpenAI (or use OPENAI_API_KEY instead)
AZURE_OPENAI_KEY=your_azure_openai_key
AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint
AZURE_OPENAI_DEPLOYMENT=gpt-4

# Database (Supabase)
DATABASE_URL=your_supabase_database_url
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# NextAuth
NEXTAUTH_SECRET=your_nextauth_secret_minimum_32_characters
NEXTAUTH_URL=http://localhost:3000
```

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Microphone  │→ │  MediaStream │→ │  Azure Speech SDK    │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     Next.js Server                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    API Routes                            │ │
│  │  /api/meetings    /api/transcripts    /api/enrollment   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  Service Layer                           │ │
│  │  SpeechService    SpeakerRecognition    BlobStorage      │ │
│  │  SummaryService                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │                │                 │
         ▼                ▼                 ▼
┌─────────────┐  ┌─────────────┐    ┌─────────────┐
│   Supabase  │  │Azure Speech │    │Azure Blob   │
│  (PostgreSQL)│ │  Services   │    │  Storage    │
└─────────────┘  └─────────────┘    └─────────────┘
```

## Database Schema

### Core Tables

- **profiles** - User information extending Supabase auth users
- **speaker_profiles** - Voice enrollment metadata and Azure profile IDs
- **voice_enrollments** - Individual enrollment session records
- **meetings** - Meeting records with metadata
- **meeting_participants** - Link table for meeting attendees
- **transcripts** - Parent transcript records
- **transcript_segments** - Individual speaker turns with identification
- **meeting_summaries** - AI-generated meeting summaries
- **action_items** - Extracted action items

All tables have Row Level Security (RLS) enabled.

## API Endpoints

### Meetings
- `GET /api/meetings` - List meetings
- `POST /api/meetings` - Create meeting
- `GET /api/meetings/[id]` - Get meeting details
- `POST /api/meetings/[id]/start` - Start meeting
- `POST /api/meetings/[id]/end` - End meeting

### Transcripts
- `GET /api/transcripts` - List transcripts
- `POST /api/transcripts` - Save transcript segment
- `GET /api/transcripts/[id]` - Get transcript with export

### Users
- `GET /api/users` - List users (admin)
- `POST /api/users` - Create user (admin)
- `PUT /api/users/[id]` - Update user

### Enrollment
- `POST /api/enrollment` - Initialize enrollment
- `POST /api/enrollment/submit` - Submit voice sample
- `POST /api/enrollment/reset` - Reset enrollment

## Key Components

### Live Meeting Room (`/meetings/[id]/room`)
- Real-time transcription display
- Speaker identification with confidence scores
- Unknown speaker detection
- Recording controls
- Participant list

### Voice Enrollment (`/profile/enrollment`)
- Multi-sample voice recording
- Audio visualization
- Progress tracking (30 samples required)
- Azure profile creation

### Dashboard (`/dashboard`)
- Meeting statistics
- Recognition accuracy metrics
- Quick actions
- Recent meetings

### Analytics (`/analytics`)
- Time-based metrics (day/week/month/year)
- Speaker recognition rates
- Action item completion
- Meeting timeline visualization

## Deployment

### Vercel

```bash
vercel deploy
```

### Azure

Build and deploy to Azure App Service:

```bash
npm run build
# Deploy .next folder and dependencies
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

## Security

- Row Level Security (RLS) on all database tables
- Supabase Auth for user authentication
- Server-side API validation
- Input sanitization
- CORS configuration for Edge Functions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and lint
5. Submit a pull request

## License

MIT License - See LICENSE file for details
