import { useMemo, useState } from 'react';
import './App.css';

const API_ENDPOINT = '/api/download';

function getFilenameFromDisposition(disposition) {
  if (!disposition) return 'video.mp4';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || 'video.mp4';
}

function App() {
  const [url, setUrl] = useState('');
  const [resolution, setResolution] = useState('1080');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const isBusy = status === 'downloading';
  const buttonLabel = useMemo(() => {
    if (status === 'downloading') return 'Preparing your video...';
    return 'Download Video';
  }, [status]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setStatus('downloading');

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), resolution }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to download this video right now.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition');
      const filename = getFilenameFromDisposition(disposition);
      const objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Download failed.');
    }
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">YT Downloader</p>
        <h1>Save YouTube Video in 1080p or 1440p</h1>
        <p className="intro">Paste a link, choose quality, and download the MP4 with audio.</p>

        <form className="form" onSubmit={onSubmit}>
          <label htmlFor="youtube-url">YouTube URL</label>
          <input
            id="youtube-url"
            name="youtube-url"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            autoComplete="off"
            inputMode="url"
          />

          <label htmlFor="resolution">Resolution</label>
          <select
            id="resolution"
            name="resolution"
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
          >
            <option value="1080">1080p</option>
            <option value="1440">1440p</option>
          </select>

          <button type="submit" disabled={isBusy}>
            {buttonLabel}
          </button>
        </form>

        {status === 'done' && <p className="success">Download started. Check your Downloads folder.</p>}
        {status === 'error' && <p className="error">{error}</p>}

        <p className="note">
          Only download content you own or have permission to download.
        </p>
      </section>
    </main>
  );
}

export default App;
