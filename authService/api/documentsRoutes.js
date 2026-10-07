/**
 * Documents API — powers the Finder-style SOPs & Reports browser.
 *
 * Exposes a read-only, sandboxed view of a few known repository folders as a
 * folder/file tree, plus file contents (text inline, binaries streamed).
 */

const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const router = express.Router();
const { protect } = require('../middleware/auth');

const REPO_ROOT = process.env.DOCS_REPO_ROOT || path.join(__dirname, '..', '..');

// Named, explicitly allow-listed roots. Nothing outside these is reachable.
const ROOTS = [
  { id: 'docs', name: 'Docs', dir: path.join(REPO_ROOT, 'Docs'), icon: 'book' },
  { id: 'runbooks', name: 'Runbooks & Manifests', dir: path.join(REPO_ROOT, 'k8s-configs'), icon: 'server' },
  { id: 'charts', name: 'Helm Charts', dir: path.join(REPO_ROOT, 'helm'), icon: 'package' },
];

const IGNORE = new Set(['node_modules', '.git', 'venv', '.venv', '__pycache__', 'charts', '.DS_Store', 'dist', 'build']);

const TEXT_EXT = new Set([
  'md', 'markdown', 'txt', 'yaml', 'yml', 'json', 'log', 'sh', 'bash', 'js', 'jsx', 'ts', 'tsx',
  'py', 'tpl', 'conf', 'cfg', 'ini', 'env', 'toml', 'sql', 'html', 'css', 'xml', 'csv', 'helmignore', 'gitignore',
]);
const MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
};
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const extOf = (name) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

/** Resolve "<rootId>/rel/path" to an absolute path, refusing traversal. */
function resolveVirtual(virtualPath) {
  const clean = String(virtualPath || '').replace(/^\/+/, '');
  const [rootId, ...rest] = clean.split('/');
  const root = ROOTS.find((r) => r.id === rootId);
  if (!root) return null;
  const abs = path.resolve(root.dir, ...rest);
  const base = path.resolve(root.dir);
  // must stay inside the root
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return { abs, root, rel: rest.join('/') };
}

async function buildTree(dir, virtualPrefix, depth = 0) {
  if (depth > 6) return [];
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (IGNORE.has(e.name) || e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    const vpath = `${virtualPrefix}/${e.name}`;
    let stat;
    try { stat = await fsp.stat(abs); } catch { continue; }
    if (e.isDirectory()) {
      out.push({
        name: e.name, path: vpath, type: 'dir',
        modified: stat.mtime,
        children: await buildTree(abs, vpath, depth + 1),
      });
    } else {
      out.push({
        name: e.name, path: vpath, type: 'file',
        ext: extOf(e.name), size: stat.size, modified: stat.mtime,
      });
    }
  }
  // folders first, then alphabetical (Finder-like)
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return out;
}

// GET /api/documents/tree
router.get('/tree', protect, async (req, res) => {
  try {
    const roots = [];
    for (const r of ROOTS) {
      if (!fs.existsSync(r.dir)) continue;
      roots.push({
        name: r.name, path: r.id, type: 'dir', icon: r.icon, root: true,
        children: await buildTree(r.dir, r.id, 0),
      });
    }
    res.json({ success: true, roots });
  } catch (e) {
    console.error('documents/tree error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/documents/file?path=<rootId>/rel  [&raw=1]
router.get('/file', protect, async (req, res) => {
  const target = resolveVirtual(req.query.path);
  if (!target) return res.status(400).json({ success: false, error: 'Invalid path' });
  try {
    const stat = await fsp.stat(target.abs);
    if (stat.isDirectory()) return res.status(400).json({ success: false, error: 'Path is a directory' });

    const ext = extOf(target.abs);
    const isText = TEXT_EXT.has(ext);

    // Binary (pdf / images) — stream with the right content type.
    if (!isText || req.query.raw === '1') {
      res.setHeader('Content-Type', MIME[ext] || (isText ? 'text/plain; charset=utf-8' : 'application/octet-stream'));
      res.setHeader('Content-Length', stat.size);
      return fs.createReadStream(target.abs).pipe(res);
    }

    if (stat.size > MAX_TEXT_BYTES) {
      return res.json({ success: true, type: 'text', ext, truncated: true, size: stat.size, content: '// File too large to preview (> 2 MB)' });
    }
    const content = await fsp.readFile(target.abs, 'utf8');
    res.json({ success: true, type: 'text', ext, content, size: stat.size, modified: stat.mtime });
  } catch (e) {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

module.exports = router;
