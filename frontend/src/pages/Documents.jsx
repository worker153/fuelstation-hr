/**
 * Documents — Admin page for creating, editing and sharing company documents.
 * Supports: text content (rich editor), file attachments (PDF/image/DOCX),
 * sharing with all workers, by role group, or selected individuals.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Plus, Edit2, Trash2, Eye, Users, Check,
  Send, BookOpen, X, RotateCcw, Bold, Italic, Underline,
  List, Upload, Paperclip, Download, ExternalLink, ShieldCheck,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const TYPE_CFG = {
  handbook:  { label: 'Staff Handbook',  emoji: '📖', color: 'bg-blue-100 text-blue-700'     },
  policy:    { label: 'Policy',          emoji: '📋', color: 'bg-purple-100 text-purple-700'  },
  notice:    { label: 'Notice',          emoji: '📢', color: 'bg-amber-100 text-amber-700'    },
  agreement: { label: 'Agreement',       emoji: '🤝', color: 'bg-green-100 text-green-700'    },
  other:     { label: 'Other',           emoji: '📄', color: 'bg-gray-100 text-gray-700'      },
};

const fmt = d => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Rich Text Editor ───────────────────────────────────────────────────────────
function RichEditor({ value, onChange }) {
  const editorRef   = useRef(null);
  const isComposing = useRef(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value)
      editorRef.current.innerHTML = value || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    onChange(editorRef.current?.innerHTML || '');
  };

  const TB = ({ icon: Icon, cmd, val, title }) => (
    <button type="button" title={title}
      onMouseDown={e => { e.preventDefault(); exec(cmd, val); }}
      className="p-1.5 rounded hover:bg-gray-200 transition-colors">
      <Icon size={14} className="text-gray-700" />
    </button>
  );

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <TB icon={Bold}      cmd="bold"      title="Bold"   />
        <TB icon={Italic}    cmd="italic"    title="Italic" />
        <TB icon={Underline} cmd="underline" title="Underline" />
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<h2>'); }}
          className="px-2 py-1 rounded text-xs font-bold text-gray-700 hover:bg-gray-200">H1</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<h3>'); }}
          className="px-2 py-1 rounded text-xs font-bold text-gray-600 hover:bg-gray-200">H2</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<p>'); }}
          className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200">¶</button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }}
          className="p-1.5 rounded hover:bg-gray-200"><List size={14} className="text-gray-700" /></button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }}
          className="px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-200">1.</button>
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => { isComposing.current = false; onChange(editorRef.current?.innerHTML || ''); }}
        onInput={() => { if (!isComposing.current) onChange(editorRef.current?.innerHTML || ''); }}
        className="min-h-[220px] max-h-[400px] overflow-y-auto px-4 py-3 text-sm text-gray-800 leading-relaxed outline-none
          [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-gray-900 [&_h2]:mt-4 [&_h2]:mb-2
          [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-3 [&_h3]:mb-1
          [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2
          [&_li]:mb-1 [&_strong]:font-bold [&_em]:italic [&_u]:underline"
      />
    </div>
  );
}

// ── File preview inline (PDF iframe / image / download link) ──────────────────
function FileViewer({ fileUrl, fileName, fileType }) {
  if (!fileUrl) return null;
  if (fileType === 'pdf') {
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ height: 480 }}>
        <iframe src={fileUrl} title={fileName} className="w-full h-full" />
      </div>
    );
  }
  if (fileType === 'image') {
    return <img src={fileUrl} alt={fileName} className="max-w-full rounded-xl border border-gray-200" />;
  }
  return (
    <a href={fileUrl} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-brand-600 hover:bg-brand-50 transition-colors">
      <Download size={16} /> Download {fileName}
    </a>
  );
}

// ── Signatures panel ───────────────────────────────────────────────────────────
function SignaturesPanel({ docId, onClose }) {
  const [data, setData] = useState(null);
  const [tab,  setTab ] = useState('signed');

  useEffect(() => {
    api.get(`/documents/${docId}/signatures`).then(r => setData(r.data.data)).catch(() => {});
  }, [docId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <p className="font-bold text-gray-800">Signature Status</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={16} /></button>
        </div>
        {!data ? (
          <div className="flex-1 flex items-center justify-center">
            <RotateCcw size={20} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="flex border-b border-gray-100 px-5 shrink-0">
              <button onClick={() => setTab('signed')}
                className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'signed' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>
                ✅ Signed ({data.signatures.length})
              </button>
              <button onClick={() => setTab('unsigned')}
                className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'unsigned' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'}`}>
                ⏳ Pending ({data.unsigned.length})
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {tab === 'signed' && (data.signatures.length === 0
                ? <p className="text-center text-gray-400 py-10 text-sm">No signatures yet</p>
                : data.signatures.map(s => (
                  <div key={s._id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700 font-bold shrink-0">{(s.workerName || '?')[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{s.workerName}</p>
                      <p className="text-xs text-gray-400">{s.workerRole} · Signed: {fmt(s.signedAt)}</p>
                      <p className="text-xs text-gray-400 italic">"{s.signatureName}"</p>
                    </div>
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">✓ SIGNED</span>
                  </div>
                ))
              )}
              {tab === 'unsigned' && (data.unsigned.length === 0
                ? <p className="text-center text-gray-400 py-10 text-sm">🎉 Everyone has signed!</p>
                : data.unsigned.map(w => (
                  <div key={w._id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 font-bold shrink-0">{(w.fullName || '?')[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{w.fullName}</p>
                      <p className="text-xs text-gray-400">{w.role}</p>
                    </div>
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">PENDING</span>
                  </div>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 shrink-0 text-center">
              <p className="text-xs text-gray-400">
                {data.signatures.length} of {data.totalTarget} workers signed
                ({data.totalTarget > 0 ? Math.round(data.signatures.length / data.totalTarget * 100) : 0}%)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Document editor modal ──────────────────────────────────────────────────────
function DocModal({ doc, onSave, onClose, allWorkers, allRoles }) {
  const [form, setForm] = useState({
    title:             doc?.title             || '',
    body:              doc?.body              || '',
    type:              doc?.type              || 'handbook',
    requiresSignature: doc?.requiresSignature !== false,
    targetType:        doc?.targetType        || 'all',
    targetWorkers:     (doc?.targetWorkers || []).map(w => String(w._id || w)),
    targetRoles:       doc?.targetRoles       || [],
  });
  const [file,       setFile      ] = useState(null);      // new file chosen
  const [removeFile, setRemoveFile] = useState(false);     // remove existing file
  const [saving,     setSaving    ] = useState(false);
  const fileInputRef = useRef(null);
  const notify = useNotify();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleWorker = (id) =>
    set('targetWorkers', form.targetWorkers.includes(id)
      ? form.targetWorkers.filter(x => x !== id)
      : [...form.targetWorkers, id]);

  const toggleRole = (role) =>
    set('targetRoles', form.targetRoles.includes(role)
      ? form.targetRoles.filter(r => r !== role)
      : [...form.targetRoles, role]);

  const hasExistingFile = doc?.fileUrl && !removeFile && !file;

  const handleSave = async () => {
    if (!form.title.trim()) return notify('Title is required', 'error');
    if (form.targetType === 'role' && form.targetRoles.length === 0)
      return notify('Choose at least one role to share with', 'error');
    if (form.targetType === 'selected' && form.targetWorkers.length === 0)
      return notify('Select at least one worker to share with', 'error');

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title',             form.title);
      fd.append('body',              form.body);
      fd.append('type',              form.type);
      fd.append('requiresSignature', String(form.requiresSignature));
      fd.append('targetType',        form.targetType);
      fd.append('targetWorkers',     JSON.stringify(form.targetType === 'selected' ? form.targetWorkers : []));
      fd.append('targetRoles',       JSON.stringify(form.targetType === 'role'     ? form.targetRoles   : []));
      if (file) fd.append('file', file);
      if (removeFile) fd.append('removeFile', 'true');

      const res = doc
        ? await api.put(`/documents/${doc._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        : await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      onSave(res.data.data);
      notify(doc ? '✅ Document updated' : '✅ Document created');
    } catch (e) {
      notify(e.response?.data?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const countForRole = (role) => allWorkers.filter(w => w.role?.toLowerCase() === role.toLowerCase()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mb-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg">{doc ? 'Edit Document' : 'New Document'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="label">Document Title</label>
            <input className="input" placeholder="e.g. Pump Attendant Safety Rules / Employment Agreement"
              value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          {/* Type + Signature */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Document Type</label>
              <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
                {Object.entries(TYPE_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.requiresSignature}
                  onChange={e => set('requiresSignature', e.target.checked)}
                  className="w-4 h-4 rounded text-brand-600" />
                <span className="text-sm font-medium text-gray-700">Requires worker signature</span>
              </label>
            </div>
          </div>

          {/* ── File Upload ── */}
          <div>
            <label className="label">Attach File <span className="text-gray-400 font-normal">(PDF, Image, Word — optional)</span></label>

            {/* Existing file */}
            {hasExistingFile && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 mb-2">
                <Paperclip size={15} className="text-gray-400 shrink-0" />
                <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                  className="flex-1 text-sm text-brand-600 hover:underline truncate">{doc.fileName}</a>
                <button type="button" onClick={() => setRemoveFile(true)}
                  className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
              </div>
            )}

            {/* New file chosen */}
            {file && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-brand-200 bg-brand-50 mb-2">
                <Paperclip size={15} className="text-brand-500 shrink-0" />
                <span className="flex-1 text-sm text-brand-700 truncate">{file.name}</span>
                <button type="button" onClick={() => setFile(null)}
                  className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
              </div>
            )}

            {/* Upload button */}
            {!hasExistingFile && !file && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 py-6 border-2 border-dashed border-gray-200 rounded-xl hover:border-brand-400 hover:bg-brand-50 transition-colors text-gray-400 hover:text-brand-600">
                <Upload size={22} />
                <span className="text-sm font-medium">Click to upload a file</span>
                <span className="text-xs">PDF, JPG, PNG, DOCX · max 10 MB</span>
              </button>
            )}
            {hasExistingFile && !file && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="text-xs text-brand-600 hover:underline">Replace file</button>
            )}
            <input ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={e => { setFile(e.target.files[0] || null); setRemoveFile(false); }} />
          </div>

          {/* ── Text Content ── */}
          <div>
            <label className="label">Text Content <span className="text-gray-400 font-normal">(optional if file uploaded)</span></label>
            <RichEditor value={form.body} onChange={v => set('body', v)} />
          </div>

          {/* ── Share With ── */}
          <div>
            <label className="label">Share With</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {[
                ['all',      '👥 All Workers'],
                ['role',     '🏷️ By Role'],
                ['selected', '🎯 Specific Workers'],
              ].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => set('targetType', val)}
                  className={`flex-1 min-w-[120px] py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors
                    ${form.targetType === val ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Role picker */}
            {form.targetType === 'role' && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600">
                    {form.targetRoles.length === 0 ? 'Select which roles to share with' : `Sharing with: ${form.targetRoles.join(', ')}`}
                  </p>
                </div>
                <div className="divide-y divide-gray-50">
                  {allRoles.map(role => {
                    const sel = form.targetRoles.includes(role);
                    const cnt = countForRole(role);
                    return (
                      <label key={role} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${sel ? 'bg-brand-50/50' : ''}`}>
                        <input type="checkbox" checked={sel} onChange={() => toggleRole(role)}
                          className="w-4 h-4 rounded text-brand-600 shrink-0" />
                        <ShieldCheck size={14} className={sel ? 'text-brand-500' : 'text-gray-300'} />
                        <span className="text-sm font-medium text-gray-800 flex-1">{role}</span>
                        <span className="text-xs text-gray-400">{cnt} worker{cnt !== 1 ? 's' : ''}</span>
                      </label>
                    );
                  })}
                  {allRoles.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">No roles found</p>
                  )}
                </div>
              </div>
            )}

            {/* Individual picker */}
            {form.targetType === 'selected' && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">{form.targetWorkers.length} selected</p>
                  <button type="button" className="text-xs text-brand-600 hover:underline"
                    onClick={() => set('targetWorkers', allWorkers.map(w => String(w._id)))}>Select all</button>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                  {allWorkers.map(w => {
                    const sel = form.targetWorkers.includes(String(w._id));
                    return (
                      <label key={w._id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 ${sel ? 'bg-brand-50/50' : ''}`}>
                        <input type="checkbox" checked={sel} onChange={() => toggleWorker(String(w._id))}
                          className="w-4 h-4 rounded text-brand-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{w.fullName}</p>
                          <p className="text-xs text-gray-400">{w.role}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary flex items-center gap-2">
            {saving ? <RotateCcw size={14} className="animate-spin" /> : <Check size={14} />}
            {doc ? 'Save Changes' : 'Create Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Doc preview modal ──────────────────────────────────────────────────────────
function DocPreview({ doc, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-800 text-lg">{doc.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{TYPE_CFG[doc.type]?.emoji} {TYPE_CFG[doc.type]?.label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {doc.fileUrl && <FileViewer fileUrl={doc.fileUrl} fileName={doc.fileName} fileType={doc.fileType} />}
          {doc.body && (
            <div className="text-sm text-gray-800 leading-relaxed
              [&_h2]:text-xl [&_h2]:font-black [&_h2]:mt-4 [&_h2]:mb-2
              [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1
              [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5
              [&_strong]:font-bold [&_em]:italic [&_u]:underline"
              dangerouslySetInnerHTML={{ __html: doc.body }} />
          )}
          {!doc.fileUrl && !doc.body && <p className="text-gray-400 text-sm italic">No content yet</p>}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Documents page ────────────────────────────────────────────────────────
export default function Documents() {
  const [docs,       setDocs      ] = useState([]);
  const [allWorkers, setAllWorkers] = useState([]);
  const [allRoles,   setAllRoles  ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [modal,      setModal     ] = useState(null);
  const [preview,    setPreview   ] = useState(null);
  const [sigPanel,   setSigPanel  ] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const notify = useNotify();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, wRes, rolesRes] = await Promise.all([
        api.get('/documents'),
        api.get('/workers?all=1&limit=500'),
        api.get('/documents/roles'),
      ]);
      setDocs(docsRes.data.data);
      setAllWorkers(wRes.data.data?.workers || wRes.data.data || []);
      setAllRoles(rolesRes.data.data || []);
    } catch { notify('Failed to load', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved) => {
    setDocs(prev => {
      const idx = prev.findIndex(d => d._id === saved._id);
      return idx >= 0 ? prev.map(d => d._id === saved._id ? { ...d, ...saved } : d) : [saved, ...prev];
    });
    setModal(null);
  };

  const handlePublish = async (doc) => {
    try {
      const { data } = await api.post(`/documents/${doc._id}/publish`);
      setDocs(prev => prev.map(d => d._id === doc._id ? { ...d, ...data.data } : d));
      notify(data.message);
    } catch (e) { notify(e.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDelete = async (doc) => {
    try {
      await api.delete(`/documents/${doc._id}`);
      setDocs(prev => prev.filter(d => d._id !== doc._id));
      setDelConfirm(null);
      notify('Document deleted');
    } catch { notify('Delete failed', 'error'); }
  };

  const targetLabel = (doc) => {
    if (doc.targetType === 'all')      return '👥 All workers';
    if (doc.targetType === 'role')     return `🏷️ ${(doc.targetRoles || []).join(', ') || 'By role'}`;
    return `🎯 ${doc.targetWorkers?.length || 0} selected`;
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <BookOpen size={24} className="text-brand-600" /> Documents
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload, share and collect signatures from your team</p>
        </div>
        <button onClick={() => setModal('create')}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> New Document
        </button>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total',     val: docs.length,                                        color: 'text-gray-700' },
            { label: 'Published', val: docs.filter(d => d.status === 'published').length,  color: 'text-green-700' },
            { label: 'Drafts',    val: docs.filter(d => d.status === 'draft').length,       color: 'text-amber-700' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3.5 text-center shadow-sm">
              <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <RotateCcw size={28} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading…</p>
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <FileText size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">No documents yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Upload a PDF or create a typed document to share with your team</p>
          <button onClick={() => setModal('create')} className="btn-primary text-sm">
            <Plus size={14} className="inline mr-1" /> Create Document
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const tc = TYPE_CFG[doc.type] || TYPE_CFG.other;
            return (
              <div key={doc._id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  <div className="text-2xl shrink-0 mt-0.5">{tc.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900 text-base">{doc.title}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tc.color}`}>{tc.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${doc.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {doc.status === 'published' ? '● Published' : '○ Draft'}
                      </span>
                      {doc.requiresSignature && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Requires signature</span>
                      )}
                      {doc.fileUrl && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                          <Paperclip size={9} /> {doc.fileType?.toUpperCase() || 'FILE'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                      <span>Created {fmt(doc.createdAt)}</span>
                      {doc.publishedAt && <span>Published {fmt(doc.publishedAt)}</span>}
                      <span>{targetLabel(doc)}</span>
                      {doc.signatureCount > 0 && <span>✅ {doc.signatureCount} signed</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setPreview(doc)} title="Preview"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <Eye size={15} />
                    </button>
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noreferrer" title="Open file"
                        className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                        <ExternalLink size={15} />
                      </a>
                    )}
                    <button onClick={() => setModal(doc)} title="Edit"
                      className="p-2 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                      <Edit2 size={15} />
                    </button>
                    {doc.requiresSignature && (
                      <button onClick={() => setSigPanel(doc._id)} title="View signatures"
                        className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition-colors">
                        <Users size={15} />
                      </button>
                    )}
                    <button onClick={() => handlePublish(doc)}
                      title={doc.status === 'published' ? 'Unpublish' : 'Publish to workers'}
                      className={`p-2 rounded-lg transition-colors ${doc.status === 'published' ? 'hover:bg-amber-50 text-amber-500' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`}>
                      <Send size={15} />
                    </button>
                    <button onClick={() => setDelConfirm(doc)} title="Delete"
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <DocModal
          doc={modal === 'create' ? null : modal}
          allWorkers={allWorkers}
          allRoles={allRoles}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {preview  && <DocPreview doc={preview} onClose={() => setPreview(null)} />}
      {sigPanel && <SignaturesPanel docId={sigPanel} onClose={() => setSigPanel(null)} />}

      {delConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <p className="font-bold text-gray-800 text-lg mb-1">Delete document?</p>
            <p className="text-sm text-gray-500 mb-1">"{delConfirm.title}"</p>
            <p className="text-sm text-red-500 mb-5">All signatures and the attached file will also be deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelConfirm(null)} className="flex-1 btn-secondary">Cancel</button>
              <button onClick={() => handleDelete(delConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl py-2.5 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
