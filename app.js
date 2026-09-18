(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const templates = {
    pachinko: { web: 'assets/pachinko-web.jpg', signage: 'assets/pachinko-signage.jpg' },
    slot: { web: 'assets/slot-web.jpg', signage: 'assets/slot-signage.jpg' }
  };
  const layout = {
    web: { dateX: [140, 450, 850, 1250], dateY: 658, dateFont: 72,
      rowTop: 906, rowHeight: 101, rowStep: 129.3, cells: [[253, 932], [951, 1146], [1166, 1482]],
      numberRight: 490, numberWidth: 228, nameX: 510, nameWidth: 416,
      rowDateX: 1049, dateWidth: 186, amountRight: 1472, amountWidth: 296,
      numberFont: 54, nameFont: 47, rowDateFont: 54, valueFont: 52 },
    signage: { dateX: [90, 245, 430, 615], dateY: 404, dateFont: 40,
      rowTop: 540, rowHeight: 59, rowStep: 77, cells: [[118, 430], [441, 529], [540, 684]],
      numberRight: 225, numberWidth: 101, nameX: 235, nameWidth: 190,
      rowDateX: 485, dateWidth: 83, amountRight: 677, amountWidth: 129,
      numberFont: 29, nameFont: 27, rowDateFont: 29, valueFont: 28 }
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

  const toneColors = { weekday: '#111111', saturday: '#0c4ac4', holiday: '#c11320' };

  function drawFitted(ctx, text, x, y, width, initial, minimum, align, outline = false) {
    let size = initial;
    ctx.textAlign = align;
    ctx.font = `700 ${size}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    while (size > minimum) {
      if (ctx.measureText(text).width <= width) break;
      size--;
      ctx.font = `700 ${size}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    }
    if (outline) {
      ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.lineWidth = size > 50 ? 8 : 5;
      ctx.strokeText(text, x, y, width);
    }
    ctx.fillText(text, x, y, width);
  }

  function drawName(ctx, name, g, y) {
    // Try the largest bold font that fits the cell, using up to three lines.
    let chosen;
    for (let size = g.nameFont; size >= (g.rowHeight > 80 ? 18 : 12); size--) {
      ctx.font = `700 ${size}px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
      const lines = [''];
      for (const char of Array.from(name)) {
        const last = lines.length - 1;
        if (lines[last] && ctx.measureText(lines[last] + char).width > g.nameWidth) lines.push(char);
        else lines[last] += char;
      }
      if (lines.length <= 3 && lines.length * (size + 2) <= g.rowHeight - 6) { chosen = { size, lines }; break; }
    }
    if (!chosen) { ctx.font = '700 12px sans-serif'; chosen = { size: 12, lines: [name] }; }
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
    const parts = [
      [model.start.month, model.start], [model.start.day, model.start],
      [model.end.month, model.end], [model.end.day, model.end]
    ];
    parts.forEach(([value, date], i) => {
      ctx.fillStyle = toneColors[RankingCore.dateTone(date)];
      drawFitted(ctx, String(value), g.dateX[i], g.dateY, format === 'web' ? 115 : 65, g.dateFont, g.dateFont - 8, 'center', true);
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
      drawFitted(ctx, `${row.number}番台`, g.numberRight, y, g.numberWidth, g.numberFont, g.numberFont - 12, 'right');
      drawName(ctx, row.name, g, y);
      const date = RankingCore.rowDate(row, model);
      ctx.fillStyle = toneColors[RankingCore.dateTone(date)];
      drawFitted(ctx, `${row.month}/${row.day}`, g.rowDateX, y, g.dateWidth, g.rowDateFont, g.rowDateFont - 8, 'center');
      ctx.fillStyle = toneColors.weekday;
      drawFitted(ctx, `${row.amount}${type === 'pachinko' ? '玉' : '枚'}`, g.amountRight, y, g.amountWidth, g.valueFont, g.valueFont - 10, 'right');
    });
  }

  let drawVersion = 0;
  async function updatePreview() {
    const current = ++drawVersion;
    const rows = state.parsed.groups[state.type];
    const period = dates();
    $('download').disabled = !rows.length || !period;
    $('downloadAll').disabled = !period || !(state.parsed.groups.pachinko.length || state.parsed.groups.slot.length);
    const coverage = period && (period.start.year < 1955 || period.end.year > JapanHolidayData.throughYear)
      ? ' この年の公式祝日データは未収録です。土日だけ色分けします。' : '';
    $('previewStatus').textContent = !rows.length ? 'この種類のランキングは見つかりません。' : !period ? '開始日と終了日（年・月・日）を正しく入力してください。' : `${rows.length}件を読み取りました。画像には上位${Math.min(rows.length, 10)}件を表示します。${coverage}`;
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
    if (total > 0 && !p.period) parts.push('期間が見つからないため、今年とランキングの日付で仮入力しました。年と期間を確認してください。');
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
  ['startYear', 'startMonth', 'startDay', 'endYear', 'endMonth', 'endDay'].forEach((id) => $(id).addEventListener('input', updatePreview));
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
