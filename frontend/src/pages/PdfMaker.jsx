import { useState, useRef, useCallback, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  ImagePlus, Loader, Copy, Check, Link2,
  Share2, FileDown, ChevronLeft, ChevronRight, Settings2,
  LayoutGrid, LayoutList, FlipVertical2, FlipHorizontal2, X,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';

// ─── constants ────────────────────────────────────────────────────────────────
const PAGE_SIZES = {
  A4_P:  { label: 'A4 Portrait',   w: 210, h: 297 },
  A4_L:  { label: 'A4 Landscape',  w: 297, h: 210 },
  A5_P:  { label: 'A5 Portrait',   w: 148, h: 210 },
  LTR_P: { label: 'Letter Portrait', w: 216, h: 279 },
};

const LAYOUTS = [
  { id: '1',  label: '1 per page',    cols: 1, rows: 1, icon: LayoutList  },
  { id: '2v', label: '2 per page (stack)', cols: 1, rows: 2, icon: FlipVertical2   },
  { id: '2h', label: '2 per page (side)',  cols: 2, rows: 1, icon: FlipHorizontal2 },
  { id: '4',  label: '4 per page',    cols: 2, rows: 2, icon: LayoutGrid  },
];

const MARGINS = { none: 0, small: 5, normal: 10, large: 18 };

// ─── helpers ─────────────────────────────────────────────────────────────────
function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function imgDims(src) {
  return new Promise(res => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = src;
  });
}

// Draw one image into a jsPDF rect, centred + fitted
async function placeImage(pdf, dataUrl, x, y, maxW, maxH) {
  if (!dataUrl) return;
  const { w, h } = await imgDims(dataUrl);
  const aspect = w / h;
  let iw = maxW, ih = iw / aspect;
  if (ih > maxH) { ih = maxH; iw = ih * aspect; }
  const px = x + (maxW - iw) / 2;
  const py = y + (maxH - ih) / 2;
  const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  pdf.addImage(dataUrl, fmt, px, py, iw, ih, undefined, 'FAST');
}

// ─── Page preview canvas ──────────────────────────────────────────────────────
function PagePreview({ images, layout, pageKey, margin, title, pageIndex, total }) {
  const canvasRef = useRef(null);
  const ps = PAGE_SIZES[pageKey];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const cw   = canvas.width;
    const ch   = canvas.height;
    const scaleX = cw / ps.w;
    const scaleY = ch / ps.h;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    const mg  = margin * scaleX;
    const lay = LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
    const { cols, rows } = lay;

    let topOffset = mg;
    if (title && pageIndex === 0) {
      ctx.fillStyle = '#111827';
      ctx.font = `bold ${Math.round(14 * scaleX)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(title, cw / 2, mg + 14 * scaleX);
      topOffset += 20 * scaleX;
    }

    const slotW = (cw - mg * 2 - (cols - 1) * mg / 2) / cols;
    const slotH = (ch - topOffset - mg - (rows - 1) * mg / 2) / rows;

    images.forEach((img, i) => {
      if (!img?.dataUrl) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = mg + col * (slotW + mg / 2);
      const y   = topOffset + row * (slotH + mg / 2);

      const el = new Image();
      el.onload = () => {
        const aspect = el.naturalWidth / el.naturalHeight;
        let iw = slotW, ih = iw / aspect;
        if (ih > slotH) { ih = slotH; iw = ih * aspect; }
        const px = x + (slotW - iw) / 2;
        const py = y + (slotH - ih) / 2;
        ctx.drawImage(el, px, py, iw, ih);
      };
      el.src = img.dataUrl;
    });

    // Page number
    ctx.fillStyle = '#9ca3af';
    ctx.font = `${Math.round(9 * scaleX)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${pageIndex + 1} / ${total}`, cw / 2, ch - 4);
  }, [images, layout, pageKey, margin, title, pageIndex, total]);

  const aspect = ps.w / ps.h;
  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={Math.round(320 / aspect)}
      className="w-full rounded-lg border border-gray-200 shadow-sm bg-white"
    />
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PdfMaker() {
  const notify   = useNotify();
  const inputRef = useRef(null);

  const [images,     setImages    ] = useState([]);
  const [title,      setTitle     ] = useState('');
  const [layout,     setLayout    ] = useState('1');
  const [pageKey,    setPageKey   ] = useState('A4_P');
  const [margin,     setMargin    ] = useState(10);
  const [quality,    setQuality   ] = useState(0.85);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [building,   setBuilding  ] = useState(false);
  const [uploading,  setUploading ] = useState(false);
  const [shareUrl,   setShareUrl  ] = useState('');
  const [copied,     setCopied    ] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver,   setDragOver  ] = useState(false);

  const lay = LAYOUTS.find(l => l.id === layout) || LAYOUTS[0];
  const perPage = lay.cols * lay.rows;

  // Chunk images into pages
  const pages = [];
  for (let i = 0; i < images.length; i += perPage) {
    pages.push(images.slice(i, i + perPage));
  }
  if (!pages.length) pages.push([]);

  const safeIdx = Math.min(previewIdx, Math.max(0, pages.length - 1));

  // ── File handling ────────────────────────────────────────────────────────
  const addFiles = useCallback(async files => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!valid.length) return;
    const loaded = await Promise.all(valid.map(async f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      dataUrl: await readFile(f),
    })));
    setImages(prev => [...prev, ...loaded]);
    setShareUrl('');
  }, []);

  const onInput  = e => { addFiles(e.target.files); e.target.value = ''; };
  const onDrop   = e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); };
  const remove   = id => { setImages(prev => prev.filter(i => i.id !== id)); setShareUrl(''); };

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const buildPdf = async () => {
    if (!images.length) { notify('Add at least one image', 'warning'); return null; }
    setBuilding(true);
    try {
      const ps  = PAGE_SIZES[pageKey];
      const pdf = new jsPDF({ unit: 'mm', format: [ps.w, ps.h], compress: true });
      const mg  = margin;
      const { cols, rows } = lay;

      for (let p = 0; p < pages.length; p++) {
        if (p > 0) pdf.addPage([ps.w, ps.h]);
        let topY = mg;

        if (title && p === 0) {
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(17, 24, 39);
          pdf.text(title, ps.w / 2, mg + 6, { align: 'center' });
          topY += 14;
        }

        const gap  = mg / 2;
        const slotW = (ps.w - mg * 2 - gap * (cols - 1)) / cols;
        const slotH = (ps.h - topY - mg - gap * (rows - 1)) / rows;

        for (let i = 0; i < pages[p].length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x   = mg + col * (slotW + gap);
          const y   = topY + row * (slotH + gap);
          await placeImage(pdf, pages[p][i].dataUrl, x, y, slotW, slotH);
        }

        // Page number
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(156, 163, 175);
        pdf.text(`${p + 1} / ${pages.length}`, ps.w / 2, ps.h - 4, { align: 'center' });
      }
      return pdf;
    } finally {
      setBuilding(false);
    }
  };

  const download = async () => {
    const pdf = await buildPdf();
    if (pdf) pdf.save(`${title.trim() || 'document'}.pdf`);
  };

  const generateLink = async () => {
    const pdf = await buildPdf();
    if (!pdf) return;
    setUploading(true);
    setShareUrl('');
    try {
      const blob = pdf.output('blob');
      const fd   = new FormData();
      fd.append('pdf', blob, `${title.trim() || 'document'}.pdf`);
      const { data } = await api.post('/pdf-share/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setShareUrl(data.url);
      notify('Link ready!');
    } catch (err) {
      notify(err.response?.data?.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    });
  };

  const sendWhatsApp = () => {
    if (!shareUrl) return;
    const text = `${title.trim() ? `*${title.trim()}*\n\n` : ''}📄 PDF Document:\n${shareUrl}\n\n— Sage Energy HR`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">PDF Maker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Turn photos into a PDF — share instantly via WhatsApp</p>
        </div>
        <button onClick={() => setShowSettings(s => !s)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors
            ${showSettings ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <Settings2 size={15} /> Settings
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

        {/* ── Left: images + settings ───────────────────────────────────── */}
        <div className="space-y-4">

          {/* Title */}
          <div className="card p-4">
            <label className="label">Document Title</label>
            <input className="input" placeholder="e.g. Verification Documents — July 2026"
              value={title} onChange={e => { setTitle(e.target.value); setShareUrl(''); }} />
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="card p-4 space-y-4">
              {/* Layout */}
              <div>
                <label className="label">Layout — images per page</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                  {LAYOUTS.map(l => (
                    <button key={l.id} type="button"
                      onClick={() => { setLayout(l.id); setPreviewIdx(0); setShareUrl(''); }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-colors
                        ${layout === l.id ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-brand-400'}`}>
                      <l.icon size={18} />
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Page size */}
              <div>
                <label className="label">Page Size</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {Object.entries(PAGE_SIZES).map(([key, ps]) => (
                    <button key={key} type="button"
                      onClick={() => { setPageKey(key); setShareUrl(''); }}
                      className={`py-2 px-3 rounded-xl border text-xs font-medium transition-colors
                        ${pageKey === key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-brand-400'}`}>
                      {ps.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin */}
              <div>
                <label className="label">Margins</label>
                <div className="flex gap-2 mt-1">
                  {Object.entries(MARGINS).map(([k, v]) => (
                    <button key={k} type="button"
                      onClick={() => { setMargin(v); setShareUrl(''); }}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors
                        ${margin === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-brand-400'}`}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => inputRef.current?.click()}
            className={`card p-7 border-2 border-dashed flex flex-col items-center gap-3 cursor-pointer transition-colors
              ${dragOver ? 'border-brand-500 bg-brand-100' : 'border-brand-200 bg-brand-50 hover:border-brand-400 hover:bg-brand-100'}`}>
            <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center">
              <ImagePlus size={26} className="text-brand-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-brand-700">Tap to add photos</p>
              <p className="text-sm text-brand-500 mt-0.5">Supports JPG, PNG, WebP — multiple at once</p>
            </div>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInput} />
          </div>

          {/* Image grid */}
          {images.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="font-semibold text-sm text-gray-800">
                  {images.length} photo{images.length !== 1 ? 's' : ''} · {pages.length} page{pages.length !== 1 ? 's' : ''}
                </p>
                <button onClick={() => { setImages([]); setShareUrl(''); setPreviewIdx(0); }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Remove all</button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3">
                {images.map((img, idx) => (
                  <div key={img.id} className="relative group aspect-square">
                    <img src={img.dataUrl} alt=""
                      className="w-full h-full object-cover rounded-xl border border-gray-200" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-colors flex items-center justify-center">
                      <button onClick={() => remove(img.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 bg-red-500 text-white rounded-full transition-opacity">
                        <X size={12} />
                      </button>
                    </div>
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-black/50 text-white rounded-md px-1.5 py-0.5">
                      {idx + 1}
                    </span>
                  </div>
                ))}
                {/* Add more tile */}
                <div onClick={() => inputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors">
                  <ImagePlus size={20} className="text-gray-300" />
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={download} disabled={building || uploading}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
                {building ? <Loader size={16} className="animate-spin" /> : <FileDown size={16} />}
                Download PDF
              </button>
              <button onClick={generateLink} disabled={building || uploading}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors disabled:opacity-50">
                {uploading ? <Loader size={16} className="animate-spin" /> : <Link2 size={16} />}
                {uploading ? 'Uploading…' : 'Get Share Link'}
              </button>
            </div>
          )}

          {/* Share panel */}
          {shareUrl && (
            <div className="card p-4 space-y-3 border border-green-200 bg-green-50">
              <p className="font-semibold text-green-800 text-sm flex items-center gap-2">
                <Link2 size={15} /> PDF Link Ready
              </p>
              <div className="flex items-center gap-2 bg-white border border-green-200 rounded-xl px-3 py-2">
                <p className="flex-1 text-xs text-gray-600 truncate">{shareUrl}</p>
                <button onClick={copyLink}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 transition-colors">
                  {copied ? <><Check size={11} className="text-green-600" /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
              <button onClick={sendWhatsApp}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors">
                <Share2 size={16} /> Send via WhatsApp
              </button>
              <p className="text-xs text-green-700 text-center">Anyone with this link can open & download the PDF</p>
            </div>
          )}
        </div>

        {/* ── Right: live preview ───────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="card p-3 sticky top-20">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 text-center">
              Preview — Page {safeIdx + 1} of {pages.length}
            </p>

            <PagePreview
              key={`${safeIdx}-${layout}-${pageKey}-${margin}-${title}-${images.map(i=>i.id).join()}`}
              images={pages[safeIdx] || []}
              layout={layout}
              pageKey={pageKey}
              margin={margin}
              title={title}
              pageIndex={safeIdx}
              total={pages.length}
            />

            {pages.length > 1 && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                  disabled={safeIdx === 0}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs text-gray-500 font-medium">
                  {safeIdx + 1} / {pages.length}
                </span>
                <button onClick={() => setPreviewIdx(i => Math.min(pages.length - 1, i + 1))}
                  disabled={safeIdx === pages.length - 1}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            {images.length === 0 && (
              <p className="text-xs text-gray-400 text-center mt-2">Add photos to see preview</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
