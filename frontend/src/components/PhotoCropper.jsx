import { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Check, Upload, Move } from 'lucide-react';

const CROP = 288; // px — size of the visible crop window

/**
 * PhotoCropper
 * Props:
 *   file      — File object (image)
 *   onConfirm — (blob: Blob) => void   called with cropped JPEG blob
 *   onCancel  — () => void             called when user wants to re-upload
 */
export default function PhotoCropper({ file, onConfirm, onCancel }) {
  const imgRef  = useRef(null);
  const [imgUrl]              = useState(() => URL.createObjectURL(file));
  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [ready, setReady]     = useState(false);
  const dragRef               = useRef(null); // { startX, startY, origOffX, origOffY }
  const pinchRef              = useRef(null); // { dist, origScale }

  // Revoke object URL on unmount
  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  // Auto-fit image to fill the crop window on load
  const onImgLoad = () => {
    const { naturalWidth: nw, naturalHeight: nh } = imgRef.current;
    const autoScale = Math.max(CROP / nw, CROP / nh);
    setScale(autoScale);
    setOffset({ x: 0, y: 0 });
    setReady(true);
  };

  // ── Mouse events ─────────────────────────────────────────────
  const onMouseDown = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: offset.x, origOffY: offset.y };
  };

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { startX, startY, origOffX, origOffY } = dragRef.current;
    setOffset({ x: origOffX + e.clientX - startX, y: origOffY + e.clientY - startY });
  }, []);

  const onMouseUp = () => { dragRef.current = null; };

  // ── Touch events ─────────────────────────────────────────────
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragRef.current = { startX: t.clientX, startY: t.clientY, origOffX: offset.x, origOffY: offset.y };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchRef.current = { dist, origScale: scale };
      dragRef.current  = null;
    }
  };

  const onTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragRef.current) {
      const t = e.touches[0];
      const { startX, startY, origOffX, origOffY } = dragRef.current;
      setOffset({ x: origOffX + t.clientX - startX, y: origOffY + t.clientY - startY });
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const newScale = Math.min(6, Math.max(0.3, pinchRef.current.origScale * (dist / pinchRef.current.dist)));
      setScale(newScale);
    }
  };

  const onTouchEnd = () => { dragRef.current = null; pinchRef.current = null; };

  // ── Scroll zoom ───────────────────────────────────────────────
  const onWheel = (e) => {
    e.preventDefault();
    setScale(s => Math.min(6, Math.max(0.3, s - e.deltaY * 0.002)));
  };

  // ── Crop to canvas ─────────────────────────────────────────────
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const { naturalWidth: nw, naturalHeight: nh } = img;

    // The image is centred at (CROP/2 + offset.x, CROP/2 + offset.y) in display space.
    // Display pixel (0,0) maps to image pixel:
    //   srcX = nw/2 - (CROP/2 + offset.x) / scale
    //   srcY = nh/2 - (CROP/2 + offset.y) / scale
    const srcX = nw / 2 - (CROP / 2 + offset.x) / scale;
    const srcY = nh / 2 - (CROP / 2 + offset.y) / scale;
    const srcW = CROP / scale;
    const srcH = CROP / scale;

    const canvas = document.createElement('canvas');
    canvas.width  = CROP;
    canvas.height = CROP;
    const ctx = canvas.getContext('2d');

    // White background (in case srcX/srcY clips outside image)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CROP, CROP);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, CROP, CROP);

    canvas.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.93);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900 text-base">Position Photo</p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <Move size={11} /> Drag to move &nbsp;·&nbsp; Scroll or pinch to zoom
          </p>
        </div>

        {/* Crop window */}
        <div className="flex flex-col items-center px-5 pt-5 pb-4 gap-4">
          <div
            className="relative rounded-2xl overflow-hidden bg-gray-100 select-none"
            style={{
              width: CROP, height: CROP,
              cursor: dragRef.current ? 'grabbing' : 'grab',
              touchAction: 'none',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
          >
            {/* Hidden img used for natural dimensions + canvas draw */}
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              onLoad={onImgLoad}
              draggable={false}
              style={{
                position:        'absolute',
                top:             '50%',
                left:            '50%',
                transformOrigin: 'center center',
                transform:       `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                maxWidth:        'none',
                pointerEvents:   'none',
                opacity:          ready ? 1 : 0,
                transition:       ready ? 'none' : 'opacity 0.2s',
              }}
            />

            {/* Corner guides */}
            {['top-0 left-0 border-t-2 border-l-2',
              'top-0 right-0 border-t-2 border-r-2',
              'bottom-0 left-0 border-b-2 border-l-2',
              'bottom-0 right-0 border-b-2 border-r-2',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-6 h-6 border-white/80 pointer-events-none ${cls}`} />
            ))}

            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
              </div>
            )}
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3 w-full">
            <button type="button"
              onClick={() => setScale(s => Math.max(0.3, s - 0.12))}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors shrink-0">
              <ZoomOut size={15} className="text-gray-600" />
            </button>
            <input
              type="range" min="0.3" max="6" step="0.02"
              value={scale}
              onChange={e => setScale(Number(e.target.value))}
              className="flex-1 accent-brand-600 h-1.5"
            />
            <button type="button"
              onClick={() => setScale(s => Math.min(6, s + 0.12))}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors shrink-0">
              <ZoomIn size={15} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button type="button" onClick={handleConfirm}
            className="btn-primary flex-1 justify-center py-2.5">
            <Check size={15} /> Use This Photo
          </button>
          <button type="button" onClick={onCancel}
            className="btn-secondary flex items-center gap-1.5 px-4">
            <Upload size={14} /> Re-upload
          </button>
        </div>
      </div>
    </div>
  );
}
