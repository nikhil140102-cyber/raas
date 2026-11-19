import { NextResponse } from 'next/server';
import { slugify } from './util';
// Client-ready resume: default content, Word export and PDF export.
import { lakh, notice } from './util';

export function defaultClientResume(c) {
  return {
    headline: [c.current_title, c.total_exp ? `${c.total_exp} years` : null, (c.skills || []).slice(0, 3).join(', ')].filter(Boolean).join(' · '),
    summary: c.summary || '',
    experience: (c.experience || []).map((e) => ({ role: [e.role, e.company].filter(Boolean).join(' · '), when: e.when || '', points: Array.isArray(e.points) ? e.points.join(' ') : e.points || '' })),
    skills: (c.skills || []).join(' · '),
    education: (c.education || []).map((e) => [e.degree, e.school, e.year].filter(Boolean).join(', ')).join('\n'),
    options: { hideContact: true, brand: true, includeSummary: true },
  };
}

export function resumeModel(c, screening, match) {
  const r = { ...defaultClientResume(c), ...(c.client_resume || {}) };
  r.options = { ...defaultClientResume(c).options, ...((c.client_resume || {}).options || {}) };
  const parts = String(c.name || '').split(/\s+/);
  return {
    ...r,
    name: r.options.hideContact ? `${parts[0] || ''} ${parts[1] ? parts[1][0] + '.' : ''}`.trim() : c.name,
    contact: r.options.hideContact ? `${c.location || ''}${c.location ? ' · ' : ''}contact through AvaStars` : [c.email, c.phone, c.location].filter(Boolean).join(' · '),
    facts: [['Current CTC', lakh(c.cctc)], ['Expected CTC', lakh(c.ectc)], ['Notice', notice(c.notice_days)]],
    screeningLine: r.options.includeSummary && (match || screening)
      ? { title: `AvaStars screening summary${match ? ` · Match ${match}` : ''}${screening?.score ? ` · Call ${screening.score}/10` : ''}`, text: screening?.summary || '' }
      : null,
    ref: `AVS-${String(c.id).padStart(5, '0')}`,
  };
}

export async function toDocx(m) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = await import('docx');
  const P = (text, opts = {}) => new Paragraph({ spacing: { after: 80 }, ...opts, children: [new TextRun({ text, size: 21, ...(opts.run || {}) })] });
  const H = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20, color: '3730A3' })] });
  const children = [];
  if (m.options.brand) {
    children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '4F46E5' } }, spacing: { after: 200 }, children: [new TextRun({ text: 'AvaStars', bold: true, color: '3730A3', size: 26 }), new TextRun({ text: `    Candidate profile · Ref ${m.ref}`, size: 18, color: '5B6474' })] }));
  }
  children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: m.name, bold: true, size: 36 })] }));
  children.push(P(m.headline));
  children.push(P(m.contact, { run: { color: '5B6474', size: 19 } }));
  children.push(P(m.facts.map(([k, v]) => `${k}: ${v}`).join('    '), { run: { bold: true, size: 20 } }));
  if (m.screeningLine) {
    children.push(H(m.screeningLine.title));
    if (m.screeningLine.text) children.push(P(m.screeningLine.text));
  }
  if (m.summary) { children.push(H('Summary')); children.push(P(m.summary)); }
  if (m.experience.length) {
    children.push(H('Experience'));
    m.experience.forEach((e) => {
      children.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: e.role, bold: true, size: 22 }), new TextRun({ text: e.when ? `   ${e.when}` : '', color: '5B6474', size: 19 })] }));
      if (e.points) children.push(P(e.points));
    });
  }
  if (m.skills) { children.push(H('Skills')); children.push(P(m.skills)); }
  if (m.education) { children.push(H('Education')); m.education.split('\n').forEach((l) => children.push(P(l))); }
  const doc = new Document({ styles: { default: { document: { run: { font: 'Calibri' } } } }, sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// pdf-lib standard fonts only support WinAnsi characters.
const safe = (s) => String(s || '').replace(/₹/g, 'Rs ').replace(/[–—]/g, '-').replace(/[·•]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

export async function toPdf(m) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28; const H = 841.89; const M = 50;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const indigo = rgb(0.216, 0.188, 0.639); const grey = rgb(0.36, 0.39, 0.45); const ink = rgb(0.06, 0.09, 0.16);

  const newPageIfNeeded = (h) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const write = (text, { f = font, size = 10.5, color = ink, gap = 4 } = {}) => {
    const words = safe(text).split(/\s+/);
    let line = '';
    const lines = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > W - 2 * M) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    for (const l of lines) {
      newPageIfNeeded(size + gap);
      page.drawText(l, { x: M, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };
  const heading = (t) => { y -= 10; write(t.toUpperCase(), { f: bold, size: 10, color: indigo, gap: 6 }); };

  if (m.options.brand) {
    page.drawText('AvaStars', { x: M, y: y - 14, size: 14, font: bold, color: indigo });
    const ref = safe(`Candidate profile - Ref ${m.ref}`);
    page.drawText(ref, { x: W - M - font.widthOfTextAtSize(ref, 9), y: y - 12, size: 9, font, color: grey });
    y -= 24;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: rgb(0.31, 0.27, 0.9) });
    y -= 18;
  }
  write(m.name, { f: bold, size: 20, gap: 6 });
  write(m.headline, { size: 11 });
  write(m.contact, { size: 9.5, color: grey, gap: 10 });
  write(m.facts.map(([k, v]) => `${k}: ${v}`).join('     '), { f: bold, size: 10, gap: 8 });
  if (m.screeningLine) { heading(m.screeningLine.title); if (m.screeningLine.text) write(m.screeningLine.text); }
  if (m.summary) { heading('Summary'); write(m.summary); }
  if (m.experience.length) {
    heading('Experience');
    m.experience.forEach((e) => { y -= 4; write(`${e.role}${e.when ? `   (${e.when})` : ''}`, { f: bold, size: 11 }); if (e.points) write(e.points, { size: 10 }); });
  }
  if (m.skills) { heading('Skills'); write(m.skills); }
  if (m.education) { heading('Education'); m.education.split('\n').forEach((l) => write(l)); }
  return Buffer.from(await pdf.save());
}

export async function exportResponse(c, screening, match, format) {
  const m = resumeModel(c, screening, match);
  const base = `${slugify(m.name) || 'candidate'}-${m.ref}`;
  if (format === 'pdf') {
    return new NextResponse(await toPdf(m), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${base}.pdf"` } });
  }
  return new NextResponse(await toDocx(m), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': `attachment; filename="${base}.docx"` } });
}
