// Portfolio assistant — a standalone Vercel Function (Node.js runtime, Web Request/Response).
// Answers only from /assistant-facts.json, which the site build generates from src/content.
import Anthropic from '@anthropic-ai/sdk';
import { createRateLimiter, validateAskBody } from '../src/lib/ask-guard.js';

// Claude Opus 5.5 by default; set ASK_MODEL=claude-haiku-5-5 for a much cheaper assistant.
const MODEL = process.env.ASK_MODEL || 'claude-opus-5-5';
// Server-side refusal fallback is available on these models (not on Haiku).
const SUPPORTS_FALLBACK = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL);

const limiter = createRateLimiter();
let client;
let systemPrompt;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

async function loadSystemPrompt(origin) {
  if (!systemPrompt) {
    const response = await fetch(new URL('/assistant-facts.json', origin));
    if (!response.ok) throw new Error(`Facts unavailable (${response.status})`);
    systemPrompt = (await response.json()).system;
  }
  return systemPrompt;
}

export async function POST(request) {
  if (process.env.ASK_ENABLED !== 'true' || !process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'The assistant is switched off right now.' });
  }

  const origin = new URL(request.url).origin;
  const caller = request.headers.get('origin');
  if (caller && caller !== origin) return json(403, { error: 'Not allowed.' });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const gate = limiter(ip);
  if (!gate.allowed) {
    return json(429, {
      error:
        gate.reason === 'daily'
          ? "The assistant has reached today's limit."
          : 'Too many questions — please wait a few minutes.',
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'That request could not be read.' });
  }
  const check = validateAskBody(body);
  if (!check.ok) return json(400, { error: check.error });

  let system;
  try {
    system = await loadSystemPrompt(origin);
  } catch (error) {
    console.error('Assistant facts failed to load:', error.message);
    return json(503, { error: 'The assistant is unavailable right now.' });
  }

  client ??= new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: 1200,
    // Frozen facts first, cached; the visitor's questions come after.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: check.messages,
    output_config: { effort: 'low' },
  };
  if (SUPPORTS_FALLBACK) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  const stream = client.beta.messages.stream(params);
  const encoder = new TextEncoder();
  const body$ = new ReadableStream({
    async start(controller) {
      let sent = false;
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
            sent = true;
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal' && !sent) {
          controller.enqueue(
            encoder.encode("I can't help with that one — but ask me anything about Siddiq's work.\nSOURCES: contact"),
          );
        }
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) console.error('Assistant rate limited by the API');
        else if (error instanceof Anthropic.APIError) console.error(`Assistant API error ${error.status}`);
        else console.error('Assistant stream failed:', error?.message);
        if (!sent) controller.enqueue(encoder.encode("Sorry — I couldn't answer just now."));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body$, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function GET() {
  return json(405, { error: 'Use POST.' });
}
