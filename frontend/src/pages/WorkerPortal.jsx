/**
 * WorkerPortal — Unified worker app
 *
 * Approved device  → Clock In/Out · Report Shortage · My Dashboard · Change PIN
 * Personal phone   →               My Dashboard · Change PIN
 *
 * Supervisor on approved device:
 *   → Terminal shows all shift workers; supervisor picks who to clock
 *   → Shortage lets supervisor report for any shift worker
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import axios from 'axios';
import {
  Leaf, LogIn, LogOut, Delete, Loader, AlertTriangle, LayoutDashboard,
  Key, ChevronLeft, ChevronRight, CheckCircle, XCircle, X,
  ChevronDown, ChevronUp, ShieldCheck, UserCircle2, Eye,
  RotateCcw, MapPin, Coffee, Play, Square, FileWarning, Users,
} from 'lucide-react';
import PWAInstallBanner from '../components/PWAInstallBanner';

const BASE           = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY      = 'attendance_device_token';
const MODEL_URL      = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';
const VERIFY_THR     = 0.50;
const STABLE_FRAMES  = 4;

const fmt  = n  => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const fmtT = ts => ts
  ? new Date(ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })
  : '—';
const fmtD = d =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL  = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

const REASON_OPTIONS = [
  { value: 'cash_shortage',      label: 'Cash Shortage'      },
  { value: 'fuel_shortage',      label: 'Fuel Shortage'      },
  { value: 'equipment_damage',   label: 'Equipment Damage'   },
  { value: 'customer_complaint', label: 'Customer Complaint' },
  { value: 'other',              label: 'Other'              },
];

// ── Live clock ─────────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ── Face camera hook ───────────────────────────────────────────────────────────
function useFaceCamera() {
  const videoNodeRef = useRef(null);
  const overlayRef   = useRef(null);
  const captureRef   = useRef(null);
  const streamRef    = useRef(null);
  const loopRef      = useRef(null);

  const videoRef = useCallback(node => {
    videoNodeRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  const startCamera = useCallback(async () => {
    const attempts = [
      { video: { facingMode: 'user' } },
      { video: { facingMode: { ideal: 'user' } } },
      { video: true },
    ];
    let stream = null, lastErr = '';
    for (const c of attempts) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
      catch (e) { lastErr = e?.name || 'Unknown'; }
    }
    if (!stream) return { ok: false, error: lastErr };
    streamRef.current = stream;
    if (videoNodeRef.current) {
      videoNodeRef.current.srcObject = stream;
      await videoNodeRef.current.play().catch(() => {});
    }
    return { ok: true };
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const captureFrame = useCallback(() => {
    const v = videoNodeRef.current, c = captureRef.current;
    if (!v || !c) return null;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);
  return { videoRef, videoNodeRef, overlayRef, captureRef, loopRef, streamRef, startCamera, stopCamera, captureFrame };
}

// ── Model loader (singleton) ───────────────────────────────────────────────────
let modelsLoaded = false;
async function loadModels(onProgress) {
  if (modelsLoaded) return;
  onProgress?.(10);
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  onProgress?.(45);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  onProgress?.(80);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  onProgress?.(100);
  modelsLoaded = true;
}

// ── Face Registration (first-time workers) ────────────────────────────────────
function FaceRegister({ worker, token, onDone, onBack }) {
  const { videoRef, videoNodeRef, overlayRef, captureRef, loopRef, startCamera, stopCamera, captureFrame } = useFaceCamera();
  const [stage,    setStage   ] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [faceOk,   setFaceOk  ] = useState(false);
  const [error,    setError   ] = useState('');
  const capturedDesc = useRef(null);
  const stableRef    = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels(p => { if (!cancelled) setProgress(p); });
        const r = await startCamera();
        if (!cancelled) {
          if (r.ok) setStage('scanning');
          else { setError(r.error === 'NotAllowedError' ? 'Camera permission denied' : `Camera unavailable (${r.error})`); setStage('error'); }
        }
      } catch (e) { if (!cancelled) { setError(String(e)); setStage('error'); } }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (stage !== 'scanning') return;
    const loop = async () => {
      const video = videoNodeRef.current, overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) { loopRef.current = requestAnimationFrame(loop); return; }
      try {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
          .withFaceLandmarks().withFaceDescriptor();
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        overlay.width = video.videoWidth; overlay.height = video.videoHeight;
        if (det) {
          stableRef.current++;
          setFaceOk(true);
          const b = det.detection.box;
          ctx.strokeStyle = stableRef.current >= STABLE_FRAMES ? '#22c55e' : '#f59e0b';
          ctx.lineWidth = 3;
          ctx.strokeRect(b.x, b.y, b.width, b.height);
          if (stableRef.current >= STABLE_FRAMES) {
            capturedDesc.current = Array.from(det.descriptor);
            stopCamera(); setStage('captured'); return;
          }
        } else { stableRef.current = 0; setFaceOk(false); }
      } catch { /* skip frame */ }
      loopRef.current = requestAnimationFrame(loop);
    };
    loopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRef.current);
  }, [stage, stopCamera]);

  const save = async () => {
    setStage('saving');
    try {
      await axios.post(`${BASE}/devices/terminal/register-face`, {
        token, workerId: worker._id, faceDescriptor: capturedDesc.current,
      });
      onDone(capturedDesc.current, captureFrame());
    } catch (err) { setError(err.response?.data?.message || 'Save failed'); setStage('error'); }
  };

  const retake = async () => {
    capturedDesc.current = null; stableRef.current = 0;
    setFaceOk(false); setError('');
    const r = await startCamera();
    if (r.ok) setStage('scanning');
    else { setError('Camera unavailable'); setStage('error'); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/50 border border-blue-600 rounded-2xl px-4 py-3 text-center">
        <p className="text-blue-200 font-bold text-sm">👤 First-Time Face Registration</p>
        <p className="text-blue-300/70 text-xs mt-0.5">Required once for identity verification</p>
      </div>

      <WorkerBadge worker={worker} />

      {stage === 'loading' && (
        <div className="text-center py-6 space-y-3">
          <Eye size={28} className="text-white/50 mx-auto" />
          <p className="text-white/60 text-sm">Loading face recognition…</p>
          <div className="w-full bg-white/10 rounded-full h-2 max-w-xs mx-auto">
            <div className="bg-brand-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {(stage === 'scanning' || stage === 'captured') && (
        <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '1/1' }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full scale-x-[-1]" style={{ pointerEvents: 'none' }} />
          <canvas ref={captureRef} className="hidden" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-44 h-44 rounded-full border-4 border-dashed transition-colors duration-300
              ${stage === 'captured' ? 'border-green-400' : faceOk ? 'border-amber-400' : 'border-white/30'}`} />
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <div className={`rounded-xl px-3 py-2 text-center text-sm font-medium
              ${stage === 'captured' ? 'bg-green-900/80 text-green-300 border border-green-600'
              : faceOk ? 'bg-amber-900/80 text-amber-300 border border-amber-600'
              : 'bg-black/60 text-white/50 border border-white/10'}`}>
              {stage === 'captured' ? '✓ Face captured — confirm below' : faceOk ? 'Hold still…' : 'Look directly at the camera'}
            </div>
          </div>
        </div>
      )}

      {stage === 'saving' && (
        <div className="text-center py-4 space-y-2">
          <Loader size={28} className="animate-spin text-white/60 mx-auto" />
          <p className="text-white/60 text-sm">Saving face data…</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="bg-red-900/50 border border-red-700 rounded-2xl p-4 text-center space-y-2">
          <XCircle size={28} className="text-red-400 mx-auto" />
          <p className="text-white text-sm font-semibold">{error || 'Camera not available'}</p>
        </div>
      )}

      {stage === 'captured' && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={retake} className="py-3 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/10 flex items-center justify-center gap-2">
            <RotateCcw size={14} /> Retake
          </button>
          <button onClick={save} className="py-3 rounded-xl bg-green-500 hover:bg-green-400 text-white font-bold text-sm flex items-center justify-center gap-2">
            <ShieldCheck size={14} /> Register
          </button>
        </div>
      )}
      {stage === 'error' && (
        <button onClick={onBack} className="w-full py-2.5 rounded-xl border border-white/20 text-white/60 text-sm hover:bg-white/10">← Back</button>
      )}
    </div>
  );
}

// ── Face Verification (returning workers) ─────────────────────────────────────
function FaceVerify({ worker, storedDescriptor, type, onVerified, onBack }) {
  const { videoRef, videoNodeRef, overlayRef, captureRef, loopRef, startCamera, stopCamera } = useFaceCamera();
  const [stage,     setStage    ] = useState('loading');
  const [progress,  setProgress ] = useState(0);
  const [liveScore, setLiveScore] = useState(null);
  const [faceFound, setFaceFound] = useState(false);
  const [capturedB64, setCapturedB64] = useState(null);
  const [failMsg,   setFailMsg  ] = useState('');
  const stableRef = useRef(0);
  const refDesc   = useRef(storedDescriptor ? new Float32Array(storedDescriptor) : null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels(p => { if (!cancelled) setProgress(p); });
        const r = await startCamera();
        if (!cancelled) {
          if (r.ok) setStage('scanning');
          else { setFailMsg(r.error === 'NotAllowedError' ? 'Camera permission denied' : `Camera unavailable (${r.error})`); setStage('fail'); }
        }
      } catch (e) { if (!cancelled) { setFailMsg(String(e)); setStage('fail'); } }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (stage !== 'scanning' || !refDesc.current) return;
    const loop = async () => {
      const video = videoNodeRef.current, overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) { loopRef.current = requestAnimationFrame(loop); return; }
      try {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks().withFaceDescriptor();
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        overlay.width = video.videoWidth; overlay.height = video.videoHeight;
        if (det) {
          const dist  = faceapi.euclideanDistance(refDesc.current, det.descriptor);
          const score = Math.round(Math.max(0, Math.min(100, (1 - dist) * 145)));
          setLiveScore(score); setFaceFound(true);
          const matched = dist < VERIFY_THR;
          const color = matched ? '#22c55e' : dist < 0.62 ? '#f59e0b' : '#ef4444';
          const b = det.detection.box;
          ctx.strokeStyle = color; ctx.lineWidth = 3;
          ctx.strokeRect(b.x, b.y, b.width, b.height);
          if (matched) {
            stableRef.current++;
            if (stableRef.current >= STABLE_FRAMES) {
              const c = captureRef.current;
              c.width = video.videoWidth; c.height = video.videoHeight;
              c.getContext('2d').drawImage(video, 0, 0);
              const b64 = c.toDataURL('image/jpeg', 0.85);
              setCapturedB64(b64); stopCamera(); setStage('matched'); return;
            }
          } else { stableRef.current = 0; }
        } else { setFaceFound(false); setLiveScore(null); stableRef.current = 0; }
      } catch { /* skip */ }
      loopRef.current = requestAnimationFrame(loop);
    };
    loopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRef.current);
  }, [stage, stopCamera]);

  return (
    <div className="space-y-3">
      <WorkerBadge worker={worker} sub={
        type === 'clock_in'      ? '🟢 Clocking IN'
        : type === 'clock_out'   ? '🔴 Clocking OUT'
        : type === 'break_start' ? '☕ Going on Break'
        : type === 'break_end'   ? '✅ Returning from Break'
        : ''
      } />

      {stage === 'loading' && (
        <div className="text-center py-6 space-y-3">
          <Eye size={28} className="text-white/50 mx-auto" />
          <p className="text-white/60 text-sm">Preparing face scan…</p>
          <div className="w-full bg-white/10 rounded-full h-2 max-w-xs mx-auto">
            <div className="bg-brand-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {stage === 'scanning' && (
        <>
          <div className={`rounded-xl px-4 py-2.5 text-sm font-medium text-center
            ${liveScore >= 70 ? 'bg-green-900/50 border border-green-600 text-green-300'
            : liveScore >= 50 ? 'bg-amber-900/50 border border-amber-600 text-amber-300'
            : 'bg-white/5 border border-white/10 text-white/40'}`}>
            {faceFound
              ? liveScore >= 70
                ? <span className="flex items-center justify-center gap-2"><ShieldCheck size={14} /> Match confirmed — hold still</span>
                : liveScore >= 50
                  ? <span className="flex items-center justify-center gap-2"><AlertTriangle size={14} /> Getting closer — adjust angle</span>
                  : 'Face not matching — are you facing the camera?'
              : <span className="flex items-center justify-center gap-2"><UserCircle2 size={14} /> Look directly at the camera</span>
            }
          </div>
          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '1/1' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full scale-x-[-1]" style={{ pointerEvents: 'none' }} />
            <canvas ref={captureRef} className="hidden" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-44 h-44 rounded-full border-4 border-dashed transition-colors duration-300
                ${liveScore >= 70 ? 'border-green-400' : liveScore >= 50 ? 'border-amber-400' : 'border-white/30'}`} />
            </div>
            {liveScore != null && (
              <div className="absolute top-3 right-3 bg-black/60 rounded-lg px-2 py-1">
                <span className={`text-xs font-bold ${liveScore >= 70 ? 'text-green-400' : liveScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{liveScore}%</span>
              </div>
            )}
          </div>
          <button onClick={onBack} className="w-full py-2.5 rounded-xl border border-white/20 text-white/50 text-sm hover:bg-white/10">← Back</button>
        </>
      )}

      {stage === 'matched' && capturedB64 && (
        <div className="space-y-3">
          <div className="bg-green-900/50 border border-green-500 rounded-2xl p-4 text-center">
            <ShieldCheck size={32} className="text-green-400 mx-auto mb-2" />
            <p className="text-green-300 font-bold">Identity Verified</p>
            <p className="text-green-300/60 text-xs mt-1">{liveScore}% match</p>
          </div>
          <button
            onClick={() => onVerified(capturedB64, liveScore)}
            className={`w-full py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2
              ${type === 'clock_in'    ? 'bg-green-600 hover:bg-green-500'
              : type === 'clock_out'   ? 'bg-red-500 hover:bg-red-400'
              : type === 'break_start' ? 'bg-orange-500 hover:bg-orange-400'
              :                          'bg-green-600 hover:bg-green-500'}`}
          >
            {type === 'clock_in'     ? <><LogIn       size={20} /> Confirm Clock In</>
            : type === 'clock_out'   ? <><LogOut      size={20} /> Confirm Clock Out</>
            : type === 'break_start' ? <><Coffee      size={20} /> Confirm Break Start</>
            :                          <><CheckCircle size={20} /> Confirm Return</>}
          </button>
          <button onClick={onBack} className="w-full py-2.5 rounded-xl border border-white/20 text-white/50 text-sm hover:bg-white/10">← Back</button>
        </div>
      )}

      {stage === 'fail' && (
        <div className="space-y-3">
          <div className="bg-red-900/50 border border-red-700 rounded-2xl p-4 text-center">
            <XCircle size={28} className="text-red-400 mx-auto mb-2" />
            <p className="text-white text-sm font-semibold">{failMsg || 'Face verification failed'}</p>
          </div>
          <button onClick={onBack} className="w-full py-2.5 rounded-xl border border-white/20 text-white/60 text-sm hover:bg-white/10">← Back</button>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function WorkerBadge({ worker, sub }) {
  return (
    <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 border border-white/20">
      {worker.photo
        ? <img src={worker.photo} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-white/20 shrink-0" />
        : <div className="w-10 h-10 rounded-lg bg-white/20 text-white font-bold flex items-center justify-center shrink-0">{(worker.fullName||'?')[0]}</div>
      }
      <div>
        <p className="text-white font-semibold">{worker.fullName}</p>
        <p className="text-white/50 text-xs">{sub || worker.role}</p>
      </div>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────
function Shell({ session, onSignOut, children }) {
  const now = useClock();
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex flex-col select-none">
      <PWAInstallBanner manifest="/worker-manifest.json" />
      <div className="flex items-center justify-between px-4 py-3 bg-black/20 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Leaf size={16} className="text-white" />
          <span className="text-white font-bold text-sm">FuelStation HR</span>
          {session && <span className="text-brand-300 text-xs hidden sm:inline">· {session.worker.branch}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs font-mono">
            {now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          {session && (
            <button onClick={onSignOut} className="text-white/50 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-colors">
              Sign out
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ── PIN Pad ────────────────────────────────────────────────────────────────────
function PinPad({ pin, onChange, onSubmit, loading, error, label, sublabel }) {
  const [shake, setShake] = useState(false);
  const press = d => {
    if (pin.length < 4) {
      const next = pin + d;
      onChange(next);
      if (next.length === 4) setTimeout(() => onSubmit(next), 180);
    }
  };
  const del = () => onChange(pin.slice(0, -1));

  useEffect(() => {
    if (error) { setShake(true); onChange(''); const t = setTimeout(() => setShake(false), 600); return () => clearTimeout(t); }
  }, [error]);

  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],[null,'0','del']];
  const SUB  = { '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ','0':'+' };

  return (
    <div className="flex flex-col items-center">
      {label    && <p className="font-bold text-gray-900 text-lg mb-0.5">{label}</p>}
      {sublabel && <p className="text-gray-500 text-sm mb-4">{sublabel}</p>}
      <div className={`flex gap-4 mb-5 ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all
            ${pin.length > i ? 'bg-brand-600 border-brand-600 scale-110' : 'bg-transparent border-gray-300'}`} />
        ))}
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl mb-4 text-center w-full">{error}</p>}
      <div className="space-y-3 w-full">
        {KEYS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-3">
            {row.map((key, ki) => {
              if (key === null) return <div key={ki} />;
              if (key === 'del') return (
                <button key={ki} onClick={del} disabled={!pin.length || loading}
                  className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center transition-all disabled:opacity-40">
                  <Delete size={20} className="text-gray-600" />
                </button>
              );
              return (
                <button key={ki} onClick={() => press(key)} disabled={pin.length === 4 || loading}
                  className="h-14 rounded-2xl bg-gray-50 hover:bg-brand-50 active:bg-brand-100 border border-gray-200 hover:border-brand-300 flex flex-col items-center justify-center transition-all disabled:opacity-50">
                  <span className="text-xl font-bold text-gray-800 leading-none">{key}</span>
                  <span className="text-[9px] text-gray-400 leading-none mt-0.5">{SUB[key] || ''}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {loading && (
        <div className="flex items-center gap-2 mt-5 text-brand-600">
          <Loader size={16} className="animate-spin" /><span className="text-sm font-medium">Verifying…</span>
        </div>
      )}
    </div>
  );
}

// ── Main Menu ──────────────────────────────────────────────────────────────────
function MenuView({ session, onNavigate }) {
  const { worker, deviceApproved, todayStatus } = session;

  const clockStatusText = () => {
    if (todayStatus?.clockedIn && todayStatus?.clockedOut) return `Done · In ${fmtT(todayStatus.clockInTime)} · Out ${fmtT(todayStatus.clockOutTime)}`;
    if (todayStatus?.clockedIn) return `Clocked in at ${fmtT(todayStatus.clockInTime)}`;
    return 'Not clocked in today';
  };
  const clockStatusColor = () => {
    if (todayStatus?.clockedIn && todayStatus?.clockedOut) return 'text-green-300';
    if (todayStatus?.clockedIn) return 'text-amber-300';
    return 'text-red-300';
  };

  return (
    <div className="p-4 max-w-sm mx-auto">
      {/* Worker identity card */}
      <div className="flex items-center gap-3 bg-white/10 rounded-2xl p-4 mb-5 border border-white/20">
        {worker.photo
          ? <img src={worker.photo} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-white/20 shrink-0" />
          : <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-white text-2xl font-bold shrink-0">{(worker.fullName||'?')[0]}</div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold truncate">{worker.fullName}</p>
          <p className="text-white/60 text-sm">{worker.role}</p>
          {deviceApproved && <p className={`text-xs mt-0.5 ${clockStatusColor()}`}>⏱ {clockStatusText()}</p>}
        </div>
        {deviceApproved && (
          <div className="bg-green-500/20 border border-green-500/40 rounded-xl px-2 py-1 text-center shrink-0">
            <p className="text-green-300 text-xs font-bold">✓</p>
            <p className="text-green-300/60 text-[10px]">Device</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Clock In/Out — approved device only */}
        {deviceApproved && (
          <MenuCard
            icon={todayStatus?.clockedIn && !todayStatus?.clockedOut ? LogOut : LogIn}
            label="Clock In / Out"
            sub={todayStatus?.clockedIn && todayStatus?.clockedOut ? 'Attendance complete today' : 'Record your attendance'}
            color="bg-brand-600"
            onClick={() => onNavigate('terminal')}
          />
        )}

        {/* Breaks — any phone (GPS required) */}
        <MenuCard
          icon={Coffee}
          label="Breaks"
          sub={todayStatus?.clockedIn && !todayStatus?.clockedOut ? 'Start or end your break' : 'View your break history'}
          color="bg-orange-500"
          onClick={() => onNavigate('break')}
        />

        {/* Shift Status Board */}
        <MenuCard
          icon={Users}
          label="Shift Status Board"
          sub="See who is active and who is on break"
          color="bg-teal-600"
          onClick={() => onNavigate('shift_board')}
        />

        {/* Book Offence + Shortage — approved device only */}
        {deviceApproved && (
          <>
            <MenuCard
              icon={FileWarning}
              label="Book Offence"
              sub="Record a worker offence"
              color="bg-red-600"
              onClick={() => onNavigate('offence')}
            />
            <MenuCard
              icon={AlertTriangle}
              label="Report Shortage"
              sub="Submit a cash or fuel shortage"
              color="bg-amber-600"
              onClick={() => onNavigate('shortage')}
            />
          </>
        )}
        <MenuCard
          icon={LayoutDashboard}
          label="My Dashboard"
          sub="Attendance history and pay summary"
          color="bg-blue-600"
          onClick={() => onNavigate('dashboard')}
        />
        <MenuCard
          icon={Key}
          label="Change PIN"
          sub="Update your 4-digit access PIN"
          color="bg-purple-600"
          onClick={() => onNavigate('change_pin')}
        />
      </div>
    </div>
  );
}

function MenuCard({ icon: Icon, label, sub, color, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-4 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-2xl px-4 py-4 border border-white/15 transition-all text-left">
      <div className={`${color} rounded-xl p-3 shrink-0`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm">{label}</p>
        <p className="text-white/50 text-xs">{sub}</p>
      </div>
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
}

// ── Terminal View (clock in / out) ─────────────────────────────────────────────
function TerminalView({ session, onBack, onClockSuccess }) {
  const { worker, deviceInfo, shiftWorkers, todayStatus } = session;
  const isSup = worker.isSupervisor;

  const [tStep,     setTStep    ] = useState(isSup ? 'pick' : 'choose');
  const [selWorker, setSelWorker] = useState(isSup ? null : worker);
  const [clockType, setClockType] = useState(null);
  const [error,     setError    ] = useState('');
  const [result,    setResult   ] = useState(null);
  const [gps,       setGps      ] = useState(null);

  // Get GPS once (optional — only if branch has GPS)
  useEffect(() => {
    if (!deviceInfo?.branchGPS?.lat) return;
    navigator.geolocation?.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  const todayFor = (w) => {
    if (String(w._id) === String(worker._id)) return todayStatus;
    return shiftWorkers?.find(s => String(s._id) === String(w._id))?.todayStatus
      || { clockedIn: false, clockedOut: false };
  };

  // Submit clock (after face verification)
  const submitClock = async ({ selfieBase64, faceMatchScore }) => {
    setTStep('clocking');
    try {
      const { data } = await axios.post(`${BASE}/attendance/clock`, {
        deviceToken:    deviceInfo.deviceToken,
        workerId:       selWorker._id,
        type:           clockType,
        gps:            gps || undefined,
        selfieBase64:   selfieBase64 || undefined,
        faceMatchScore: faceMatchScore || 0,
      });
      setResult(data.data);
      setTStep('success');
    } catch (err) {
      setError(err.response?.data?.message || 'Clock failed — please try again');
      setTStep('error');
    }
  };

  // Supervisor clocking another worker (no face)
  const submitClockOther = async () => {
    setTStep('clocking');
    try {
      const { data } = await axios.post(`${BASE}/attendance/clock`, {
        deviceToken: deviceInfo.deviceToken,
        workerId:    selWorker._id,
        type:        clockType,
        gps:         gps || undefined,
      });
      setResult(data.data);
      setTStep('success');
    } catch (err) {
      setError(err.response?.data?.message || 'Clock failed — please try again');
      setTStep('error');
    }
  };

  const isSelf = selWorker ? String(selWorker._id) === String(worker._id) : false;

  const handleBack = () => {
    if (tStep === 'pick' || tStep === 'choose') return onBack();
    if (tStep === 'confirm_other') { setTStep('pick'); setSelWorker(null); setClockType(null); }
    else if (tStep === 'face')     { setTStep(isSup ? 'pick' : 'choose'); if (isSup) { setSelWorker(null); setClockType(null); } }
    else if (tStep === 'error')    { setTStep(isSup ? 'pick' : 'choose'); setError(''); if (isSup) { setSelWorker(null); setClockType(null); } }
    else onBack();
  };

  return (
    <div className="p-4 max-w-sm mx-auto">
      {/* Header */}
      {tStep !== 'success' && (
        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-white font-bold text-lg">
            {tStep === 'pick' ? 'Select Worker' : 'Clock In / Out'}
          </h2>
          {deviceInfo?.branchGPS?.lat && gps && (
            <div className="ml-auto flex items-center gap-1 text-green-300 text-xs">
              <MapPin size={12} /> GPS
            </div>
          )}
        </div>
      )}

      {/* ── Pick worker (supervisor) ───────────────────────────────────────── */}
      {tStep === 'pick' && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm mb-3">Who are you clocking?</p>

          {/* Self */}
          {(() => {
            const st = todayStatus;
            const done = st?.clockedIn && st?.clockedOut;
            const nextType = !st?.clockedIn ? 'clock_in' : !st?.clockedOut ? 'clock_out' : null;
            return (
              <button
                onClick={() => {
                  if (!nextType) { setError('You have already completed attendance today'); setTStep('error'); return; }
                  setSelWorker(worker); setClockType(nextType); setTStep('face');
                }}
                className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-2xl px-4 py-3 border border-white/15 transition-all"
              >
                {worker.photo
                  ? <img src={worker.photo} alt="" className="w-11 h-11 rounded-lg object-cover border-2 border-white/20 shrink-0" />
                  : <div className="w-11 h-11 rounded-lg bg-white/20 text-white font-bold flex items-center justify-center shrink-0">{(worker.fullName||'?')[0]}</div>
                }
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white font-semibold text-sm">{worker.fullName} <span className="text-white/40 text-xs">(me)</span></p>
                  <p className="text-white/50 text-xs">{worker.role}</p>
                </div>
                <StatusPill done={done} inOnly={st?.clockedIn && !st?.clockedOut} />
              </button>
            );
          })()}

          {/* Shift workers */}
          {shiftWorkers?.filter(sw => String(sw._id) !== String(worker._id)).map(sw => {
            const st = sw.todayStatus || { clockedIn: false, clockedOut: false };
            const nextType = !st.clockedIn ? 'clock_in' : !st.clockedOut ? 'clock_out' : null;
            return (
              <button key={sw._id}
                onClick={() => {
                  if (!nextType) { setError(`${sw.fullName} has already completed attendance today`); setTStep('error'); return; }
                  setSelWorker(sw); setClockType(nextType); setTStep('confirm_other');
                }}
                className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-2xl px-4 py-3 border border-white/15 transition-all"
              >
                {sw.photo
                  ? <img src={sw.photo} alt="" className="w-11 h-11 rounded-lg object-cover border-2 border-white/20 shrink-0" />
                  : <div className="w-11 h-11 rounded-lg bg-white/20 text-white font-bold flex items-center justify-center shrink-0">{(sw.fullName||'?')[0]}</div>
                }
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white font-semibold text-sm truncate">{sw.fullName}</p>
                  <p className="text-white/50 text-xs">{sw.role}{sw.shift ? ` · ${sw.shift}` : ''}</p>
                </div>
                <StatusPill done={st.clockedIn && st.clockedOut} inOnly={st.clockedIn && !st.clockedOut} />
              </button>
            );
          })}
        </div>
      )}

      {/* ── Choose action (non-supervisor) ───────────────────────────────────── */}
      {tStep === 'choose' && selWorker && (
        <div className="space-y-4">
          <WorkerBadge worker={selWorker} />
          {todayStatus?.clockedIn && todayStatus?.clockedOut ? (
            <div className="bg-green-900/50 border border-green-600 rounded-2xl p-5 text-center space-y-2">
              <CheckCircle size={32} className="text-green-400 mx-auto" />
              <p className="text-white font-bold">Attendance Complete</p>
              <p className="text-white/60 text-sm">
                In: {fmtT(todayStatus.clockInTime)} · Out: {fmtT(todayStatus.clockOutTime)}
              </p>
              <button onClick={onBack} className="w-full mt-2 py-2.5 rounded-xl border border-white/20 text-white/70 text-sm">Back to Menu</button>
            </div>
          ) : (
            <div className={`grid gap-3 ${!todayStatus?.clockedIn ? 'grid-cols-1' : 'grid-cols-1'}`}>
              {!todayStatus?.clockedIn && (
                <button onClick={() => { setClockType('clock_in'); setTStep('face'); }}
                  className="py-8 rounded-2xl bg-green-600 hover:bg-green-500 text-white font-bold flex flex-col items-center gap-2 transition-colors">
                  <LogIn size={32} /><span className="text-lg">Clock In</span>
                  <span className="text-green-200 text-xs font-normal">Not yet clocked in today</span>
                </button>
              )}
              {todayStatus?.clockedIn && !todayStatus?.clockedOut && (
                <button onClick={() => { setClockType('clock_out'); setTStep('face'); }}
                  className="py-8 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-bold flex flex-col items-center gap-2 transition-colors">
                  <LogOut size={32} /><span className="text-lg">Clock Out</span>
                  <span className="text-red-200 text-xs font-normal">Clocked in at {fmtT(todayStatus.clockInTime)}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Confirm other (supervisor clocking a shift worker) ─────────────── */}
      {tStep === 'confirm_other' && selWorker && clockType && (
        <div className="space-y-4">
          <WorkerBadge worker={selWorker} sub={clockType === 'clock_in' ? '🟢 About to Clock IN' : '🔴 About to Clock OUT'} />
          <div className={`rounded-2xl p-4 text-center border ${clockType === 'clock_in' ? 'bg-green-900/40 border-green-600' : 'bg-red-900/40 border-red-600'}`}>
            <p className="text-white font-bold text-lg">{clockType === 'clock_in' ? '🟢 Clock In' : '🔴 Clock Out'}</p>
            <p className="text-white/60 text-sm mt-1">Confirm for {selWorker.fullName}?</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setTStep('pick'); setSelWorker(null); setClockType(null); }}
              className="py-3 rounded-2xl border border-white/20 text-white text-sm hover:bg-white/10">← Back</button>
            <button onClick={submitClockOther}
              className={`py-3 rounded-2xl text-white font-bold text-sm ${clockType === 'clock_in' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-500 hover:bg-red-400'}`}>
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* ── Face step (self-clock only) ────────────────────────────────────── */}
      {tStep === 'face' && selWorker && clockType && isSelf && (
        !selWorker.hasFace ? (
          <FaceRegister
            worker={selWorker}
            token={deviceInfo.deviceToken}
            onDone={(descriptor, selfieB64) => submitClock({ selfieBase64: selfieB64, faceMatchScore: 100 })}
            onBack={() => { setTStep(isSup ? 'pick' : 'choose'); if (isSup) { setSelWorker(null); setClockType(null); } }}
          />
        ) : (
          <FaceVerify
            worker={selWorker}
            storedDescriptor={selWorker.faceDescriptor}
            type={clockType}
            onVerified={(selfieB64, score) => submitClock({ selfieBase64: selfieB64, faceMatchScore: score })}
            onBack={() => { setTStep(isSup ? 'pick' : 'choose'); if (isSup) { setSelWorker(null); setClockType(null); } }}
          />
        )
      )}

      {/* ── Clocking… ──────────────────────────────────────────────────────── */}
      {tStep === 'clocking' && (
        <div className="flex flex-col items-center py-12 gap-4">
          <Loader size={40} className="animate-spin text-white/60" />
          <p className="text-white/60">Recording attendance…</p>
        </div>
      )}

      {/* ── Success ────────────────────────────────────────────────────────── */}
      {tStep === 'success' && result && (
        <div className="flex flex-col items-center py-8 gap-5">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center ${clockType === 'clock_in' ? 'bg-green-500' : 'bg-red-500'}`}>
            <CheckCircle size={48} className="text-white" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-2xl">{clockType === 'clock_in' ? 'Clocked In!' : 'Clocked Out!'}</p>
            <p className="text-white/60 mt-1">{result.workerName || selWorker?.fullName}</p>
            <p className="text-white/40 text-sm">{fmtT(new Date())}</p>
          </div>
          {isSup && (
            <button
              onClick={() => { setTStep('pick'); setSelWorker(null); setClockType(null); setResult(null); setError(''); }}
              className="w-full max-w-xs py-3 rounded-2xl border border-white/20 text-white hover:bg-white/10 font-medium text-sm"
            >
              Clock Another Worker
            </button>
          )}
          <button onClick={() => onClockSuccess(selWorker?._id, clockType)}
            className="w-full max-w-xs py-3 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20">
            Back to Menu
          </button>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {tStep === 'error' && (
        <div className="flex flex-col items-center py-8 gap-5">
          <XCircle size={48} className="text-red-400" />
          <p className="text-white font-bold text-center">{error || 'Something went wrong'}</p>
          <div className="grid grid-cols-2 gap-3 w-full">
            <button onClick={onBack} className="py-3 rounded-2xl border border-white/20 text-white text-sm">Menu</button>
            <button onClick={() => { setError(''); setTStep(isSup ? 'pick' : 'choose'); setSelWorker(isSup ? null : worker); setClockType(null); }}
              className="py-3 rounded-2xl bg-brand-600 text-white text-sm font-bold">Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ done, inOnly }) {
  if (done)   return <span className="text-xs bg-green-900/50 text-green-300 border border-green-600 px-2 py-1 rounded-full shrink-0">Done ✓</span>;
  if (inOnly) return <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-600 px-2 py-1 rounded-full shrink-0">In ✓</span>;
  return       <span className="text-xs bg-white/10 text-white/50 border border-white/20 px-2 py-1 rounded-full shrink-0">Pending</span>;
}

// ── Shortage View ──────────────────────────────────────────────────────────────
function ShortageView({ session, onBack, onSuccess }) {
  const { worker, shiftWorkers } = session;
  const isSup = worker.isSupervisor;

  const [sStep,  setSStep ] = useState(isSup ? 'pick' : 'form');
  const [target, setTarget] = useState(isSup ? null : worker);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('cash_shortage');
  const [notes,  setNotes ] = useState('');
  const [date,   setDate  ] = useState(new Date().toISOString().split('T')[0]);
  const [error,  setError ] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${BASE}/shortages/worker`, {
        pin:            session.pin,
        amount:         Number(amount),
        reason,
        notes,
        date,
        targetWorkerId: isSup && target ? target._id : undefined,
      });
      setResult(data);
      setSStep('success');
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (sStep === 'pick' || sStep === 'success') return onBack();
    if (sStep === 'form' && isSup) return setSStep('pick');
    onBack();
  };

  return (
    <div className="p-4 max-w-sm mx-auto">
      {sStep !== 'success' && (
        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"><ChevronLeft size={20} /></button>
          <h2 className="text-white font-bold text-lg">Report Shortage</h2>
        </div>
      )}

      {/* Supervisor picks target worker */}
      {sStep === 'pick' && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm mb-3">Who is the shortage for?</p>
          {[worker, ...(shiftWorkers?.filter(sw => String(sw._id) !== String(worker._id)) || [])].map((w, i) => (
            <button key={w._id || i}
              onClick={() => { setTarget(w); setSStep('form'); }}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-2xl px-4 py-3 border border-white/15 transition-all"
            >
              {w.photo
                ? <img src={w.photo} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-white/20 shrink-0" />
                : <div className="w-10 h-10 rounded-lg bg-white/20 text-white font-bold flex items-center justify-center shrink-0">{(w.fullName||'?')[0]}</div>
              }
              <div className="flex-1 text-left min-w-0">
                <p className="text-white font-semibold text-sm truncate">{w.fullName}{i === 0 ? <span className="text-white/40"> (me)</span> : ''}</p>
                <p className="text-white/50 text-xs">{w.role}{w.shift ? ` · ${w.shift}` : ''}</p>
              </div>
              <ChevronRight size={16} className="text-white/30 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Shortage form */}
      {sStep === 'form' && target && (
        <div className="space-y-4">
          <WorkerBadge worker={target} />
          <div className="bg-white rounded-2xl p-4 space-y-4">
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Amount (₦)</label>
              <input type="number" min="0" inputMode="numeric" placeholder="0"
                value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Reason</label>
              <select value={reason} onChange={e => setReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Additional details…" rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          {error && <p className="text-red-300 text-sm bg-red-900/30 border border-red-700 rounded-xl px-4 py-2.5 text-center">{error}</p>}
          <button onClick={submit} disabled={loading}
            className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <Loader size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
            {loading ? 'Submitting…' : 'Submit Shortage'}
          </button>
        </div>
      )}

      {/* Success */}
      {sStep === 'success' && (
        <div className="flex flex-col items-center py-8 gap-5">
          <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle size={48} className="text-white" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-2xl">Recorded!</p>
            <p className="text-white/60 mt-1">Shortage submitted successfully</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 w-full border border-white/20 space-y-2">
            <Row label="Worker" value={target?.fullName} />
            <Row label="Amount" value={fmt(amount)} />
            <Row label="Reason" value={REASON_OPTIONS.find(r => r.value === reason)?.label} />
          </div>
          {isSup && (
            <button onClick={() => { setSStep('pick'); setTarget(null); setAmount(''); setNotes(''); setError(''); setResult(null); }}
              className="w-full py-3 rounded-2xl border border-white/20 text-white hover:bg-white/10 text-sm">
              Report Another
            </button>
          )}
          <button onClick={onSuccess} className="w-full py-3 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20">Back to Menu</button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

// ── Break View ─────────────────────────────────────────────────────────────────
const BREAK_EMOJI = {
  morning: '🌅', afternoon: '☀️', night: '🌙',
  break_4: '⭐', break_5: '💫', break_6: '🔔',
};

function fmtSecs(s) {
  const m = Math.floor(Math.abs(s) / 60), sec = Math.abs(s) % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Capture GPS location (resolves with coords or null)
function getGPS() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30000 }
    );
  });
}

function BreakView({ session, onBack }) {
  const { worker, deviceInfo, shiftWorkers } = session;
  const isSup = worker.isSupervisor;
  const isPersonalPhone = !deviceInfo?.deviceToken;

  const [bStep,           setBStep          ] = useState(isSup ? 'pick' : 'status');
  const [selWorker,       setSelWorker      ] = useState(isSup ? null : worker);
  const [status,          setStatus         ] = useState(null);
  const [loading,         setLoading        ] = useState(false);
  const [actLoading,      setActLoading     ] = useState(false);
  const [error,           setError          ] = useState('');
  const [result,          setResult         ] = useState(null);
  const [elapsedSec,      setElapsedSec     ] = useState(0);
  const [pendingBreakType,setPendingBreakType] = useState(null);

  // Is the selected worker the logged-in worker? (face required for self only)
  const isSelf = !selWorker || String(selWorker._id) === String(worker._id);

  // Build auth params — device token if on approved device, PIN if on personal phone
  // NOTE: session.pin is the 4-digit PIN the worker typed at login.
  //       worker.pin is NOT returned by the API (security), so we read from session.
  const breakAuthParams = useCallback((wId) => {
    if (deviceInfo?.deviceToken) return { deviceToken: deviceInfo.deviceToken, workerId: wId };
    return { pin: session.pin, workerId: wId };
  }, [deviceInfo?.deviceToken, session.pin]);

  const loadStatus = useCallback(async (wId) => {
    setLoading(true); setError('');
    try {
      const { data } = await axios.get(`${BASE}/breaks/status`, {
        params: breakAuthParams(wId),
      });
      setStatus(data.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load break status');
    } finally { setLoading(false); }
  }, [breakAuthParams]);

  useEffect(() => {
    if (bStep === 'status' && selWorker) loadStatus(selWorker._id);
  }, [selWorker, bStep]);

  // Auto-refresh every 60 s so windows open/close without manual tap
  useEffect(() => {
    if (bStep !== 'status' || !selWorker) return;
    const t = setInterval(() => loadStatus(selWorker._id), 60000);
    return () => clearInterval(t);
  }, [bStep, selWorker, loadStatus]);

  // Live countdown
  useEffect(() => {
    if (!status?.activeBreak) { setElapsedSec(0); return; }
    const start = new Date(status.activeBreak.startTime).getTime();
    const tick  = () => setElapsedSec(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [status?.activeBreak?._id]);

  const doStart = async (breakType) => {
    setActLoading(true); setError('');
    try {
      const gps = isPersonalPhone ? await getGPS() : null;
      const body = isPersonalPhone
        ? { pin: session.pin, workerId: selWorker._id, breakType, gps }
        : { deviceToken: deviceInfo.deviceToken, workerId: selWorker._id, breakType };
      const { data } = await axios.post(`${BASE}/breaks/start`, body);
      setResult({ action: 'started', ...data.data });
      setBStep('result');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to start break');
      setBStep('status'); // return to status so error is visible (face_start was active)
    } finally { setActLoading(false); }
  };

  const doEnd = async () => {
    setActLoading(true); setError('');
    try {
      const gps = isPersonalPhone ? await getGPS() : null;
      const body = isPersonalPhone
        ? { pin: session.pin, workerId: selWorker._id, gps }
        : { deviceToken: deviceInfo.deviceToken, workerId: selWorker._id };
      const { data } = await axios.post(`${BASE}/breaks/end`, body);
      setResult({ action: 'ended', ...data.data });
      setBStep('result');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to end break');
      setBStep('status'); // return to status so error is visible (face_end was active)
    } finally { setActLoading(false); }
  };

  const handleBack = () => {
    if (bStep === 'pick') return onBack();
    if (bStep === 'status') {
      if (isSup) { setBStep('pick'); setSelWorker(null); setStatus(null); }
      else onBack();
      return;
    }
    if (bStep === 'face_start' || bStep === 'face_end') {
      setBStep('status'); setPendingBreakType(null); return;
    }
    if (bStep === 'result') {
      setResult(null); setStatus(null); setBStep('status');
    }
  };

  return (
    <div className="p-4 max-w-sm mx-auto">
      {/* Header — hidden during face scan and result */}
      {bStep !== 'face_start' && bStep !== 'face_end' && bStep !== 'result' && (
      <div className="flex items-center gap-3 mb-4">
        <button onClick={handleBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 className="text-white font-bold text-lg">
            {bStep === 'pick' ? 'Select Worker' : 'Breaks'}
          </h2>
          {isPersonalPhone && bStep === 'status' && (
            <p className="text-white/40 text-[10px] flex items-center gap-1 mt-0.5">
              <MapPin size={9} /> GPS required · personal phone
            </p>
          )}
        </div>
        {bStep === 'status' && selWorker && !loading && (
          <button onClick={() => loadStatus(selWorker._id)}
            className="ml-auto p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 hover:text-white">
            <RotateCcw size={14} />
          </button>
        )}
      </div>
      )}

      {/* ── Supervisor picks worker ──────────────────────────────── */}
      {bStep === 'pick' && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm mb-3">Manage break for:</p>
          {[worker, ...(shiftWorkers?.filter(sw => String(sw._id) !== String(worker._id)) || [])].map((w, i) => (
            <button key={w._id || i}
              onClick={() => { setSelWorker(w); setBStep('status'); }}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-2xl px-4 py-3 border border-white/15 transition-all">
              {w.photo
                ? <img src={w.photo} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-white/20 shrink-0" />
                : <div className="w-10 h-10 rounded-lg bg-white/20 text-white font-bold flex items-center justify-center shrink-0">{(w.fullName||'?')[0]}</div>
              }
              <div className="flex-1 text-left min-w-0">
                <p className="text-white font-semibold text-sm truncate">{w.fullName}{i === 0 && <span className="text-white/40"> (me)</span>}</p>
                <p className="text-white/50 text-xs">{w.role}</p>
              </div>
              <ChevronRight size={16} className="text-white/30 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ── Status view ─────────────────────────────────────────── */}
      {bStep === 'status' && (
        <div className="space-y-4">
          {/* Action error banner — shown prominently at the top */}
          {error && !loading && (
            <div className="bg-red-900/60 border border-red-500 rounded-2xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-200 text-sm font-semibold">Action failed</p>
                <p className="text-red-300 text-xs mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-200 shrink-0">
                <X size={14} />
              </button>
            </div>
          )}
          {selWorker && <WorkerBadge worker={selWorker} />}

          {loading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader size={28} className="animate-spin text-white/40" />
              <p className="text-white/40 text-sm">Loading…</p>
            </div>
          )}

          {!loading && status && (() => {
            const attCfg = {
              active:        { label: '🟢 Clocked In — active',  cls: 'bg-green-900/40 border-green-600 text-green-300' },
              on_break:      { label: '☕ Currently on break',    cls: 'bg-orange-900/40 border-orange-500 text-orange-300' },
              break_overdue: { label: '⚠️ Break overdue!',        cls: 'bg-red-900/60 border-red-500 text-red-300' },
              clocked_out:   { label: '✅ Clocked out today',      cls: 'bg-gray-900/40 border-gray-600 text-gray-300' },
              absent:        { label: '⏳ Not yet clocked in',    cls: 'bg-yellow-900/40 border-yellow-600 text-yellow-300' },
            }[status.attendanceStatus] || { label: status.attendanceStatus, cls: 'bg-white/10 border-white/20 text-white/60' };

            return (
              <>
                {/* Attendance status + server time */}
                <div className={`rounded-xl px-4 py-2.5 text-sm font-bold text-center border ${attCfg.cls}`}>
                  {attCfg.label}
                  {status.serverTimeWAT && (
                    <span className="block text-xs font-normal opacity-60 mt-0.5">
                      Server time: {status.serverTimeWAT} WAT
                    </span>
                  )}
                </div>

                {/* ── Active break countdown ───────────────────── */}
                {status.activeBreak && (() => {
                  const allowed = status.activeBreak.allowedMinutes * 60;
                  const remaining = allowed - elapsedSec;
                  const pct = Math.min(100, Math.round((elapsedSec / allowed) * 100));
                  const isOver = remaining < 0;
                  return (
                    <div className="bg-orange-900/30 border border-orange-500/50 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{BREAK_EMOJI[status.activeBreak.breakType]}</span>
                        <div>
                          <p className="text-orange-200 font-bold">{status.activeBreak.label}</p>
                          <p className="text-orange-300/60 text-xs">
                            Started {fmtT(status.activeBreak.startTime)} · {status.activeBreak.allowedMinutes} min allowed
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-orange-300/70">Elapsed: {fmtSecs(elapsedSec)}</span>
                          <span className={`font-black text-base ${isOver ? 'text-red-300' : remaining < 60 ? 'text-amber-300' : 'text-green-300'}`}>
                            {isOver ? `⚠️ +${fmtSecs(-remaining)} over` : `${fmtSecs(remaining)} left`}
                          </span>
                        </div>
                        <div className="bg-white/10 rounded-full h-2.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-1000 ${isOver ? 'bg-red-500' : 'bg-orange-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <button
                        onClick={() => { if (isSelf) setBStep('face_end'); else doEnd(); }}
                        disabled={actLoading}
                        className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                        {actLoading ? <Loader size={16} className="animate-spin" /> : <Square size={16} />}
                        End Break
                      </button>
                    </div>
                  );
                })()}

                {/* ── Available breaks ──────────────────────────── */}
                {!status.activeBreak && (
                  <div className="space-y-2">
                    <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Available Breaks</p>
                    {status.availableBreaks?.map(br => {
                      const canStart = !br.taken && br.inWindow && status.attendanceStatus === 'active';
                      const isTaken  = br.taken;
                      return (
                        <div key={br.type}
                          className={`rounded-2xl p-4 border transition-colors ${
                            isTaken  ? 'bg-green-900/20 border-green-700/50' :
                            canStart ? 'bg-white/10 border-white/20' :
                                       'bg-white/5 border-white/10 opacity-60'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xl shrink-0">{BREAK_EMOJI[br.type]}</span>
                              <div className="min-w-0">
                                <p className={`font-semibold text-sm ${isTaken ? 'text-green-300' : canStart ? 'text-white' : 'text-white/40'}`}>
                                  {br.label}
                                </p>
                                <p className="text-white/30 text-xs">{br.windowStart}–{br.windowEnd} · {br.allowedMinutes} min</p>
                              </div>
                            </div>
                            {isTaken ? (
                              <span className="bg-green-500/20 text-green-300 border border-green-500/30 text-xs px-2.5 py-1 rounded-full font-bold shrink-0">
                                Taken ✓
                              </span>
                            ) : canStart ? (
                              <button
                                onClick={() => {
                                  if (isSelf) { setPendingBreakType(br.type); setBStep('face_start'); }
                                  else doStart(br.type);
                                }}
                                disabled={actLoading}
                                className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 transition-colors">
                                {actLoading ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                                Start
                              </button>
                            ) : (
                              <span className="text-white/20 text-xs shrink-0">
                                {!br.inWindow ? 'Window closed' : 'Unavailable'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Today's break history ─────────────────────── */}
                {status.todayBreaks?.length > 0 && (
                  <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                    <p className="px-4 py-2.5 text-white/40 text-xs font-bold uppercase tracking-wider border-b border-white/10">
                      Today's History
                    </p>
                    <div className="divide-y divide-white/5">
                      {status.todayBreaks.map((b, i) => {
                        const sc = {
                          completed:  { cls: 'bg-green-500/20 text-green-300',   label: 'Done ✓' },
                          overstayed: { cls: 'bg-red-500/20 text-red-300',        label: `Over +${b.excessMinutes}m` },
                          active:     { cls: 'bg-orange-500/20 text-orange-300',  label: 'Active' },
                          missed:     { cls: 'bg-gray-500/20 text-gray-400',      label: 'Missed' },
                        }[b.status] || { cls: 'bg-white/10 text-white/40', label: b.status };
                        return (
                          <div key={i} className="px-4 py-3 flex items-center gap-3">
                            <span className="text-base shrink-0">{BREAK_EMOJI[b.breakType]}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium">{b.label}</p>
                              <p className="text-white/40 text-xs">
                                {b.startTime ? fmtT(b.startTime) : '—'}
                                {b.endTime ? ` → ${fmtT(b.endTime)}` : ''}
                                {b.actualMinutes > 0 ? ` · ${b.actualMinutes} min` : ''}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full font-bold shrink-0 ${sc.cls}`}>
                              {sc.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* No breaks yet */}
                {!status.activeBreak && status.todayBreaks?.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-4">No breaks taken today</p>
                )}

                {/* error shown in top banner above */}
              </>
            );
          })()}

          {!loading && !status && error && (
            <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 text-center space-y-2">
              <p className="text-red-300 text-sm">{error}</p>
              <button onClick={() => loadStatus(selWorker._id)} className="text-red-300 text-xs underline">Retry</button>
            </div>
          )}
        </div>
      )}

      {/* ── Face verification — break start ─────────────────────── */}
      {bStep === 'face_start' && selWorker && (
        !selWorker.hasFace ? (
          <FaceRegister
            worker={selWorker}
            token={deviceInfo?.deviceToken}
            onDone={(_desc, selfieB64) => doStart(pendingBreakType)}
            onBack={() => { setBStep('status'); setPendingBreakType(null); }}
          />
        ) : (
          <FaceVerify
            worker={selWorker}
            storedDescriptor={selWorker.faceDescriptor}
            type="break_start"
            onVerified={() => doStart(pendingBreakType)}
            onBack={() => { setBStep('status'); setPendingBreakType(null); }}
          />
        )
      )}

      {/* ── Face verification — break end ────────────────────────── */}
      {bStep === 'face_end' && selWorker && (
        !selWorker.hasFace ? (
          <FaceRegister
            worker={selWorker}
            token={deviceInfo?.deviceToken}
            onDone={() => doEnd()}
            onBack={() => setBStep('status')}
          />
        ) : (
          <FaceVerify
            worker={selWorker}
            storedDescriptor={selWorker.faceDescriptor}
            type="break_end"
            onVerified={() => doEnd()}
            onBack={() => setBStep('status')}
          />
        )
      )}

      {/* ── Result ──────────────────────────────────────────────── */}
      {bStep === 'result' && result && (
        <div className="flex flex-col items-center py-8 gap-5">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center ${result.action === 'started' ? 'bg-orange-500' : 'bg-green-500'}`}>
            {result.action === 'started'
              ? <Coffee size={48} className="text-white" />
              : <CheckCircle size={48} className="text-white" />}
          </div>
          <div className="text-center">
            <p className="text-white font-black text-2xl">
              {result.action === 'started' ? 'Break Started!' : 'Break Ended!'}
            </p>
            <p className="text-white/60 mt-1">{result.label}</p>
            {result.action === 'started' && result.allowedMinutes && (
              <p className="text-orange-300 text-sm mt-1">You have {result.allowedMinutes} minutes ⏱</p>
            )}
            {result.action === 'ended' && result.overstayed && (
              <p className="text-red-300 text-sm mt-1">⚠️ Overstayed by {result.excessMinutes} min — {result.actualMinutes} min total</p>
            )}
            {result.action === 'ended' && !result.overstayed && (
              <p className="text-green-300 text-sm mt-1">✓ On time · {result.actualMinutes} min used</p>
            )}
          </div>
          {isSup && (
            <button onClick={() => { setResult(null); setStatus(null); setBStep('pick'); setSelWorker(null); }}
              className="w-full py-3 rounded-2xl border border-white/20 text-white hover:bg-white/10 text-sm">
              Another Worker
            </button>
          )}
          <button onClick={handleBack}
            className="w-full py-3 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20">
            Back
          </button>
        </div>
      )}
    </div>
  );
}

// ── Offence View ───────────────────────────────────────────────────────────────
const OFFENCE_TYPES = [
  { value: 'late_arrival',           label: 'Late Arrival'            },
  { value: 'absent_without_notice',  label: 'Absent Without Notice'   },
  { value: 'improper_uniform',       label: 'Improper Uniform'        },
  { value: 'rude_to_customer',       label: 'Rude to Customer'        },
  { value: 'cash_shortage',          label: 'Cash Shortage'           },
  { value: 'fuel_shortage',          label: 'Fuel Shortage'           },
  { value: 'negligence',             label: 'Negligence'              },
  { value: 'theft_fraud',            label: 'Theft / Fraud'           },
  { value: 'disobedience',           label: 'Disobedience'            },
  { value: 'mobile_phone_misuse',    label: 'Mobile Phone Misuse'     },
  { value: 'fighting_misconduct',    label: 'Fighting / Misconduct'   },
  { value: 'damage_to_property',     label: 'Damage to Property'      },
  { value: 'abandoning_post',        label: 'Abandoning Post'         },
  { value: 'insubordination',        label: 'Insubordination'         },
  { value: 'sleeping_on_duty',       label: 'Sleeping on Duty'        },
  { value: 'other',                  label: 'Other'                   },
];

const SEVERITY_OPTIONS = [
  { value: 'minor',    label: '⚪ Minor'    },
  { value: 'moderate', label: '🟡 Moderate' },
  { value: 'serious',  label: '🟠 Serious'  },
  { value: 'gross',    label: '🔴 Gross'    },
];

const ACTION_OPTIONS = [
  { value: 'verbal_warning',   label: 'Verbal Warning'   },
  { value: 'written_warning',  label: 'Written Warning'  },
  { value: 'deduction',        label: 'Deduction (₦)'    },
  { value: 'suspension',       label: 'Suspension'       },
  { value: 'dismissal',        label: 'Dismissal'        },
  { value: 'none',             label: 'No Action'        },
];

const SEVERITY_BADGE = {
  minor:    'bg-gray-500/20 text-gray-300 border-gray-500/30',
  moderate: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  serious:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  gross:    'bg-red-500/20 text-red-300 border-red-500/30',
};

function OffenceView({ session, onBack }) {
  const { worker, deviceInfo, shiftWorkers } = session;
  const isSup = worker.isSupervisor;

  const [oStep,  setOStep ] = useState(isSup ? 'pick' : 'not_sup');
  const [target, setTarget] = useState(null);
  const [form,   setForm  ] = useState({
    offenceType:     'late_arrival',
    severity:        'minor',
    action:          'verbal_warning',
    description:     '',
    deductionAmount: '',
    witness:         '',
    date:            new Date().toISOString().split('T')[0],
  });
  const [error,   setError  ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult ] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${BASE}/worker/book-offence`, {
        deviceToken:     deviceInfo?.deviceToken,
        pin:             session.pin,
        workerId:        target._id,
        offenceType:     form.offenceType,
        severity:        form.severity,
        action:          form.action,
        deductionAmount: form.action === 'deduction' ? Number(form.deductionAmount) : 0,
        description:     form.description,
        witness:         form.witness,
        date:            form.date,
      });
      setResult(data.data);
      setOStep('success');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to book offence');
    } finally { setLoading(false); }
  };

  const handleBack = () => {
    if (oStep === 'pick' || oStep === 'not_sup') return onBack();
    if (oStep === 'form')    { setOStep('pick'); setTarget(null); setError(''); }
    if (oStep === 'success') { setResult(null); setOStep('pick'); setTarget(null); setForm({
      offenceType: 'late_arrival', severity: 'minor', action: 'verbal_warning',
      description: '', deductionAmount: '', witness: '', date: new Date().toISOString().split('T')[0],
    }); }
  };

  return (
    <div className="p-4 max-w-sm mx-auto">
      {/* Header */}
      {oStep !== 'success' && (
        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-white font-bold text-lg">
            {oStep === 'pick' ? 'Select Worker' : 'Book Offence'}
          </h2>
        </div>
      )}

      {/* Not supervisor */}
      {oStep === 'not_sup' && (
        <div className="flex flex-col items-center py-12 gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <FileWarning size={36} className="text-white/40" />
          </div>
          <p className="text-white font-bold">Supervisors Only</p>
          <p className="text-white/50 text-sm">Only supervisors can book offences for workers</p>
          <button onClick={onBack} className="mt-2 py-2.5 px-6 rounded-xl border border-white/20 text-white/60 text-sm hover:bg-white/10">
            Back to Menu
          </button>
        </div>
      )}

      {/* Supervisor picks target worker */}
      {oStep === 'pick' && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm mb-3">Who is the offence for?</p>
          {[worker, ...(shiftWorkers?.filter(sw => String(sw._id) !== String(worker._id)) || [])].map((w, i) => (
            <button key={w._id || i}
              onClick={() => { setTarget(w); setOStep('form'); }}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-2xl px-4 py-3 border border-white/15 transition-all">
              {w.photo
                ? <img src={w.photo} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-white/20 shrink-0" />
                : <div className="w-10 h-10 rounded-lg bg-white/20 text-white font-bold flex items-center justify-center shrink-0">{(w.fullName||'?')[0]}</div>
              }
              <div className="flex-1 text-left min-w-0">
                <p className="text-white font-semibold text-sm truncate">{w.fullName}{i === 0 && <span className="text-white/40"> (me)</span>}</p>
                <p className="text-white/50 text-xs">{w.role}{w.shift ? ` · ${w.shift}` : ''}</p>
              </div>
              <ChevronRight size={16} className="text-white/30 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Offence form */}
      {oStep === 'form' && target && (
        <div className="space-y-4">
          <WorkerBadge worker={target} />
          <div className="bg-white rounded-2xl p-4 space-y-4">

            {/* Offence Type */}
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Offence Type</label>
              <select value={form.offenceType} onChange={e => set('offenceType', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                {OFFENCE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Severity</label>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_OPTIONS.map(s => (
                  <button key={s.value} type="button"
                    onClick={() => set('severity', s.value)}
                    className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      form.severity === s.value
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action */}
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Action Taken</label>
              <select value={form.action} onChange={e => set('action', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                {ACTION_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            {/* Deduction amount — only when action=deduction */}
            {form.action === 'deduction' && (
              <div>
                <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Deduction Amount (₦)</label>
                <input type="number" min="0" inputMode="numeric" placeholder="0"
                  value={form.deductionAmount} onChange={e => set('deductionAmount', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Describe what happened…" rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>

            {/* Witness */}
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Witness (optional)</label>
              <input type="text" placeholder="Witness name"
                value={form.witness} onChange={e => set('witness', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>

            {/* Date */}
            <div>
              <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1">Date</label>
              <input type="date" value={form.date}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => set('date', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </div>

          {error && (
            <p className="text-red-300 text-sm bg-red-900/30 border border-red-700 rounded-xl px-4 py-2.5 text-center">{error}</p>
          )}

          <button onClick={submit} disabled={loading}
            className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
            {loading ? <Loader size={18} className="animate-spin" /> : <FileWarning size={18} />}
            {loading ? 'Booking…' : 'Book Offence'}
          </button>
        </div>
      )}

      {/* Success */}
      {oStep === 'success' && result && (
        <div className="flex flex-col items-center py-8 gap-5">
          <div className="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center">
            <CheckCircle size={48} className="text-white" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-2xl">Offence Booked</p>
            <p className="text-white/60 mt-1">{target?.fullName}</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 w-full border border-white/20 space-y-2">
            <Row label="Offence"   value={OFFENCE_TYPES.find(o => o.value === form.offenceType)?.label} />
            <Row label="Severity"  value={SEVERITY_OPTIONS.find(s => s.value === form.severity)?.label} />
            <Row label="Action"    value={ACTION_OPTIONS.find(a => a.value === form.action)?.label} />
            {form.action === 'deduction' && form.deductionAmount && (
              <Row label="Deduction" value={fmt(form.deductionAmount)} />
            )}
            <Row label="Recorded by" value={worker.fullName} />
          </div>
          <button onClick={handleBack}
            className="w-full py-3 rounded-2xl border border-white/20 text-white hover:bg-white/10 text-sm">
            Book Another
          </button>
          <button onClick={onBack}
            className="w-full py-3 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20">
            Back to Menu
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dashboard View ─────────────────────────────────────────────────────────────
function DashboardView({ session, onBack }) {
  const { pin } = session;
  const now = new Date();
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [year,  setYear ]       = useState(now.getFullYear());
  const [data,  setData ]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error,   setError  ]   = useState('');
  const [showAtt, setShowAtt]   = useState(false);
  const [showDed, setShowDed]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await axios.get(`${BASE}/shortages/worker/dashboard`, { params: { pin, month, year } });
      setData(r.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load');
    } finally { setLoading(false); }
  }, [pin, month, year]);

  useEffect(() => { load(); }, [load]);

  const atCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (!atCurrentMonth) { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); } };

  // Correct nested data paths
  const att = data?.attendance || {};
  const sal = data?.salary     || {};
  const deductions = data?.shortages     || [];
  const attDays    = data?.attendanceDays || [];

  const deductPct = sal.baseSalary > 0
    ? Math.min(100, Math.round((sal.totalDeducted / sal.baseSalary) * 100))
    : 0;

  return (
    <div className="pb-8">
      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-brand-900/95 backdrop-blur px-4 py-3 flex items-center gap-2 border-b border-white/10">
        <button onClick={onBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white shrink-0">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-white font-bold text-base flex-1">My Dashboard</h2>
        {/* Month navigator */}
        <div className="flex items-center gap-1 bg-white/10 rounded-xl px-1 py-1">
          <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-white text-xs font-bold min-w-[72px] text-center">
            {MONTH_SHORT[month-1]} {year}
          </span>
          <button onClick={nextMonth} disabled={atCurrentMonth}
            className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-sm mx-auto space-y-3">
        {/* ── Worker card ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 bg-white/10 rounded-2xl p-4 border border-white/15">
          {data?.worker?.photo
            ? <img src={data.worker.photo} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-white/20 shrink-0" />
            : <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-white text-2xl font-black shrink-0">
                {(data?.worker?.fullName || session.worker?.fullName || '?')[0]}
              </div>
          }
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-base truncate">{data?.worker?.fullName || session.worker?.fullName}</p>
            <p className="text-white/60 text-sm">{data?.worker?.role || session.worker?.role}</p>
            <p className="text-brand-300 text-xs mt-0.5">{data?.worker?.branchName || session.worker?.branch}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-white/40 text-[10px] uppercase tracking-wide">Period</p>
            <p className="text-white font-bold text-sm">{MONTH_SHORT[month-1]}</p>
            <p className="text-white/60 text-xs">{year}</p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader size={32} className="animate-spin text-white/40" />
            <p className="text-white/40 text-sm">Loading…</p>
          </div>
        )}
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 text-center">
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={load} className="text-red-300 text-xs underline mt-2">Retry</button>
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── Salary card ───────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-xl">
              {/* Green header bar */}
              <div className="bg-brand-700 px-5 py-3 flex items-center justify-between">
                <p className="text-white/80 text-xs font-bold uppercase tracking-wider">Salary Summary</p>
                <p className="text-brand-200 text-xs">{MONTH_FULL[month-1]} {year}</p>
              </div>

              <div className="p-5 space-y-3">
                {/* Base salary */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-gray-600 text-sm">Base Salary</span>
                  </div>
                  <span className="text-gray-900 font-bold">{fmt(sal.baseSalary)}</span>
                </div>

                {/* Bonus (if any) */}
                {sal.bonus > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                      <span className="text-gray-600 text-sm">Bonus</span>
                    </div>
                    <span className="text-green-600 font-bold">+{fmt(sal.bonus)}</span>
                  </div>
                )}

                {/* Deductions */}
                {sal.totalDeducted > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span className="text-gray-600 text-sm">Total Deductions</span>
                    </div>
                    <span className="text-red-600 font-bold">-{fmt(sal.totalDeducted)}</span>
                  </div>
                )}

                {/* Deduction progress bar */}
                {sal.totalDeducted > 0 && sal.baseSalary > 0 && (
                  <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full" style={{ width: `${100 - deductPct}%` }} />
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-900 font-black text-base">Expected Pay</p>
                      {sal.totalDeducted > 0 && (
                        <p className="text-red-500 text-xs mt-0.5">{deductPct}% deducted this month</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-green-600 font-black text-2xl">{fmt(sal.expectedPay)}</p>
                      {sal.totalDeducted > 0 && sal.baseSalary > 0 && (
                        <p className="text-gray-400 text-xs line-through">{fmt(sal.baseSalary + (sal.bonus||0))}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Attendance stats ───────────────────────────────────────── */}
            <div className="bg-white/10 rounded-2xl border border-white/15 overflow-hidden">
              <p className="px-4 py-2.5 text-white/60 text-xs font-bold uppercase tracking-wider border-b border-white/10">
                Attendance — {MONTH_FULL[month-1]}
              </p>
              <div className="grid grid-cols-5 divide-x divide-white/10">
                {[
                  { label: 'Present', value: att.daysPresent,  emoji: '✅', color: 'text-green-300' },
                  { label: 'Late',    value: att.lateDays,      emoji: '🕐', color: att.lateDays     > 0 ? 'text-amber-300' : 'text-white/40' },
                  { label: 'Absent',  value: att.absentDays,    emoji: '❌', color: att.absentDays   > 0 ? 'text-red-300'   : 'text-white/40' },
                  { label: 'No-show', value: att.noShowDays,    emoji: '👻', color: att.noShowDays   > 0 ? 'text-red-300'   : 'text-white/40' },
                  { label: 'Early↑',  value: att.earlyExitDays, emoji: '🏃', color: att.earlyExitDays> 0 ? 'text-amber-300' : 'text-white/40' },
                ].map(s => (
                  <div key={s.label} className="py-3 text-center">
                    <p className="text-base">{s.emoji}</p>
                    <p className={`text-lg font-black leading-tight ${s.color}`}>{s.value || 0}</p>
                    <p className="text-white/40 text-[10px] leading-tight mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Deductions detail ──────────────────────────────────────── */}
            {deductions.length > 0 && (
              <div className="bg-white/10 rounded-2xl border border-white/15 overflow-hidden">
                <button onClick={() => setShowDed(e => !e)}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💸</span>
                    <span className="text-white font-bold text-sm">Deductions ({deductions.length})</span>
                    <span className="bg-red-500/20 text-red-300 text-xs px-2 py-0.5 rounded-full font-bold border border-red-500/30">
                      -{fmt(sal.totalDeducted)}
                    </span>
                  </div>
                  {showDed ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
                </button>
                {showDed && (
                  <div className="divide-y divide-white/5">
                    {deductions.map((s, i) => (
                      <div key={i} className="px-4 py-3 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-sm">
                            {s.source === 'late_arrival'    ? '🕐'
                             : s.source === 'absent'        ? '❌'
                             : s.source === 'no_clockin'    ? '👻'
                             : s.source === 'early_departure'? '🏃'
                             : '💸'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold">{s.label || s.source}</p>
                          {s.notes && <p className="text-white/40 text-xs mt-0.5 truncate">{s.notes}</p>}
                          {s.date && (
                            <p className="text-white/30 text-xs mt-0.5">
                              {new Date(s.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-red-300 font-black text-base">-{fmt(s.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Attendance log ─────────────────────────────────────────── */}
            <div className="bg-white/10 rounded-2xl border border-white/15 overflow-hidden">
              <button onClick={() => setShowAtt(e => !e)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📅</span>
                  <span className="text-white font-bold text-sm">
                    Attendance Log
                    {attDays.length > 0 && <span className="text-white/40 font-normal"> · {attDays.length} days</span>}
                  </span>
                </div>
                {showAtt ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
              </button>

              {showAtt && (
                attDays.length > 0 ? (
                  <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                    {[...attDays].reverse().map((d, i) => (
                      <div key={i} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-white text-sm font-semibold">{fmtD(d.date)}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-lg font-bold">
                            IN {fmtT(d.clockIn)}
                          </span>
                          {d.clockOut && (
                            <span className="bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-1 rounded-lg font-bold">
                              OUT {fmtT(d.clockOut)}
                            </span>
                          )}
                          {!d.clockOut && (
                            <span className="bg-white/5 text-white/30 border border-white/10 px-2 py-1 rounded-lg">
                              —
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/30 text-sm text-center py-6">No attendance records for {MONTH_FULL[month-1]}</p>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Change PIN View ────────────────────────────────────────────────────────────
function ChangePinView({ session, onBack, onSuccess }) {
  const [cpStep,   setCpStep  ] = useState('current'); // current | new | confirm
  const [current,  setCurrent ] = useState('');
  const [newPin,   setNewPin  ] = useState('');
  const [confirm,  setConfirm ] = useState('');
  const [error,    setError   ] = useState('');
  const [loading,  setLoading ] = useState(false);

  const handleCurrent = (p) => { setCurrent(p); setError(''); setCpStep('new'); };

  const handleNew = (p) => {
    if (p === current) { setError('New PIN must be different from current PIN'); setNewPin(''); return; }
    setNewPin(p); setError(''); setCpStep('confirm');
  };

  const handleConfirm = async (p) => {
    if (p !== newPin) { setError("PINs don't match — start over"); setConfirm(''); setNewPin(''); setError("PINs didn't match — re-enter your new PIN"); setCpStep('new'); return; }
    setLoading(true); setError('');
    try {
      await axios.post(`${BASE}/worker/change-pin`, { currentPin: current, newPin: p });
      onSuccess(p);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change PIN');
      setCpStep('current'); setCurrent(''); setNewPin(''); setConfirm('');
    } finally { setLoading(false); }
  };

  const handleBack = () => {
    if (cpStep === 'current') return onBack();
    if (cpStep === 'new')     { setCpStep('current'); setCurrent(''); setError(''); }
    if (cpStep === 'confirm') { setCpStep('new');     setNewPin('');  setError(''); }
  };

  const stepNum = { current: 1, new: 2, confirm: 3 }[cpStep];

  return (
    <div className="p-4 max-w-sm mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={handleBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h2 className="text-white font-bold text-lg leading-tight">Change PIN</h2>
          <p className="text-white/50 text-xs">Step {stepNum} of 3</p>
        </div>
        <div className="flex gap-1.5">
          {[1,2,3].map(i => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i <= stepNum ? 'bg-white' : 'bg-white/20'}`} />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl p-6">
        {cpStep === 'current' && (
          <PinPad pin={current} onChange={setCurrent} onSubmit={handleCurrent}
            loading={false} error={error} label="Current PIN" sublabel="Enter your existing 4-digit PIN" />
        )}
        {cpStep === 'new' && (
          <PinPad pin={newPin} onChange={setNewPin} onSubmit={handleNew}
            loading={false} error={error} label="New PIN" sublabel="Choose a new 4-digit PIN" />
        )}
        {cpStep === 'confirm' && (
          <PinPad pin={confirm} onChange={setConfirm} onSubmit={handleConfirm}
            loading={loading} error={error} label="Confirm PIN" sublabel="Re-enter your new PIN to confirm" />
        )}
      </div>
    </div>
  );
}

// ── Shift Status Board ─────────────────────────────────────────────────────────
function ShiftBoardView({ session, onBack }) {
  const { deviceToken, worker } = session;
  const [board,   setBoard  ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError  ] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const params = deviceToken
        ? { deviceToken }
        : { pin: session.pin, workerId: worker._id };
      const { data } = await axios.get(`${BASE}/breaks/shift-board`, { params });
      if (data.success) setBoard(data.data);
      else setError(data.message || 'Could not load board');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load board');
    } finally {
      setLoading(false);
    }
  }, [deviceToken, session.pin, worker._id]);

  // Load on mount + auto-refresh every 30 s
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const active  = board?.workers?.filter(w => w.status === 'active')  || [];
  const onBreak = board?.workers?.filter(w => w.status === 'on_break') || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-10 pb-4">
        <button onClick={onBack}
          className="bg-white/10 hover:bg-white/20 rounded-xl p-2.5 transition-colors">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Shift Status Board</h1>
          {board && <p className="text-white/50 text-xs">{board.branchName}</p>}
        </div>
        <button onClick={() => { setLoading(true); load(); }}
          className="ml-auto bg-white/10 hover:bg-white/20 rounded-xl p-2.5 transition-colors"
          title="Refresh">
          <RotateCcw size={16} className="text-white/70" />
        </button>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-4 overflow-y-auto">
        {loading && !board && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader size={28} className="text-white/40 animate-spin" />
            <p className="text-white/40 text-sm">Loading shift status…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-4 text-center">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {board && (
          <>
            {/* ── Counters ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-2xl p-4 text-center">
                <p className="text-emerald-300 text-3xl font-bold">{board.activeCount}</p>
                <p className="text-emerald-200/70 text-xs mt-1 font-medium">Active on Duty</p>
              </div>
              <div className="bg-amber-500/20 border border-amber-500/30 rounded-2xl p-4 text-center">
                <p className="text-amber-300 text-3xl font-bold">{board.onBreakCount}</p>
                <p className="text-amber-200/70 text-xs mt-1 font-medium">On Break</p>
              </div>
            </div>

            {/* ── Break Availability ───────────────────────────────────────── */}
            <div className={`rounded-2xl p-4 border text-center ${
              board.breakAvailable
                ? 'bg-emerald-500/15 border-emerald-500/30'
                : 'bg-red-500/15 border-red-500/30'
            }`}>
              <p className="text-2xl mb-1">{board.breakAvailable ? '🟢' : '🔴'}</p>
              <p className={`font-bold text-base ${board.breakAvailable ? 'text-emerald-300' : 'text-red-300'}`}>
                {board.breakAvailable ? 'Break Available' : 'Break Not Available'}
              </p>
              {!board.breakAvailable && board.minActiveWorkers > 0 && (
                <p className="text-red-200/60 text-xs mt-1 leading-snug">
                  Minimum {board.minActiveWorkers} active worker{board.minActiveWorkers !== 1 ? 's' : ''} must remain on duty
                </p>
              )}
              {board.breakAvailable && board.minActiveWorkers > 0 && (
                <p className="text-emerald-200/50 text-xs mt-1">
                  Min. {board.minActiveWorkers} required · {board.activeCount} currently active
                </p>
              )}
            </div>

            {/* ── Active Workers ───────────────────────────────────────────── */}
            <div>
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
                ✅ Active Workers ({active.length})
              </p>
              {active.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-3">No active workers right now</p>
              ) : (
                <div className="space-y-2">
                  {active.map(w => (
                    <div key={w.id}
                      className="flex items-center gap-3 bg-white/8 border border-emerald-500/20 rounded-xl px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-300 font-bold text-sm shrink-0">
                        {(w.name || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">{w.name}</p>
                        <p className="text-white/40 text-xs">{w.role}</p>
                      </div>
                      <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                        ACTIVE
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── On Break ─────────────────────────────────────────────────── */}
            <div>
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
                ☕ On Break ({onBreak.length})
              </p>
              {onBreak.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-3">No workers on break</p>
              ) : (
                <div className="space-y-2">
                  {onBreak.map(w => (
                    <div key={w.id}
                      className="flex items-center gap-3 bg-white/8 border border-amber-500/20 rounded-xl px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-300 font-bold text-sm shrink-0">
                        {(w.name || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">{w.name}</p>
                        <p className="text-white/40 text-xs">{w.role}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full block mb-0.5">
                          ON BREAK
                        </span>
                        {w.breakLabel && (
                          <p className="text-white/30 text-[10px]">{w.breakLabel}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-white/20 text-xs text-center pt-2">
              Auto-refreshes every 30 seconds
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── WorkerPortal — main ────────────────────────────────────────────────────────
export default function WorkerPortal() {
  const [step,    setStep   ] = useState('pin');
  const [session, setSession] = useState(null);
  const [pin,     setPin    ] = useState('');
  const [pinErr,  setPinErr ] = useState('');
  const [pinLoad, setPinLoad] = useState(false);

  const deviceToken = localStorage.getItem(TOKEN_KEY) || '';

  const handlePinSubmit = async (p) => {
    if ((p || pin).length !== 4) return;
    const code = p || pin;
    setPinLoad(true); setPinErr('');
    try {
      const { data } = await axios.post(`${BASE}/worker/auth`, {
        pin: code,
        deviceToken: deviceToken || undefined,
      });
      setSession({ ...data.data, pin: code });
      setPin('');
      setStep('menu');
    } catch (err) {
      setPinErr(err.response?.data?.message || 'Invalid PIN');
    } finally { setPinLoad(false); }
  };

  const signOut = () => {
    setSession(null); setPin(''); setPinErr(''); setStep('pin');
  };

  return (
    <Shell session={session} onSignOut={signOut}>
      {/* ── PIN entry ──────────────────────────────────────────────────────── */}
      {step === 'pin' && (
        <div className="flex items-center justify-center p-4 min-h-[calc(100vh-120px)]">
          <div className="w-full max-w-sm">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="bg-white/20 rounded-xl p-2.5">
                <Leaf size={24} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-xl leading-none">FuelStation HR</p>
                <p className="text-brand-300 text-sm">Worker Portal</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-2xl p-6">
              <PinPad pin={pin} onChange={setPin} onSubmit={handlePinSubmit}
                loading={pinLoad} error={pinErr}
                label="Enter your PIN" sublabel="4-digit PIN to access your portal" />
            </div>
          </div>
        </div>
      )}

      {/* ── Menu ───────────────────────────────────────────────────────────── */}
      {step === 'menu' && session && (
        <MenuView session={session} onNavigate={setStep} />
      )}

      {/* ── Terminal ───────────────────────────────────────────────────────── */}
      {step === 'terminal' && session && (
        <TerminalView
          session={session}
          onBack={() => setStep('menu')}
          onClockSuccess={(workerId, clockType) => {
            // Update todayStatus if self was clocked
            if (String(workerId) === String(session.worker._id)) {
              setSession(s => ({
                ...s,
                todayStatus: {
                  ...s.todayStatus,
                  [clockType === 'clock_in' ? 'clockedIn'   : 'clockedOut'  ]: true,
                  [clockType === 'clock_in' ? 'clockInTime' : 'clockOutTime']: new Date(),
                },
              }));
            }
            setStep('menu');
          }}
        />
      )}

      {/* ── Offence ────────────────────────────────────────────────────────── */}
      {step === 'offence' && session && (
        <OffenceView session={session} onBack={() => setStep('menu')} />
      )}

      {/* ── Breaks ─────────────────────────────────────────────────────────── */}
      {step === 'break' && session && (
        <BreakView session={session} onBack={() => setStep('menu')} />
      )}

      {/* ── Shortage ───────────────────────────────────────────────────────── */}
      {step === 'shortage' && session && (
        <ShortageView session={session} onBack={() => setStep('menu')} onSuccess={() => setStep('menu')} />
      )}

      {/* ── Dashboard ──────────────────────────────────────────────────────── */}
      {step === 'dashboard' && session && (
        <DashboardView session={session} onBack={() => setStep('menu')} />
      )}

      {/* ── Change PIN ─────────────────────────────────────────────────────── */}
      {step === 'change_pin' && session && (
        <ChangePinView
          session={session}
          onBack={() => setStep('menu')}
          onSuccess={(newPin) => {
            setSession(s => ({ ...s, pin: newPin }));
            setStep('menu');
          }}
        />
      )}

      {/* ── Shift Board ────────────────────────────────────────────────────── */}
      {step === 'shift_board' && session && (
        <ShiftBoardView session={session} onBack={() => setStep('menu')} />
      )}
    </Shell>
  );
}
