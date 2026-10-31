// Request validation and lightweight abuse limits for the assistant endpoint.
export const LIMITS = { maxChars: 500, maxTurns: 6, perWindow: 8, windowMs: 10 * 60 * 1000, dailyCap: 300 };

/** Validates { messages } from the client. Returns { ok, messages } or { ok: false, error }. */
export function validateAskBody(body) {
  const list = body && Array.isArray(body.messages) ? body.messages : null;
  if (!list || !list.length) return { ok: false, error: 'Ask a question to get started.' };
  const recent = list.slice(-LIMITS.maxTurns);
  for (const m of recent) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return { ok: false, error: 'That request could not be read.' };
    }
    if (!m.content.trim()) return { ok: false, error: 'Messages cannot be empty.' };
    if (m.role === 'user' && m.content.length > LIMITS.maxChars) {
      return { ok: false, error: `Please keep questions under ${LIMITS.maxChars} characters.` };
    }
  }
  // The conversation must start with the visitor and end with their question.
  while (recent.length && recent[0].role !== 'user') recent.shift();
  if (!recent.length || recent[recent.length - 1].role !== 'user') {
    return { ok: false, error: 'That request could not be read.' };
  }
  return { ok: true, messages: recent.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })) };
}

/** In-memory sliding window per key plus a daily cap. Best effort: one instance's memory only. */
export function createRateLimiter({ perWindow, windowMs, dailyCap } = LIMITS, now = () => Date.now()) {
  const hits = new Map();
  let day = '';
  let dayCount = 0;
  return (key) => {
    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
    if (dayCount >= dailyCap) return { allowed: false, reason: 'daily' };
    const recent = (hits.get(key) || []).filter((stamp) => t - stamp < windowMs);
    if (recent.length >= perWindow) return { allowed: false, reason: 'rate' };
    recent.push(t);
    hits.set(key, recent);
    dayCount++;
    return { allowed: true };
  };
}

/** Splits a finished answer into visible text and the cited section ids. */
export function splitSources(text) {
  const match = text.match(/\n?\s*SOURCES:\s*([^\n]*)\s*$/i);
  if (!match) return { answer: text.trim(), sources: [] };
  const sources = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z]+(:[a-z0-9-]+)?$/.test(s));
  return { answer: text.slice(0, match.index).trim(), sources: [...new Set(sources)] };
}
