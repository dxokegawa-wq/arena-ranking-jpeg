(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RankingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const normal = (s) => String(s || '').replace(/[①-⑳]/g, (c) => `${c.codePointAt(0) - 9311}位`).normalize('NFKC').replace(/\u00a0/g, ' ');

  function readPeriod(text) {
    const source = normal(text).replace(/\s+/g, ' ');
    const date = '(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日';
    const match = source.match(new RegExp(date + '[^\\d]{0,15}[～〜~ー－-][^\\d]{0,15}' + date));
    if (!match) return null;
    return {
      start: { year: +match[1], month: +match[2], day: +match[3] },
      end: { year: +match[4], month: +match[5], day: +match[6] }
    };
  }

  function validDate(date) {
    if (!date || date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return false;
    if (!date.year) return true;
    const check = new Date(date.year, date.month - 1, date.day);
    return check.getFullYear() === date.year && check.getMonth() + 1 === date.month && check.getDate() === date.day;
  }

  function parseMail(text) {
    const groups = { pachinko: [], slot: [] };
    const invalid = [];
    let section = null;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = normal(lines[i]).trim();
      if (!line) continue;
      if (/^[■□●◆▪\s]*(?:\d+(?:[.,]\d+)?\s*円\s*)?P\s*$/i.test(line)) { section = 'pachinko'; continue; }
      if (/^[■□●◆▪\s]*(?:\d+(?:[.,]\d+)?\s*円\s*)?S\s*$/i.test(line)) { section = 'slot'; continue; }
      // A rank and a machine number must start the line. The date and result are
      // taken from the right so digits and spaces in machine names are preserved.
      const match = line.match(/^\s*(?:(?:[①-⑳]|\d{1,2}\s*(?:位|[.．、)]))\s*)?(\d{1,5})\s*番台\s+(.+?)\s+(\d{1,2})\s*[\/.]\s*(\d{1,2})\s+([\d,，]+)\s*(発|枚)\s*$/i);
      if (!match) {
        if (/番台/.test(line) && /[発枚]\s*$/.test(line)) invalid.push({ line: i + 1, text: lines[i] });
        continue;
      }
      const type = match[6] === '発' ? 'pachinko' : 'slot';
      const row = {
        number: +match[1], name: match[2].trim(), month: +match[3], day: +match[4],
        amount: +match[5].replace(/[，,]/g, ''), unit: match[6]
      };
      if (row.number < 1 || row.month < 1 || row.month > 12 || row.day < 1 || row.day > 31 || +row.amount < 0) {
        invalid.push({ line: i + 1, text: lines[i] });
        continue;
      }
      if (section && section !== type) invalid.push({ line: i + 1, text: lines[i], reason: '区分と単位が異なります' });
      groups[type].push(row);
    }
    return { groups, period: readPeriod(text), invalid };
  }

  return { parseMail, readPeriod, validDate };
});
