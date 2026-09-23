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
  const typographyStorageKey = 'arena-ranking-typography-v1';
  const savedTypography = loadTypography();
  const state = {
    parsed: RankingCore.parseMail(''), format: 'web', periodKey: null,
    nameWeight: savedTypography.weight, nameScale: savedTypography.scale, rankingMode: 'weekly'
  };
  const imageCache = {};
  const nameBreakStorageKey = 'arena-ranking-name-breaks-v1';
  const nameBreaks = loadNameBreaks();
  const nameStyleStorageKey = 'arena-ranking-name-styles-v1';
  const nameStyles = loadNameStyles();
  const gmailStoreStorageKey = 'arena-ranking-store-v1';

  function loadTypography() {
    try {
      const saved = JSON.parse(localStorage.getItem(typographyStorageKey) || '{}');
      const weight = [500, 600, 700, 800, 900].includes(+saved.weight) ? +saved.weight : 800;
      const scale = Number.isFinite(+saved.scale) && +saved.scale >= 0.75 && +saved.scale <= 1.2 ? +saved.scale : 1;
      return { weight, scale };
    } catch (_) {
      return { weight: 800, scale: 1 };
    }
  }

  function saveTypography() {
    try { localStorage.setItem(typographyStorageKey, JSON.stringify({ weight: state.nameWeight, scale: state.nameScale })); } catch (_) {}
  }

  function updateTypographyLabels() {
    const labels = { 500: '細い', 600: 'やや細い', 700: '標準', 800: 'やや太い', 900: '太い' };
    $('nameWeightValue').textContent = labels[state.nameWeight];
    $('nameSizeValue').textContent = `${Math.round(state.nameScale * 100)}%`;
  }

  function typographyWeightLabel(weight) {
    return ({ 500: '細い', 600: 'やや細い', 700: '標準', 800: 'やや太い', 900: '太い' })[weight];
  }

  let gmailAccessToken = '';
  let gmailTokenExpiresAt = 0;

  function gmailStores() {
    const stores = window.ArenaGmailConfig && window.ArenaGmailConfig.stores;
    return Array.isArray(stores) ? stores.filter((store) => store && store.id && store.name && store.email) : [];
  }

  function selectedGmailStore() {
    const stores = gmailStores();
    return stores.find((store) => store.id === $('gmailStore').value) || stores[0] || null;
  }

  function selectedGmailEmail() {
    const store = selectedGmailStore();
    return store ? store.email : '';
  }

  function updateGmailStore(resetToken = true) {
    const store = selectedGmailStore();
    if (resetToken) {
      gmailAccessToken = '';
      gmailTokenExpiresAt = 0;
    }
    $('gmailEmail').textContent = store ? store.email : '利用できる店舗がありません';
    if (store) {
      try { localStorage.setItem(gmailStoreStorageKey, store.id); } catch (_) {}
      $('gmailStatus').textContent = `${store.name}のGmailから週間または月間の画像を作成します。`;
    }
  }

  function setupGmailStores() {
    const select = $('gmailStore');
    const stores = gmailStores();
    select.replaceChildren(...stores.map((store) => {
      const option = document.createElement('option');
      option.value = store.id;
      option.textContent = store.name;
      return option;
    }));
    let saved = '';
    try { saved = localStorage.getItem(gmailStoreStorageKey) || ''; } catch (_) {}
    select.value = stores.some((store) => store.id === saved) ? saved : (stores[0] && stores[0].id || '');
    updateGmailStore(false);
  }

  function setGmailBusy(busy, message) {
    $('gmailImport').disabled = busy;
    $('gmailMonthlyImport').disabled = busy;
    $('gmailImport').textContent = busy ? '週間画像を作成中…' : '週間画像作成';
    $('gmailMonthlyImport').textContent = busy ? '月間画像を作成中…' : '月間画像作成';
    if (message) $('gmailStatus').textContent = message;
  }

  async function importLatestGmail() {
    setGmailBusy(true, '直近30日のメールからランキングを探しています…');
    try {
      const found = await ArenaGmail.findLatestRanking(gmailAccessToken, RankingCore.parseMail, {
        allowedEmail: selectedGmailEmail()
      });
      if (!found) {
        setGmailBusy(false, '直近30日に読み取れるランキングメールが見つかりませんでした。');
        return;
      }
      $('mailText').value = found.body;
      updateMail();
      const p = found.parsed;
      $('gmailStatus').textContent = `「${found.subject}」を読み込み、パチンコ${p.groups.pachinko.length}件・スロット${p.groups.slot.length}件の画像を作成しました。`;
    } catch (error) {
      if (error.status === 401) { gmailAccessToken = ''; gmailTokenExpiresAt = 0; }
      $('gmailStatus').textContent = error.message || 'Gmailの読み込みに失敗しました。';
    } finally {
      setGmailBusy(false);
    }
  }

  function buildMonthlyMail(parsed) {
    const p = parsed.period;
    const lines = [
      'Gmailの週間ランキングメールをまとめた月間ランキング',
      `${p.start.year}年${p.start.month}月${p.start.day}日～${p.end.year}年${p.end.month}月${p.end.day}日`,
      '',
      '■4円P'
    ];
    parsed.groups.pachinko.forEach((row, i) => lines.push(`${i + 1}位 ${row.number}番台 ${row.name} ${row.month}/${row.day} ${row.amount}発`));
    lines.push('', '■21.7391円S');
    parsed.groups.slot.forEach((row, i) => lines.push(`${i + 1}位 ${row.number}番台 ${row.name} ${row.month}/${row.day} ${row.amount}枚`));
    return lines.join('\n');
  }

  async function importMonthlyGmail() {
    const match = $('monthlyTarget').value.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      $('gmailStatus').textContent = '月間ランキングの対象月を選んでください。';
      return;
    }
    const year = +match[1], month = +match[2];
    setGmailBusy(true, `${year}年${month}月と前後の週間メールを集めています…`);
    try {
      const found = await ArenaGmail.findMonthlyRankings(gmailAccessToken, RankingCore.parseMail, {
        allowedEmail: selectedGmailEmail(),
        year,
        month
      });
      if (!found) {
        setGmailBusy(false, `${year}年${month}月のランキングを週間メールから見つけられませんでした。`);
        return;
      }
      state.rankingMode = 'monthly';
      $('mailText').value = buildMonthlyMail(found.parsed);
      updateMail();
      const p = found.parsed;
      $('gmailStatus').textContent = `${found.sources.length}通の週間メールを結合しました。全記録を数値順に並べ、パチンコ${p.groups.pachinko.length}件・スロット${p.groups.slot.length}件から月間画像を作成しました。`;
    } catch (error) {
      if (error.status === 401) { gmailAccessToken = ''; gmailTokenExpiresAt = 0; }
      $('gmailStatus').textContent = error.message || '月間ランキングの作成に失敗しました。';
    } finally {
      setGmailBusy(false);
    }
  }

  function runGmailImport(mode) {
    return mode === 'monthly' ? importMonthlyGmail() : importLatestGmail();
  }

  function authorizeGmail(mode = 'weekly') {
    const clientId = window.ArenaGmailConfig && window.ArenaGmailConfig.clientId;
    const allowedEmail = selectedGmailEmail();
    if (!clientId) {
      $('gmailStatus').textContent = 'Google側の認証設定を準備中です。';
      return;
    }
    if (!allowedEmail) {
      $('gmailStatus').textContent = '店舗のGmail設定が見つかりません。';
      return;
    }
    if (gmailAccessToken && Date.now() < gmailTokenExpiresAt) {
      runGmailImport(mode);
      return;
    }
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      $('gmailStatus').textContent = 'Googleログインを準備中です。数秒後にもう一度押してください。';
      return;
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      prompt: '',
      login_hint: allowedEmail || undefined,
      callback: (response) => {
        if (response.error || !response.access_token) {
          $('gmailStatus').textContent = response.error === 'access_denied' ? 'Gmailの読み取りが許可されませんでした。' : 'Googleログインを完了できませんでした。';
          return;
        }
        gmailAccessToken = response.access_token;
        gmailTokenExpiresAt = Date.now() + Math.max(60, (+response.expires_in || 3600) - 60) * 1000;
        runGmailImport(mode);
      },
      error_callback: () => { $('gmailStatus').textContent = 'Googleログイン画面が閉じられました。'; }
    });
    tokenClient.requestAccessToken();
  }

  function nameKey(name) {
    return String(name || '').replace(/\s+/g, '');
  }

  function loadNameStyles() {
    try {
      const saved = JSON.parse(localStorage.getItem(nameStyleStorageKey) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
      return Object.fromEntries(Object.entries(saved).filter(([, value]) =>
        value && [500, 600, 700, 800, 900].includes(+value.weight) &&
        Number.isFinite(+value.scale) && +value.scale >= 0.75 && +value.scale <= 1.2
      ).map(([key, value]) => [key, { weight: +value.weight, scale: +value.scale }]));
    } catch (_) {
      return {};
    }
  }

  function saveNameStyles() {
    try { localStorage.setItem(nameStyleStorageKey, JSON.stringify(nameStyles)); } catch (_) {}
  }

  function machineRows() {
    const seen = new Set();
    const rows = [];
    for (const [type, label] of [['pachinko', 'パチンコ'], ['slot', 'スロット']]) {
      for (const row of state.parsed.groups[type]) {
        const key = nameKey(row.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        rows.push({ key, label, name: String(row.name).replace(/\n/g, ' ／ ') });
      }
    }
    return rows;
  }

  function updateMachineStyleOptions(selectedKey = $('machineStyleList').value) {
    const select = $('machineStyleList');
    const rows = machineRows();
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = rows.length ? '機種名を選択' : 'メール本文を読み込んでください';
    select.append(empty);
    for (const row of rows) {
      const option = document.createElement('option');
      option.value = row.key;
      option.textContent = `${row.label}：${row.name}`;
      select.append(option);
    }
    select.value = rows.some((row) => row.key === selectedKey) ? selectedKey : '';
    syncMachineStyleControls();
  }

  function syncMachineStyleControls() {
    const key = $('machineStyleList').value;
    const saved = key && nameStyles[key];
    const weight = saved ? saved.weight : state.nameWeight;
    const scale = saved ? saved.scale : state.nameScale;
    $('machineWeight').value = weight;
    $('machineSize').value = Math.round(scale * 100);
    $('machineWeightValue').textContent = typographyWeightLabel(weight);
    $('machineSizeValue').textContent = `${Math.round(scale * 100)}%`;
    $('machineWeight').disabled = !key;
    $('machineSize').disabled = !key;
    $('resetMachineStyle').disabled = !saved;
    $('machineStyleStatus').textContent = !key ? '機種名を選ぶと個別に調整できます。'
      : saved ? 'この機種の個別設定を使用しています。次回も同じ設定で表示します。'
        : '個別設定なし。現在は全体設定を使用しています。';
  }

  function saveSelectedMachineStyle() {
    const key = $('machineStyleList').value;
    if (!key) return;
    nameStyles[key] = { weight: +$('machineWeight').value, scale: +$('machineSize').value / 100 };
    saveNameStyles();
    syncMachineStyleControls();
    updatePreview();
  }

  function resetSelectedMachineStyle() {
    const key = $('machineStyleList').value;
    if (!key || !nameStyles[key]) return;
    delete nameStyles[key];
    saveNameStyles();
    syncMachineStyleControls();
    $('machineStyleStatus').textContent = '個別設定を解除し、全体設定に戻しました。';
    updatePreview();
  }

  function nameStyle(name) {
    return nameStyles[nameKey(name)] || { weight: state.nameWeight, scale: state.nameScale };
  }

  function loadNameBreaks() {
    try {
      const saved = JSON.parse(localStorage.getItem(nameBreakStorageKey) || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (_) {
      return {};
    }
  }

  function saveNameBreaks() {
    try { localStorage.setItem(nameBreakStorageKey, JSON.stringify(nameBreaks)); } catch (_) {}
  }

  function updateBreakMemoryControls(selectedKey = '') {
    const select = $('breakMemoryList');
    const entries = Object.entries(nameBreaks).sort((a, b) =>
      a[1].replace(/\n/g, '').localeCompare(b[1].replace(/\n/g, ''), 'ja')
    );
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = entries.length ? '機種名を選択' : '記憶なし';
    select.append(empty);
    for (const [key, displayName] of entries) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = displayName.replace(/\n/g, ' ／ ');
      select.append(option);
    }
    select.value = entries.some(([key]) => key === selectedKey) ? selectedKey : '';
    $('forgetBreak').disabled = !select.value;
  }

  function rememberManualBreaks(parsed) {
    let changed = 0;
    for (const row of [...parsed.groups.pachinko, ...parsed.groups.slot]) {
      const parts = String(row.name).split('\n').map((line) => line.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const displayName = `${parts[0]}\n${parts.slice(1).join(' ')}`;
      const key = nameKey(displayName);
      if (key && nameBreaks[key] !== displayName) {
        nameBreaks[key] = displayName;
        changed++;
      }
    }
    if (changed) {
      saveNameBreaks();
      updateBreakMemoryControls();
    }
    return changed;
  }

  function rememberedName(name) {
    if (String(name).includes('\n')) return name;
    return nameBreaks[nameKey(name)] || name;
  }

  function forgetSelectedBreak() {
    const key = $('breakMemoryList').value;
    const displayName = nameBreaks[key];
    if (!key || !displayName) return;
    delete nameBreaks[key];
    saveNameBreaks();
    for (const row of [...state.parsed.groups.pachinko, ...state.parsed.groups.slot]) {
      if (nameKey(row.name) === key) row.name = String(row.name).replace(/\s*\n\s*/g, '');
    }
    updateBreakMemoryControls();
    $('breakMemoryStatus').textContent = `「${displayName.replace(/\n/g, '')}」を1行に戻しました。次回も1行で表示します。`;
    updatePreview();
  }

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

  const nameFont = 'Arial, "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';

  function fittedNameSize(ctx, lines, initial, minimum, width, weight) {
    let size = initial;
    while (size > minimum) {
      ctx.font = `${weight} ${size}px ${nameFont}`;
      if (lines.every((line) => ctx.measureText(line).width <= width)) break;
      size--;
    }
    return size;
  }

  function drawNameLine(ctx, text, x, y, width, size, align, weight) {
    ctx.textAlign = align;
    ctx.font = `${weight} ${size}px ${nameFont}`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle;
    const stroke = Math.max(0, (weight - 500) / 400) * Math.min(size > 25 ? 1.8 : 1.1, size * 0.03);
    if (stroke > 0.1) { ctx.lineWidth = stroke; ctx.strokeText(text, x, y, width); }
    ctx.fillText(text, x, y, width);
  }

  function drawName(ctx, name, g, y) {
    const style = nameStyle(name);
    name = rememberedName(name);
    const minimum = g.rowHeight > 80 ? 15 : 9;
    const oneLineMax = Math.round(g.nameFont * style.scale);
    const parts = String(name).split('\n').map((line) => line.trim()).filter(Boolean);
    if (parts.length <= 1) {
      const line = parts[0] || '';
      const size = fittedNameSize(ctx, [line], oneLineMax, minimum, g.nameWidth, style.weight);
      drawNameLine(ctx, line, g.nameX, y, g.nameWidth, size, 'left', style.weight);
      return;
    }

    // Only an Enter inserted by the user creates a second line. If more than
    // one Enter is present, keep the first line and combine the rest on line 2.
    const lines = [parts[0], parts.slice(1).join(' ')];
    const twoLineMax = Math.round((g.rowHeight > 80 ? 41 : 23) * style.scale);
    const size = fittedNameSize(ctx, lines, twoLineMax, minimum, g.nameWidth, style.weight);
    const center = g.nameX + g.nameWidth / 2;
    const gap = size * 0.96;
    drawNameLine(ctx, lines[0], center, y - gap / 2, g.nameWidth, size, 'center', style.weight);
    drawNameLine(ctx, lines[1], center, y + gap / 2, g.nameWidth, size, 'center', style.weight);
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
    const remembered = rememberManualBreaks(p);
    const period = p.period || inferDates(p);
    if (p.period) {
      const start = Date.UTC(p.period.start.year, p.period.start.month - 1, p.period.start.day);
      const end = Date.UTC(p.period.end.year, p.period.end.month - 1, p.period.end.day);
      state.rankingMode = (end - start) / 86400000 >= 20 ? 'monthly' : 'weekly';
    }
    const key = p.period ? JSON.stringify(p.period) : null;
    if (period && key !== state.periodKey && (p.period || !dates())) setDates(period);
    state.periodKey = key;
    const total = p.groups.pachinko.length + p.groups.slot.length;
    $('pCount').textContent = p.groups.pachinko.length;
    $('sCount').textContent = p.groups.slot.length;
    const parts = total ? [`パチンコ ${p.groups.pachinko.length}件、スロット ${p.groups.slot.length}件を読み取りました。`] : ['ランキング行を待っています。'];
    if (remembered) parts.push(`${remembered}件の機種名の改行位置を記憶しました。`);
    if (p.invalid.length) parts.push(`確認が必要な行 ${p.invalid.length}件（${p.invalid.map((x) => x.line).join('、')}行目）。`);
    if (total > 0 && !p.period) parts.push('期間が見つからないため、今年とランキングの日付で仮入力しました。年と期間を確認してください。');
    if (p.groups.pachinko.length > 10 || p.groups.slot.length > 10) parts.push('各種類の先頭10件だけ画像に表示します。');
    $('readStatus').textContent = parts.join(' ');
    updateMachineStyleOptions();
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
  const fileName = (type, format) => `ranking-${state.rankingMode === 'monthly' ? 'monthly-' : ''}${type}-${format}.jpg`;

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
  $('gmailImport').addEventListener('click', () => authorizeGmail('weekly'));
  $('gmailMonthlyImport').addEventListener('click', () => authorizeGmail('monthly'));
  $('gmailStore').addEventListener('change', () => updateGmailStore(true));
  $('breakMemoryList').addEventListener('change', () => {
    $('forgetBreak').disabled = !$('breakMemoryList').value;
    $('breakMemoryStatus').textContent = '';
  });
  $('forgetBreak').addEventListener('click', forgetSelectedBreak);
  $('machineStyleList').addEventListener('change', syncMachineStyleControls);
  $('machineWeight').addEventListener('input', saveSelectedMachineStyle);
  $('machineSize').addEventListener('input', saveSelectedMachineStyle);
  $('resetMachineStyle').addEventListener('click', resetSelectedMachineStyle);
  $('format').addEventListener('change', () => { state.format = $('format').value; updatePreview(); });
  $('nameWeight').value = state.nameWeight;
  $('nameSize').value = Math.round(state.nameScale * 100);
  updateTypographyLabels();
  $('nameWeight').addEventListener('input', () => {
    state.nameWeight = +$('nameWeight').value;
    updateTypographyLabels(); saveTypography(); syncMachineStyleControls(); updatePreview();
  });
  $('nameSize').addEventListener('input', () => {
    state.nameScale = +$('nameSize').value / 100;
    updateTypographyLabels(); saveTypography(); syncMachineStyleControls(); updatePreview();
  });
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
      saveBlob(zipFiles(files), state.rankingMode === 'monthly' ? 'ranking-monthly-jpegs.zip' : 'ranking-jpegs.zip');
    } catch (err) { $('readStatus').textContent = err.message; }
    finally { button.textContent = 'パチンコ・スロットをまとめて保存（ZIP）'; updatePreview(); }
  });
  updateBreakMemoryControls();
  updateMachineStyleOptions();
  setupGmailStores();
  const now = new Date();
  $('monthlyTarget').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  updatePreview();
})();
