export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.((e.loaded / e.total) * 100);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

const PROXY = /(cdninstagram\.com|fbcdn\.net|tiktokcdn|ibyteimg\.com|byteimg\.com|tiktokv\.com|muscdn\.com)/;
/** Instagram/TikTok CDNs block hotlinking, so route those through the local server. */
export const proxied = (u) => (!u ? null : PROXY.test(u) ? `/api/proxy?u=${encodeURIComponent(u)}` : u);

export const isUrl = (s) => /^https?:\/\/\S+\.\S+/i.test(String(s || '').trim());
