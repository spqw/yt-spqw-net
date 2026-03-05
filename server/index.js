import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const TEMP_DIR = path.join(ROOT_DIR, 'tmp-downloads');
const QUALITY_OPTIONS = new Set(['360', '480', '720', '1080']);

function isValidYouTubeUrl(input) {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function runYtDlp({ url, quality }) {
  return new Promise((resolve, reject) => {
    const format = [
      `bestvideo[vcodec*=avc1][height<=${quality}][ext=mp4]+bestaudio[acodec*=mp4a][ext=m4a]`,
      `bestvideo[vcodec*=avc1][height<=${quality}]+bestaudio[acodec*=mp4a]`,
      `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]`,
      `best[height<=${quality}][ext=mp4]`,
      `best[height<=${quality}]`,
    ].join('/');

    const args = [
      '--no-playlist',
      '--no-warnings',
      '--merge-output-format',
      'mp4',
      '--restrict-filenames',
      '--print',
      'after_move:filepath',
      '-f',
      format,
      '-o',
      path.join(TEMP_DIR, '%(title).80s-%(id)s.%(ext)s'),
      url,
    ];

    const child = spawn('yt-dlp', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        return;
      }

      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const filePath = lines.at(-1);

      if (!filePath) {
        reject(new Error('Download completed but no output file path was returned.'));
        return;
      }

      resolve(filePath);
    });
  });
}

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'yt-spqw-net' });
});

app.post('/api/download', async (req, res) => {
  const { url, quality } = req.body || {};

  if (typeof url !== 'string' || !isValidYouTubeUrl(url)) {
    res.status(400).json({ error: 'Please provide a valid YouTube URL.' });
    return;
  }

  if (typeof quality !== 'string' || !QUALITY_OPTIONS.has(quality)) {
    res.status(400).json({ error: 'Quality must be one of: 360, 480, 720, 1080.' });
    return;
  }

  let filePath = '';
  try {
    await ensureTempDir();
    filePath = await runYtDlp({ url, quality });

    const fileName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]+/g, '_');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    res.download(filePath, fileName, async (downloadErr) => {
      try {
        await fs.rm(filePath, { force: true });
      } catch {
        // Ignore cleanup errors.
      }

      if (downloadErr && !res.headersSent) {
        res.status(500).json({ error: 'Failed to stream downloaded file.' });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed.';
    res.status(500).json({ error: message });
  }
});

app.use(express.static(DIST_DIR));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`yt.spqw.net service running on port ${PORT}`);
});
