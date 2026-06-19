import { createClient } from '@supabase/supabase-js';

const openaiKey = process.env.AZURE_OPENAI_KEY || process.env.OPENAI_API_KEY;
const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';

export interface SummaryResult {
  summary: string;
  keyTopics: string[];
  decisions: string[];
  actionItems: ActionItemFromAI[];
  sentiment: string;
  processingTime: number;
  tokensUsed: number;
}

export interface ActionItemFromAI {
  title: string;
  description: string;
  assigned_to?: string;
  due_date?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface TranscriptSegment {
  speaker_name: string;
  text: string;
  timestamp: string;
}

async function generateWithOpenAI(prompt: string): Promise<{ content: string; tokens: number }> {
  const startTime = Date.now();

  // Check if using Azure OpenAI
  if (openaiEndpoint && process.env.AZURE_OPENAI_KEY) {
    const response = await fetch(
      `${openaiEndpoint}/openai/deployments/${openaiDeployment}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: {
          'api-key': process.env.AZURE_OPENAI_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are an expert meeting analyst. Extract insights from transcripts in JSON format.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Azure OpenAI request failed: ${await response.text()}`);
    }

    const result = await response.json();
    return {
      content: result.choices[0].message.content,
      tokens: result.usage?.total_tokens || 0,
    };
  }

  // Fallback to standard OpenAI
  if (process.env.OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert meeting analyst. Extract insights from transcripts in JSON format.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${await response.text()}`);
    }

    const result = await response.json();
    return {
      content: result.choices[0].message.content,
      tokens: result.usage?.total_tokens || 0,
    };
  }

  throw new Error('No OpenAI/Azure OpenAI credentials configured');
}

export async function generateSummary(
  meetingId: string,
  transcript: TranscriptSegment[]
): Promise<SummaryResult> {
  const startTime = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create a pending summary record
  const { data: summaryRecord, error: summaryError } = await supabase
    .from('meeting_summaries')
    .insert({
      meeting_id: meetingId,
      summary: '',
      key_topics: [],
      decisions: [],
      action_items: [],
      status: 'processing',
    })
    .select()
    .single();

  if (summaryError || !summaryRecord) {
    throw new Error('Failed to create summary record');
  }

  try {
    // Format transcript for prompt
    const transcriptText = transcript
      .map((seg) => `[${seg.timestamp}] ${seg.speaker_name}: ${seg.text}`)
      .join('\n');

    const prompt = `Analyze this meeting transcript and extract:

1. A concise summary (2-3 paragraphs)
2. Key topics discussed (as array of strings)
3. Decisions made (as array of strings)
4. Action items (as array of objects with: title, description, priority)
5. Overall sentiment (positive/neutral/negative)

Transcript:
${transcriptText}

Respond ONLY with a JSON object in this exact format:
{
  "summary": "...",
  "keyTopics": ["topic1", "topic2"],
  "decisions": ["decision1", "decision2"],
  "actionItems": [{"title": "...", "description": "...", "priority": "medium"}],
  "sentiment": "neutral"
}`;

    const result = await generateWithOpenAI(prompt);

    // Parse the JSON response
    const parsed = JSON.parse(result.content);

    const summaryData: SummaryResult = {
      summary: parsed.summary || '',
      keyTopics: parsed.keyTopics || [],
      decisions: parsed.decisions || [],
      actionItems: (parsed.actionItems || []).map((item: { title: string; description?: string; priority?: string }) => ({
        title: item.title,
        description: item.description || '',
        priority: item.priority || 'medium',
      })),
      sentiment: parsed.sentiment || 'neutral',
      processingTime: (Date.now() - startTime) / 1000,
      tokensUsed: result.tokens,
    };

    // Update summary record
    await supabase
      .from('meeting_summaries')
      .update({
        summary: summaryData.summary,
        key_topics: summaryData.keyTopics,
        decisions: summaryData.decisions,
        action_items: summaryData.actionItems,
        sentiment: summaryData.sentiment,
        processing_time_seconds: summaryData.processingTime,
        tokens_used: summaryData.tokensUsed,
        model_used: openaiDeployment,
        status: 'completed',
      })
      .eq('id', summaryRecord.id);

    // Create action items in database
    for (const item of summaryData.actionItems) {
      await supabase.from('action_items').insert({
        meeting_id: meetingId,
        summary_id: summaryRecord.id,
        title: item.title,
        description: item.description,
        priority: item.priority,
        status: 'pending',
      });
    }

    return summaryData;
  } catch (error) {
    // Mark as failed
    await supabase.from('meeting_summaries').update({ status: 'failed' }).eq('id', summaryRecord.id);

    throw error;
  }
}

export async function extractActionItems(transcript: TranscriptSegment[]): Promise<ActionItemFromAI[]> {
  const transcriptText = transcript
    .map((seg) => `${seg.speaker_name}: ${seg.text}`)
    .join('\n');

  const prompt = `Extract action items from this conversation.
For each action item, identify:
- The task to be done
- Who should do it (if mentioned)
- Urgency level (low/medium/high/urgent)

Transcript:
${transcriptText}

Respond ONLY with a JSON array:
[{"title": "...", "description": "...", "assigned_to": "...", "priority": "medium"}]`;

  const result = await generateWithOpenAI(prompt);
  return JSON.parse(result.content);
}

export async function summarizeTranscript(transcriptText: string): Promise<string> {
  const prompt = `Summarize this meeting transcript in 2-3 paragraphs:

${transcriptText}`;

  const result = await generateWithOpenAI(prompt);
  return result.content;
}
