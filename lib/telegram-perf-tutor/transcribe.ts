import OpenAI, { toFile } from 'openai';

const ALLOWED_EXT = new Set([
  'flac',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'm4a',
  'ogg',
  'opus',
  'wav',
  'webm',
]);

/** Telegram voice notes are often `.oga` — Whisper APIs reject that extension name. */
function whisperSafeFilename(filename: string): string {
  const base = (filename || 'voice').split(/[\\/]/).pop() || 'voice';
  const dot = base.lastIndexOf('.');
  const ext = (dot >= 0 ? base.slice(dot + 1) : '').toLowerCase();

  if (ext === 'oga' || ext === 'ogg' || ext === 'opus') return 'voice.ogg';
  if (ALLOWED_EXT.has(ext)) return `audio.${ext}`;
  // Telegram voice is Ogg Opus under the hood even when the name is odd.
  return 'voice.ogg';
}

/**
 * Transcribe a Telegram voice/audio buffer with Groq Whisper (preferred) or OpenAI Whisper.
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const safeName = whisperSafeFilename(filename);

  const attempts: Array<{
    label: string;
    client: OpenAI;
    model: string;
  }> = [];

  if (groqKey) {
    attempts.push({
      label: 'groq',
      client: new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' }),
      model: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
    });
  }
  if (openaiKey) {
    attempts.push({
      label: 'openai',
      client: new OpenAI({ apiKey: openaiKey }),
      model: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
    });
  }

  if (attempts.length === 0) {
    throw new Error('No GROQ_API_KEY or OPENAI_API_KEY for voice transcription');
  }

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      const file = await toFile(buffer, safeName, { type: 'audio/ogg' });
      const result = await attempt.client.audio.transcriptions.create({
        file,
        model: attempt.model,
        // No fixed language — works for English and mixed answers.
        prompt:
          'Performance testing and performance engineering vocabulary: latency, throughput, JMeter, k6, percentiles, SLA, bottleneck.',
      });
      const text = (result.text || '').trim();
      if (!text) throw new Error(`${attempt.label} returned empty transcript`);
      return text;
    } catch (err) {
      lastErr = err;
      console.error(`[transcribe] ${attempt.label} failed:`, err);
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Voice transcription failed');
}

export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = (await metaRes.json()) as {
    ok?: boolean;
    description?: string;
    result?: { file_path?: string; file_size?: number };
  };
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(meta.description || 'Could not get Telegram voice file');
  }

  const size = meta.result.file_size ?? 0;
  // Bot API getFile cap is 20 MB.
  if (size > 19 * 1024 * 1024) {
    throw new Error('Voice note is too large (max ~20 MB). Send a shorter note or type the answer.');
  }

  const filePath = meta.result.file_path;
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
  );
  if (!fileRes.ok) {
    throw new Error(`Telegram file download failed (${fileRes.status})`);
  }
  const arrayBuf = await fileRes.arrayBuffer();
  const base = filePath.split('/').pop() || 'voice.oga';
  return { buffer: Buffer.from(arrayBuf), filename: whisperSafeFilename(base) };
}
