import { useRef, useState } from 'react';
import { Camera, Upload, X, RotateCcw, ZoomIn } from 'lucide-react';

/**
 * CameraCapture — take a photo with the device camera OR upload a file.
 * Works on mobile (rear/front camera) and desktop (webcam).
 *
 * Props:
 *   label, accept, preview (existing URL), onChange (file => void), onClear
 *   facingMode  — 'user' | 'environment' (default 'environment' for rear cam on mobile)
 *   square      — if true, preview is a square
 */
export default function CameraCapture({
  label,
  accept      = 'image/*',
  preview,
  onChange,
  onClear,
  facingMode  = 'environment',
  square      = false,
  className   = ''
}) {
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const fileInputRef  = useRef(null);
  const streamRef     = useRef(null);

  const [mode,         setMode]         = useState(null);  // null | 'camera' | 'preview'
  const [localPreview, setLocalPreview] = useState(null);
  const [camError,     setCamError]     = useState(null);
  const [lightbox,     setLightbox]     = useState(false);

  const hasCamera = !!(navigator.mediaDevices?.getUserMedia);

  // ── Camera helpers ─────────────────────────────────────────────────────────
  const startCamera = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setMode('camera');
    } catch (err) {
      setCamError(err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : 'Camera not available. Use file upload instead.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setMode(null);
  };

  const capture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url  = URL.createObjectURL(blob);
      setLocalPreview(url);
      stopCamera();
      setMode('preview');
      onChange?.(file);
    }, 'image/jpeg', 0.92);
  };

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    setMode('preview');
    onChange?.(file);
  };

  const clear = () => {
    stopCamera();
    setLocalPreview(null);
    setMode(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClear?.();
  };

  const displayPreview = localPreview || preview;
  const previewClass   = square
    ? 'w-32 h-32 object-cover rounded-xl border-2 border-gray-100 shadow-sm'
    : 'w-full max-h-48 object-cover rounded-xl border border-gray-200 shadow-sm';

  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera live view */}
      {mode === 'camera' && (
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full"
            style={{ maxHeight: 320, objectFit: 'cover' }}
          />
          <div className="flex items-center justify-center gap-3 p-3 bg-gray-900">
            <button type="button" onClick={stopCamera} className="btn-secondary text-xs">
              <X size={14} /> Cancel
            </button>
            <button type="button" onClick={capture}
              className="btn-primary text-xs px-6 py-2 text-base">
              <Camera size={18} /> Capture
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {mode !== 'camera' && displayPreview && (
        <div className={`relative ${square ? 'inline-block' : 'block'}`}>
          <img
            src={displayPreview}
            alt="Preview"
            className={previewClass}
            onClick={() => setLightbox(true)}
          />
          <div className={`absolute ${square ? 'top-1 right-1' : 'top-2 right-2'} flex gap-1`}>
            <button type="button" onClick={() => setLightbox(true)}
              className="bg-black/40 text-white rounded-full p-1 hover:bg-black/60">
              <ZoomIn size={12} />
            </button>
            <button type="button" onClick={clear}
              className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* No preview — show action buttons */}
      {mode !== 'camera' && !displayPreview && (
        <div className="flex gap-2 flex-wrap">
          {hasCamera && (
            <button type="button" onClick={startCamera}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors bg-white">
              <Camera size={15} /> Camera
            </button>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors bg-white">
            <Upload size={15} /> Upload File
          </button>
        </div>
      )}

      {/* Camera error */}
      {camError && (
        <p className="text-xs text-red-500 mt-1">{camError}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <img src={displayPreview} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70">
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
