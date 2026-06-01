/**
 * Documents — Admin page for creating, editing and sharing company documents.
 * Route: /documents  (protected)
 *
 * Features:
 * - Create / edit documents with built-in rich text editor
 * - Choose document type: Handbook / Policy / Notice / Agreement
 * - Share with all workers or select specific workers
 * - Publish / unpublish toggle
 * - View who has signed vs who hasn't
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Plus, Edit2, Trash2, Eye, Users, Check,
  ChevronDown, ChevronUp, Send, BookOpen, AlertCircle,
  Clock, Download, X, RotateCcw, Bold, Italic, Underline,
  List, AlignLeft, Heading1, Heading2, Type,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const TYPE_CFG = {
  handbook:  { label: 'Staff Handbook',  emoji: '📖', color: 'bg-blue-100 text-blue-700'  },
  policy:    { label: 'Policy',          emoji: '📋', color: 'bg-purple-100 text-purple-700' },
  notice:    { label: 'Notice',          emoji: '📢', color: 'bg-amber-100 text-amber-700' },
  agreement: { label: 'Agreement',       emoji: '🤝', color: 'bg-green-100 text-green-700' },
  other:     { label: 'Other',           emoji: '📄', color: 'bg-gray-100 text-gray-700'  },
};

const fmt = d => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Simple Rich Text Editor ────────────────────────────────────────────────────
function RichEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const isComposing = useRef(false);

  // Set initial content once
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    onChange(editorRef.current?.innerHTML || '');
  };

  const ToolBtn = ({ icon: Icon, cmd, val, title, active }) => (
    <button type="button" title={title}
      onMouseDown={e => { e.preventDefault(); exec(cmd, val); }}
      className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${active ? 'bg-gray-200' : ''}`}>
      <Icon size={14} className="text-gray-700" />
    </button>
  );

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <ToolBtn icon={Bold}      cmd="bold"          title="Bold (Ctrl+B)"      />
        <ToolBtn icon={Italic}    cmd="italic"        title="Italic (Ctrl+I)"    />
        <ToolBtn icon={Underline} cmd="underline"     title="Underline (Ctrl+U)" />
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" title="Heading 1"
          onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<h2>'); }}
          className="px-2 py-1 rounded text-xs font-bold text-gray-700 hover:bg-gray-200 transition-colors">H1</button>
        <button type="button" title="Heading 2"
          onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<h3>'); }}
          className="px-2 py-1 rounded text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors">H2</button>
        <button type="button" title="Paragraph"
          onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<p>'); }}
          className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 transition-colors">¶</button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" title="Bullet list"
          onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors">
          <List size={14} className="text-gray-700" />
        </button>
        <button type="button" title="Numbered list"
          onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }}
          className="px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-200 transition-colors">1.</button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" title="Horizontal rule"
          onMouseDown={e => { e.preventDefault(); exec('insertHorizontalRule'); }}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-200 transition-colors">—</button>
      </div>
      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => { isComposing.current = false; onChange(editorRef.current?.innerHTML || ''); }}
        onInput={() => { if (!isComposing.current) onChange(editorRef.current?.innerHTML || ''); }}
        className="min-h-[320px] max-h-[500px] overflow-y-auto px-4 py-3 text-sm text-gray-800 leading-relaxed outline-none
          [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-gray-900 [&_h2]:mt-4 [&_h2]:mb-2
          [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-3 [&_h3]:mb-1
          [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2
          [&_li]:mb-1 [&_hr]:my-4 [&_hr]:border-gray-300
          [&_strong]:font-bold [&_em]:italic [&_u]:underline"
      />
    </div>
  );
}

// ── Document preview (rendered template) ──────────────────────────────────────
function DocPreview({ doc, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-800 text-lg">{doc.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{TYPE_CFG[doc.type]?.emoji} {TYPE_CFG[doc.type]?.label} · Preview</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>

        {/* Letterhead */}
        <div className="overflow-y-auto flex-1 px-8 py-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-brand-600">
            <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center text-white font-black text-lg shrink-0">S</div>
            <div>
              <p className="font-black text-gray-900 text-sm">Sage Energy & Natural Resources</p>
              <p className="text-xs text-gray-500">{TYPE_CFG[doc.type]?.label}</p>
            </div>
          </div>

          <h1 className="text-2xl font-black text-gray-900 mb-1">{doc.title}</h1>
          <p className="text-xs text-gray-400 mb-6">
            {doc.publishedAt ? `Published ${fmt(doc.publishedAt)}` : `Created ${fmt(doc.createdAt)}`}
            {doc.requiresSignature && ' · Requires signature'}
          </p>

          <div
            className="text-sm text-gray-800 leading-relaxed
              [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-gray-200
              [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-4 [&_h3]:mb-1
              [&_p]:mb-3 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-3
              [&_li]:mb-1.5 [&_hr]:my-5 [&_hr]:border-gray-200
              [&_strong]:font-bold [&_em]:italic [&_u]:underline"
            dangerouslySetInnerHTML={{ __html: doc.body || '<p><em>No content yet</em></p>' }}
          />

          {doc.requiresSignature && (
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-3">Acknowledgement</p>
              <p className="text-xs text-gray-500 mb-4">
                I confirm that I have read, understood, and agree to the contents of this document.
              </p>
              <div className="flex gap-8">
                <div className="flex-1">
                  <div className="border-b border-gray-400 pb-1 mb-1" style={{ minWidth: 140 }}></div>
                  <p className="text-xs text-gray-400">Worker Signature & Name</p>
                </div>
                <div className="flex-1">
                  <div className="border-b border-gray-400 pb-1 mb-1"></div>
                  <p className="text-xs text-gray-400">Date</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Signatures panel ──────────────────────────────────────────────────────────
function SignaturesPanel({ docId, onClose }) {
  const [data, setData] = useState(null);
  const [tab,  setTab ] = useState('signed');

  useEffect(() => {
    api.get(`/documents/${docId}/signatures`)
      .then(r => setData(r.data.data))
      .catch(() => {});
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
            {/* Tabs */}
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
              {tab === 'signed' && (
                data.signatures.length === 0
                  ? <p className="text-center text-gray-400 py-10 text-sm">No signatures yet</p>
                  : data.signatures.map(s => (
                    <div key={s._id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700 font-bold shrink-0">
                        {(s.workerName || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{s.workerName}</p>
                        <p className="text-xs text-gray-400">{s.workerRole} · Signed: {fmt(s.signedAt)}</p>
                        <p className="text-xs text-gray-400 italic">"{s.signatureName}"</p>
                      </div>
                      <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">✓ SIGNED</span>
                    </div>
                  ))
              )}
              {tab === 'unsigned' && (
                data.unsigned.length === 0
                  ? <p className="text-center text-gray-400 py-10 text-sm">🎉 Everyone has signed!</p>
                  : data.unsigned.map(w => (
                    <div key={w._id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 font-bold shrink-0">
                        {(w.fullName || '?')[0]}
                      </div>
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
function DocModal({ doc, onSave, onClose, allWorkers }) {
  const [form, setForm] = useState({
    title:             doc?.title             || '',
    body:              doc?.body              || '',
    type:              doc?.type              || 'handbook',
    requiresSignature: doc?.requiresSignature !== false,
    targetType:        doc?.targetType        || 'all',
    targetWorkers:     (doc?.targetWorkers || []).map(w => String(w._id || w)),
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const notify = useNotify();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleWorker = (id) => {
    set('targetWorkers', form.targetWorkers.includes(id)
      ? form.targetWorkers.filter(x => x !== id)
      : [...form.targetWorkers, id]);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return notify('Title is required', 'error');
    setSaving(true);
    try {
      const payload = {
        ...form,
        targetWorkers: form.targetType === 'selected' ? form.targetWorkers : [],
      };
      const res = doc
        ? await api.put(`/documents/${doc._id}`, payload)
        : await api.post('/documents', payload);
      onSave(res.data.data);
      notify(doc ? '✅ Document updated' : '✅ Document created');
    } catch (e) {
      notify(e.response?.data?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  if (preview) {
    return <DocPreview doc={{ ...form, publishedAt: doc?.publishedAt, createdAt: doc?.createdAt || new Date() }} onClose={() => setPreview(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mb-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg">{doc ? 'Edit Document' : 'New Document'}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreview(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
              <Eye size={13} /> Preview
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="label">Document Title</label>
            <input className="input" placeholder="e.g. Staff Handbook 2025 / Break Policy / Employment Agreement"
              value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          {/* Type + Requires Signature */}
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

          {/* Body editor */}
          <div>
            <label className="label">Content</label>
            <RichEditor value={form.body} onChange={v => set('body', v)} />
            <p className="text-xs text-gray-400 mt-1.5">Use the toolbar to format. Press Enter for new paragraph, Shift+Enter for line break.</p>
          </div>

          {/* Who to share with */}
          <div>
            <label className="label">Share With</label>
            <div className="flex gap-3 mb-3">
              {[['all', '👥 All workers'], ['selected', '🎯 Selected workers']].map(([val, lbl]) => (
                <button key={val} type="button"
                  onClick={() => set('targetType', val)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${form.targetType === val ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {lbl}
                </button>
              ))}
            </div>

            {form.targetType === 'selected' && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">{form.targetWorkers.length} worker{form.targetWorkers.length !== 1 ? 's' : ''} selected</p>
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

// ── Main Documents page ────────────────────────────────────────────────────────
export default function Documents() {
  const [docs,       setDocs      ] = useState([]);
  const [allWorkers, setAllWorkers] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [modal,      setModal     ] = useState(null);  // null | 'create' | doc object
  const [preview,    setPreview   ] = useState(null);
  const [sigPanel,   setSigPanel  ] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const notify = useNotify();
  const { user }   = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, wRes] = await Promise.all([
        api.get('/documents'),
        api.get('/workers?all=1&limit=500'),
      ]);
      setDocs(docsRes.data.data);
      setAllWorkers(wRes.data.data?.workers || wRes.data.data || []);
    } catch { notify('Failed to load documents', 'error'); }
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

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <BookOpen size={24} className="text-brand-600" /> Documents
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Create, edit and share handbooks, policies and agreements</p>
        </div>
        <button onClick={() => setModal('create')}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> New Document
        </button>
      </div>

      {/* Stats strip */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total',    val: docs.length,                                  color: 'text-gray-700 bg-gray-100' },
            { label: 'Published', val: docs.filter(d => d.status === 'published').length, color: 'text-green-700 bg-green-100' },
            { label: 'Drafts',   val: docs.filter(d => d.status === 'draft').length,      color: 'text-amber-700 bg-amber-100' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3.5 text-center shadow-sm">
              <p className={`text-2xl font-black ${s.color.split(' ')[0]}`}>{s.val}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <RotateCcw size={28} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading documents…</p>
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <FileText size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">No documents yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Create your first staff handbook or policy</p>
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
                  {/* Icon */}
                  <div className="text-2xl shrink-0 mt-0.5">{tc.emoji}</div>

                  {/* Content */}
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
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                      <span>Created {fmt(doc.createdAt)}</span>
                      {doc.publishedAt && <span>Published {fmt(doc.publishedAt)}</span>}
                      <span>{doc.targetType === 'all' ? '👥 All workers' : `🎯 ${doc.targetWorkers?.length || 0} selected`}</span>
                      {doc.signatureCount > 0 && <span>✅ {doc.signatureCount} signed</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setPreview(doc)} title="Preview"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <Eye size={15} />
                    </button>
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
                    <button
                      onClick={() => handlePublish(doc)}
                      title={doc.status === 'published' ? 'Unpublish (move to draft)' : 'Publish to workers'}
                      className={`p-2 rounded-lg transition-colors ${doc.status === 'published' ? 'hover:bg-amber-50 text-amber-500 hover:text-amber-700' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`}>
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
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {preview && <DocPreview doc={preview} onClose={() => setPreview(null)} />}
      {sigPanel && <SignaturesPanel docId={sigPanel} onClose={() => setSigPanel(null)} />}

      {/* Delete confirm */}
      {delConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <p className="font-bold text-gray-800 text-lg mb-1">Delete document?</p>
            <p className="text-sm text-gray-500 mb-1">"{delConfirm.title}"</p>
            <p className="text-sm text-red-500 mb-5">All signatures will also be deleted. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelConfirm(null)} className="flex-1 btn-secondary">Cancel</button>
              <button onClick={() => handleDelete(delConfirm)} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl py-2.5 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
