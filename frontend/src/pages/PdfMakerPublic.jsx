/**
 * Public PDF Maker — /pdf
 * No login required. Works for admin-dashboard PIN users and anyone with the link.
 * Generates PDFs client-side with jsPDF and shares via the native Web Share API.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { useNavigate } from 'react-router-dom';

const LAYOUTS = [
  { id: '1',  label: '1 photo',        cols: 1, rows: 1 },
  { id: '2v', label: '2 stacked',      cols: 1, rows: 2 },
  { id: '2h', label: '2 side by side', cols: 2, rows: 1 },
  { id: '4',  label: '4 grid',         cols: 2, rows: 2 },
];

const COLORS = ['#ffffff','#000000','#ff0000','#ffdd00','#00cc44','#0088ff','#ff6600'];
const SIZES  = [{ label:'S', val:18 },{ label:'M', val:28 },{ label:'L', val:42 },{ label:'XL', val:60 }];

// ─── helpers ──────────────────────────────────────────────────────────────────
function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function imgDims(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.src = src; });
}

async function placeImg(pdf, url, x, y, mw, mh) {
  if (!url) return;
  const { w, h } = await imgDims(url);
  const a = w / h;
  let iw = mw, ih = iw / a;
  if (ih > mh) { ih = mh; iw = ih * a; }
  const fmt = url.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  pdf.addImage(url, fmt, x + (mw - iw) / 2, y + (mh - ih) / 2, iw, ih, undefined, 'FAST');
}

async function makePdf({ images, layout, margin, title }) {
  const lay = LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
  const { cols, rows } = lay;
  const pp   = cols * rows;
  const ps   = { w: 210, h: 297 };
  const pages = [];
  for (let i = 0; i < images.length; i += pp) pages.push(images.slice(i, i + pp));
  if (!pages.length) pages.push([]);

  const pdf = new jsPDF({ unit: 'mm', format: [ps.w, ps.h], compress: true });
  for (let p = 0; p < pages.length; p++) {
    if (p > 0) pdf.addPage([ps.w, ps.h]);
    let topY = margin;
    if (title && p === 0) {
      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17, 24, 39);
      pdf.text(title, ps.w / 2, margin + 6, { align: 'center' }); topY += 13;
    }
    const gap = margin / 2;
    const sw  = (ps.w - margin * 2 - gap * (cols - 1)) / cols;
    const sh  = (ps.h - topY - margin - gap * (rows - 1)) / rows;
    for (let i = 0; i < pages[p].length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      await placeImg(pdf, pages[p][i].dataUrl, margin + col * (sw + gap), topY + row * (sh + gap), sw, sh);
    }
    pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(156,163,175);
    pdf.text(`${p+1} / ${pages.length}`, ps.w/2, ps.h - 4, { align:'center' });
  }
  return pdf;
}

// ─── Image annotator ──────────────────────────────────────────────────────────
// Flow: type text in the box → tap anywhere on the photo → text appears there.
function Annotator({ dataUrl, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const inputRef  = useRef(null);
  const imgRef    = useRef(null);
  const textsRef  = useRef([]);   // keep in sync with state for canvas draw
  const [texts,  setTexts ] = useState([]);
  const [color,  setColor ] = useState('#ffffff');
  const [size,   setSize  ] = useState(28);
  const [draft,  setDraft ] = useState('');
  const [hint,   setHint  ] = useState('');  // brief flash message

  // Load image and draw canvas once
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; redraw([]); };
    img.src = dataUrl;
  }, []);

  // Keep textsRef in sync so canvas callbacks see latest texts
  useEffect(() => { textsRef.current = texts; }, [texts]);

  function redraw(list) {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const maxW = window.innerWidth;
    const maxH = window.innerHeight - 200;
    const sc   = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    canvas.width  = Math.round(img.naturalWidth  * sc);
    canvas.height = Math.round(img.naturalHeight * sc);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    list.forEach(t => stamp(ctx, t, canvas.width, canvas.height, sc));
  }

  function stamp(ctx, t, cw, ch, sc) {
    const fs = Math.round(t.size * (sc || 1));
    ctx.font      = `bold ${fs}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.lineWidth   = Math.max(2, fs * 0.08);
    ctx.strokeStyle = t.color === '#000000' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
    ctx.strokeText(t.text, t.cx * cw, t.cy * ch);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text,   t.cx * cw, t.cy * ch);
  }

  // Redraw whenever texts list changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const sc = canvas.width / img.naturalWidth;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    texts.forEach(t => stamp(ctx, t, canvas.width, canvas.height, sc));
  }, [texts]);

  function getPos(e) {
    const r  = canvasRef.current.getBoundingClientRect();
    const src = e.changedTouches ? e.changedTouches[0] : e;
    return {
      x: (src.clientX - r.left) / r.width,
      y: (src.clientY - r.top)  / r.height,
    };
  }

  // User taps/touches the photo — place text at that spot
  function onPhotoTap(e) {
    e.preventDefault();
    if (!draft.trim()) {
      // No text typed yet — focus the input to prompt them
      inputRef.current?.focus();
      flashHint('Type your text first, then tap the photo');
      return;
    }
    const pos  = getPos(e);
    const item = { id: Date.now(), text: draft.trim(), color, size, cx: pos.x, cy: pos.y };
    const next = [...textsRef.current, item];
    setTexts(next);
    setDraft('');        // clear for next text
    flashHint('Tap again to add more text');
    inputRef.current?.focus();
  }

  function flashHint(msg) {
    setHint(msg);
    setTimeout(() => setHint(''), 2500);
  }

  function undo() {
    setTexts(prev => prev.slice(0, -1));
  }

  function done() {
    const img = imgRef.current;
    if (!img) { onSave(dataUrl); return; }
    // Render at full original resolution
    const out = document.createElement('canvas');
    out.width  = img.naturalWidth;
    out.height = img.naturalHeight;
    const ctx  = out.getContext('2d');
    ctx.drawImage(img, 0, 0);
    textsRef.current.forEach(t => stamp(ctx, t, out.width, out.height, 3));
    onSave(out.toDataURL('image/jpeg', 0.92));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
        <button onClick={onCancel} className="text-white/60 text-sm font-semibold px-3 py-2 rounded-xl active:bg-white/10">
          ✕ Cancel
        </button>
        <p className="text-white text-xs font-semibold text-center">
          {hint || (draft.trim() ? '👆 Tap photo to place text' : 'Type below, then tap the photo')}
        </p>
        <button onClick={done} className="bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-xl active:bg-green-400">
          Done ✓
        </button>
      </div>

      {/* Canvas — tap to place text */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black"
        onTouchEnd={onPhotoTap} onClick={onPhotoTap}>
        <canvas ref={canvasRef}
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block',
            outline: draft.trim() ? '2px dashed rgba(255,255,255,0.5)' : 'none' }} />
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 bg-black/95 px-4 pt-3 pb-6 space-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)' }}>

        {/* Text input — always visible */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            placeholder="Type your text, then tap the photo…"
            className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-4 py-3 text-base outline-none border border-white/20"
            autoComplete="off"
            autoCorrect="off"
          />
          {texts.length > 0 && (
            <button onClick={undo}
              className="shrink-0 bg-white/10 text-white text-sm font-semibold px-3 rounded-xl active:bg-white/20">
              ↩
            </button>
          )}
        </div>

        {/* Colour picker */}
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs font-semibold uppercase tracking-wide shrink-0">Colour</span>
          <div className="flex gap-2 flex-1">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ background: c, boxShadow: color === c ? '0 0 0 3px #22c55e' : '0 0 0 1.5px rgba(255,255,255,0.25)' }}
                className="w-8 h-8 rounded-full shrink-0 transition-all active:scale-90" />
            ))}
          </div>
        </div>

        {/* Size picker */}
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs font-semibold uppercase tracking-wide shrink-0">Size</span>
          {SIZES.map(s => (
            <button key={s.val} onClick={() => setSize(s.val)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors
                ${size === s.val ? 'bg-green-500 text-white' : 'bg-white/10 text-white/60'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PdfMakerPublic() {
  const navigate   = useNavigate();
  const galleryRef = useRef(null);
  const cameraRef  = useRef(null);

  const [images,       setImages      ] = useState([]);
  const [title,        setTitle       ] = useState('');
  const [layout,       setLayout      ] = useState('1');
  const [margin,       setMargin      ] = useState(10);
  const [building,     setBuilding    ] = useState(false);
  const [toast,        setToast       ] = useState('');
  const [showCfg,      setShowCfg     ] = useState(false);
  const [annotating,   setAnnotating  ] = useState(null);
  const [savedName,    setSavedName   ] = useState('');
  const [showWaGuide,  setShowWaGuide ] = useState(false);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const addFiles = useCallback(async files => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!valid.length) return;
    const loaded = await Promise.all(valid.map(async f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      dataUrl: await readFile(f),
    })));
    setImages(prev => [...prev, ...loaded]);
  }, []);

  const onGallery = e => { addFiles(e.target.files); e.target.value = ''; };
  const onCamera  = e => { addFiles(e.target.files); e.target.value = ''; };
  const remove    = id => setImages(prev => prev.filter(i => i.id !== id));
  const moveUp    = idx => setImages(prev => { const a=[...prev]; [a[idx-1],a[idx]]=[a[idx],a[idx-1]]; return a; });
  const moveDown  = idx => setImages(prev => { const a=[...prev]; [a[idx],a[idx+1]]=[a[idx+1],a[idx]]; return a; });

  const saveAnnotated = (id, url) => {
    setImages(prev => prev.map(i => i.id === id ? { ...i, dataUrl: url, annotated: true } : i));
    setAnnotating(null);
    showToast('Text added ✓');
  };

  const build = async (action) => {
    if (!images.length) { showToast('Add at least one photo first'); return; }
    setBuilding(true);
    try {
      const pdf  = await makePdf({ images, layout, margin, title });
      const name = `${title.trim() || 'Sage-document'}.pdf`;

      if (action === 'share') {
        const buf  = pdf.output('arraybuffer');
        const blob = new Blob([buf], { type: 'application/pdf' });
        const file = new File([blob], name, { type: 'application/pdf' });

        // Try native share sheet first (works on most Android + iOS)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: title || 'PDF Document' });
            showToast('Shared ✓');
            return;
          } catch (shareErr) {
            if (shareErr.name === 'AbortError') return; // user cancelled — do nothing
            // share failed for other reason — fall through to download + guide
          }
        }

        // Fallback: download the file then show WhatsApp instructions
        pdf.save(name);
        setSavedName(name);
        setShowWaGuide(true);

      } else {
        pdf.save(name);
        showToast('PDF saved to Downloads ✓');
      }
    } catch (err) {
      showToast(`Could not create PDF: ${err.message || 'unknown error'}`);
    } finally {
      setBuilding(false);
    }
  };

  const annotatingImg = images.find(i => i.id === annotating);
  const lay = LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
  const pageCount = images.length ? Math.ceil(images.length / (lay.cols * lay.rows)) : 0;

  return (
    <>
      {annotatingImg && (
        <Annotator dataUrl={annotatingImg.dataUrl}
          onSave={url => saveAnnotated(annotating, url)}
          onCancel={() => setAnnotating(null)} />
      )}

      <div className="min-h-screen bg-green-50 flex flex-col max-w-lg mx-auto">

        {/* Header */}
        <div className="bg-green-700 text-white px-4 pt-12 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 16px)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white text-lg shrink-0">
              ←
            </button>
            <div>
              <h1 className="text-lg font-bold leading-tight">PDF Maker</h1>
              <p className="text-green-200 text-xs">Sage Energy — create &amp; share</p>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-2xl shadow-xl">
            {toast}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 space-y-4">

          {/* Settings toggle */}
          <button onClick={() => setShowCfg(c => !c)}
            className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-green-100 shadow-sm">
            <span className="text-sm font-semibold text-gray-700">⚙️ Layout &amp; Margin Settings</span>
            <span className="text-gray-400 text-sm">{showCfg ? '▲' : '▼'}</span>
          </button>

          {showCfg && (
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4 border border-green-100">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos per page</p>
                <div className="grid grid-cols-4 gap-2">
                  {LAYOUTS.map(l => (
                    <button key={l.id} onClick={() => setLayout(l.id)}
                      className={`py-3 rounded-xl text-xs font-semibold border-2 transition-all
                        ${layout===l.id ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Margins</p>
                <div className="flex gap-2">
                  {[['None',0],['Small',5],['Normal',10],['Large',18]].map(([lbl,v]) => (
                    <button key={lbl} onClick={() => setMargin(v)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all
                        ${margin===v ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
            <input type="text" placeholder="Document title (optional)"
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
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onGallery} />
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={onCamera} />
          </div>

          {/* Photo list */}
          {images.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="font-bold text-sm text-gray-800">
                  {images.length} photo{images.length!==1?'s':''}
                  {pageCount>0 && <span className="text-gray-400 font-normal"> · {pageCount} page{pageCount!==1?'s':''}</span>}
                </p>
                <button onClick={() => setImages([])} className="text-xs text-red-500 font-semibold">Remove all</button>
              </div>
              <div className="divide-y divide-gray-50">
                {images.map((img, idx) => (
                  <div key={img.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="relative shrink-0">
                      <img src={img.dataUrl} alt="" className="w-16 h-16 object-cover rounded-xl border border-gray-100" />
                      {img.annotated && (
                        <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">T</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-medium truncate">{img.name}</p>
                      <button onClick={() => setAnnotating(img.id)}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg">
                        ✏️ {img.annotated ? 'Edit text' : 'Add text'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => moveUp(idx)} disabled={idx===0}
                        className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 disabled:opacity-20 text-sm font-bold flex items-center justify-center">↑</button>
                      <button onClick={() => moveDown(idx)} disabled={idx===images.length-1}
                        className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 disabled:opacity-20 text-sm font-bold flex items-center justify-center">↓</button>
                      <button onClick={() => remove(img.id)}
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
        <div className="bg-white border-t border-gray-100 px-4 pt-3 pb-8 space-y-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 12px)' }}>
          <button onClick={() => build('share')} disabled={building || images.length===0}
            className="w-full flex items-center justify-center gap-2 bg-green-600 text-white text-base font-bold py-4 rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm">
            {building ? <><span className="animate-spin">⏳</span> Building PDF…</> : <><span>📤</span> Create &amp; Share PDF</>}
          </button>
          <button onClick={() => build('download')} disabled={building || images.length===0}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 text-sm font-semibold py-3 rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all">
            <span>⬇️</span> Download PDF Only
          </button>
        </div>
      </div>

      {/* WhatsApp sharing guide — shown when native share isn't available */}
      {showWaGuide && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4"
          onClick={() => setShowWaGuide(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6"
            onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-5xl mb-2">✅</div>
              <p className="font-black text-gray-900 text-lg">PDF Saved!</p>
              <p className="text-gray-500 text-sm mt-1">
                <span className="font-semibold text-green-700">{savedName}</span> is in your Downloads folder
              </p>
            </div>

            <p className="font-black text-gray-800 text-sm mb-3">To send on WhatsApp:</p>
            <div className="space-y-3">
              {[
                { n:'1', text:'Open WhatsApp and go to a chat' },
                { n:'2', text:'Tap the 📎 paperclip (attachment) button' },
                { n:'3', text:'Tap "Document"' },
                { n:'4', text:`Find "${savedName}" in Downloads` },
                { n:'5', text:'Tap Send ✓' },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-xs">{n}</span>
                  </div>
                  <p className="text-sm text-gray-700">{text}</p>
                </div>
              ))}
            </div>

            <button onClick={() => setShowWaGuide(false)}
              className="w-full mt-6 py-3.5 bg-green-600 text-white font-black rounded-2xl text-base active:scale-95 transition-all">
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
