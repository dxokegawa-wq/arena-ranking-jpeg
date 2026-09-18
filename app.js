(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const templates = {
    pachinko: { web: 'assets/pachinko-web.jpg', signage: 'assets/pachinko-signage.jpg' },
    slot: { web: 'assets/slot-web.jpg', signage: 'assets/slot-signage.jpg' }
  };
  const layout = {
    web: { dateX: [140, 450, 850, 1250], dateY: 658, dateFont: 72,
      rowY: 971, rowStep: 130, numberRight: 390, nameX: 510, nameWidth: 420,
      rowDateX: 1050, amountRight: 1400, numberFont: 37, nameFont: 34, valueFont: 39 },
    signage: { dateX: [90, 245, 430, 615], dateY: 404, dateFont: 40,
      rowY: 582, rowStep: 77, numberRight: 178, nameX: 235, nameWidth: 192,
      rowDateX: 485, amountRight: 652, numberFont: 22, nameFont: 20, valueFont: 23 }
  };
  const state = { parsed: RankingCore.parseMail(''), type: 'pachinko', format: 'web', periodKey: null };
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
    const ids = ['startMonth', 'startDay', 'endMonth', 'endDay'];
    const nums = ids.map((id) => +$(id).value);
    const start = { month: nums[0], day: nums[1] };
    const end = { month: nums[2], day: nums[3] };
    return RankingCore.validDate(start) && RankingCore.validDate(end) ? { start, end } : null;
  }

  function setDates(period) {
    $('startMonth').value = period.start.month;
    $('startDay').value = period.start.day;
    $('endMonth').value = period.end.month;
    $('endDay').value = period.end.day;
  }

  function inferDates(parsed) {
    const rows = [...parsed.groups.pachinko, ...parsed.groups.slot];
    if (!rows.length) return null;
    const first = rows[0], last = rows[rows.length - 1];
    // A week can cross month/year boundaries. Use first/last dates in source
    // order only when no explicit period is supplied; users can correct it.
    return { start: { month: last.month, day: last.day }, end: { month: first.month, day: first.day } };
  }

  function drawFitted(ctx, text, x, y, width, initial, minimum, align) {
    let size = initial;
    ctx.textAlign = align;
    ctx.font = `700 ${size}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    while (size > minimum) {
      if (ctx.measureText(text).width <= width) break;
      size--;
      ctx.font = `700 ${size}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    }
    ctx.fillText(text, x, y, width);
  }

  function drawName(ctx, name, g, y, format) {
    ctx.font = `700 ${g.nameFont}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    if (format === 'web' || ctx.measureText(name).width <= g.nameWidth) {
      drawFitted(ctx, name, g.nameX, y, g.nameWidth, g.nameFont, Math.round(g.nameFont * 0.57), 'left');
      return;
    }
    // Two or three short lines keep long Japanese model names legible on signage.
    let chosen = null;
    for (const size of [19, 18, 17, 16, 15, 14]) {
      ctx.font = `700 ${size}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
      const lines = [''];
      for (const char of Array.from(name)) {
        const last = lines.length - 1;
        if (lines[last] && ctx.measureText(lines[last] + char).width > g.nameWidth) lines.push(char);
        else lines[last] += char;
      }
      if (lines.length <= 2 || size === 14) { chosen = { size, lines: lines.slice(0, 3) }; break; }
    }
    ctx.textAlign = 'left';
    ctx.font = `700 ${chosen.size}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    const step = chosen.size + 2;
    chosen.lines.forEach((line, n) => ctx.fillText(line, g.nameX, y + (n - (chosen.lines.length - 1) / 2) * step, g.nameWidth));
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
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#080b25';
    ctx.shadowBlur = format === 'web' ? 8 : 5;
    ctx.shadowOffsetY = 2;
    const parts = [model.start.month, model.start.day, model.end.month, model.end.day];
    parts.forEach((value, i) => drawFitted(ctx, String(value), g.dateX[i], g.dateY, 85, g.dateFont, g.dateFont, 'center'));
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = type === 'pachinko' ? '#a80014' : '#092d78';
    state.parsed.groups[type].slice(0, 10).forEach((row, i) => {
      const y = g.rowY + i * g.rowStep;
      drawFitted(ctx, String(row.number), g.numberRight, y, format === 'web' ? 90 : 49, g.numberFont, g.numberFont - 4, 'right');
      drawName(ctx, row.name, g, y, format);
      drawFitted(ctx, `${row.month}/${row.day}`, g.rowDateX, y, format === 'web' ? 155 : 86, g.numberFont, g.numberFont - 5, 'center');
      drawFitted(ctx, String(row.amount), g.amountRight, y, format === 'web' ? 190 : 90, g.valueFont, g.valueFont - 5, 'right');
    });
  }

  let drawVersion = 0;
  async function updatePreview() {
    const current = ++drawVersion;
    const rows = state.parsed.groups[state.type];
    const period = dates();
    $('download').disabled = !rows.length || !period;
    $('downloadAll').disabled = !period || !(state.parsed.groups.pachinko.length || state.parsed.groups.slot.length);
    $('previewStatus').textContent = !rows.length ? 'この種類のランキングは見つかりません。' : !period ? '開始日と終了日を入力してください。' : `${rows.length}件を読み取りました。画像には上位${Math.min(rows.length, 10)}件を表示します。`;
    try {
      await render(state.type, state.format, $('preview'));
      if (current !== drawVersion) updatePreview();
    } catch (err) { $('previewStatus').textContent = err.message; $('download').disabled = true; }
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
    if (p.groups[state.type].length === 0 && total) state.type = p.groups.pachinko.length ? 'pachinko' : 'slot';
    document.querySelectorAll('.type-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
    const parts = total ? [`パチンコ ${p.groups.pachinko.length}件、スロット ${p.groups.slot.length}件を読み取りました。`] : ['ランキング行を待っています。'];
    if (p.invalid.length) parts.push(`確認が必要な行 ${p.invalid.length}件（${p.invalid.map((x) => x.line).join('、')}行目）。`);
    if (total > 0 && !p.period) parts.push('期間が見つからないため、最初と最後のランキング日を仮入力しました。');
    if (p.groups.pachinko.length > 10 || p.groups.slot.length > 10) parts.push('各種類の先頭10件だけ画像に表示します。');
    $('readStatus').textContent = parts.join(' ');
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

  document.querySelectorAll('.type-btn').forEach((button) => button.addEventListener('click', () => {
    state.type = button.dataset.type;
    document.querySelectorAll('.type-btn').forEach((b) => b.classList.toggle('active', b === button));
    updatePreview();
  }));
  $('mailText').addEventListener('input', updateMail);
  $('format').addEventListener('change', () => { state.format = $('format').value; updatePreview(); });
  ['startMonth', 'startDay', 'endMonth', 'endDay'].forEach((id) => $(id).addEventListener('input', updatePreview));
  $('download').addEventListener('click', async () => {
    if ($('download').disabled) return;
    const blob = await blobFromCanvas($('preview'));
    saveBlob(blob, fileName(state.type, state.format));
  });
  $('downloadAll').addEventListener('click', async () => {
    if ($('downloadAll').disabled) return;
    const button = $('downloadAll'); button.disabled = true; button.textContent = 'JPEGを作成中…';
    try {
      const files = [];
      for (const type of ['pachinko', 'slot']) {
        if (!state.parsed.groups[type].length) continue;
        for (const format of ['web', 'signage']) {
          const canvas = document.createElement('canvas');
          await render(type, format, canvas);
          files.push({ name: fileName(type, format), bytes: new Uint8Array(await (await blobFromCanvas(canvas)).arrayBuffer()) });
        }
      }
      saveBlob(zipFiles(files), 'ranking-jpegs.zip');
    } catch (err) { $('previewStatus').textContent = err.message; }
    finally { button.textContent = '読み取った画像をまとめて保存'; updatePreview(); }
  });
  updatePreview();
})();
