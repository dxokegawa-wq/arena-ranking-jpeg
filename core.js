(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RankingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const normal = (s) => String(s || '').replace(/[①-⑳]/g, (c) => `${c.codePointAt(0) - 9311}位`).normalize('NFKC').replace(/\u00a0/g, ' ');

  function readPeriod(text) {
    const source = normal(text).replace(/\s+/g, ' ');
    const date = '(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日';
    const match = source.match(new RegExp(date + '[^\\d]{0,15}[～〜~ー－-][^\\d]{0,15}' + date));
    if (!match) return null;
    const period = {
      start: { year: +match[1], month: +match[2], day: +match[3] },
      end: { year: +match[4], month: +match[5], day: +match[6] }
    };
    return validDate(period.start) && validDate(period.end) ? period : null;
  }

  function validDate(date) {
    if (!date || !Number.isInteger(date.year) || date.year < 1900 || date.year > 2100 || date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return false;
    const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
    return check.getUTCFullYear() === date.year && check.getUTCMonth() + 1 === date.month && check.getUTCDate() === date.day;
  }

  function dateTone(date, holidayData = root.JapanHolidayData) {
    if (!validDate(date)) return 'weekday';
    const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    const key = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    if (day === 0 || holidayData?.dates.has(key)) return 'holiday';
    return day === 6 ? 'saturday' : 'weekday';
  }

  function rowDate(row, period) {
    const begin = Date.UTC(period.start.year, period.start.month - 1, period.start.day);
    const end = Date.UTC(period.end.year, period.end.month - 1, period.end.day);
    for (const year of new Set([period.start.year, period.end.year])) {
      const date = { year, month: row.month, day: row.day };
      const time = Date.UTC(year, row.month - 1, row.day);
      if (validDate(date) && time >= begin && time <= end) return date;
    }
    return { year: period.end.year, month: row.month, day: row.day };
  }

  function parseMail(text) {
    const groups = { pachinko: [], slot: [] };
    const invalid = [];
    let section = null;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const sourceLine = i;
      let line = normal(lines[i]).trim();
      if (!line) continue;
      if (/^[■□●◆▪\s]*(?:\d+(?:[.,]\d+)?\s*円\s*)?P\s*$/i.test(line)) { section = 'pachinko'; continue; }
      if (/^[■□●◆▪\s]*(?:\d+(?:[.,]\d+)?\s*円\s*)?S\s*$/i.test(line)) { section = 'slot'; continue; }
      // A line break inserted inside a machine name is kept as a manual
      // two-line instruction for the image. Continue until the date/result
      // portion of that ranking row is found.
      if (/番台/.test(line) && !/[発枚]\s*$/.test(line)) {
        const parts = [line];
        while (i + 1 < lines.length && !/[発枚]\s*$/.test(parts[parts.length - 1])) {
          const next = normal(lines[i + 1]).trim();
          if (!next || /^[■□●◆▪]/.test(next)) break;
          parts.push(next);
          i++;
        }
        line = parts.join('\n');
      }
      // A rank and a machine number must start the line. The date and result are
      // taken from the right so digits and spaces in machine names are preserved.
      const match = line.match(/^\s*(?:(?:[①-⑳]|\d{1,2}\s*(?:位|[.．、)]))\s*)?(\d{1,5})\s*番台\s+([\s\S]+?)\s+(\d{1,2})\s*[\/.]\s*(\d{1,2})\s+([\d,，]+)\s*(発|枚)\s*$/i);
      if (!match) {
        if (/番台/.test(line) && /[発枚]\s*$/.test(line)) invalid.push({ line: sourceLine + 1, text: lines.slice(sourceLine, i + 1).join('\n') });
        continue;
      }
      const type = match[6] === '発' ? 'pachinko' : 'slot';
      const row = {
        number: +match[1], name: match[2].trim().replace(/[ \t]*\n[ \t]*/g, '\n'), month: +match[3], day: +match[4],
        amount: +match[5].replace(/[，,]/g, ''), unit: match[6]
      };
      if (row.number < 1 || row.month < 1 || row.month > 12 || row.day < 1 || row.day > 31 || +row.amount < 0) {
        invalid.push({ line: sourceLine + 1, text: lines.slice(sourceLine, i + 1).join('\n') });
        continue;
      }
      if (section && section !== type) invalid.push({ line: sourceLine + 1, text: lines.slice(sourceLine, i + 1).join('\n'), reason: '区分と単位が異なります' });
      groups[type].push(row);
    }
    return { groups, period: readPeriod(text), invalid };
  }

  return { parseMail, readPeriod, validDate, dateTone, rowDate };
});
