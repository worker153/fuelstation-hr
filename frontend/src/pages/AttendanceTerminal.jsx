/**
 * AttendanceTerminal — Branch kiosk for worker clock-in / clock-out.
 *
 * FLOW:
 *   Device setup  →  PIN entry  →  [First time] Face Registration
 *                               →  [Returning]  Live Face Verification
 *                               →  Clock In / Out choice  →  Success
 *
 * Face matching uses face-api.js (client-side, no external API).
 * - First login: capture face, extract descriptor, save to server.
 * - Every login after: compare live feed against stored descriptor.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import axios from 'axios';
import {
  Leaf, Building2, LogIn, LogOut, Loader, RefreshCw,
  AlertTriangle, MapPin, Smartphone, ShieldAlert, RotateCcw,
  CheckCircle, XCircle, UserCircle2, Camera, ShieldCheck,
  Eye, Delete, Shield, Coffee, Clock, AlertCircle,
} from 'lucide-react';
import PWAInstallBanner from '../components/PWAInstallBanner';

const BASE      = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'attendance_device_token';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';

// Match threshold — euclidean distance (lower = stricter)
// face-api default is 0.6; we use 0.50 for higher security
const VERIFY_THRESHOLD  = 0.50;
// Require this many consecutive matched frames before auto-capture
const STABLE_FRAMES     = 4;

// ── Stable device fingerprint ─────────────────────────────────────────────────
function getFingerprint() {
  const raw = [navigator.userAgent, navigator.language,
    `${screen.width}x${screen.height}`, navigator.hardwareConcurrency || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = Math.imul(31, h) + raw.charCodeAt(i) | 0;
  return Math.abs(h).toString(16).padStart(8, '0');
}

// ── Shared clock display ──────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

// ── Shell wrapper ─────────────────────────────────────────────────────────────
function Shell({ deviceInfo, children }) {
  const now = useClock();
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex flex-col select-none">
      <PWAInstallBanner manifest="/terminal-manifest.json" />
      <div className="flex items-center justify-between px-5 py-3 bg-black/20 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Leaf size={18} className="text-white" />
          <span className="text-white font-bold text-sm">FuelStation HR</span>
          {deviceInfo && <span className="text-brand-300 text-xs hidden sm:inline">· {deviceInfo.branchName}</span>}
        </div>
        <span className="text-white/60 text-sm font-mono">
          {now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      {deviceInfo && (
        <p className="text-center text-white/20 text-xs pb-2">
          {deviceInfo.name} · {deviceInfo.branchName}
          {deviceInfo.branchGPS && <> · <MapPin size={9} className="inline" /> GPS</>}
        </p>
      )}
    </div>
  );
}

// ── Device Setup ──────────────────────────────────────────────────────────────
function SetupScreen({ onSetup }) {
  const [code,    setCode   ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState('');

  const submit = async e => {
    e.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-character code');
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${BASE}/devices/terminal/register`, {
        registrationCode: code.toUpperCase(), deviceId: getFingerprint(),
      });
      localStorage.setItem(TOKEN_KEY, data.data.deviceToken);
      onSetup(data.data.deviceToken);
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Shell>
      <div className="space-y-5">
        <div className="text-center">
          <div className="bg-white/10 rounded-2xl p-4 inline-flex mb-3"><Smartphone size={32} className="text-white" /></div>
          <p className="text-white font-bold text-2xl">Device Setup</p>
          <p className="text-white/50 text-sm mt-1">Enter the registration code from your admin dashboard</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <form onSubmit={submit} className="space-y-4">
            <input
              className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-3xl tracking-[0.8rem] font-bold uppercase focus:outline-none focus:border-brand-500"
              placeholder="XXXXXX" maxLength={6} value={code} autoFocus
              onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError(''); }}
            />
            {error && <p className="text-red-600 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading || code.length !== 6}
              className="w-full py-3.5 rounded-xl bg-brand-600 text-white font-bold text-base hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader size={18} className="animate-spin" /> : 'Connect Device'}
            </button>
          </form>
        </div>
      </div>
    </Shell>
  );
}

// ── ATM-style PIN Pad ─────────────────────────────────────────────────────────
function PinPad({ onComplete, loading, error, onClearError }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  // Shake dots on error
  useEffect(() => {
    if (error) {
      setShake(true);
      setPin('');
      const t = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(t);
    }
  }, [error]);

  const press = (d) => {
    onClearError();
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      // Small delay so 4th dot fills before submit
      setTimeout(() => { onComplete(next); setPin(''); }, 150);
    }
  };

  const del = () => { onClearError(); setPin(p => p.slice(0, -1)); };

  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],[null,'0','del']];
  const SUB  = {'2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ','0':'+'};

  return (
    <div className="space-y-5">
      {/* Dot indicators */}
      <div className={`flex justify-center gap-5 ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
            pin.length > i ? 'bg-white border-white scale-110' : 'bg-transparent border-white/40'
          }`} />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-red-300 text-sm text-center bg-red-900/40 border border-red-700 px-3 py-2 rounded-xl">
          {error}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-white/60">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Verifying PIN…</span>
        </div>
      )}

      {/* Keypad */}
      {!loading && (
        <div className="space-y-3">
          {KEYS.map((row, ri) => (
            <div key={ri} className="grid grid-cols-3 gap-3">
              {row.map((key, ki) => {
                if (key === null) return <div key={ki} />;
                if (key === 'del') return (
                  <button key={ki} onClick={del} disabled={!pin.length}
                    className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 flex items-center justify-center transition-all disabled:opacity-30">
                    <Delete size={22} className="text-white" />
                  </button>
                );
                return (
                  <button key={ki} onClick={() => press(key)}
                    disabled={pin.length >= 4}
                    className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 active:scale-95 border border-white/20 flex flex-col items-center justify-center transition-all disabled:opacity-50">
                    <span className="text-white text-2xl font-bold leading-none">{key}</span>
                    {SUB[key] && <span className="text-white/40 text-[9px] leading-none mt-0.5">{SUB[key]}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Face Camera hook ──────────────────────────────────────────────────────────
function useFaceCamera() {
  // videoNodeRef holds the actual DOM element (used by detection loops)
  const videoNodeRef = useRef(null);
  const overlayRef   = useRef(null);
  const captureRef   = useRef(null);
  const streamRef    = useRef(null);
  const loopRef      = useRef(null);

  // Callback ref — React calls this synchronously when <video> mounts/unmounts.
  // This guarantees the stream is attached the instant the element enters the DOM.
  const videoRef = useCallback(node => {
    videoNodeRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  const startCamera = useCallback(async () => {
    // Try front-facing first, fall back to any camera, then bare true
    const attempts = [
      { video: { facingMode: 'user' } },
      { video: { facingMode: { ideal: 'user' } } },
      { video: true },
    ];
    let stream = null;
    let lastErr = '';
    for (const constraints of attempts) {
      try { stream = await navigator.mediaDevices.getUserMedia(constraints); break; }
      catch (e) { lastErr = e?.name || 'Unknown'; }
    }
    if (!stream) return { ok: false, error: lastErr };

    streamRef.current = stream;
    // If <video> is already in the DOM, attach immediately
    if (videoNodeRef.current) {
      videoNodeRef.current.srcObject = stream;
      await videoNodeRef.current.play().catch(() => {});
    }
    // If not yet mounted, the callback ref above will attach on mount
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

// ── Model loader (singleton — loads once) ─────────────────────────────────────
let modelsLoaded = false;
async function loadModels(onProgress) {
  if (modelsLoaded) return;
  onProgress(10);
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  onProgress(45);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  onProgress(80);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  onProgress(100);
  modelsLoaded = true;
}

// ── Face REGISTER step (first time only) ──────────────────────────────────────
function FaceRegister({ worker, token, onDone, onBack }) {
  const { videoRef, videoNodeRef, overlayRef, captureRef, loopRef, startCamera, stopCamera, captureFrame } = useFaceCamera();
  const [stage,    setStage   ] = useState('loading');  // loading | scanning | captured | saving | error
  const [progress, setProgress] = useState(0);
  const [faceOk,   setFaceOk  ] = useState(false);
  const [error,    setError   ] = useState('');
  const capturedDesc = useRef(null);
  const stableRef    = useRef(0);

  // Load models + start camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels(p => { if (!cancelled) setProgress(p); });
        const result = await startCamera();
        if (!cancelled) {
          if (result.ok) setStage('scanning');
          else { setError(result.error === 'NotAllowedError' ? 'Camera permission denied — allow camera in your browser settings' : `Camera unavailable (${result.error})`); setStage('error'); }
        }
      } catch (e) { if (!cancelled) { setError(String(e)); setStage('error'); } }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [startCamera, stopCamera]);

  // Detection loop — wait for clear face before capturing
  useEffect(() => {
    if (stage !== 'scanning') return;

    const loop = async () => {
      const video   = videoNodeRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) { loopRef.current = requestAnimationFrame(loop); return; }

      try {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        overlay.width  = video.videoWidth;
        overlay.height = video.videoHeight;

        if (det) {
          stableRef.current++;
          setFaceOk(true);

          // Draw green box
          const b = det.detection.box;
          ctx.strokeStyle = stableRef.current >= STABLE_FRAMES ? '#22c55e' : '#f59e0b';
          ctx.lineWidth   = 3;
          ctx.strokeRect(b.x, b.y, b.width, b.height);

          if (stableRef.current >= STABLE_FRAMES) {
            capturedDesc.current = Array.from(det.descriptor);
            stopCamera();
            setStage('captured');
            return;
          }
        } else {
          stableRef.current = 0;
          setFaceOk(false);
        }
      } catch { /* skip frame */ }

      loopRef.current = requestAnimationFrame(loop);
    };

    loopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRef.current);
  }, [stage, stopCamera]);

  // Save descriptor to server
  const save = async () => {
    setStage('saving');
    try {
      await axios.post(`${BASE}/devices/terminal/register-face`, {
        token,
        workerId:       worker._id,
        faceDescriptor: capturedDesc.current,
      });
      const selfieB64 = captureFrame();
      onDone(capturedDesc.current, selfieB64);
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
      setStage('error');
    }
  };

  const retake = async () => {
    capturedDesc.current = null; stableRef.current = 0;
    setFaceOk(false); setError('');
    const result = await startCamera();
    if (result.ok) setStage('scanning');
    else { setError('Camera unavailable — try again'); setStage('error'); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-blue-900/50 border border-blue-600 rounded-2xl px-4 py-3 text-center">
        <p className="text-blue-200 font-bold text-sm">👤 First-Time Face Registration</p>
        <p className="text-blue-300/70 text-xs mt-0.5">Your face will be saved for future logins</p>
      </div>

      {/* Worker */}
      <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 border border-white/20">
        {worker.photo
          ? <img src={worker.photo} className="w-10 h-10 rounded-lg object-cover border-2 border-white/20" alt="" />
          : <div className="w-10 h-10 rounded-lg bg-white/20 text-white flex items-center justify-center font-bold">{worker.fullName[0]}</div>
        }
        <div>
          <p className="text-white font-semibold">{worker.fullName}</p>
          <p className="text-white/50 text-xs">{worker.role}</p>
        </div>
      </div>

      {/* Model loading */}
      {stage === 'loading' && (
        <div className="text-center py-6 space-y-3">
          <Eye size={32} className="text-white/50 mx-auto" />
          <p className="text-white/60 text-sm">Loading face recognition…</p>
          <div className="w-full bg-white/10 rounded-full h-2 max-w-xs mx-auto">
            <div className="bg-brand-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Camera */}
      {(stage === 'scanning' || stage === 'captured') && (
        <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '1/1' }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full scale-x-[-1]" style={{ pointerEvents: 'none' }} />
          <canvas ref={captureRef} className="hidden" />

          {/* Face guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-44 h-44 rounded-full border-4 border-dashed transition-colors duration-300 ${
              stage === 'captured' ? 'border-green-400' : faceOk ? 'border-amber-400' : 'border-white/30'
            }`} />
          </div>

          {/* Status overlay */}
          <div className="absolute bottom-3 left-3 right-3">
            <div className={`rounded-xl px-3 py-2 text-center text-sm font-medium ${
              stage === 'captured' ? 'bg-green-900/80 text-green-300 border border-green-600'
              : faceOk ? 'bg-amber-900/80 text-amber-300 border border-amber-600'
              : 'bg-black/60 text-white/50 border border-white/10'
            }`}>
              {stage === 'captured' ? '✓ Face captured — confirm below'
               : faceOk ? 'Hold still…'
               : 'Look directly at the camera'}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {stage === 'error' && (
        <div className="bg-red-900/50 border border-red-700 rounded-2xl p-4 text-center space-y-2">
          <XCircle size={28} className="text-red-400 mx-auto" />
          <p className="text-white text-sm font-semibold">{error || 'Camera not available'}</p>
        </div>
      )}

      {/* Saving */}
      {stage === 'saving' && (
        <div className="text-center py-4 space-y-2">
          <Loader size={28} className="animate-spin text-white/60 mx-auto" />
          <p className="text-white/60 text-sm">Saving face data…</p>
        </div>
      )}

      {/* Actions */}
      {stage === 'captured' && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={retake} className="py-3 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/10 flex items-center justify-center gap-2">
            <RotateCcw size={14} /> Retake
          </button>
          <button onClick={save} className="py-3 rounded-xl bg-green-500 hover:bg-green-400 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg">
            <ShieldCheck size={14} /> Register
          </button>
        </div>
      )}
      {(stage === 'error') && (
        <button onClick={onBack} className="w-full py-2.5 rounded-xl border border-white/20 text-white/60 text-sm hover:bg-white/10">
          ← Back
        </button>
      )}
    </div>
  );
}

// ── Face VERIFY step (returning workers) ──────────────────────────────────────
function FaceVerify({ worker, storedDescriptor, type, onVerified, onBack }) {
  const { videoRef, videoNodeRef, overlayRef, captureRef, loopRef, startCamera, stopCamera } = useFaceCamera();
  const [stage,     setStage    ] = useState('loading');  // loading | scanning | matched | fail
  const [progress,  setProgress ] = useState(0);
  const [liveScore, setLiveScore] = useState(null);
  const [faceFound, setFaceFound] = useState(false);
  const [capturedB64, setCapturedB64] = useState(null);
  const [failMsg,   setFailMsg  ] = useState('');
  const stableRef  = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels(p => { if (!cancelled) setProgress(p); });
        const result = await startCamera();
        if (!cancelled) {
          if (result.ok) setStage('scanning');
          else { setFailMsg(result.error === 'NotAllowedError' ? 'Camera permission denied' : `Camera unavailable (${result.error})`); setStage('fail'); }
        }
      } catch (e) { if (!cancelled) { setFailMsg(String(e)); setStage('fail'); } }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [startCamera, stopCamera]);

  // Convert stored array → Float32Array for faceapi
  const refDesc = useRef(storedDescriptor ? new Float32Array(storedDescriptor) : null);

  useEffect(() => {
    if (stage !== 'scanning' || !refDesc.current) return;

    const loop = async () => {
      const video   = videoNodeRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) { loopRef.current = requestAnimationFrame(loop); return; }

      try {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        overlay.width  = video.videoWidth;
        overlay.height = video.videoHeight;

        if (det) {
          const dist  = faceapi.euclideanDistance(refDesc.current, det.descriptor);
          const score = Math.round(Math.max(0, Math.min(100, (1 - dist) * 145)));
          setLiveScore(score);
          setFaceFound(true);

          const matched = dist < VERIFY_THRESHOLD;
          const color   = matched ? '#22c55e' : dist < 0.62 ? '#f59e0b' : '#ef4444';
          const b       = det.detection.box;
          ctx.strokeStyle = color;
          ctx.lineWidth   = 3;
          ctx.strokeRect(b.x, b.y, b.width, b.height);

          if (matched) {
            stableRef.current++;
            if (stableRef.current >= STABLE_FRAMES) {
              const c = captureRef.current;
              c.width = video.videoWidth; c.height = video.videoHeight;
              c.getContext('2d').drawImage(video, 0, 0);
              const b64 = c.toDataURL('image/jpeg', 0.85);
              setCapturedB64(b64);
              stopCamera();
              setStage('matched');
              return;
            }
          } else {
            stableRef.current = 0;
          }
        } else {
          setFaceFound(false);
          setLiveScore(null);
          stableRef.current = 0;
        }
      } catch { /* skip */ }

      loopRef.current = requestAnimationFrame(loop);
    };

    loopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRef.current);
  }, [stage, stopCamera]);

  const scoreColor = liveScore == null ? 'bg-gray-500'
    : liveScore >= 70 ? 'bg-green-500'
    : liveScore >= 50 ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className="space-y-3">
      {/* Worker card */}
      <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 border border-white/20">
        {worker.photo
          ? <img src={worker.photo} className="w-11 h-11 rounded-lg object-cover border-2 border-white/20" alt="" />
          : <div className="w-11 h-11 rounded-lg bg-white/20 text-white flex items-center justify-center font-bold">{worker.fullName[0]}</div>
        }
        <div>
          <p className="text-white font-semibold">{worker.fullName}</p>
          <p className="text-white/50 text-xs">{worker.role} · {type === 'clock_in' ? '🟢 Clocking IN' : '🔴 Clocking OUT'}</p>
        </div>
      </div>

      {/* Loading */}
      {stage === 'loading' && (
        <div className="text-center py-6 space-y-3">
          <Eye size={28} className="text-white/50 mx-auto" />
          <p className="text-white/60 text-sm">Preparing face scan…</p>
          <div className="w-full bg-white/10 rounded-full h-2 max-w-xs mx-auto">
            <div className="bg-brand-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Camera scanning */}
      {stage === 'scanning' && (
        <>
          {/* Live status bar */}
          <div className={`rounded-xl px-4 py-2.5 text-sm font-medium text-center ${
            liveScore >= 70 ? 'bg-green-900/50 border border-green-600 text-green-300'
            : liveScore >= 50 ? 'bg-amber-900/50 border border-amber-600 text-amber-300'
            : 'bg-white/5 border border-white/10 text-white/40'
          }`}>
            {faceFound
              ? liveScore >= 70 ? <span className="flex items-center justify-center gap-2"><ShieldCheck size={14} /> Match confirmed — hold still</span>
                : liveScore >= 50 ? <span className="flex items-center justify-center gap-2"><AlertTriangle size={14} /> Partial match — hold still</span>
                : 'Face not matching — are you {worker.fullName}?'
              : <span className="flex items-center justify-center gap-2"><UserCircle2 size={14} /> Look directly at the camera</span>
            }
          </div>

          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '1/1' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full scale-x-[-1]" style={{ pointerEvents: 'none' }} />
            <canvas ref={captureRef} className="hidden" />

            {/* Face guide circle */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-44 h-44 rounded-full border-4 border-dashed transition-colors duration-300 ${
                liveScore >= 70 ? 'border-green-400' : liveScore >= 50 ? 'border-amber-400' : 'border-white/30'
              }`} />
            </div>

            {/* Score bar */}
            {liveScore != null && (
              <div className="absolute bottom-3 left-3 right-3">
                <div className="bg-black/70 rounded-xl p-2">
                  <div className="flex justify-between text-xs text-white/70 mb-1">
                    <span>Face Match</span>
                    <span className={liveScore >= 70 ? 'text-green-400 font-bold' : liveScore >= 50 ? 'text-amber-400' : 'text-red-400'}>
                      {liveScore}%
                    </span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all duration-200 ${scoreColor}`} style={{ width: `${liveScore}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-white/30 text-xs">
            Auto-captures when identity is confirmed ({Math.round(VERIFY_THRESHOLD * 100)}%+ required)
          </p>
        </>
      )}

      {/* Matched */}
      {stage === 'matched' && (
        <div className="space-y-3">
          <div className="bg-green-900/60 border border-green-500 rounded-2xl p-4 text-center space-y-2">
            <ShieldCheck size={32} className="text-green-400 mx-auto" />
            <p className="text-green-300 font-bold text-lg">Identity Confirmed</p>
            <p className="text-green-400/70 text-sm">{liveScore}% face match</p>
          </div>
          {capturedB64 && (
            <img src={capturedB64} alt="Selfie"
              className="w-20 h-20 rounded-xl object-cover mx-auto border-4 border-green-500 scale-x-[-1]" />
          )}
          <button onClick={() => onVerified(capturedB64, liveScore)}
            className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-xl flex items-center justify-center gap-3 ${
              type === 'clock_in' ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500 hover:bg-red-400'
            }`}>
            {type === 'clock_in' ? <LogIn size={22} /> : <LogOut size={22} />}
            {type === 'clock_in' ? 'Clock In' : 'Clock Out'}
          </button>
        </div>
      )}

      {/* Fail */}
      {stage === 'fail' && (
        <div className="bg-red-900/50 border border-red-700 rounded-2xl p-4 text-center space-y-3">
          <XCircle size={28} className="text-red-400 mx-auto" />
          <p className="text-white font-semibold">Camera unavailable</p>
          <p className="text-red-300 text-sm">{failMsg || 'Allow camera access and try again'}</p>
          <p className="text-white/40 text-xs">In Chrome: tap the 🔒 lock icon in the address bar → Allow camera</p>
        </div>
      )}

      <button onClick={onBack}
        className="w-full py-2.5 rounded-xl border border-white/20 text-white/50 text-sm hover:bg-white/10 flex items-center justify-center gap-2">
        <RotateCcw size={13} /> Back
      </button>
    </div>
  );
}

// ── Auto-reset countdown ───────────────────────────────────────────────────────
function AutoReset({ onReset, seconds = 8 }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft(v => {
      if (v <= 1) { clearInterval(t); onReset(); return 0; }
      return v - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [onReset]);
  return (
    <div className="space-y-2 mt-2">
      <div className="w-full bg-white/10 rounded-full h-1">
        <div className="bg-white/40 h-1 rounded-full transition-all duration-1000" style={{ width: `${(left / seconds) * 100}%` }} />
      </div>
      <p className="text-white/30 text-xs text-center">Auto-reset in {left}s</p>
      <button onClick={onReset} className="w-full py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20">
        Next Worker →
      </button>
    </div>
  );
}

// ── Break timer (live countdown while on break) ───────────────────────────────
function BreakTimer({ startTime, allowedMinutes }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startTime)) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startTime]);

  const totalSecs    = allowedMinutes * 60;
  const remainSecs   = Math.max(0, totalSecs - elapsed);
  const overSecs     = Math.max(0, elapsed - totalSecs);
  const pct          = Math.min(100, (elapsed / totalSecs) * 100);
  const isOver       = elapsed > totalSecs;

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  return (
    <div className={`rounded-2xl p-4 border-2 ${isOver ? 'border-red-500 bg-red-900/30' : 'border-brand-400 bg-brand-900/30'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/60 text-xs font-medium">Break Timer</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isOver ? 'bg-red-500 text-white' : 'bg-brand-500 text-white'}`}>
          {isOver ? `⚠️ OVER by ${fmt(overSecs)}` : `${fmt(remainSecs)} left`}
        </span>
      </div>
      <div className="w-full bg-white/10 rounded-full h-2 mb-2">
        <div className={`h-2 rounded-full transition-all ${isOver ? 'bg-red-500' : 'bg-brand-400'}`}
          style={{ width: `${pct}%` }} />
      </div>
      <p className="text-white text-center text-2xl font-mono font-bold">{fmt(elapsed)}</p>
      <p className="text-white/40 text-xs text-center mt-0.5">elapsed of {allowedMinutes} min allowed</p>
    </div>
  );
}

// ── Break button ─────────────────────────────────────────────────────────────
function BreakBtn({ type, label, allowedMinutes, inWindow, taken, status, loading, onSelect }) {
  const emoji = { morning: '🌅', afternoon: '☀️', night: '🌙' }[type];
  if (taken && status !== 'missed') {
    const doneCls = status === 'overstayed' ? 'border-red-700 text-red-300 bg-red-900/20' : 'border-green-700 text-green-300 bg-green-900/20';
    return (
      <div className={`flex-1 py-3 px-2 rounded-xl border-2 flex flex-col items-center gap-1 opacity-70 ${doneCls}`}>
        <span className="text-lg">{emoji}</span>
        <p className="text-xs font-semibold text-center leading-tight">{label}</p>
        <p className="text-[10px] opacity-70">{status === 'overstayed' ? '⚠️ Overstayed' : '✓ Done'}</p>
      </div>
    );
  }
  if (!inWindow || !allowedMinutes) {
    return (
      <div className="flex-1 py-3 px-2 rounded-xl border-2 border-white/10 flex flex-col items-center gap-1 opacity-30">
        <span className="text-lg">{emoji}</span>
        <p className="text-xs font-semibold text-white/50 text-center leading-tight">{label}</p>
        <p className="text-[10px] text-white/30">Closed</p>
      </div>
    );
  }
  return (
    <button onClick={() => onSelect(type)} disabled={loading}
      className="flex-1 py-3 px-2 rounded-xl border-2 border-brand-400 bg-brand-500/20 hover:bg-brand-500/30 active:scale-95 flex flex-col items-center gap-1 transition-all disabled:opacity-50">
      <span className="text-lg">{emoji}</span>
      <p className="text-xs font-bold text-white text-center leading-tight">{label}</p>
      <p className="text-[10px] text-brand-300">{allowedMinutes} min</p>
    </button>
  );
}

// ── Main Terminal ─────────────────────────────────────────────────────────────
export default function AttendanceTerminal() {
  const [token,      setToken    ] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('token');
    // If token came from URL, persist it so /worker can also detect approved device
    if (p) localStorage.setItem(TOKEN_KEY, p);
    return p || localStorage.getItem(TOKEN_KEY) || '';
  });
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [devStage,   setDevStage  ] = useState(token ? 'loading' : 'setup');

  // Attendance flow: pin | register | action | verify | submitting | done | fail
  // Break flow: pin → action → break_confirm | break_end → break_done
  const [step,        setStep      ] = useState('pin');
  const [worker,      setWorker    ] = useState(null);
  const [attendType,  setAttendType] = useState('clock_in');
  const [selfieB64,   setSelfieB64 ] = useState(null);
  const [faceScore,   setFaceScore ] = useState(null);
  const [result,      setResult    ] = useState(null);
  const [failMsg,     setFailMsg   ] = useState('');
  const [pinLoading,  setPinLoading] = useState(false);
  const [pinError,    setPinError  ] = useState('');
  const [breakStatus, setBreakStatus] = useState(null);    // from GET /api/breaks/status
  const [breakAction, setBreakAction] = useState(null);    // { type, label, allowedMinutes } for confirm
  const [breakResult, setBreakResult] = useState(null);    // result from start/end
  const [breakLoading,setBreakLoading] = useState(false);

  // Load device info
  const loadDevice = useCallback(async t => {
    try {
      const { data } = await axios.get(`${BASE}/devices/terminal/info`, { params: { token: t } });
      setDeviceInfo(data.data);
      setDevStage(data.data.status === 'approved' ? 'ready' : 'not_approved');
    } catch { setDevStage('error'); }
  }, []);

  useEffect(() => { if (token && devStage === 'loading') loadDevice(token); }, [token, devStage, loadDevice]);
  useEffect(() => {
    if (!token || devStage === 'setup') return;
    const t = setInterval(() => loadDevice(token), 30000);
    return () => clearInterval(t);
  }, [token, devStage, loadDevice]);

  // PIN submitted → fetch worker + break status → go to action panel
  const handlePin = async (pin) => {
    setPinLoading(true); setPinError('');
    try {
      const { data } = await axios.get(`${BASE}/devices/terminal/worker-by-pin`, {
        params: { token, pin }
      });
      const w = data.data;
      setWorker(w);

      // Also load break status
      try {
        const { data: bs } = await axios.get(`${BASE}/breaks/status`, {
          params: { deviceToken: token, workerId: w._id }
        });
        setBreakStatus(bs.data);
      } catch { setBreakStatus(null); }

      // First time → face registration; then straight to action panel
      setStep(w.hasFace ? 'action' : 'register');
    } catch (err) {
      setPinError(err.response?.data?.message || 'Invalid PIN');
    } finally { setPinLoading(false); }
  };

  // Start a break (no face verify needed)
  const handleStartBreak = async (breakType) => {
    const cfg = breakStatus?.availableBreaks?.find(b => b.type === breakType);
    setBreakAction({ type: breakType, label: cfg?.label || breakType, allowedMinutes: cfg?.allowedMinutes });
    setStep('break_confirm');
  };

  const confirmStartBreak = async () => {
    setBreakLoading(true);
    try {
      const { data } = await axios.post(`${BASE}/breaks/start`, {
        deviceToken: token, workerId: worker._id, breakType: breakAction.type,
      });
      setBreakResult({ mode: 'started', ...data.data, message: data.message });
      setStep('break_done');
    } catch (err) {
      setBreakResult({ mode: 'error', message: err.response?.data?.message || 'Failed to start break' });
      setStep('break_done');
    } finally { setBreakLoading(false); }
  };

  const handleEndBreak = async () => {
    setBreakLoading(true);
    try {
      const { data } = await axios.post(`${BASE}/breaks/end`, {
        deviceToken: token, workerId: worker._id,
      });
      setBreakResult({ mode: 'ended', ...data.data });
      setStep('break_done');
    } catch (err) {
      setBreakResult({ mode: 'error', message: err.response?.data?.message || 'Failed to end break' });
      setStep('break_done');
    } finally { setBreakLoading(false); }
  };

  // GPS helper
  const getGPS = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null), { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });

  // Submit attendance
  const submitAttendance = async (b64, score) => {
    setSelfieB64(b64); setFaceScore(score);
    setStep('submitting');
    const gps = await getGPS();
    try {
      const { data } = await axios.post(`${BASE}/attendance/clock`, {
        deviceToken:    token,
        workerId:       worker._id,
        type:           attendType,
        gps,
        selfieBase64:   b64 || undefined,
        faceMatchScore: score,
      });
      setResult(data);
      setStep('done');
    } catch (err) {
      const errData = err.response?.data || {};
      if (errData.alreadyDone) {
        setFailMsg(errData.message);
        setStep('already_done');
      } else {
        setFailMsg(errData.message || 'Submission failed');
        setStep('fail');
      }
    }
  };

  const reset = useCallback(() => {
    setWorker(null); setResult(null); setFailMsg('');
    setSelfieB64(null); setFaceScore(null);
    setAttendType('clock_in'); setPinError('');
    setBreakStatus(null); setBreakAction(null); setBreakResult(null);
    setStep('pin');
  }, []);

  // ── Screens ────────────────────────────────────────────────────────────────
  if (devStage === 'setup') return <SetupScreen onSetup={t => { setToken(t); setDevStage('loading'); }} />;

  if (devStage === 'loading') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="text-center space-y-3">
        <Loader size={40} className="animate-spin text-white/50 mx-auto" />
        <p className="text-white/50">Connecting…</p>
      </div>
    </Shell>
  );

  if (devStage === 'not_approved') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="bg-white rounded-2xl p-6 text-center space-y-3 shadow-2xl">
        <AlertTriangle size={28} className="text-amber-500 mx-auto" />
        <p className="font-bold text-gray-900 text-lg">{deviceInfo?.status === 'blocked' ? 'Device Blocked' : 'Awaiting Approval'}</p>
        <p className="text-gray-500 text-sm">
          {deviceInfo?.status === 'blocked' ? deviceInfo.blockedReason : 'Ask admin to approve this device.'}
        </p>
        <button onClick={() => loadDevice(token)} className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm flex items-center justify-center gap-2">
          <RefreshCw size={14} /> Check Again
        </button>
      </div>
    </Shell>
  );

  if (devStage === 'error') return (
    <Shell>
      <div className="text-center space-y-4">
        <ShieldAlert size={36} className="text-red-400 mx-auto" />
        <p className="text-white font-bold">Device not recognized</p>
        <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(''); setDevStage('setup'); }}
          className="w-full py-2.5 rounded-xl bg-white/10 text-white text-sm">Re-setup Device</button>
      </div>
    </Shell>
  );

  const now = new Date();

  // ─ PIN screen ────────────────────────────────────────────────────────────────
  if (step === 'pin') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="space-y-5">
        <div className="text-center">
          <p className="text-white/50 text-sm">
            {now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-white text-5xl font-bold font-mono tracking-tight mt-1">
            {now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-brand-300 text-sm mt-1 flex items-center justify-center gap-1">
            <Building2 size={12} /> {deviceInfo?.branchName}
          </p>
        </div>

        <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center">
          <Shield size={24} className="text-white/50 mx-auto mb-1.5" />
          <p className="text-white font-semibold">Enter your 4-digit PIN</p>
        </div>

        <PinPad
          onComplete={handlePin}
          loading={pinLoading}
          error={pinError}
          onClearError={() => setPinError('')}
        />
      </div>
    </Shell>
  );

  // ─ First-time face registration ───────────────────────────────────────────────
  if (step === 'register') return (
    <Shell deviceInfo={deviceInfo}>
      <FaceRegister
        worker={worker}
        token={token}
        onDone={(desc, b64) => {
          setWorker(w => ({ ...w, faceDescriptor: desc, hasFace: true }));
          setSelfieB64(b64);
          setStep('action');
        }}
        onBack={reset}
      />
    </Shell>
  );

  // ─ Action panel — shows worker status + Clock In/Out + Break buttons ──────────
  if (step === 'action') {
    const bs       = breakStatus;
    const status   = bs?.attendanceStatus || 'absent';
    const active   = bs?.activeBreak;
    const avail    = bs?.availableBreaks || [];
    const anyBreakAvail = avail.some(b => b.inWindow && !b.taken);

    const STATUS_LABEL = {
      active:        { text: '🟢 Active — In Shift',         cls: 'bg-green-900/40 border-green-600 text-green-300'  },
      on_break:      { text: '🟡 On Break',                   cls: 'bg-amber-900/40 border-amber-600 text-amber-300'  },
      break_overdue: { text: '🔴 Break Overdue!',             cls: 'bg-red-900/50 border-red-500 text-red-300 animate-pulse' },
      clocked_out:   { text: '⚫ Clocked Out',                cls: 'bg-gray-800 border-gray-600 text-gray-300'        },
      absent:        { text: '⚫ Not Clocked In Today',       cls: 'bg-gray-800 border-gray-600 text-gray-300'        },
    };
    const slabel = STATUS_LABEL[status] || STATUS_LABEL.absent;

    return (
      <Shell deviceInfo={deviceInfo}>
        <div className="space-y-4">
          {/* Worker card */}
          <div className="flex items-center gap-3 bg-white/10 rounded-2xl px-4 py-4 border border-white/20">
            {worker.photo
              ? <img src={worker.photo} className="w-16 h-16 rounded-xl object-cover border-2 border-white/20" alt="" />
              : <div className="w-16 h-16 rounded-xl bg-white/20 text-white flex items-center justify-center text-2xl font-bold">{worker.fullName[0]}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-xl truncate">{worker.fullName}</p>
              <p className="text-white/50 text-sm">{worker.role}</p>
              {!worker.hasFace && (
                <p className="text-green-400 text-xs mt-0.5 flex items-center gap-1"><CheckCircle size={10} /> Face registered!</p>
              )}
            </div>
          </div>

          {/* Status banner */}
          <div className={`rounded-xl px-4 py-2.5 border text-sm font-semibold text-center ${slabel.cls}`}>
            {slabel.text}
          </div>

          {/* Break timer (if on active break) */}
          {(status === 'on_break' || status === 'break_overdue') && active && (
            <BreakTimer startTime={active.startTime} allowedMinutes={active.allowedMinutes} />
          )}

          {/* ── Not clocked in: only Clock In ── */}
          {status === 'absent' && (
            <button onClick={() => { setAttendType('clock_in'); setStep('verify'); }}
              className="w-full flex flex-col items-center gap-3 py-8 rounded-2xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all shadow-xl">
              <LogIn size={36} className="text-white" />
              <div className="text-center">
                <p className="text-white font-bold text-xl">Clock In</p>
                <p className="text-green-100 text-xs">Start of shift</p>
              </div>
            </button>
          )}

          {/* ── Clocked out: info only ── */}
          {status === 'clocked_out' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <p className="text-white/60 text-sm">You have completed your shift for today.</p>
            </div>
          )}

          {/* ── Active / on break / overdue: show all actions ── */}
          {(status === 'active' || status === 'on_break' || status === 'break_overdue') && (
            <>
              {/* Break buttons */}
              {status === 'active' && (
                <div>
                  <p className="text-white/40 text-xs text-center mb-2 font-medium">── BREAKS ──</p>
                  <div className="flex gap-2">
                    {avail.map(b => (
                      <BreakBtn key={b.type}
                        type={b.type} label={b.label}
                        allowedMinutes={b.allowedMinutes}
                        inWindow={b.inWindow} taken={b.taken} status={b.status}
                        loading={breakLoading}
                        onSelect={handleStartBreak}
                      />
                    ))}
                  </div>
                  {!anyBreakAvail && (
                    <p className="text-white/30 text-xs text-center mt-2">No break windows open right now</p>
                  )}
                </div>
              )}

              {/* End Break button */}
              {(status === 'on_break' || status === 'break_overdue') && (
                <button onClick={handleEndBreak} disabled={breakLoading}
                  className={`w-full py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 disabled:opacity-60
                    ${status === 'break_overdue' ? 'bg-red-500 hover:bg-red-400' : 'bg-amber-500 hover:bg-amber-400'}`}>
                  {breakLoading ? <Loader size={24} className="animate-spin" /> : <Coffee size={28} />}
                  End Break
                </button>
              )}

              {/* Clock Out button */}
              {status !== 'on_break' && status !== 'break_overdue' && (
                <button onClick={() => { setAttendType('clock_out'); setStep('verify'); }}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-95 transition-all shadow-xl">
                  <LogOut size={24} className="text-white" />
                  <div className="text-left">
                    <p className="text-white font-bold text-lg">Clock Out</p>
                    <p className="text-red-100 text-xs">End of shift</p>
                  </div>
                </button>
              )}
            </>
          )}

          <button onClick={reset}
            className="w-full py-2.5 rounded-xl border border-white/20 text-white/50 text-sm hover:bg-white/10 flex items-center justify-center gap-2">
            <RotateCcw size={13} /> Not you?
          </button>
        </div>
      </Shell>
    );
  }

  // ─ Break confirm ──────────────────────────────────────────────────────────────
  if (step === 'break_confirm') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="space-y-5 text-center">
        <div className="bg-brand-900/50 border border-brand-500 rounded-2xl p-5">
          <Coffee size={40} className="text-brand-300 mx-auto mb-3" />
          <p className="text-white font-bold text-xl">{breakAction?.label}</p>
          <p className="text-brand-300 text-lg font-semibold mt-1">{breakAction?.allowedMinutes} minutes</p>
          <p className="text-white/40 text-sm mt-2">Make sure to return before your time runs out!</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setStep('action')}
            className="py-3.5 rounded-xl border border-white/20 text-white/60 text-sm font-medium hover:bg-white/10 flex items-center justify-center gap-2">
            <RotateCcw size={14} /> Back
          </button>
          <button onClick={confirmStartBreak} disabled={breakLoading}
            className="py-3.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-base flex items-center justify-center gap-2 shadow-xl disabled:opacity-60">
            {breakLoading ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            Start Break
          </button>
        </div>
      </div>
    </Shell>
  );

  // ─ Break done (start or end result) ──────────────────────────────────────────
  if (step === 'break_done') {
    const br = breakResult || {};
    const isError     = br.mode === 'error';
    const isEnded     = br.mode === 'ended';
    const isOverstayed = isEnded && br.overstayed;

    return (
      <Shell deviceInfo={deviceInfo}>
        <div className="space-y-4 text-center">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-2xl ${
            isError ? 'bg-red-900/50 border border-red-700' :
            isOverstayed ? 'bg-red-500' :
            isEnded ? 'bg-green-500' : 'bg-brand-500'
          }`}>
            {isError      ? <XCircle size={40} className="text-red-400" /> :
             isOverstayed ? <AlertCircle size={40} className="text-white" /> :
             isEnded      ? <CheckCircle size={40} className="text-white" /> :
                            <Coffee size={40} className="text-white" />}
          </div>

          <div>
            <p className="text-white text-2xl font-bold">
              {isError ? 'Error' :
               isOverstayed ? 'Break Ended — Overstayed!' :
               isEnded ? 'Break Ended' : 'Break Started!'}
            </p>
            <p className={`text-sm mt-1 ${isError ? 'text-red-400' : isOverstayed ? 'text-red-300' : 'text-white/50'}`}>
              {isError ? br.message :
               isEnded ? `${br.actualMinutes ?? 0} min taken · ${br.allowedMinutes} min allowed` :
               br.message || ''}
            </p>
          </div>

          {isOverstayed && (
            <div className="bg-red-900/40 border border-red-700 rounded-2xl px-4 py-3">
              <p className="text-red-300 font-semibold text-sm">⚠️ {br.excessMinutes} minute(s) over limit</p>
              <p className="text-red-400/70 text-xs mt-0.5">Your supervisor has been notified</p>
            </div>
          )}

          {!isError && isEnded && !isOverstayed && (
            <div className="bg-green-900/30 border border-green-700 rounded-2xl px-4 py-3">
              <p className="text-green-300 text-sm font-medium">✅ Back to work — good job!</p>
            </div>
          )}

          <AutoReset onReset={reset} seconds={8} />
        </div>
      </Shell>
    );
  }

  // ─ Face verification ──────────────────────────────────────────────────────────
  if (step === 'verify') return (
    <Shell deviceInfo={deviceInfo}>
      <FaceVerify
        worker={worker}
        storedDescriptor={worker.faceDescriptor}
        type={attendType}
        onVerified={(b64, score) => submitAttendance(b64, score)}
        onBack={() => setStep('action')}
      />
    </Shell>
  );

  // ─ Submitting ────────────────────────────────────────────────────────────────
  if (step === 'submitting') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="text-center space-y-4">
        <Loader size={48} className="animate-spin text-white/50 mx-auto" />
        <p className="text-white font-semibold text-lg">Saving attendance…</p>
        <p className="text-white/40 text-sm">Verifying GPS · Uploading selfie</p>
      </div>
    </Shell>
  );

  // ─ Already Done ───────────────────────────────────────────────────────────────
  if (step === 'already_done') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="space-y-5 text-center">
        <div className="w-20 h-20 bg-amber-500/20 border-2 border-amber-400 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-4xl">✅</span>
        </div>
        <div>
          <p className="text-white font-bold text-2xl mb-1">Already Recorded</p>
          <p className="text-amber-300 font-medium">{worker?.fullName}</p>
        </div>
        <p className="text-amber-200 bg-amber-900/30 border border-amber-700 px-5 py-3 rounded-2xl text-sm leading-relaxed">
          {failMsg}
        </p>
        <p className="text-white/40 text-xs">You can only {attendType === 'clock_in' ? 'clock in' : 'clock out'} once per day</p>
        <button onClick={reset} className="w-full py-3 rounded-xl bg-white/10 border border-white/20 text-white font-medium hover:bg-white/20">
          ← Back
        </button>
      </div>
    </Shell>
  );

  // ─ Fail ───────────────────────────────────────────────────────────────────────
  if (step === 'fail') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 bg-red-900/50 border border-red-700 rounded-2xl flex items-center justify-center mx-auto">
          <XCircle size={32} className="text-red-400" />
        </div>
        <p className="text-white font-bold text-xl">Failed</p>
        <p className="text-red-300 bg-red-900/40 border border-red-800 px-4 py-3 rounded-xl text-sm">{failMsg}</p>
        <button onClick={reset} className="w-full py-3 rounded-xl bg-white/10 border border-white/20 text-white font-medium hover:bg-white/20">
          Try Again
        </button>
      </div>
    </Shell>
  );

  // ─ Success ────────────────────────────────────────────────────────────────────
  if (step === 'done' && result) return (
    <Shell deviceInfo={deviceInfo}>
      <div className="space-y-4 text-center">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-2xl ${
          attendType === 'clock_in' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {attendType === 'clock_in' ? <LogIn size={40} className="text-white" /> : <LogOut size={40} className="text-white" />}
        </div>

        <div>
          <p className="text-white text-3xl font-bold">{attendType === 'clock_in' ? 'Clocked In!' : 'Clocked Out!'}</p>
          <p className="text-white/50 mt-1">
            {new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        <div className="bg-white/10 rounded-2xl p-4 border border-white/20 text-left space-y-2">
          {result.data?.selfieUrl && (
            <img src={result.data.selfieUrl} className="w-16 h-16 rounded-xl object-cover mx-auto border-4 border-green-500 mb-3 scale-x-[-1]" alt="" />
          )}
          {[
            ['Worker',  result.data?.workerName],
            ['Branch',  deviceInfo?.branchName],
            ['GPS',     result.data?.gpsVerified ? '✅ Verified' : '⚠️ Unverified'],
            ['Face',    `✅ ${faceScore}% match`],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between text-sm">
              <span className="text-white/40">{l}</span>
              <span className="text-white font-medium">{v}</span>
            </div>
          ))}
          {result.data?.pumpAssignment && <>
            <div className="border-t border-white/10 my-2" />
            <div className="text-center">
              <p className="text-white/40 text-xs mb-1">Today's Pump Assignment</p>
              {result.data.pumpAssignment.islandName && (
                <p className="text-white/60 text-sm mb-0.5">{result.data.pumpAssignment.islandName}</p>
              )}
              <p className="text-white text-2xl font-black">
                {result.data.pumpAssignment.pumpName || result.data.pumpAssignment.islandName}
              </p>
              <p className={`text-sm font-semibold mt-0.5 ${
                result.data.pumpAssignment.productType === 'PMS' ? 'text-green-300' :
                result.data.pumpAssignment.productType === 'AGO' ? 'text-amber-300' : 'text-blue-300'
              }`}>{result.data.pumpAssignment.productType}</p>
              {result.data.pumpAssignment.openingMeter != null ? (
                <div className="mt-3 bg-white/10 rounded-xl px-4 py-2">
                  <p className="text-white/50 text-xs">Opening Meter</p>
                  <p className="text-white text-2xl font-black tracking-tight">
                    {Number(result.data.pumpAssignment.openingMeter).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-white/40 text-xs">litres</p>
                </div>
              ) : (
                <p className="text-white/30 text-xs mt-2">Opening meter not yet recorded in StationDesk</p>
              )}
              {result.data.pumpAssignment.isOverride && <p className="text-white/40 text-xs mt-1">⚡ Override assignment</p>}
            </div>
          </>}

          {result.data?.meterReadout && <>
            <div className="border-t border-white/10 my-2" />
            <div className="text-center">
              <p className="text-white/40 text-xs mb-1">{result.data.meterReadout.pumpName}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-white/10 rounded-xl px-3 py-2">
                  <p className="text-white/50 text-xs">Opening</p>
                  <p className="text-white text-lg font-bold">
                    {result.data.meterReadout.openingMeter != null
                      ? Number(result.data.meterReadout.openingMeter).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : '—'}
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl px-3 py-2">
                  <p className="text-white/50 text-xs">Closing</p>
                  <p className="text-white text-lg font-bold">
                    {result.data.meterReadout.closingMeter != null
                      ? Number(result.data.meterReadout.closingMeter).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : '—'}
                  </p>
                </div>
              </div>
              {result.data.meterReadout.litresSold != null && (
                <div className="mt-2 bg-green-500/20 rounded-xl px-4 py-2">
                  <p className="text-green-300 text-xs">Total Litres Sold</p>
                  <p className="text-white text-3xl font-black">
                    {Number(result.data.meterReadout.litresSold).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-base font-normal text-white/60 ml-1">L</span>
                  </p>
                  {!result.data.meterReadout.isFinal && (
                    <p className="text-white/40 text-[10px] mt-0.5">⏳ Provisional — pending owner review</p>
                  )}
                </div>
              )}
              {result.data.meterReadout.closingMeter == null && (
                <p className="text-white/30 text-xs mt-2">Closing meter not yet recorded in StationDesk</p>
              )}
            </div>
          </>}
        </div>

        <AutoReset onReset={reset} seconds={8} />
      </div>
    </Shell>
  );

  return null;
}
