/**
 * Runbook (SOP) authoring.
 *
 * When the agent resolves an alert, what it learned should outlive the ticket.
 * This writes a per-alert markdown runbook into the SOPs root that the
 * Documents browser already serves, so it shows up in SOPs & Reports.
 *
 * One file per alert name, appended to rather than replaced: the second
 * occurrence of an alert is evidence about which fix actually sticks, and
 * overwriting would throw that away. The history section is capped so a noisy
 * alert cannot grow the file without bound.
 */

const fsp = require('fs/promises');
const path = require('path');

const REPO_ROOT = process.env.DOCS_REPO_ROOT || path.join(__dirname, '..', '..');
const SOP_DIR = process.env.SOP_DIR || path.join(REPO_ROOT, 'Docs', 'SOPs');
const MAX_HISTORY_ENTRIES = 10;

/** Filesystem-safe name derived from the alert. */
function fileNameFor(alertname) {
  const slug = String(alertname || 'unknown')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
  return `${slug}.md`;
}

function header(alertname) {
  return [
    `# Runbook: ${alertname}`,
    '',
    '> Maintained automatically by the AIOps agent from real resolutions.',
    '> Each entry below is something that was actually run against the cluster.',
    '',
  ].join('\n');
}

function entryFor({ summary, actions = [], outcome, namespace }) {
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const lines = [
    `## ${when} UTC — ${outcome}`,
    '',
    namespace ? `**Namespace:** ${namespace}` : null,
    '',
    summary || '_No summary produced._',
    '',
  ].filter((l) => l !== null);

  if (actions.length) {
    lines.push('**Actions applied:**', '');
    actions.forEach((a) => {
      lines.push(`- \`${a.action}\`${a.detail ? ` — ${a.detail}` : ''}`);
      if (a.verify) lines.push(`  - Verify: \`${a.verify}\``);
    });
    lines.push('');
  } else {
    lines.push('**Actions applied:** none — the alert was resolved without changing the cluster.', '');
  }

  return lines.join('\n');
}

/**
 * Split an existing runbook into its header and its dated entries, so a new
 * entry can go on top without re-parsing markdown properly.
 */
function splitEntries(existing) {
  const idx = existing.indexOf('\n## ');
  if (idx === -1) return { head: existing.trimEnd(), entries: [] };
  const head = existing.slice(0, idx).trimEnd();
  const rest = existing.slice(idx + 1);
  const entries = rest.split(/\n(?=## )/).filter((e) => e.trim());
  return { head, entries };
}

/**
 * @returns {{virtualPath, absPath, updated}} or null if writing was not possible
 */
async function writeRunbook({ alertname, namespace, summary, actions, outcome }) {
  if (!alertname) return null;

  await fsp.mkdir(SOP_DIR, { recursive: true });
  const file = fileNameFor(alertname);
  const absPath = path.join(SOP_DIR, file);

  let existing = '';
  try { existing = await fsp.readFile(absPath, 'utf8'); } catch { /* first time */ }

  const entry = entryFor({ summary, actions, outcome, namespace });
  let content;
  let updated = false;

  if (existing.trim()) {
    const { head, entries } = splitEntries(existing);
    entries.unshift(entry.trim());
    content = `${head}\n\n${entries.slice(0, MAX_HISTORY_ENTRIES).join('\n\n')}\n`;
    updated = true;
  } else {
    content = `${header(alertname)}\n${entry}`;
  }

  await fsp.writeFile(absPath, content, 'utf8');

  return { virtualPath: `sops/${file}`, absPath, updated };
}

module.exports = { writeRunbook, SOP_DIR, fileNameFor };
