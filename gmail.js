(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ArenaGmail = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function decodeBase64Url(data) {
    if (!data) return '';
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const bytes = typeof Buffer !== 'undefined'
      ? Uint8Array.from(Buffer.from(padded, 'base64'))
      : Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  function htmlToText(html) {
    if (root.DOMParser) {
      const prepared = String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n');
      const doc = new root.DOMParser().parseFromString(prepared, 'text/html');
      return (doc.body.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    return String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  }

  function collectParts(part, output) {
    if (!part) return;
    const data = part.body && part.body.data;
    if (data && (part.mimeType === 'text/plain' || part.mimeType === 'text/html')) {
      output.push({ type: part.mimeType, text: decodeBase64Url(data) });
    }
    for (const child of part.parts || []) collectParts(child, output);
  }

  function messageBody(payload) {
    const parts = [];
    collectParts(payload, parts);
    const plain = parts.filter((part) => part.type === 'text/plain').map((part) => part.text.trim()).filter(Boolean);
    if (plain.length) return plain.join('\n\n').trim();
    const html = parts.filter((part) => part.type === 'text/html').map((part) => htmlToText(part.text)).filter(Boolean);
    return html.join('\n\n').trim();
  }

  function headerValue(payload, name) {
    const header = (payload && payload.headers || []).find((item) => String(item.name).toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  }

  async function gmailRequest(accessToken, path, fetchFn) {
    const response = await fetchFn(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Gmailの認証期限が切れました。もう一度ボタンを押してください。' : `Gmailの読み込みに失敗しました（${response.status}）。`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function findLatestRanking(accessToken, parseMail, options = {}) {
    const fetchFn = options.fetchFn || root.fetch.bind(root);
    const query = options.query || 'newer_than:30d';
    const maxResults = options.maxResults || 30;
    const profile = await gmailRequest(accessToken, 'profile', fetchFn);
    const allowedEmail = String(options.allowedEmail || '').trim().toLowerCase();
    if (allowedEmail && String(profile.emailAddress || '').trim().toLowerCase() !== allowedEmail) {
      const error = new Error(`${allowedEmail} でログインしてください。現在は ${profile.emailAddress || '別のアカウント'} です。`);
      error.status = 403;
      throw error;
    }
    const list = await gmailRequest(accessToken, `messages?labelIds=INBOX&maxResults=${maxResults}&q=${encodeURIComponent(query)}`, fetchFn);
    for (const item of list.messages || []) {
      const message = await gmailRequest(accessToken, `messages/${encodeURIComponent(item.id)}?format=full`, fetchFn);
      const body = messageBody(message.payload);
      if (!body) continue;
      const parsed = parseMail(body);
      const total = parsed.groups.pachinko.length + parsed.groups.slot.length;
      if (!total) continue;
      return {
        id: item.id,
        body,
        parsed,
        subject: headerValue(message.payload, 'Subject') || '件名なし',
        from: headerValue(message.payload, 'From'),
        date: headerValue(message.payload, 'Date')
      };
    }
    return null;
  }

  return { decodeBase64Url, messageBody, headerValue, findLatestRanking };
});
