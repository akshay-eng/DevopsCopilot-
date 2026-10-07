/**
 * Embedding service.
 *
 * Provider order (first that is configured/reachable wins):
 *   1. EMBEDDING_URL  — any OpenAI-compatible /v1/embeddings endpoint
 *   2. OLLAMA_URL     — local Ollama /api/embeddings
 *   3. local fallback — signed feature-hashing over word+bigram tokens
 *
 * The fallback is LEXICAL, not semantic: it matches on shared terminology
 * (alert names, error strings, pod/namespace names), which is exactly what
 * ticket/incident similarity keys off in practice. Point EMBEDDING_URL at a
 * real model to upgrade quality without changing anything else.
 */

const DIM = parseInt(process.env.EMBEDDING_DIM || '768', 10);

const EMBEDDING_URL = process.env.EMBEDDING_URL || '';           // e.g. http://host:8000/v1
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || '';
const OLLAMA_URL = process.env.OLLAMA_URL || '';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

// ---- local fallback --------------------------------------------------------

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'for', 'on', 'at', 'by', 'with', 'this', 'that', 'it', 'as', 'be', 'are', 'was', 'from']);

function tokenize(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && w.length < 40 && !STOP.has(w));
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]}_${words[i + 1]}`); // bigrams
  return out;
}

// FNV-1a
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function localEmbed(text) {
  const v = new Float64Array(DIM);
  for (const t of tokenize(text)) {
    const h = hash32(t);
    const idx = h % DIM;
    const sign = (h >>> 31) & 1 ? -1 : 1; // signed hashing cancels collision bias
    v[idx] += sign;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) {
    // sublinear term-frequency damping
    v[i] = Math.sign(v[i]) * Math.log1p(Math.abs(v[i]));
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm) || 1;
  const out = new Array(DIM);
  for (let i = 0; i < DIM; i++) out[i] = v[i] / norm;
  return out;
}

// ---- remote providers ------------------------------------------------------

async function openAiCompatible(texts) {
  const base = EMBEDDING_URL.replace(/\/+$/, '');
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(EMBEDDING_KEY ? { Authorization: `Bearer ${EMBEDDING_KEY}` } : {}) },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`embeddings HTTP ${res.status}`);
  const body = await res.json();
  return (body.data || []).map((d) => d.embedding);
}

async function ollama(texts) {
  const base = OLLAMA_URL.replace(/\/+$/, '');
  const out = [];
  for (const t of texts) {
    const res = await fetch(`${base}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: t }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`ollama embeddings HTTP ${res.status}`);
    out.push((await res.json()).embedding);
  }
  return out;
}

function resize(vec) {
  if (!Array.isArray(vec)) return null;
  if (vec.length === DIM) return vec;
  // Fold/pad so a differently-sized model still fits the collection schema.
  const out = new Array(DIM).fill(0);
  for (let i = 0; i < vec.length; i++) out[i % DIM] += vec[i];
  let n = Math.sqrt(out.reduce((s, x) => s + x * x, 0)) || 1;
  return out.map((x) => x / n);
}

let activeProvider = null;

/**
 * Embed one or more texts. Never throws — degrades to the local fallback so
 * ingestion/search keep working.
 */
async function embed(input) {
  const texts = (Array.isArray(input) ? input : [input]).map((t) => String(t || '').slice(0, 8000));
  if (texts.length === 0) return [];

  if (EMBEDDING_URL) {
    try {
      const v = await openAiCompatible(texts);
      if (v.length === texts.length) { activeProvider = `openai-compatible:${EMBEDDING_MODEL}`; return v.map(resize); }
    } catch (e) { console.warn('[embeddings] remote failed, falling back:', e.message); }
  }
  if (OLLAMA_URL) {
    try {
      const v = await ollama(texts);
      if (v.length === texts.length) { activeProvider = `ollama:${OLLAMA_EMBED_MODEL}`; return v.map(resize); }
    } catch (e) { console.warn('[embeddings] ollama failed, falling back:', e.message); }
  }

  activeProvider = 'local-hashing';
  return texts.map(localEmbed);
}

const provider = () => activeProvider || (EMBEDDING_URL ? 'openai-compatible (untested)' : OLLAMA_URL ? 'ollama (untested)' : 'local-hashing');

module.exports = { embed, DIM, provider, localEmbed, tokenize };
