import { useMemo, useState } from 'react';
import './App.css';

const API_ENDPOINT = '/api/download';
const QUALITY_OPTIONS = [
  { value: '360', label: '360p (smallest file)' },
  { value: '480', label: '480p' },
  { value: '720', label: '720p (recommended for phones)' },
  { value: '1080', label: '1080p (larger file)' },
];

function App() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('720');
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
      const params = new URLSearchParams({ url: url.trim(), quality });
      window.location.assign(`${API_ENDPOINT}?${params.toString()}`);
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
        <h1>Download YouTube Video as MP4</h1>
        <p className="intro">Paste a link, choose quality, and save an Android-friendly video with audio.</p>

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

          <label htmlFor="quality">Quality</label>
          <select
            id="quality"
            name="quality"
            value={quality}
            onChange={(event) => setQuality(event.target.value)}
          >
            {QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
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
