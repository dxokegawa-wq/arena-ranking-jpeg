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
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetchFn(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (response.ok) return response.json();
      let detail = {};
      try { detail = await response.json(); } catch (_) {}
      const apiError = detail && detail.error || {};
      const reason = String(apiError.errors && apiError.errors[0] && apiError.errors[0].reason || apiError.status || '');
      const detailMessage = String(apiError.message || '');
      const retryable403 = response.status === 403 && /rate.?limit|quota|backend/i.test(`${reason} ${detailMessage}`);
      const retryable = response.status === 429 || response.status >= 500 || retryable403;
      if (retryable && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
        continue;
      }
      const suffix = reason ? `: ${reason}` : '';
      const error = new Error(response.status === 401 ? 'Gmailの認証期限が切れました。もう一度ボタンを押してください。' : `Gmailの読み込みに失敗しました（${response.status}${suffix}）。`);
      error.status = response.status;
      error.reason = reason;
      throw error;
    }
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

  function isoDate(date) {
    return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function dateForRow(row, period) {
    if (!period) return null;
    const begin = Date.UTC(period.start.year, period.start.month - 1, period.start.day);
    const end = Date.UTC(period.end.year, period.end.month - 1, period.end.day);
    for (const year of new Set([period.start.year, period.end.year])) {
      const time = Date.UTC(year, row.month - 1, row.day);
      if (time >= begin && time <= end) return { year, month: row.month, day: row.day };
    }
    return null;
  }

  async function findMonthlyRankings(accessToken, parseMail, options = {}) {
    const fetchFn = options.fetchFn || root.fetch.bind(root);
    const year = +options.year;
    const month = +options.month;
    if (!Number.isInteger(year) || year < 1900 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('月間ランキングの対象月を選んでください。');
    }
    const profile = await gmailRequest(accessToken, 'profile', fetchFn);
    const allowedEmail = String(options.allowedEmail || '').trim().toLowerCase();
    if (allowedEmail && String(profile.emailAddress || '').trim().toLowerCase() !== allowedEmail) {
      const error = new Error(`${allowedEmail} でログインしてください。現在は ${profile.emailAddress || '別のアカウント'} です。`);
      error.status = 403;
      throw error;
    }

    // Include the weeks that overlap the beginning and end of the month. The
    // ranking date inside each email decides whether each row belongs to the month.
    const searchStart = new Date(Date.UTC(year, month - 1, 1) - 21 * 86400000);
    const searchEnd = new Date(Date.UTC(year, month, 1) + 21 * 86400000);
    // Narrow the list to ranking-like messages before opening each full body.
    // Without these terms, an active mailbox can require hundreds of Gmail API
    // calls and hit its short-term request limit.
    const query = options.query || `after:${isoDate(searchStart)} before:${isoDate(searchEnd)} "番台" {"4円P" "21.7391円S"}`;
    // Search all mail for monthly creation. Older weekly reports may already
    // be archived and therefore no longer carry the INBOX label.
    const messages = [];
    const items = [];
    const pageSize = Math.min(100, Math.max(1, +options.maxResults || 100));
    const scanLimit = Math.max(pageSize, +options.scanLimit || 200);
    let pageToken = '';
    do {
      const tokenPart = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const list = await gmailRequest(accessToken, `messages?maxResults=${pageSize}&q=${encodeURIComponent(query)}${tokenPart}`, fetchFn);
      items.push(...(list.messages || []).slice(0, scanLimit - items.length));
      pageToken = list.nextPageToken || '';
    } while (pageToken && items.length < scanLimit);
    // Read one message at a time. Gmail can return userRateLimitExceeded as
    // HTTP 403 when several full message requests arrive in a burst.
    for (const item of items) {
      const message = await gmailRequest(accessToken, `messages/${encodeURIComponent(item.id)}?format=full`, fetchFn);
      messages.push({ id: item.id, message });
    }

    const groups = { pachinko: [], slot: [] };
    const sources = [];
    const seenSets = new Set();
    for (const { id, message } of messages) {
      const body = messageBody(message.payload);
      if (!body) continue;
      const parsed = parseMail(body);
      const total = parsed.groups.pachinko.length + parsed.groups.slot.length;
      if (!total || !parsed.period) continue;
      const setKey = JSON.stringify({ period: parsed.period, groups: parsed.groups });
      if (seenSets.has(setKey)) continue;
      seenSets.add(setKey);
      let added = 0;
      for (const type of ['pachinko', 'slot']) {
        for (const row of parsed.groups[type]) {
          const date = dateForRow(row, parsed.period);
          if (!date || date.year !== year || date.month !== month) continue;
          groups[type].push({ ...row });
          added++;
        }
      }
      if (added) sources.push({
        id,
        subject: headerValue(message.payload, 'Subject') || '件名なし',
        period: parsed.period,
        count: added
      });
    }
    groups.pachinko.sort((a, b) => b.amount - a.amount);
    groups.slot.sort((a, b) => b.amount - a.amount);
    if (!groups.pachinko.length && !groups.slot.length) return null;
    return {
      parsed: {
        groups,
        period: {
          start: { year, month, day: 1 },
          end: { year, month, day: new Date(Date.UTC(year, month, 0)).getUTCDate() }
        },
        invalid: []
      },
      sources,
      query
    };
  }

  return { decodeBase64Url, messageBody, headerValue, findLatestRanking, findMonthlyRankings };
});
