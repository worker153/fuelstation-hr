import { useRef, useState } from 'react';
import { Upload, X, FileText, Image } from 'lucide-react';

export default function FileUpload({
  label,
  accept = 'image/*,application/pdf',
  preview,          // existing URL
  onChange,         // (file) => void
  onClear,
  className = ''
}) {
  const inputRef = useRef(null);
  const [localPreview, setLocalPreview] = useState(null);
  const [localFile, setLocalFile]       = useState(null);
  const [dragging, setDragging]         = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    setLocalFile(file);
    if (file.type.startsWith('image/')) {
      setLocalPreview(URL.createObjectURL(file));
    } else {
      setLocalPreview('pdf');
    }
    onChange?.(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const clearFile = () => {
    setLocalFile(null);
    setLocalPreview(null);
    if (inputRef.current) inputRef.current.value = '';
    onClear?.();
  };

  const displayPreview = localPreview || preview;
  const isPdf = displayPreview === 'pdf' || (typeof displayPreview === 'string' && displayPreview.endsWith('.pdf'));

  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}

      {displayPreview ? (
        <div className="relative inline-block">
          {isPdf ? (
            <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl bg-gray-50">
              <FileText size={32} className="text-red-500" />
              <div>
                <p className="text-sm font-medium text-gray-700">{localFile?.name || 'PDF Document'}</p>
                {preview && !localFile && (
                  <a href={preview} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-600 hover:underline">View existing</a>
                )}
              </div>
            </div>
          ) : (
            <img
              src={displayPreview}
              alt="Preview"
              className="w-28 h-28 object-cover rounded-xl border border-gray-200"
            />
          )}
          <button
            type="button"
            onClick={clearFile}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-xl
                      cursor-pointer transition-colors text-center
                      ${dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}
        >
          <Upload size={24} className="text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-600">Drop file here or <span className="text-brand-600">browse</span></p>
            <p className="text-xs text-gray-400 mt-0.5">JPEG, PNG, WebP or PDF — max 10 MB</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
    </div>
  );
}
