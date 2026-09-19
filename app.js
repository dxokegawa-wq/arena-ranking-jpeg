(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const templates = {
    pachinko: { web: 'assets/pachinko-web.jpg', signage: 'assets/pachinko-signage.jpg' },
    slot: { web: 'assets/slot-web.jpg', signage: 'assets/slot-signage.jpg' }
  };
  const layout = {
    web: { dateX: [140, 425, 850, 1200], dateY: 658, dateFont: 134, headerWidths: [145, 160, 145, 165],
      rowTop: 906, rowHeight: 101, rowStep: 129.3, cells: [[253, 932], [951, 1146], [1166, 1482]],
      numberRight: 387, numberWidth: 126, numberSuffixX: 401, nameX: 510, nameWidth: 416,
      rowDateX: 1049, dateWidth: 186, amountRight: 1434, amountWidth: 248, amountSuffixX: 1441,
      numberFont: 78, nameFont: 67, rowDateFont: 73, valueFont: 79, suffixFont: 29, suffixY: 21 },
    signage: { dateX: [90, 225, 430, 574], dateY: 403, dateFont: 88, headerWidths: [86, 90, 86, 93],
      rowTop: 540, rowHeight: 59, rowStep: 77, cells: [[118, 430], [441, 529], [540, 684]],
      numberRight: 181, numberWidth: 59, numberSuffixX: 187, nameX: 235, nameWidth: 190,
      rowDateX: 485, dateWidth: 83, amountRight: 654, amountWidth: 108, amountSuffixX: 661,
      numberFont: 46, nameFont: 39, rowDateFont: 42, valueFont: 48, suffixFont: 18, suffixY: 14 }
  };
  const state = { parsed: RankingCore.parseMail(''), format: 'web', periodKey: null };
  const imageCache = {};

  function loadImage(url) {
    if (!imageCache[url]) imageCache[url] = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('背景画像を読み込めませんでした。'));
      img.src = url;
    });
    return imageCache[url];
  }

  function dates() {
    const ids = ['startYear', 'startMonth', 'startDay', 'endYear', 'endMonth', 'endDay'];
    const nums = ids.map((id) => +$(id).value);
    const start = { year: nums[0], month: nums[1], day: nums[2] };
    const end = { year: nums[3], month: nums[4], day: nums[5] };
    const begin = Date.UTC(start.year, start.month - 1, start.day);
    const finish = Date.UTC(end.year, end.month - 1, end.day);
    return RankingCore.validDate(start) && RankingCore.validDate(end) && begin <= finish ? { start, end } : null;
  }

  function setDates(period) {
    $('startYear').value = period.start.year;
    $('startMonth').value = period.start.month;
    $('startDay').value = period.start.day;
    $('endYear').value = period.end.year;
    $('endMonth').value = period.end.month;
    $('endDay').value = period.end.day;
  }

  function inferDates(parsed) {
    const rows = [...parsed.groups.pachinko, ...parsed.groups.slot];
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => a.month * 32 + a.day - b.month * 32 - b.day);
    const year = new Date().getFullYear();
    const start = sorted[0], end = sorted[sorted.length - 1];
    return { start: { year, month: start.month, day: start.day }, end: { year, month: end.month, day: end.day } };
  }

  const toneColors = { weekday: '#111111', saturday: '#0648d5', holiday: '#e00018' };

  function drawFitted(ctx, text, x, y, width, initial, minimum, align, font = 'Impact, "Arial Narrow", sans-serif') {
    let size = initial;
    ctx.textAlign = align;
    ctx.font = `900 ${size}px ${font}`;
    while (size > minimum) {
      if (ctx.measureText(text).width <= width) break;
      size--;
      ctx.font = `900 ${size}px ${font}`;
    }
    ctx.fillText(text, x, y, width);
  }

  function drawTabular(ctx, text, x, y, width, initial, minimum, align) {
    // Impact uses proportional numerals. Give every digit the same advance so
    // equal-length values line up in a vertical column.
    let size = initial;
    let digitWidth, slashWidth;
    while (true) {
      ctx.font = `900 ${size}px Impact, "Arial Narrow", sans-serif`;
      digitWidth = Math.max(...'0123456789'.split('').map((digit) => ctx.measureText(digit).width));
      slashWidth = ctx.measureText('/').width;
      const total = [...text].reduce((sum, char) => sum + (char === '/' ? slashWidth : digitWidth), 0);
      if (total <= width || size <= minimum) break;
      size--;
    }
    const total = [...text].reduce((sum, char) => sum + (char === '/' ? slashWidth : digitWidth), 0);
    const scale = Math.min(1, width / total);
    ctx.save();
    ctx.translate(align === 'right' ? x - total * scale : align === 'center' ? x - total * scale / 2 : x, y);
    ctx.scale(scale, 1);
    ctx.textAlign = 'left';
    let cursor = 0;
    for (const char of text) {
      ctx.fillText(char, cursor, 0);
      cursor += char === '/' ? slashWidth : digitWidth;
    }
    ctx.restore();
  }

  function drawName(ctx, name, g, y) {
    // Keep every machine name on one line and use the largest size that fits.
    let size = g.nameFont;
    const minimum = g.rowHeight > 80 ? 15 : 10;
    const nameFont = '"Arial Black", "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
    while (size > minimum) {
      ctx.font = `900 ${size}px ${nameFont}`;
      if (ctx.measureText(name).width <= g.nameWidth) break;
      size--;
    }
    ctx.textAlign = 'left';
    ctx.font = `900 ${size}px ${nameFont}`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, Math.min(g.rowHeight > 80 ? 2.6 : 1.6, size * 0.05));
    ctx.strokeText(name, g.nameX, y, g.nameWidth);
    ctx.fillText(name, g.nameX, y, g.nameWidth);
  }

  async function render(type, format, targetCanvas) {
    const img = await loadImage(templates[type][format]);
    targetCanvas.width = img.naturalWidth;
    targetCanvas.height = img.naturalHeight;
    const ctx = targetCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const model = dates();
    if (!model) return;
    const g = layout[format];
    ctx.textBaseline = 'middle';
    const parts = [model.start.month, model.start.day, model.end.month, model.end.day];
    // The Web slot background places its month/day labels to the right of the
    // corresponding labels in the pachinko background.
    const headerOffset = type === 'slot' && format === 'web' ? 32 : 0;
    parts.forEach((value, i) => {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#061027'; ctx.shadowBlur = format === 'web' ? 9 : 5;
      ctx.shadowOffsetX = 3; ctx.shadowOffsetY = format === 'web' ? 7 : 4;
      drawTabular(ctx, String(value), g.dateX[i] + headerOffset, g.dateY, g.headerWidths[i], g.dateFont, g.dateFont - 24, 'center');
      ctx.restore();
    });
    // Remove colored placeholders built into the original Excel backgrounds.
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 10; i++) {
      const top = Math.round(g.rowTop + i * g.rowStep);
      for (const [left, right] of g.cells) ctx.fillRect(left + 2, top + 2, right - left - 3, g.rowHeight - 4);
    }
    state.parsed.groups[type].slice(0, 10).forEach((row, i) => {
      const y = Math.round(g.rowTop + i * g.rowStep + g.rowHeight / 2);
      ctx.fillStyle = toneColors.weekday;
      drawTabular(ctx, String(row.number), g.numberRight, y, g.numberWidth, g.numberFont, g.numberFont - 22, 'right');
      drawFitted(ctx, '番台', g.numberSuffixX, y + g.suffixY, g.nameX - g.numberSuffixX - 10, g.suffixFont, g.suffixFont - 4, 'left', '"Yu Gothic", Meiryo, sans-serif');
      drawName(ctx, row.name, g, y);
      const date = RankingCore.rowDate(row, model);
      ctx.fillStyle = toneColors[RankingCore.dateTone(date)];
      drawTabular(ctx, `${row.month}/${row.day}`, g.rowDateX, y, g.dateWidth, g.rowDateFont, g.rowDateFont - 8, 'center');
      ctx.fillStyle = toneColors.weekday;
      drawTabular(ctx, String(row.amount), g.amountRight, y, g.amountWidth, g.valueFont, g.valueFont - 27, 'right');
      drawFitted(ctx, type === 'pachinko' ? '玉' : '枚', g.amountSuffixX, y + g.suffixY, g.cells[2][1] - g.amountSuffixX - 5, g.suffixFont, g.suffixFont - 4, 'left', '"Yu Gothic", Meiryo, sans-serif');
    });
  }

  let drawVersion = 0;
  async function updatePreview() {
    const current = ++drawVersion;
    const period = dates();
    $('downloadAll').disabled = !period || !(state.parsed.groups.pachinko.length || state.parsed.groups.slot.length);
    const coverage = period && (period.start.year < 1955 || period.end.year > JapanHolidayData.throughYear)
      ? ' この年の公式祝日データは未収録です。土日だけ色分けします。' : '';
    const typeViews = [
      ['pachinko', 'previewP', 'statusP', 'downloadP'],
      ['slot', 'previewS', 'statusS', 'downloadS']
    ];
    await Promise.all(typeViews.map(async ([type, canvasId, statusId, buttonId]) => {
      const rows = state.parsed.groups[type];
      $(buttonId).disabled = !rows.length || !period;
      $(statusId).textContent = !rows.length ? 'この種類のランキングは見つかりません。' : !period ? '開始日と終了日（年・月・日）を確認してください。' : `上位${Math.min(rows.length, 10)}件を表示中。${coverage}`;
      try { await render(type, state.format, $(canvasId)); }
      catch (err) { $(statusId).textContent = err.message; $(buttonId).disabled = true; }
    }));
    if (current !== drawVersion) updatePreview();
  }

  function updateMail() {
    state.parsed = RankingCore.parseMail($('mailText').value);
    const p = state.parsed;
    const period = p.period || inferDates(p);
    const key = p.period ? JSON.stringify(p.period) : null;
    if (period && key !== state.periodKey && (p.period || !dates())) setDates(period);
    state.periodKey = key;
    const total = p.groups.pachinko.length + p.groups.slot.length;
    $('pCount').textContent = p.groups.pachinko.length;
    $('sCount').textContent = p.groups.slot.length;
    const parts = total ? [`パチンコ ${p.groups.pachinko.length}件、スロット ${p.groups.slot.length}件を読み取りました。`] : ['ランキング行を待っています。'];
    if (p.invalid.length) parts.push(`確認が必要な行 ${p.invalid.length}件（${p.invalid.map((x) => x.line).join('、')}行目）。`);
    if (total > 0 && !p.period) parts.push('期間が見つからないため、今年とランキングの日付で仮入力しました。年と期間を確認してください。');
    if (p.groups.pachinko.length > 10 || p.groups.slot.length > 10) parts.push('各種類の先頭10件だけ画像に表示します。');
    $('readStatus').textContent = parts.join(' ');
    $('periodStatus').textContent = p.period
      ? `本文から期間を自動取得しました：${p.period.start.year}年${p.period.start.month}月${p.period.start.day}日〜${p.period.end.year}年${p.period.end.month}月${p.period.end.day}日。違う場合だけ修正してください。`
      : period ? '本文に期間がないため、ランキング行の日付から仮入力しました。年と期間を確認してください。'
        : '本文の期間を自動取得します。必要な場合だけ下の日付を修正してください。';
    if (total && !p.period) $('dateDetails').open = true;
    updatePreview();
  }

  const blobFromCanvas = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('JPEGの作成に失敗しました。')), 'image/jpeg', 0.95));
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const fileName = (type, format) => `ranking-${type}-${format}.jpg`;

  // Store-only ZIP: JPEGs are already compressed. One download avoids browsers
  // blocking several automatic downloads from a single click.
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) { let crc = -1; for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ -1) >>> 0; }
  function zipFiles(files) {
    const encoder = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    function header(length, fill) { const buffer = new ArrayBuffer(length), view = new DataView(buffer); fill(view); return new Uint8Array(buffer); }
    for (const file of files) {
      const name = encoder.encode(file.name), crc = crc32(file.bytes), size = file.bytes.length;
      const local = header(30, (v) => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint32(14, crc, true); v.setUint32(18, size, true); v.setUint32(22, size, true); v.setUint16(26, name.length, true); });
      chunks.push(local, name, file.bytes);
      const record = header(46, (v) => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint32(16, crc, true); v.setUint32(20, size, true); v.setUint32(24, size, true); v.setUint16(28, name.length, true); v.setUint32(42, offset, true); });
      central.push(record, name);
      offset += local.length + name.length + size;
    }
    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const end = header(22, (v) => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, centralSize, true); v.setUint32(16, offset, true); });
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }

  $('mailText').addEventListener('input', updateMail);
  $('format').addEventListener('change', () => { state.format = $('format').value; updatePreview(); });
  ['startYear', 'startMonth', 'startDay', 'endYear', 'endMonth', 'endDay'].forEach((id) => $(id).addEventListener('input', () => {
    $('periodStatus').textContent = '日付を手動で修正しています。画像にもすぐ反映されます。';
    updatePreview();
  }));
  for (const [type, buttonId, canvasId] of [['pachinko', 'downloadP', 'previewP'], ['slot', 'downloadS', 'previewS']]) {
    $(buttonId).addEventListener('click', async () => {
      if ($(buttonId).disabled) return;
      saveBlob(await blobFromCanvas($(canvasId)), fileName(type, state.format));
    });
  }
  $('downloadAll').addEventListener('click', async () => {
    if ($('downloadAll').disabled) return;
    const button = $('downloadAll'); button.disabled = true; button.textContent = 'JPEGを作成中…';
    try {
      const files = [];
      for (const type of ['pachinko', 'slot']) {
        if (!state.parsed.groups[type].length) continue;
        const canvas = $(type === 'pachinko' ? 'previewP' : 'previewS');
        files.push({ name: fileName(type, state.format), bytes: new Uint8Array(await (await blobFromCanvas(canvas)).arrayBuffer()) });
      }
      saveBlob(zipFiles(files), 'ranking-jpegs.zip');
    } catch (err) { $('readStatus').textContent = err.message; }
    finally { button.textContent = 'パチンコ・スロットをまとめて保存（ZIP）'; updatePreview(); }
  });
  updatePreview();
})();
