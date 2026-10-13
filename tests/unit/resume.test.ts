import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// The résumé visitors download from /resume.pdf.
const pdf = readFileSync(join(import.meta.dirname, '../../public/resume.pdf'));

// In the T1 font encoding LaTeX uses, these codes are dashes and joined letters (the "fi" in "first").
const T1_CODES: Record<string, string> = { '\x15': '–', '\x16': '—', '\x1b': 'ff', '\x1c': 'fi', '\x1d': 'fl', '\x1e': 'ffi', '\x1f': 'ffl' };

/** A PDF string's escapes (\n, \(, \\, \053 and so on) turned back into the characters they stand for. */
function unescapePdf(s: string): string {
  return s.replace(/\\(?:([0-7]{1,3})|(\r?\n)|([\s\S]))/g, (_, octal: string, newline: string, char: string) => {
    if (octal) return String.fromCharCode(parseInt(octal, 8));
    if (newline) return '';
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[char] ?? char;
  });
}

/**
 * The page's text, read straight from the PDF: each page stream is unpacked, and the strings it draws are joined in
 * order. The gaps TeX leaves for kerning are dropped, so a word or number split into pieces comes back whole.
 */
function pdfText(file: Buffer): string {
  const bin = file.toString('latin1');
  let text = '';
  for (const match of bin.matchAll(/(?<!end)stream\r?\n/g)) {
    const start = match.index + match[0].length;
    let content: string;
    try {
      content = inflateSync(file.subarray(start, bin.indexOf('endstream', start))).toString('latin1');
    } catch {
      continue; // not a compressed stream
    }
    if (!/\bTf\b/.test(content)) continue; // fonts, images and links: no text drawn
    for (const [str] of content.matchAll(/\((?:\\[\s\S]|[^\\)])*\)/g)) text += unescapePdf(str.slice(1, -1));
  }
  return text.replace(/[\x15\x16\x1b-\x1f]/g, (c) => T1_CODES[c]);
}

describe('the résumé on the site', () => {
  const text = pdfText(pdf);
  // TeX engines space words differently (a space character, or just a gap), so compare without spaces.
  const squeezed = text.replace(/\s+/g, '');

  it('can be read as text', () => {
    expect(text).toContain('Engati');
  });

  it('leaves the phone number out', () => {
    // Ten digits in a row, with at most a space or dash between them, would be a phone number.
    expect(text).not.toMatch(/\d(?:[ -]?\d){9}/);
  });

  it('drops the old 35% → 12% figure, as the site did', () => {
    expect(squeezed).not.toContain('35%to12%');
  });

  it('gives the same figures as the case studies', () => {
    expect(squeezed).toContain('45%offaileddeliveriesonthefirstretry');
    expect(squeezed).toContain('~2hoursto30–60minutesaday');
  });
});
