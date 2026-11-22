// Reconnaissance de caractères (OCR) des PDF scannés, dans le navigateur (tesseract.js) :
// le texte reconnu est indexé (recherche, Claude) et la position des mots sert de couche de texte au lecteur.

import { api, getPdfjs } from './core.js';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let loading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Impossible de charger le moteur de reconnaissance de texte.'));
      document.head.append(s);
    });
  }
  return loading;
}

export async function ocrItem(id, { langs = 'fra+eng+deu', onProgress = null, maxPages = 400 } = {}) {
  const T = await loadTesseract();
  const worker = await T.createWorker(langs.split('+'), 1, {});
  const lib = await getPdfjs();
  const buf = await fetch(`/api/items/${id}/pdf`).then((r) => {
    if (!r.ok) throw new Error('PDF illisible');
    return r.arrayBuffer();
  });
  const task = lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false });
  const doc = await task.promise;
  const n = Math.min(doc.numPages, maxPages);
  const textPages = [];
  let batch = [];
  try {
    for (let i = 1; i <= n; i++) {
      onProgress?.(i, n);
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, viewport: vp }).promise;
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const words = [];
      for (const b of data.blocks || []) {
        for (const par of b.paragraphs || []) {
          for (const line of par.lines || []) {
            for (const w of line.words || []) {
              if (!w.text?.trim() || w.confidence < 30) continue;
              const { x0, y0, x1, y1 } = w.bbox;
              words.push([w.text, +(x0 / canvas.width).toFixed(4), +(y0 / canvas.height).toFixed(4), +((x1 - x0) / canvas.width).toFixed(4), +((y1 - y0) / canvas.height).toFixed(4)]);
            }
          }
        }
      }
      textPages.push({ page_no: i, text: (data.text || '').trim() });
      batch.push({ page_no: i, words });
      page.cleanup();
      if (batch.length >= 5 || i === n) {
        await api(`/api/items/${id}/ocr`, { method: 'POST', body: { pages: batch, final: i === n } });
        batch = [];
      }
    }
  } finally {
    await worker.terminate().catch(() => {});
    await task.destroy().catch(() => {});
  }
  // indexation du texte reconnu
  const B = 4;
  for (let i = 0; i < textPages.length; i += B) {
    await api(`/api/items/${id}/pages`, { method: 'POST', body: { pages: textPages.slice(i, i + B), reset: i === 0, final: i + B >= textPages.length, page_count: doc.numPages } });
  }
  return { pages: n, chars: textPages.reduce((s, p) => s + p.text.length, 0) };
}

// couche de texte d'une page à partir des mots reconnus (positions en fractions de la page)
export function ocrTextLayer(tl, words, vp) {
  const ctx = document.createElement('canvas').getContext('2d');
  const frag = document.createDocumentFragment();
  for (const [t, x, y, w, h] of words) {
    const fs = Math.max(4, h * vp.height * 0.92);
    ctx.font = `${fs}px sans-serif`;
    const mw = ctx.measureText(t).width || 1;
    const sx = (w * vp.width) / mw;
    const span = document.createElement('span');
    span.textContent = `${t} `;
    span.className = 'ocr-w';
    span.style.cssText = `left:${x * 100}%;top:${y * 100}%;font-size:${fs}px;font-family:sans-serif;transform:scaleX(${sx.toFixed(3)})`;
    frag.append(span);
  }
  tl.append(frag);
}
