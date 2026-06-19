import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'meetingmind-transcripts';

let containerClient: ContainerClient | null = null;

function getContainerClient(): ContainerClient {
  if (!containerClient && connectionString) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(containerName);
  }
  if (!containerClient) {
    throw new Error('Azure Storage not configured. Please set AZURE_STORAGE_CONNECTION_STRING');
  }
  return containerClient;
}

export interface UploadResult {
  blobUrl: string;
  blobName: string;
  size: number;
}

export async function uploadTranscript(
  meetingId: string,
  transcript: string | Buffer,
  contentType: string = 'application/json'
): Promise<UploadResult> {
  const client = getContainerClient();
  const blobName = `transcripts/${meetingId}/${new Date().toISOString()}.json`;
  const blockBlobClient = client.getBlockBlobClient(blobName);

  const content = typeof transcript === 'string' ? transcript : transcript;
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return {
    blobUrl: blockBlobClient.url,
    blobName,
    size: buffer.length,
  };
}

export async function uploadEnrollmentAudio(
  userId: string,
  enrollmentId: string,
  audioData: Buffer,
  contentType: string = 'audio/wav'
): Promise<UploadResult> {
  const client = getContainerClient();
  const blobName = `enrollments/${userId}/${enrollmentId}.wav`;
  const blockBlobClient = client.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(audioData, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return {
    blobUrl: blockBlobClient.url,
    blobName,
    size: audioData.length,
  };
}

export async function downloadTranscript(blobName: string): Promise<string> {
  const client = getContainerClient();
  const blockBlobClient = client.getBlockBlobClient(blobName);

  const downloadResponse = await blockBlobClient.download(0);
  const chunks: Buffer[] = [];

  for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

export async function deleteTranscript(blobName: string): Promise<void> {
  const client = getContainerClient();
  const blockBlobClient = client.getBlockBlobClient(blobName);
  await blockBlobClient.delete();
}

export async function listTranscripts(prefix?: string): Promise<{ name: string; url: string; lastModified: Date }[]> {
  const client = getContainerClient();
  const results: { name: string; url: string; lastModified: Date }[] = [];

  for await (const blob of client.listBlobsFlat({ prefix })) {
    results.push({
      name: blob.name,
      url: `${client.url}/${blob.name}`,
      lastModified: blob.properties.lastModified || new Date(),
    });
  }

  return results;
}

export async function ensureContainerExists(): Promise<void> {
  const client = getContainerClient();
  await client.createIfNotExists();
}
