import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { jsPDF } from 'jspdf';

// ─── Layout options ───────────────────────────────────────────────────────────
const LAYOUTS = [
  { id: '1',  label: '1 photo',        cols: 1, rows: 1 },
  { id: '2v', label: '2 stacked',      cols: 1, rows: 2 },
  { id: '2h', label: '2 side by side', cols: 2, rows: 1 },
  { id: '4',  label: '4 grid',         cols: 2, rows: 2 },
];

const PAGE_SIZES = [
  { id: 'A4',  label: 'A4',     w: 210, h: 297 },
  { id: 'LTR', label: 'Letter', w: 216, h: 279 },
  { id: 'A5',  label: 'A5',     w: 148, h: 210 },
];

const COLORS = ['#ffffff', '#000000', '#ff0000', '#ffdd00', '#00cc44', '#0088ff', '#ff6600'];
const SIZES  = [{ label: 'S', val: 18 }, { label: 'M', val: 28 }, { label: 'L', val: 42 }, { label: 'XL', val: 60 }];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readFileAsDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function imgNaturalDims(src) {
  return new Promise(res => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = src;
  });
}

async function placeImageOnPdf(pdf, dataUrl, x, y, maxW, maxH) {
  if (!dataUrl) return;
  const { w, h } = await imgNaturalDims(dataUrl);
  const aspect = w / h;
  let iw = maxW, ih = iw / aspect;
  if (ih > maxH) { ih = maxH; iw = ih * aspect; }
  const px = x + (maxW - iw) / 2;
  const py = y + (maxH - ih) / 2;
  pdf.addImage(dataUrl, 'JPEG', px, py, iw, ih, undefined, 'FAST');
}

async function buildPdf({ images, layout, pageSize, margin, title }) {
  const lay = LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
  const ps  = PAGE_SIZES.find(p => p.id === pageSize) || PAGE_SIZES[0];
  const { cols, rows } = lay;
  const perPage = cols * rows;

  const pages = [];
  for (let i = 0; i < images.length; i += perPage) pages.push(images.slice(i, i + perPage));
  if (!pages.length) pages.push([]);

  const pdf = new jsPDF({ unit: 'mm', format: [ps.w, ps.h], compress: true });

  for (let p = 0; p < pages.length; p++) {
    if (p > 0) pdf.addPage([ps.w, ps.h]);
    let topY = margin;
    if (title && p === 0) {
      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(17, 24, 39);
      pdf.text(title, ps.w / 2, margin + 6, { align: 'center' });
      topY += 13;
    }
    const gap   = margin / 2;
    const slotW = (ps.w - margin * 2 - gap * (cols - 1)) / cols;
    const slotH = (ps.h - topY - margin - gap * (rows - 1)) / rows;

    for (let i = 0; i < pages[p].length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      await placeImageOnPdf(pdf, pages[p][i].dataUrl,
        margin + col * (slotW + gap), topY + row * (slotH + gap), slotW, slotH);
    }
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(156, 163, 175);
    pdf.text(`${p + 1} / ${pages.length}`, ps.w / 2, ps.h - 4, { align: 'center' });
  }
  return pdf;
}

// ─── Image Text Annotator ─────────────────────────────────────────────────────
function ImageAnnotator({ dataUrl, onSave, onCancel }) {
  const canvasRef  = useRef(null);
  const inputRef   = useRef(null);
  const imgRef     = useRef(null);

  const [texts,   setTexts  ] = useState([]);   // placed text items
  const [color,   setColor  ] = useState('#ffffff');
  const [size,    setSize   ] = useState(28);
  const [typing,  setTyping ] = useState(false); // bottom text input visible
  const [draft,   setDraft  ] = useState('');    // current typed text
  const [tapPos,  setTapPos ] = useState(null);  // {x,y} in canvas pixels
  const [waiting, setWaiting] = useState(false); // waiting for user to tap placement

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; redraw([]); };
    img.src = dataUrl;
  }, [dataUrl]);

  function redraw(overrideTexts) {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    // Fit canvas to screen width keeping aspect ratio
    const maxW = window.innerWidth;
    const maxH = window.innerHeight - 180; // leave room for toolbar
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    canvas.width  = Math.round(img.naturalWidth  * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const list = overrideTexts ?? texts;
    list.forEach(t => drawText(ctx, t, scale));
  }

  function drawText(ctx, t, scale) {
    const fs = Math.round(t.size * scale);
    ctx.font      = `bold ${fs}px sans-serif`;
    ctx.textAlign = 'left';
    // shadow / outline for readability
    ctx.lineWidth   = Math.max(2, fs * 0.08);
    ctx.strokeStyle = t.color === '#000000' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
    ctx.strokeText(t.text, t.cx * canvasRef.current.width, t.cy * canvasRef.current.height);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text,   t.cx * canvasRef.current.width, t.cy * canvasRef.current.height);
  }

  // Redraw whenever texts change
  useEffect(() => { redraw(texts); }, [texts, color, size]);

  function getCanvasPos(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,  // normalised 0-1
      y: (clientY - rect.top)  / rect.height,
    };
  }

  function handleCanvasTap(e) {
    if (!waiting) return;
    const pos = getCanvasPos(e);
    setTapPos(pos);
    setWaiting(false);
    setTyping(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function placeText() {
    if (!draft.trim()) { setTyping(false); setDraft(''); return; }
    const newText = { id: Date.now(), text: draft.trim(), color, size, cx: tapPos?.x ?? 0.1, cy: tapPos?.y ?? 0.5 };
    const next = [...texts, newText];
    setTexts(next);
    setDraft('');
    setTyping(false);
    setTapPos(null);
  }

  function removeLastText() {
    setTexts(prev => prev.slice(0, -1));
  }

  function startPlacing() {
    if (!draft.trim()) { inputRef.current?.focus(); return; }
    setTyping(false);
    setWaiting(true);
  }

  // Flatten canvas → high-res JPEG dataURL using original image size
  function handleDone() {
    const img = imgRef.current;
    if (!img) { onSave(dataUrl); return; }

    const out = document.createElement('canvas');
    out.width  = img.naturalWidth;
    out.height = img.naturalHeight;
    const ctx  = out.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Replay texts at full resolution
    texts.forEach(t => {
      const fs = t.size * 3; // scale up for quality
      ctx.font      = `bold ${fs}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.lineWidth   = Math.max(2, fs * 0.08);
      ctx.strokeStyle = t.color === '#000000' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
      ctx.strokeText(t.text, t.cx * out.width, t.cy * out.height);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text,   t.cx * out.width, t.cy * out.height);
    });

    onSave(out.toDataURL('image/jpeg', 0.92));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: 'none' }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
        <button onClick={onCancel}
          className="text-white/70 text-sm font-semibold px-3 py-2 rounded-xl active:bg-white/10">
          ✕ Cancel
        </button>
        <p className="text-white text-sm font-bold">
          {waiting ? '👆 Tap on image to place text' : 'Add Text to Photo'}
        </p>
        <button onClick={handleDone}
          className="bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-400">
          Done ✓
        </button>
      </div>

      {/* Canvas — the image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden"
        onClick={handleCanvasTap} onTouchEnd={handleCanvasTap}>
        <canvas ref={canvasRef}
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block',
            cursor: waiting ? 'crosshair' : 'default',
            border: waiting ? '2px dashed rgba(255,255,255,0.4)' : 'none' }} />
      </div>

      {/* Bottom panel */}
      <div className="shrink-0 bg-black/90 px-4 pb-6 pt-3 space-y-3">

        {/* Typing input */}
        {typing && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') startPlacing(); }}
              placeholder="Type your text here…"
              className="flex-1 bg-white/10 text-white placeholder-white/40 rounded-xl px-4 py-3 text-base outline-none border border-white/20"
              autoComplete="off"
            />
            <button onClick={startPlacing}
              className="bg-green-500 text-white font-bold px-4 rounded-xl text-sm shrink-0 active:bg-green-400">
              Place →
            </button>
          </div>
        )}

        {/* Color row */}
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-xs font-semibold uppercase tracking-wide">Color</span>
          <div className="flex gap-2 flex-1">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ background: c, border: color === c ? '3px solid #22c55e' : '2px solid rgba(255,255,255,0.2)' }}
                className="w-8 h-8 rounded-full shrink-0 transition-transform active:scale-90"
              />
            ))}
          </div>
        </div>

        {/* Size + actions row */}
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs font-semibold uppercase tracking-wide">Size</span>
          {SIZES.map(s => (
            <button key={s.val} onClick={() => setSize(s.val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors
                ${size === s.val ? 'bg-green-500 text-white' : 'bg-white/10 text-white/70'}`}>
              {s.label}
            </button>
          ))}
          <div className="flex-1" />
          {!typing && (
            <button onClick={() => { setTyping(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="bg-white text-black text-sm font-bold px-4 py-2 rounded-xl active:bg-gray-200">
              ✏️ Add Text
            </button>
          )}
          {texts.length > 0 && (
            <button onClick={removeLastText}
              className="bg-white/10 text-white/70 text-sm font-semibold px-3 py-2 rounded-xl active:bg-white/20">
              ↩ Undo
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [images,      setImages     ] = useState([]);
  const [title,       setTitle      ] = useState('');
  const [layout,      setLayout     ] = useState('1');
  const [pageSize,    setPageSize   ] = useState('A4');
  const [margin,      setMargin     ] = useState(10);
  const [building,    setBuilding   ] = useState(false);
  const [toast,       setToast      ] = useState('');
  const [showConfig,  setShowConfig ] = useState(false);
  const [deferPrompt, setDeferPrompt] = useState(null);
  const [annotating,  setAnnotating ] = useState(null); // image id being annotated

  const galleryRef = useRef(null);
  const cameraRef  = useRef(null);

  useEffect(() => {
    const handler = e => { e.preventDefault(); setDeferPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const addFiles = useCallback(async files => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!valid.length) return;
    const loaded = await Promise.all(valid.map(async f => ({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      name: f.name,
      dataUrl: await readFileAsDataUrl(f),
    })));
    setImages(prev => [...prev, ...loaded]);
  }, []);

  const removeImage = id => setImages(prev => prev.filter(i => i.id !== id));
  const moveUp   = idx => setImages(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a; });
  const moveDown = idx => setImages(prev => { const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a; });

  const onGalleryInput = e => { addFiles(e.target.files); e.target.value = ''; };
  const onCameraInput  = e => { addFiles(e.target.files); e.target.value = ''; };

  const saveAnnotated = (id, newDataUrl) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, dataUrl: newDataUrl, annotated: true } : img));
    setAnnotating(null);
    showToast('Text added to photo ✓');
  };

  const handleBuild = async (action) => {
    if (!images.length) { showToast('Add at least one photo first'); return; }
    setBuilding(true);
    try {
      const pdf  = await buildPdf({ images, layout, pageSize, margin, title });
      const name = `${title.trim() || 'document'}.pdf`;
      if (action === 'share') {
        const blob = pdf.output('blob');
        const file = new File([blob], name, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: title || 'PDF Document' });
          showToast('Shared!');
        } else {
          pdf.save(name); showToast('Saved to downloads');
        }
      } else {
        pdf.save(name); showToast('PDF saved to downloads');
      }
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Something went wrong — try again');
    } finally {
      setBuilding(false);
    }
  };

  const installApp = async () => {
    if (!deferPrompt) return;
    deferPrompt.prompt();
    const { outcome } = await deferPrompt.userChoice;
    if (outcome === 'accepted') { setDeferPrompt(null); showToast('App installed!'); }
  };

  const lay = LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
  const perPage  = lay.cols * lay.rows;
  const pageCount = images.length ? Math.ceil(images.length / perPage) : 0;

  const annotatingImg = images.find(i => i.id === annotating);

  return (
    <>
      {/* ── Full-screen annotator overlay ───────────────────────────────── */}
      {annotatingImg && (
        <ImageAnnotator
          dataUrl={annotatingImg.dataUrl}
          onSave={newUrl => saveAnnotated(annotating, newUrl)}
          onCancel={() => setAnnotating(null)}
        />
      )}

      <div className="min-h-screen bg-green-50 flex flex-col max-w-lg mx-auto">

        {/* Header */}
        <header className="bg-green-700 text-white px-4 pt-12 pb-4 safe-top">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold leading-tight">PDF Maker</h1>
              <p className="text-green-200 text-xs mt-0.5">Sage Energy</p>
            </div>
            <div className="flex items-center gap-2">
              {deferPrompt && (
                <button onClick={installApp}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-xl">
                  📲 Install
                </button>
              )}
              <button onClick={() => setShowConfig(c => !c)}
                className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors
                  ${showConfig ? 'bg-white text-green-700' : 'bg-white/20 text-white'}`}>
                ⚙️ Settings
              </button>
            </div>
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-2xl shadow-xl">
            {toast}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 space-y-4">

          {/* Settings */}
          {showConfig && (
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4 border border-green-100">
              <p className="font-bold text-sm text-gray-800">Document Settings</p>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos per page</p>
                <div className="grid grid-cols-4 gap-2">
                  {LAYOUTS.map(l => (
                    <button key={l.id} onClick={() => setLayout(l.id)}
                      className={`py-3 rounded-xl text-xs font-semibold border-2 transition-all
                        ${layout === l.id ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Page Size</p>
                <div className="flex gap-2">
                  {PAGE_SIZES.map(ps => (
                    <button key={ps.id} onClick={() => setPageSize(ps.id)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all
                        ${pageSize === ps.id ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {ps.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Margins</p>
                <div className="flex gap-2">
                  {[['None', 0], ['Small', 5], ['Normal', 10], ['Large', 18]].map(([label, val]) => (
                    <button key={label} onClick={() => setMargin(val)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all
                        ${margin === val ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Document title */}
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
            <input type="text" placeholder="Document name (optional)"
              value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-4 text-base placeholder-gray-400 text-gray-800 outline-none font-medium" />
          </div>

          {/* Add photos */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-2 bg-white rounded-2xl shadow-sm border-2 border-dashed border-green-200 py-6 text-green-700 font-semibold text-sm active:scale-95 transition-transform">
              <span className="text-3xl">🖼️</span>From Gallery
            </button>
            <button onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-2 bg-white rounded-2xl shadow-sm border-2 border-dashed border-green-200 py-6 text-green-700 font-semibold text-sm active:scale-95 transition-transform">
              <span className="text-3xl">📷</span>Take Photo
            </button>
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onGalleryInput} />
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={onCameraInput} />
          </div>

          {/* Photo list */}
          {images.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="font-bold text-sm text-gray-800">
                  {images.length} photo{images.length !== 1 ? 's' : ''}
                  {pageCount > 0 && <span className="text-gray-400 font-normal"> · {pageCount} page{pageCount !== 1 ? 's' : ''}</span>}
                </p>
                <button onClick={() => setImages([])} className="text-xs text-red-500 font-semibold">Remove all</button>
              </div>

              <div className="divide-y divide-gray-50">
                {images.map((img, idx) => (
                  <div key={img.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Thumbnail */}
                    <div className="relative shrink-0">
                      <img src={img.dataUrl} alt=""
                        className="w-16 h-16 object-cover rounded-xl border border-gray-100" />
                      {img.annotated && (
                        <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          T
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-medium truncate">{img.name}</p>
                      {/* Annotate button */}
                      <button onClick={() => setAnnotating(img.id)}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg active:bg-green-100">
                        ✏️ {img.annotated ? 'Edit text' : 'Add text'}
                      </button>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0}
                        className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 disabled:opacity-20 text-sm font-bold flex items-center justify-center">↑</button>
                      <button onClick={() => moveDown(idx)} disabled={idx === images.length - 1}
                        className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 disabled:opacity-20 text-sm font-bold flex items-center justify-center">↓</button>
                      <button onClick={() => removeImage(img.id)}
                        className="w-8 h-8 rounded-lg bg-red-50 text-red-500 text-sm font-bold flex items-center justify-center">✕</button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => galleryRef.current?.click()}
                className="w-full py-3 text-sm text-green-600 font-semibold border-t border-gray-100 hover:bg-green-50">
                + Add more photos
              </button>
            </div>
          )}

          {images.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-6xl mb-3">📄</div>
              <p className="font-semibold text-gray-500">No photos yet</p>
              <p className="text-sm mt-1">Tap a button above to add photos</p>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="bg-white border-t border-gray-100 px-4 pt-3 pb-6 safe-bottom space-y-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
          <button onClick={() => handleBuild('share')} disabled={building || images.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-green-600 text-white text-base font-bold py-4 rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm">
            {building ? <><span className="animate-spin">⏳</span> Building PDF…</> : <><span>📤</span> Create &amp; Share PDF</>}
          </button>
          <button onClick={() => handleBuild('download')} disabled={building || images.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 text-sm font-semibold py-3 rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all">
            <span>⬇️</span> Download PDF Only
          </button>
          <p className="text-center text-xs text-gray-400 pt-0.5">
            "Create &amp; Share" opens WhatsApp, email, or any app on your phone
          </p>
        </div>
      </div>
    </>
  );
}
