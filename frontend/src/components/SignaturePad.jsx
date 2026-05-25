import { useRef, useState, useEffect, useCallback } from 'react';
import { Pen, Upload, Trash2, RefreshCw, CheckCircle } from 'lucide-react';

/**
 * SignaturePad — draw a signature on canvas OR upload an image.
 *
 * Props:
 *   label       — field label
 *   value       — { url } for existing saved signature
 *   onChange    — (result: { file: File, dataUrl: string } | null) => void
 *   className
 */
export default function SignaturePad({ label, value, onChange, className = '' }) {
  const canvasRef   = useRef(null);
  const [mode, setMode]           = useState('draw');   // 'draw' | 'upload'
  const [drawing, setDrawing]     = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Initialise canvas with correct pixel density
  useEffect(() => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, [mode]);

  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const src    = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }, []);

  const startDraw = (e) => {
    e.preventDefault();
    setDrawing(true);
    const { x, y } = getPoint(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing) return;
    const { x, y } = getPoint(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth   = 2.2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    setHasContent(true);
  };

  const endDraw = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    if (!hasContent) return;
    canvasRef.current.toBlob((blob) => {
      const file    = new File([blob], 'signature.png', { type: 'image/png' });
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onChange?.({ file, dataUrl });
    }, 'image/png');
  }, [drawing, hasContent, onChange]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const dpr    = window.devicePixelRatio || 1;
    const rect   = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasContent(false);
    onChange?.(null);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    onChange?.({ file, dataUrl: url });
  };

  const clearAll = () => {
    setLocalPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onChange?.(null);
  };

  // Existing saved signature display
  const savedUrl = value?.url;

  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}

      {/* Mode toggle */}
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => setMode('draw')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
            ${mode === 'draw' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'}`}>
          <Pen size={12} /> Draw Signature
        </button>
        <button type="button" onClick={() => { setMode('upload'); clearCanvas(); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
            ${mode === 'upload' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'}`}>
          <Upload size={12} /> Upload Image
        </button>
      </div>

      {/* Existing signature banner */}
      {savedUrl && !localPreview && mode === 'upload' && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <img src={savedUrl} alt="Saved signature" className="h-10 object-contain bg-white rounded border border-green-200" />
          <div className="flex-1">
            <p className="text-xs font-medium text-green-700">Signature saved</p>
            <p className="text-xs text-green-600">Upload a new image to replace</p>
          </div>
          <CheckCircle size={16} className="text-green-500 shrink-0" />
        </div>
      )}

      {/* Draw mode */}
      {mode === 'draw' && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          {savedUrl && !hasContent ? (
            <div className="relative">
              <img src={savedUrl} alt="Signature" className="w-full h-32 object-contain bg-white p-2" />
              <div className="absolute inset-0 bg-black/0 flex items-center justify-center opacity-0 hover:opacity-100 hover:bg-black/10 transition-all">
                <button type="button" onClick={() => setHasContent(true)} className="btn-secondary text-xs">
                  <RefreshCw size={12} /> Redraw
                </button>
              </div>
              <p className="text-center text-xs text-green-600 py-1.5 bg-green-50 border-t border-green-100 font-medium">
                ✓ Signature on file — hover to redraw
              </p>
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '130px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
                <p className="text-xs text-gray-400 italic">Sign in the box above</p>
                <button type="button" onClick={clearCanvas} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                  <Trash2 size={11} /> Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div>
          {localPreview ? (
            <div className="relative inline-block">
              <img src={localPreview} alt="Signature" className="h-24 object-contain rounded-xl border border-gray-200 bg-white p-2" />
              <button type="button" onClick={clearAll}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow">
                <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
          ) : (
            <div onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors">
              <Upload size={22} className="text-gray-400" />
              <p className="text-sm text-gray-500">Click to upload signature image</p>
              <p className="text-xs text-gray-400">PNG, JPG, WebP</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </div>
      )}
    </div>
  );
}
