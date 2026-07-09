import { useState, useRef, useCallback, useEffect } from 'react';
import { jsPDF } from 'jspdf';

// ─── Layout options ───────────────────────────────────────────────────────────
const LAYOUTS = [
  { id: '1',  label: '1 photo',     emoji: '□',   cols: 1, rows: 1 },
  { id: '2v', label: '2 stacked',   emoji: '⬜\n⬜', cols: 1, rows: 2 },
  { id: '2h', label: '2 side by side', emoji: '▭▭', cols: 2, rows: 1 },
  { id: '4',  label: '4 grid',      emoji: '⊞',   cols: 2, rows: 2 },
];

const PAGE_SIZES = [
  { id: 'A4',  label: 'A4',     w: 210, h: 297 },
  { id: 'LTR', label: 'Letter', w: 216, h: 279 },
  { id: 'A5',  label: 'A5',     w: 148, h: 210 },
];

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
  const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  pdf.addImage(dataUrl, fmt, px, py, iw, ih, undefined, 'FAST');
}

async function buildPdf({ images, layout, pageSize, margin, title }) {
  const lay  = LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
  const ps   = PAGE_SIZES.find(p => p.id === pageSize) || PAGE_SIZES[0];
  const mg   = margin;
  const { cols, rows } = lay;
  const perPage = cols * rows;

  const pages = [];
  for (let i = 0; i < images.length; i += perPage) pages.push(images.slice(i, i + perPage));
  if (!pages.length) pages.push([]);

  const pdf = new jsPDF({ unit: 'mm', format: [ps.w, ps.h], compress: true });

  for (let p = 0; p < pages.length; p++) {
    if (p > 0) pdf.addPage([ps.w, ps.h]);
    let topY = mg;

    if (title && p === 0) {
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(17, 24, 39);
      pdf.text(title, ps.w / 2, mg + 6, { align: 'center' });
      topY += 13;
    }

    const gap   = mg / 2;
    const slotW = (ps.w - mg * 2 - gap * (cols - 1)) / cols;
    const slotH = (ps.h - topY - mg - gap * (rows - 1)) / rows;

    for (let i = 0; i < pages[p].length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = mg + col * (slotW + gap);
      const y   = topY + row * (slotH + gap);
      await placeImageOnPdf(pdf, pages[p][i].dataUrl, x, y, slotW, slotH);
    }

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(156, 163, 175);
    pdf.text(`${p + 1} / ${pages.length}`, ps.w / 2, ps.h - 4, { align: 'center' });
  }

  return pdf;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function App() {
  const [images,     setImages    ] = useState([]);
  const [title,      setTitle     ] = useState('');
  const [layout,     setLayout    ] = useState('1');
  const [pageSize,   setPageSize  ] = useState('A4');
  const [margin,     setMargin    ] = useState(10);
  const [building,   setBuilding  ] = useState(false);
  const [toast,      setToast     ] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [deferPrompt, setDeferPrompt] = useState(null);

  const galleryRef = useRef(null);
  const cameraRef  = useRef(null);

  // Capture the PWA install prompt
  useEffect(() => {
    const handler = e => { e.preventDefault(); setDeferPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

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
          // Fallback: download
          pdf.save(name);
          showToast('Saved to your downloads');
        }
      } else {
        pdf.save(name);
        showToast('PDF saved to downloads');
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
  const perPage = lay.cols * lay.rows;
  const pageCount = images.length ? Math.ceil(images.length / perPage) : 0;

  return (
    <div className="min-h-screen bg-green-50 flex flex-col max-w-lg mx-auto">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-green-700 text-white px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold leading-tight">PDF Maker</h1>
            <p className="text-green-200 text-xs mt-0.5">Sage Energy</p>
          </div>
          <div className="flex items-center gap-2">
            {deferPrompt && (
              <button onClick={installApp}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                📲 Install App
              </button>
            )}
            <button onClick={() => setShowConfig(c => !c)}
              className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors
                ${showConfig ? 'bg-white text-green-700' : 'bg-white/20 hover:bg-white/30 text-white'}`}>
              ⚙️ Settings
            </button>
          </div>
        </div>
      </header>

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-2xl shadow-xl animate-bounce">
          {toast}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 space-y-4">

        {/* ── Settings Panel ───────────────────────────────────────────── */}
        {showConfig && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4 border border-green-100">
            <p className="font-bold text-sm text-gray-800">Document Settings</p>

            {/* Layout */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos per page</p>
              <div className="grid grid-cols-4 gap-2">
                {LAYOUTS.map(l => (
                  <button key={l.id} type="button" onClick={() => setLayout(l.id)}
                    className={`py-3 px-1 rounded-xl text-xs font-semibold text-center transition-all border-2
                      ${layout === l.id
                        ? 'bg-green-600 text-white border-green-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Page size */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Page Size</p>
              <div className="flex gap-2">
                {PAGE_SIZES.map(ps => (
                  <button key={ps.id} type="button" onClick={() => setPageSize(ps.id)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border-2
                      ${pageSize === ps.id
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
                    {ps.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Margin */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Margins</p>
              <div className="flex gap-2">
                {[['None', 0], ['Small', 5], ['Normal', 10], ['Large', 18]].map(([label, val]) => (
                  <button key={label} type="button" onClick={() => setMargin(val)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all border-2
                      ${margin === val
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Document title ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
          <input
            type="text"
            placeholder="Document name (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-4 py-4 text-base placeholder-gray-400 text-gray-800 outline-none font-medium"
          />
        </div>

        {/* ── Add photos ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => galleryRef.current?.click()}
            className="flex flex-col items-center gap-2 bg-white rounded-2xl shadow-sm border-2 border-dashed border-green-200 py-6 text-green-700 font-semibold text-sm hover:border-green-400 hover:bg-green-50 transition-colors active:scale-95">
            <span className="text-3xl">🖼️</span>
            From Gallery
          </button>
          <button type="button" onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-2 bg-white rounded-2xl shadow-sm border-2 border-dashed border-green-200 py-6 text-green-700 font-semibold text-sm hover:border-green-400 hover:bg-green-50 transition-colors active:scale-95">
            <span className="text-3xl">📷</span>
            Take Photo
          </button>
          <input ref={galleryRef} type="file" accept="image/*"         multiple className="hidden" onChange={onGalleryInput} />
          <input ref={cameraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={onCameraInput} />
        </div>

        {/* ── Photo list ───────────────────────────────────────────────── */}
        {images.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-sm text-gray-800">
                {images.length} photo{images.length !== 1 ? 's' : ''}
                {pageCount > 0 && <span className="text-gray-400 font-normal"> · {pageCount} page{pageCount !== 1 ? 's' : ''}</span>}
              </p>
              <button onClick={() => setImages([])}
                className="text-xs text-red-500 font-semibold hover:text-red-700">
                Remove all
              </button>
            </div>

            <div className="divide-y divide-gray-50">
              {images.map((img, idx) => (
                <div key={img.id} className="flex items-center gap-3 px-4 py-3">
                  <img src={img.dataUrl} alt=""
                    className="w-16 h-16 object-cover rounded-xl shrink-0 border border-gray-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 font-medium truncate">{img.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Photo {idx + 1}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveUp(idx)} disabled={idx === 0}
                      className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 disabled:opacity-20 hover:bg-gray-100 text-sm font-bold flex items-center justify-center">
                      ↑
                    </button>
                    <button onClick={() => moveDown(idx)} disabled={idx === images.length - 1}
                      className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 disabled:opacity-20 hover:bg-gray-100 text-sm font-bold flex items-center justify-center">
                      ↓
                    </button>
                    <button onClick={() => removeImage(img.id)}
                      className="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-sm font-bold flex items-center justify-center">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add more */}
            <button type="button" onClick={() => galleryRef.current?.click()}
              className="w-full py-3 text-sm text-green-600 font-semibold border-t border-gray-100 hover:bg-green-50 transition-colors">
              + Add more photos
            </button>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {images.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-3">📄</div>
            <p className="font-semibold text-gray-500">No photos yet</p>
            <p className="text-sm mt-1">Tap a button above to add photos</p>
          </div>
        )}

      </div>

      {/* ── Sticky action bar ─────────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-100 px-4 pt-3 pb-6 safe-bottom space-y-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        {/* Share button — primary */}
        <button
          onClick={() => handleBuild('share')}
          disabled={building || images.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white text-base font-bold py-4 rounded-2xl
                     disabled:opacity-40 hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm">
          {building
            ? <><span className="animate-spin">⏳</span> Building PDF…</>
            : <><span>📤</span> Create & Share PDF</>
          }
        </button>

        {/* Download button — secondary */}
        <button
          onClick={() => handleBuild('download')}
          disabled={building || images.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 text-sm font-semibold py-3 rounded-2xl
                     disabled:opacity-40 hover:bg-gray-200 active:scale-[0.98] transition-all">
          <span>⬇️</span> Download PDF Only
        </button>

        <p className="text-center text-xs text-gray-400 pt-0.5">
          "Create &amp; Share" opens WhatsApp, email, or any app on your phone
        </p>
      </div>

    </div>
  );
}
