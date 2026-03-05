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
const COOKIES_FILE = path.join(ROOT_DIR, '.yt-cookies.txt');
const QUALITY_OPTIONS = new Set(['360', '480', '720', '1080']);
const YTDLP_COOKIES_PATH = process.env.YTDLP_COOKIES_PATH?.trim() || '';
const YTDLP_COOKIES_B64 = process.env.YTDLP_COOKIES_B64?.trim() || '';
let activeCookiesPath = '';

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
      '--extractor-args',
      'youtube:player_client=android,web',
      '--user-agent',
      'com.google.android.youtube/19.09.37 (Linux; U; Android 13) gzip',
      '--add-header',
      'Accept-Language:en-US,en;q=0.9',
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
    if (activeCookiesPath) {
      args.unshift(activeCookiesPath);
      args.unshift('--cookies');
    }

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

async function configureCookies() {
  if (YTDLP_COOKIES_B64) {
    const cookies = Buffer.from(YTDLP_COOKIES_B64, 'base64').toString('utf8');
    await fs.writeFile(COOKIES_FILE, cookies, { mode: 0o600 });
    activeCookiesPath = COOKIES_FILE;
    return;
  }

  if (YTDLP_COOKIES_PATH) {
    activeCookiesPath = YTDLP_COOKIES_PATH;
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'yt-spqw-net' });
});

async function handleDownload({ url, quality }, res) {
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
    const rawMessage = err instanceof Error ? err.message : 'Download failed.';
    const message = rawMessage.includes('Sign in to confirm you’re not a bot')
      ? 'YouTube requested bot verification for this video. Try another video, or configure server cookies for yt-dlp.'
      : rawMessage;
    res.status(500).json({ error: message });
  }
}

app.post('/api/download', async (req, res) => {
  const { url, quality } = req.body || {};
  await handleDownload({ url, quality }, res);
});

app.get('/api/download', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  const quality = typeof req.query.quality === 'string' ? req.query.quality : '';
  await handleDownload({ url, quality }, res);
});

app.use(express.static(DIST_DIR));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

configureCookies()
  .catch((err) => {
    console.error('Failed to configure yt-dlp cookies:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`yt.spqw.net service running on port ${PORT}`);
    });
  });
