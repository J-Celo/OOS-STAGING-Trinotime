// Local-only reviewer preparation. Reconstruct ../tracker from SHA-256 verified packaged source.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cf = path.join(root, 'cloudflare');
const meta = JSON.parse(fs.readFileSync(path.join(cf, 'public/downloads/qc-tracker.json'), 'utf8'));
if (meta.environment !== 'PRODUCTION' || meta.version !== '2.3.10' ||
    meta.filename !== 'TrinoTime-QC-Tracker-v2.3.10.zip' || !/^[a-f0-9]{64}$/i.test(meta.sha256)) {
  throw Error('Unexpected Tracker package metadata');
}
const current = JSON.parse(fs.readFileSync(path.join(cf, 'public/downloads/qc-tracker-current.json'), 'utf8'));
if (current.channel !== 'production' || current.version !== meta.version || current.sha256 !== meta.sha256) {
  throw Error('Production Tracker release metadata mismatch');
}
const zip = path.join(cf, 'public/downloads', meta.filename);
if (crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex') !== meta.sha256.toLowerCase()) {
  throw Error('Tracker ZIP checksum mismatch');
}
const dest = path.join(root, 'tracker');
if (fs.existsSync(dest)) {
  const manifest = path.join(dest, 'manifest.json');
  if (!fs.existsSync(manifest) || JSON.parse(fs.readFileSync(manifest, 'utf8')).version !== meta.version) {
    throw Error('Existing tracker/ differs from bundled version; inspect it manually');
  }
  console.log('Tracker fixture already present; no files overwritten.');
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(root, '.tracker-review-'));
const quote = s => "'" + s.replaceAll("'", "''") + "'";
try {
  const win = process.platform === 'win32';
  const command = win ? 'powershell.exe' : 'unzip';
  const args = win
    ? ['-NoProfile', '-NonInteractive', '-Command',
       'Expand-Archive -LiteralPath ' + quote(zip) + ' -DestinationPath ' + quote(tmp)]
    : ['-q', zip, '-d', tmp];
  const run = spawnSync(command, args, { timeout: 30000, encoding: 'utf8' });
  if (run.error || run.status !== 0) throw Error('ZIP extraction failed; check your local extractor');
  const extracted = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  if (extracted.version !== meta.version) throw Error('Tracker manifest version mismatch');
  fs.renameSync(tmp, dest);
} catch (err) {
  fs.rmSync(tmp, { recursive: true, force: true });
  throw err;
}
console.log('Prepared Tracker test fixture from checksum-verified production ZIP. No deployment performed.');
