import { useState, useRef, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import {
  ImagePlus, Trash2, ArrowUp, ArrowDown, FileDown,
  Share2, Loader, Copy, Check, X, Link2
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';

// ─── helpers ─────────────────────────────────────────────────────────────────
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PdfMaker() {
  const notify   = useNotify();
  const inputRef = useRef(null);

  const [images,    setImages   ] = useState([]);   // { id, dataUrl, name }
  const [title,     setTitle    ] = useState('');
  const [building,  setBuilding ] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shareUrl,  setShareUrl ] = useState('');
  const [copied,    setCopied   ] = useState(false);

  // ── Add images ─────────────────────────────────────────────────────────────
  const addImages = useCallback(async (files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!valid.length) return;
    const loaded = await Promise.all(valid.map(async f => ({
      id:      Math.random().toString(36).slice(2),
      name:    f.name,
      dataUrl: await readFileAsDataURL(f),
    })));
    setImages(prev => [...prev, ...loaded]);
    setShareUrl('');
  }, []);

  const onFileInput = e => {
    addImages(e.target.files);
    e.target.value = '';
  };

  const onDrop = e => {
    e.preventDefault();
    addImages(e.dataTransfer.files);
  };

  const remove  = id  => { setImages(prev => prev.filter(i => i.id !== id)); setShareUrl(''); };
  const moveUp  = idx => setImages(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a; });
  const moveDown= idx => setImages(prev => { const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a; });

  // ── Build PDF ──────────────────────────────────────────────────────────────
  const buildPdf = async () => {
    if (!images.length) return notify('Add at least one image', 'warning');
    setBuilding(true);
    try {
      const pdf = new jsPDF({ unit: 'mm', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;

      if (title.trim()) {
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title.trim(), pageW / 2, margin + 6, { align: 'center' });
      }

      for (let i = 0; i < images.length; i++) {
        if (i > 0) pdf.addPage();
        const { dataUrl } = images[i];
        const { w, h } = await getImageDimensions(dataUrl);
        const aspect = w / h;

        const usableW = pageW - margin * 2;
        const usableH = pageH - margin * 2 - (i === 0 && title.trim() ? 20 : 0);
        const yStart  = margin + (i === 0 && title.trim() ? 20 : 0);

        let imgW = usableW;
        let imgH = imgW / aspect;
        if (imgH > usableH) { imgH = usableH; imgW = imgH * aspect; }

        const xPos = margin + (usableW - imgW) / 2;
        const fmt  = dataUrl.includes('data:image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(dataUrl, fmt, xPos, yStart, imgW, imgH);
      }

      return pdf;
    } finally {
      setBuilding(false);
    }
  };

  // ── Download locally ───────────────────────────────────────────────────────
  const download = async () => {
    const pdf = await buildPdf();
    if (!pdf) return;
    pdf.save(`${title.trim() || 'images'}.pdf`);
  };

  // ── Generate + upload + get shareable link ────────────────────────────────
  const generateLink = async () => {
    if (!images.length) return notify('Add at least one image', 'warning');
    setUploading(true);
    setShareUrl('');
    try {
      const pdf  = await buildPdf();
      if (!pdf) return;
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

  // ── Copy link ──────────────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // ── Send via WhatsApp ──────────────────────────────────────────────────────
  const sendWhatsApp = () => {
    if (!shareUrl) return;
    const text = `${title.trim() ? `*${title.trim()}*\n\n` : ''}Here is your PDF document:\n${shareUrl}\n\n— Sage Energy HR`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">PDF Maker</h1>
        <p className="text-sm text-gray-500 mt-0.5">Combine photos into a PDF and share via WhatsApp</p>
      </div>

      {/* Title input */}
      <div className="card p-4">
        <label className="label">Document Title (optional)</label>
        <input
          className="input"
          placeholder="e.g. Worker Documents — July 2026"
          value={title}
          onChange={e => { setTitle(e.target.value); setShareUrl(''); }}
        />
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="card p-8 border-2 border-dashed border-brand-200 bg-brand-50 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-brand-400 hover:bg-brand-100 transition-colors"
      >
        <ImagePlus size={32} className="text-brand-400" />
        <div className="text-center">
          <p className="font-semibold text-brand-700">Tap to add photos</p>
          <p className="text-sm text-brand-500 mt-0.5">or drag & drop images here</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onFileInput}
        />
      </div>

      {/* Image list */}
      {images.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="font-semibold text-gray-800 text-sm">{images.length} photo{images.length !== 1 ? 's' : ''} — drag to reorder</p>
            <button onClick={() => { setImages([]); setShareUrl(''); }}
              className="text-xs text-red-500 hover:text-red-700">Clear all</button>
          </div>
          <div className="divide-y divide-gray-50">
            {images.map((img, idx) => (
              <div key={img.id} className="flex items-center gap-3 px-4 py-3">
                <img src={img.dataUrl} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate font-medium">{img.name}</p>
                  <p className="text-xs text-gray-400">Page {idx + 1}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx === images.length - 1}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30">
                    <ArrowDown size={14} />
                  </button>
                  <button onClick={() => remove(img.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add more */}
          <div className="px-4 py-3 border-t border-gray-100">
            <button onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800 font-medium">
              <ImagePlus size={14} /> Add more photos
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {images.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Download */}
          <button onClick={download} disabled={building || uploading}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            {building ? <Loader size={16} className="animate-spin" /> : <FileDown size={16} />}
            Download PDF
          </button>

          {/* Generate shareable link */}
          <button onClick={generateLink} disabled={building || uploading}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors disabled:opacity-50">
            {uploading ? <Loader size={16} className="animate-spin" /> : <Link2 size={16} />}
            {uploading ? 'Uploading…' : 'Generate Shareable Link'}
          </button>
        </div>
      )}

      {/* Share panel — shows after link is generated */}
      {shareUrl && (
        <div className="card p-4 space-y-3 border border-green-200 bg-green-50">
          <p className="font-semibold text-green-800 flex items-center gap-2">
            <Link2 size={16} /> Your PDF link is ready
          </p>

          {/* Link display + copy */}
          <div className="flex items-center gap-2 bg-white border border-green-200 rounded-xl px-3 py-2">
            <p className="flex-1 text-xs text-gray-600 truncate">{shareUrl}</p>
            <button onClick={copyLink}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 transition-colors">
              {copied ? <><Check size={12} className="text-green-600" /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>

          {/* WhatsApp button */}
          <button onClick={sendWhatsApp}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors">
            <Share2 size={16} />
            Send via WhatsApp
          </button>

          <p className="text-xs text-green-700 text-center">
            Anyone with this link can view and download the PDF
          </p>
        </div>
      )}
    </div>
  );
}
