import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { config } from '../config.js';

export function StationLink() {
  const [image, setImage] = useState('');
  const [copied, setCopied] = useState(false);
  const url = config.publicUrl;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 240,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((data) => {
        if (!cancelled) setImage(data);
      })
      .catch(() => {
        if (!cancelled) setImage('');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    } catch {
      // Some browsers block the clipboard until the page is opened from the phone.
    }
    try {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      setCopied(ok);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="station">
      <h2>Station link</h2>
      {image ? <img src={image} alt="QR code for the inventory website" width="180" height="180" /> : null}
      <a className="station-url" href={url}>
        {url}
      </a>
      <button type="button" className="secondary" onClick={copyLink}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </section>
  );
}
