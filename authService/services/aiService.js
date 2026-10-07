/**
 * AI service — LLM-backed explanations and recommendations.
 *
 * Talks to any OpenAI-compatible chat endpoint (the on-prem vLLM by default).
 * Every function degrades to a deterministic, still-useful answer when no model
 * is reachable, so the UI never shows an empty box.
 */

const LLM_URL = process.env.AI_LLM_URL || process.env.TRENDS_LLM_URL || process.env.VLLM_URL || 'http://172.17.65.184:8000/v1';
const LLM_MODEL = process.env.AI_LLM_MODEL || process.env.TRENDS_LLM_MODEL || 'qwopus3.5-9b-v3';
const LLM_KEY = process.env.AI_LLM_KEY || process.env.TRENDS_LLM_KEY || '';

/**
 * NOTE: the default on-prem model is a REASONING model — it emits a long
 * `reasoning` trace and only then fills `content`. Too small a max_tokens gets
 * entirely consumed by reasoning and returns content:null, so budget generously
 * and fall back to the reasoning text if content is empty.
 */
async function chat(messages, { maxTokens = 2500, temperature = 0.2, timeout = 120000 } = {}) {
  if (!LLM_URL) return null;
  try {
    const res = await fetch(`${LLM_URL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(LLM_KEY ? { Authorization: `Bearer ${LLM_KEY}` } : {}) },
      body: JSON.stringify({ model: LLM_MODEL, messages, temperature, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      console.warn('[ai] chat HTTP', res.status);
      return null;
    }
    const body = await res.json();
    const msg = body?.choices?.[0]?.message || {};
    const content = (msg.content || '').trim();
    if (content) return content;
    // Reasoning models sometimes leave the answer only in the reasoning trace.
    const reasoning = (msg.reasoning || msg.reasoning_content || '').trim();
    if (reasoning) {
      console.warn('[ai] content empty; using reasoning trace (raise max_tokens)');
      return reasoning;
    }
    return null;
  } catch (e) {
    console.warn('[ai] chat failed:', e.message);
    return null;
  }
}

/** Pull a JSON object out of a model response that may wrap it in prose/fences. */
function extractJson(s) {
  if (!s) return null;
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ---- vulnerabilities -------------------------------------------------------

const PKG_HINTS = [
  { re: /^stdlib$|^go$|golang/i, kind: 'the Go standard library baked into the image' },
  { re: /openssl|libssl|gnutls/i, kind: 'the TLS/crypto library' },
  { re: /glibc|musl/i, kind: 'the C runtime' },
  { re: /runc|containerd|docker/i, kind: 'the container runtime' },
  { re: /grpc|net\/http|nghttp|http2/i, kind: 'the HTTP/gRPC stack' },
  { re: /zlib|libxml|expat|pcre/i, kind: 'a parsing/compression library' },
  { re: /kernel|linux/i, kind: 'the host kernel packages' },
];

function fallbackExplanation(v) {
  const hint = PKG_HINTS.find((h) => h.re.test(v.package || ''))?.kind || `the "${v.package}" package`;
  const fixable = v.fixedVersion && v.fixedVersion !== '';
  return {
    cause: `${v.id} affects ${hint}, version ${v.installedVersion || 'unknown'}, which is present inside this container image. The vulnerability ships with the base image or a bundled dependency rather than your application code — anything built on that image inherits it.`,
    impact: `Rated ${v.severity}${v.score ? ` (CVSS ${v.score})` : ''}. ${v.title || 'See the linked advisory for exploitability details.'} Exposure depends on whether the affected code path is reachable from untrusted input in this workload.`,
    fix: fixable
      ? `Upgrade ${v.package} from ${v.installedVersion} to ${v.fixedVersion}. In practice that means rebuilding the image on a newer base (or bumping the dependency), pushing the new tag, and rolling the workload. Use the Remediate button to raise a change request and roll the image.`
      : `No fixed version is published yet. Mitigate instead: limit exposure (network policy / drop capabilities), confirm whether the vulnerable code path is reachable, and track the advisory for a patched release.`,
    verification: `After rolling, re-run the Trivy scan and confirm ${v.id} no longer appears for this workload.`,
    source: 'heuristic',
  };
}

/**
 * Explain a CVE: what it is, why it is here, how to fix it.
 */
async function explainVulnerability(v, context = {}) {
  const sys = `You are a senior security engineer explaining a container vulnerability to a DevOps engineer.
Answer ONLY with JSON: {"cause": "...", "impact": "...", "fix": "...", "verification": "..."}.
- cause: what the flaw is and why it is present in this image (2-3 sentences).
- impact: realistic risk for a Kubernetes workload, referencing the severity.
- fix: concrete, ordered remediation steps for a container image.
- verification: how to confirm it is fixed.
Be specific and practical. No markdown, no prose outside the JSON.`;

  const user = [
    `CVE: ${v.id}`,
    `Severity: ${v.severity}${v.score ? ` (CVSS ${v.score})` : ''}`,
    `Package: ${v.package} ${v.installedVersion}`,
    `Fixed version: ${v.fixedVersion || 'none published'}`,
    `Title: ${v.title || 'n/a'}`,
    context.resource ? `Workload: ${context.resource.kind}/${context.resource.name} in ${context.resource.namespace}` : '',
    context.image ? `Image: ${context.image}` : '',
  ].filter(Boolean).join('\n');

  const raw = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 3000 });
  const parsed = extractJson(raw);
  if (parsed?.cause && parsed?.fix) return { ...parsed, source: 'ai' };
  return fallbackExplanation(v);
}

/**
 * General recommendation helper: given a titled context blob, return
 * prioritised, actionable suggestions.
 */
async function recommend({ title, context, maxItems = 5 }) {
  const sys = `You are an SRE assistant. Given operational context, return ONLY JSON:
{"summary":"one sentence","recommendations":[{"title":"short","detail":"what to do and why","priority":"high|medium|low"}]}
At most ${maxItems} recommendations, ordered by impact. Be concrete and specific to the data given.`;
  const raw = await chat([
    { role: 'system', content: sys },
    { role: 'user', content: `${title}\n\n${typeof context === 'string' ? context : JSON.stringify(context, null, 2).slice(0, 6000)}` },
  ], { maxTokens: 3000 });

  const parsed = extractJson(raw);
  if (parsed?.recommendations?.length) return { ...parsed, source: 'ai' };
  return {
    summary: 'AI model unavailable — showing no automated recommendations.',
    recommendations: [],
    source: 'unavailable',
  };
}

const available = () => Boolean(LLM_URL);

module.exports = { chat, explainVulnerability, recommend, available, extractJson, LLM_MODEL, LLM_URL };
