import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URIs
};

/**
 * Debug Chat API — a dedicated endpoint for the debug console page.
 * Accepts text messages with optional base64 images and returns a streaming
 * response from a vision-capable LLM.
 *
 * Provider chain:
 *   1. OpenAI gpt-4o-mini (vision-capable)
 *   2. Gemini 2.5 Flash Lite via OpenAI-compat endpoint (vision-capable, free)
 *   3. Bluesminds gpt-4o (vision-capable)
 *
 * Images are sent inline as base64 data URIs in the OpenAI vision format.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body as { messages: ChatMessage[] };

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Validate images server-side (size + MIME)
    for (const msg of messages) {
      if (msg.images?.length) {
        for (const img of msg.images) {
          if (!img.startsWith('data:image/')) {
            return NextResponse.json(
              { error: 'Invalid image format — must be a base64 data URI with image MIME type' },
              { status: 400 },
            );
          }
          // Check size: base64 is ~1.37x binary, so 15MB base64 ≈ 11MB binary
          const base64Size = new TextEncoder().encode(img).length;
          if (base64Size > 15 * 1024 * 1024) {
            return NextResponse.json(
              { error: 'Image too large. Max 11MB per image.' },
              { status: 400 },
            );
          }
        }
      }
    }

    // Convert our message format to OpenAI's chat completion format.
    // When a message has images, use the multi-modal content array format.
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((msg) => {
      if (msg.role === 'user' && msg.images?.length) {
        const content: OpenAI.Chat.ChatCompletionContentPart[] = [
          { type: 'text' as const, text: msg.content || 'What do you see in this image?' },
          ...msg.images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img },
          })),
        ];
        return { role: 'user' as const, content };
      }
      return { role: msg.role, content: msg.content };
    });

    // System prompt for the debug assistant
    const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
      role: 'system',
      content:
        'You are a debugging assistant for the Hyred job-search platform. ' +
        'You help the developer (Shashank) debug issues by analyzing screenshots, error messages, ' +
        'and code snippets. Be concise, direct, and practical. When you see an error in a screenshot, ' +
        'explain what it means and suggest the fix. You have full context about the Hyred codebase ' +
        '(Next.js 15, Supabase, Groq/OpenAI LLMs, job ingest pipeline, ATS resume builder).',
    };

    const fullMessages = [systemMessage, ...openaiMessages];

    // ── Try providers in order ──────────────────────────────────────────
    const providers = [
      { name: 'OpenAI', getClient: () => tryCreateOpenAI(), model: process.env.OPENAI_MODEL || 'gpt-4o-mini' },
      { name: 'Gemini', getClient: () => tryCreateGemini(), model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite' },
      { name: 'Bluesminds', getClient: () => tryCreateBluesminds(), model: 'gpt-4o' },
    ];

    let lastError: string | null = null;

    for (const provider of providers) {
      const client = provider.getClient();
      if (!client) {
        lastError = `${provider.name}: no API key configured`;
        continue;
      }

      try {
        // Try a non-streaming call first (simpler for image-heavy payloads)
        const response = await client.chat.completions.create({
          model: provider.model,
          messages: fullMessages,
          max_tokens: 2048,
          temperature: 0.3,
        });

        const text = response.choices[0]?.message?.content?.trim() || '';

        return NextResponse.json({
          content: text,
          model: `${provider.name} ${provider.model}`,
          usage: {
            prompt_tokens: response.usage?.prompt_tokens ?? 0,
            completion_tokens: response.usage?.completion_tokens ?? 0,
          },
        });
      } catch (e) {
        lastError = `${provider.name}: ${(e as Error).message}`;
        console.warn(`[debug-chat] ${lastError}, trying next provider...`);
        continue;
      }
    }

    return NextResponse.json(
      { error: `All providers failed. ${lastError}` },
      { status: 500 },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function tryCreateOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function tryCreateGemini(): OpenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
  });
}

function tryCreateBluesminds(): OpenAI | null {
  const key = process.env.BLUESMINDS_API_KEY;
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: 'https://api.bluesminds.com/v1',
  });
}
