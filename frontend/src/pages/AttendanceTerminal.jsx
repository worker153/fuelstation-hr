/**
 * AttendanceTerminal — Branch kiosk for worker clock-in / clock-out.
 * Uses live face-api.js verification: compares live camera feed against
 * worker's stored passport photo in real time.
 *
 * URL:  /terminal?token=DEVICE_TOKEN
 *       /terminal                       (shows setup screen)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import axios from 'axios';
import {
  Leaf, Wifi, Building2, LogIn, LogOut, Loader,
  Search, ChevronRight, RefreshCw, AlertTriangle, MapPin,
  Smartphone, ShieldAlert, RotateCcw, X, CheckCircle,
  XCircle, UserCircle2, Camera, ShieldCheck, Eye
} from 'lucide-react';

const BASE        = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY   = 'attendance_device_token';
const MODEL_URL   = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';
const THRESHOLD   = 0.52;   // euclidean distance — lower = stricter
const WARN_THRESH = 0.60;   // yellow zone

// ── Stable device fingerprint ─────────────────────────────────────────────────
function getFingerprint() {
  const raw = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    navigator.hardwareConcurrency || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = Math.imul(31, h) + raw.charCodeAt(i) | 0;
  return Math.abs(h).toString(16).padStart(8, '0');
}

// ── Shell wrapper (header + clock) ────────────────────────────────────────────
function Shell({ deviceInfo, children }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 bg-brand-900/50 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Leaf size={18} className="text-white" />
          <span className="text-white font-bold text-sm">FuelStation HR</span>
          {deviceInfo && <span className="text-brand-300 text-xs hidden sm:inline">· {deviceInfo.branchName}</span>}
        </div>
        <span className="text-white/70 text-sm font-mono">
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
    if (code.length !== 6) return setError('Enter the 6-character registration code');
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${BASE}/devices/terminal/register`, {
        registrationCode: code.trim().toUpperCase(),
        deviceId:         getFingerprint(),
      });
      localStorage.setItem(TOKEN_KEY, data.data.deviceToken);
      onSetup(data.data.deviceToken);
    } catch (err) { setError(err.response?.data?.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  return (
    <Shell>
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="text-center">
          <div className="bg-white/20 rounded-2xl p-4 inline-flex mb-3"><Smartphone size={32} className="text-white" /></div>
          <p className="text-white font-bold text-2xl">Device Setup</p>
          <p className="text-brand-300 text-sm mt-1">Enter the registration code from the admin dashboard</p>
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

// ── Worker Search ──────────────────────────────────────────────────────────────
function WorkerSearch({ token, onSelect }) {
  const [q,       setQ      ] = useState('');
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  const search = useCallback(async (val) => {
    if (!val || val.length < 2) { setWorkers([]); return; }
    setLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/devices/terminal/workers`, { params: { token, q: val } });
      setWorkers(data.data);
    } catch { setWorkers([]); }
    finally { setLoading(false); }
  }, [token]);

  const handleChange = e => {
    const v = e.target.value; setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 350);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
        {loading && <Loader size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 animate-spin" />}
        <input
          className="w-full pl-11 pr-10 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 text-lg"
          placeholder="Type your name…" value={q} onChange={handleChange} autoFocus
        />
      </div>
      {workers.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {workers.map(w => (
            <button key={w._id} onClick={() => onSelect(w)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-left transition-all active:scale-98">
              {w.photo
                ? <img src={w.photo} className="w-12 h-12 rounded-xl object-cover shrink-0 border-2 border-white/20" alt="" />
                : <div className="w-12 h-12 rounded-xl bg-white/20 text-white flex items-center justify-center text-xl font-bold shrink-0">{w.fullName[0]}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate text-base">{w.fullName}</p>
                <p className="text-white/50 text-sm">{w.role}</p>
              </div>
              <ChevronRight size={18} className="text-white/30 shrink-0" />
            </button>
          ))}
        </div>
      )}
      {q.length >= 2 && !loading && workers.length === 0 && (
        <p className="text-white/40 text-sm text-center py-3">No workers found — try again</p>
      )}
    </div>
  );
}

// ── Live Face Verification ─────────────────────────────────────────────────────
function FaceVerify({ worker, type, onVerified, onBack }) {
  const videoRef      = useRef(null);
  const overlayRef    = useRef(null);  // canvas overlay for face box
  const captureRef    = useRef(null);  // off-screen canvas for selfie capture
  const streamRef     = useRef(null);
  const loopRef       = useRef(null);
  const refDescRef    = useRef(null);  // face descriptor from passport photo
  const stableRef     = useRef(0);     // consecutive match frames counter

  const [stage,       setStage      ] = useState('loading_models');
  // 'loading_models' | 'loading_photo' | 'no_photo' | 'camera' | 'matched' | 'cam_error'
  const [progress,    setProgress   ] = useState(0);
  const [liveScore,   setLiveScore  ] = useState(null);  // 0-100
  const [faceFound,   setFaceFound  ] = useState(false);
  const [capturedB64, setCapturedB64] = useState(null);

  // ── 1. Load face-api models ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
          setProgress(10);
          await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
          setProgress(40);
          await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
          setProgress(70);
          await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
          setProgress(100);
        }
        if (!cancelled) setStage(worker.photo ? 'loading_photo' : 'no_photo');
      } catch (e) {
        console.error('Model load error', e);
        if (!cancelled) setStage('no_photo'); // fall back to selfie-only
      }
    })();
    return () => { cancelled = true; };
  }, [worker.photo]);

  // ── 2. Extract descriptor from worker's passport photo ───────────────────────
  useEffect(() => {
    if (stage !== 'loading_photo' || !worker.photo) return;
    let cancelled = false;

    (async () => {
      try {
        // Fetch image via proxy blob to avoid CORS issues
        const blob = await fetch(worker.photo).then(r => r.blob());
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload = async () => {
          try {
            const det = await faceapi
              .detectSingleFace(img)
              .withFaceLandmarks()
              .withFaceDescriptor();
            URL.revokeObjectURL(url);
            if (!cancelled) {
              if (det) {
                refDescRef.current = det.descriptor;
                setStage('camera');
              } else {
                setStage('no_photo'); // no face found in stored photo
              }
            }
          } catch { if (!cancelled) setStage('no_photo'); }
        };
        img.onerror = () => { if (!cancelled) setStage('no_photo'); };
        img.src = url;
      } catch { if (!cancelled) setStage('no_photo'); }
    })();
    return () => { cancelled = true; };
  }, [stage, worker.photo]);

  // ── 3. Start camera when stage = 'camera' or 'no_photo' ─────────────────────
  useEffect(() => {
    if (stage !== 'camera' && stage !== 'no_photo') return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }
        });
        streamRef.current = stream;
        if (videoRef.current && !cancelled) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        if (!cancelled) setStage('cam_error');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [stage]);

  // ── 4. Detection loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'camera') return;
    const refDesc = refDescRef.current;

    const loop = async () => {
      const video   = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.paused || video.ended) {
        loopRef.current = requestAnimationFrame(loop);
        return;
      }

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
          setFaceFound(true);

          // Draw face box
          const box = det.detection.box;
          const glow = refDesc && faceapi.euclideanDistance(refDesc, det.descriptor) < THRESHOLD
            ? '#22c55e' : '#f59e0b';
          ctx.strokeStyle = glow;
          ctx.lineWidth   = 3;
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          if (refDesc) {
            const dist  = faceapi.euclideanDistance(refDesc, det.descriptor);
            const score = Math.round(Math.max(0, Math.min(100, (1 - dist) * 140)));
            setLiveScore(score);

            if (dist < THRESHOLD) {
              stableRef.current++;
              if (stableRef.current >= 3) {
                // Capture selfie
                const canvas = captureRef.current;
                canvas.width  = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                const b64 = canvas.toDataURL('image/jpeg', 0.85);
                setCapturedB64(b64);
                setStage('matched');
                streamRef.current?.getTracks().forEach(t => t.stop());
                return;
              }
            } else {
              stableRef.current = 0;
            }
          }
        } else {
          setFaceFound(false);
          setLiveScore(null);
          stableRef.current = 0;
        }
      } catch { /* skip frame errors */ }

      loopRef.current = requestAnimationFrame(loop);
    };

    loopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRef.current);
  }, [stage]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Manual capture (no_photo mode) ──────────────────────────────────────────
  const manualCapture = () => {
    const video  = videoRef.current;
    const canvas = captureRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedB64(b64);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setStage('matched');
  };

  // ── Score bar color ───────────────────────────────────────────────────────────
  const scoreColor = liveScore == null ? 'bg-gray-500'
    : liveScore >= 72 ? 'bg-green-500'
    : liveScore >= 55 ? 'bg-amber-500'
    : 'bg-red-500';

  const scoreLabel = liveScore == null ? 'No face detected'
    : liveScore >= 72 ? 'Face matched ✓'
    : liveScore >= 55 ? 'Partial match — hold still'
    : 'Face not matched';

  // ── Worker identity header ────────────────────────────────────────────────────
  const WorkerHeader = () => (
    <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 border border-white/20 mb-4">
      {worker.photo
        ? <img src={worker.photo} className="w-11 h-11 rounded-lg object-cover shrink-0 border-2 border-white/20" alt="" />
        : <div className="w-11 h-11 rounded-lg bg-white/20 text-white flex items-center justify-center font-bold shrink-0">{worker.fullName[0]}</div>
      }
      <div>
        <p className="text-white font-semibold">{worker.fullName}</p>
        <p className="text-white/50 text-xs">{worker.role} · {type === 'clock_in' ? '🟢 Clocking IN' : '🔴 Clocking OUT'}</p>
      </div>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────────

  if (stage === 'loading_models' || stage === 'loading_photo') return (
    <div className="space-y-5">
      <WorkerHeader />
      <div className="text-center space-y-4 py-6">
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto">
          <Eye size={28} className="text-white/60" />
        </div>
        <p className="text-white font-semibold">
          {stage === 'loading_models' ? 'Loading face recognition…' : 'Preparing face data…'}
        </p>
        {stage === 'loading_models' && (
          <div className="w-full bg-white/10 rounded-full h-2 mx-auto max-w-xs">
            <div className="bg-brand-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}
        {stage === 'loading_photo' && <Loader size={24} className="animate-spin text-white/60 mx-auto" />}
      </div>
    </div>
  );

  if (stage === 'cam_error') return (
    <div className="space-y-4 text-center">
      <WorkerHeader />
      <div className="bg-red-900/50 border border-red-700 rounded-2xl p-5 space-y-2">
        <Camera size={32} className="text-red-400 mx-auto" />
        <p className="text-white font-semibold">Camera not available</p>
        <p className="text-red-300 text-sm">Allow camera access or use a different device</p>
      </div>
      <button onClick={onBack} className="w-full py-2.5 rounded-xl border border-white/20 text-white text-sm hover:bg-white/10">
        <RotateCcw size={14} className="inline mr-2" />Back
      </button>
    </div>
  );

  if (stage === 'camera' || stage === 'no_photo') return (
    <div className="space-y-3">
      <WorkerHeader />

      {/* Status */}
      {stage === 'no_photo' ? (
        <div className="bg-amber-900/40 border border-amber-700 rounded-xl px-4 py-2.5 text-sm text-amber-200 text-center flex items-center gap-2 justify-center">
          <AlertTriangle size={14} /> No stored photo — take a selfie for the record
        </div>
      ) : (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-medium text-center transition-all ${
          liveScore >= 72 ? 'bg-green-900/50 border border-green-600 text-green-300'
          : liveScore >= 55 ? 'bg-amber-900/50 border border-amber-600 text-amber-300'
          : 'bg-white/5 border border-white/10 text-white/50'
        }`}>
          {faceFound ? (
            <span className="flex items-center justify-center gap-2">
              {liveScore >= 72 && <ShieldCheck size={14} />}
              {liveScore < 72 && liveScore >= 55 && <AlertTriangle size={14} />}
              {scoreLabel}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <UserCircle2 size={14} /> Look directly at the camera
            </span>
          )}
        </div>
      )}

      {/* Camera feed */}
      <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '1/1' }}>
        <video ref={videoRef} autoPlay playsInline muted
          className="w-full h-full object-cover scale-x-[-1]" />

        {/* Canvas overlay for face detection box */}
        <canvas ref={overlayRef}
          className="absolute inset-0 w-full h-full scale-x-[-1]"
          style={{ pointerEvents: 'none' }} />

        {/* Face circle guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-44 h-44 rounded-full border-4 border-dashed transition-colors duration-300 ${
            liveScore >= 72 ? 'border-green-400' : liveScore >= 55 ? 'border-amber-400' : 'border-white/30'
          }`} />
        </div>

        {/* Score bar (face-compare mode only) */}
        {stage === 'camera' && liveScore != null && (
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            <div className="bg-black/60 rounded-xl p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-xs">Face Match</span>
                <span className={`text-xs font-bold ${liveScore >= 72 ? 'text-green-400' : liveScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>
                  {liveScore}%
                </span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all duration-200 ${scoreColor}`}
                  style={{ width: `${liveScore}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Waiting indicator */}
        {!faceFound && (
          <div className="absolute top-3 left-0 right-0 flex justify-center">
            <div className="bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Loader size={12} className="animate-spin text-white/60" />
              <span className="text-white/60 text-xs">Scanning…</span>
            </div>
          </div>
        )}
      </div>

      {/* Off-screen capture canvas */}
      <canvas ref={captureRef} className="hidden" />

      {/* Manual capture for no_photo mode */}
      {stage === 'no_photo' && (
        <button onClick={manualCapture}
          className="w-full py-3.5 rounded-xl bg-white text-brand-800 font-bold text-base hover:bg-brand-50 flex items-center justify-center gap-2 shadow-lg">
          <Camera size={18} /> Capture Photo
        </button>
      )}

      {stage === 'camera' && (
        <p className="text-center text-white/40 text-xs">
          Hold still — system auto-captures when face is verified ({Math.round(THRESHOLD * 100)}%+ match required)
        </p>
      )}

      <button onClick={onBack}
        className="w-full py-2.5 rounded-xl border border-white/20 text-white/60 text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
        <RotateCcw size={13} /> Back — Not you?
      </button>
    </div>
  );

  if (stage === 'matched') return (
    <div className="space-y-4">
      <WorkerHeader />
      <div className="bg-green-900/50 border border-green-600 rounded-2xl p-4 text-center space-y-2">
        <ShieldCheck size={36} className="text-green-400 mx-auto" />
        <p className="text-green-300 font-bold text-lg">Face Verified!</p>
        <p className="text-green-400/70 text-sm">Identity confirmed — submitting attendance</p>
      </div>
      {capturedB64 && (
        <img src={capturedB64} className="w-24 h-24 rounded-xl object-cover mx-auto border-4 border-green-500 scale-x-[-1]" alt="Selfie" />
      )}
      <button
        onClick={() => onVerified(capturedB64, liveScore)}
        className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-xl flex items-center justify-center gap-3 ${
          type === 'clock_in' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
        }`}>
        {type === 'clock_in' ? <LogIn size={22} /> : <LogOut size={22} />}
        {type === 'clock_in' ? 'Clock In Now' : 'Clock Out Now'}
      </button>
      <button onClick={onBack}
        className="w-full py-2.5 rounded-xl border border-white/20 text-white/50 text-sm hover:bg-white/10">
        Cancel
      </button>
    </div>
  );
}

// ── Auto-reset countdown ───────────────────────────────────────────────────────
function AutoReset({ onReset, seconds = 8 }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft(v => { if (v <= 1) { clearInterval(t); onReset(); return 0; } return v - 1; }), 1000);
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

// ── Main Terminal Page ─────────────────────────────────────────────────────────
export default function AttendanceTerminal() {
  const [token,      setToken    ] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('token');
    return p || localStorage.getItem(TOKEN_KEY) || '';
  });
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [devStage,   setDevStage  ] = useState(token ? 'loading' : 'setup');

  // Attendance flow
  const [step,        setStep       ] = useState('home');
  // 'home' | 'type' | 'verify' | 'submitting' | 'done' | 'fail'
  const [worker,      setWorker     ] = useState(null);
  const [attendType,  setAttendType ] = useState('clock_in');
  const [result,      setResult     ] = useState(null);
  const [failMsg,     setFailMsg    ] = useState('');

  const loadDevice = useCallback(async t => {
    try {
      const { data } = await axios.get(`${BASE}/devices/terminal/info`, { params: { token: t } });
      setDeviceInfo(data.data);
      setDevStage(data.data.status === 'approved' ? 'ready' : 'not_approved');
    } catch (err) {
      setDevStage(err.response?.status === 404 ? 'setup' : 'error');
    }
  }, []);

  useEffect(() => { if (token && devStage === 'loading') loadDevice(token); }, [token, devStage, loadDevice]);
  useEffect(() => {
    if (!token || devStage === 'setup') return;
    const t = setInterval(() => loadDevice(token), 30000);
    return () => clearInterval(t);
  }, [token, devStage, loadDevice]);

  const getGPS = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null), { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });

  const submitAttendance = async (selfieBase64, faceScore) => {
    setStep('submitting');
    const gps = await getGPS();
    try {
      const { data } = await axios.post(`${BASE}/attendance/clock`, {
        deviceToken:  token,
        workerId:     worker._id,
        type:         attendType,
        gps,
        selfieBase64: selfieBase64 || undefined,
        faceMatchScore: faceScore,
      });
      setResult(data);
      setStep('done');
    } catch (err) {
      setFailMsg(err.response?.data?.message || 'Submission failed');
      setStep('fail');
    }
  };

  const reset = useCallback(() => {
    setWorker(null); setResult(null); setFailMsg('');
    setAttendType('clock_in'); setStep('home');
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
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
          <AlertTriangle size={28} className="text-amber-600" />
        </div>
        <p className="font-bold text-gray-900 text-lg">
          {deviceInfo?.status === 'blocked' ? 'Device Blocked' : 'Awaiting Approval'}
        </p>
        <p className="text-gray-500 text-sm">
          {deviceInfo?.status === 'blocked'
            ? `This device has been blocked: ${deviceInfo.blockedReason || 'Contact admin'}`
            : 'Ask your admin to approve this device in the dashboard.'}
        </p>
        <button onClick={() => loadDevice(token)}
          className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm flex items-center justify-center gap-2">
          <RefreshCw size={14} /> Check Again
        </button>
      </div>
    </Shell>
  );

  if (devStage === 'error') return (
    <Shell>
      <div className="text-center space-y-4">
        <ShieldAlert size={40} className="text-red-400 mx-auto" />
        <p className="text-white font-bold">Device not recognized</p>
        <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(''); setDevStage('setup'); }}
          className="w-full py-2.5 rounded-xl bg-white/10 text-white text-sm">Re-setup Device</button>
      </div>
    </Shell>
  );

  // ─ Home ──────────────────────────────────────────────────────────────────────
  const now = new Date();
  if (step === 'home') return (
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
          <Eye size={28} className="text-white/50 mx-auto mb-2" />
          <p className="text-white font-semibold text-lg">Search your name to continue</p>
          <p className="text-white/40 text-sm mt-0.5">Face verification required</p>
        </div>

        <WorkerSearch token={token} onSelect={w => { setWorker(w); setStep('type'); }} />
      </div>
    </Shell>
  );

  // ─ Choose clock in / out ─────────────────────────────────────────────────────
  if (step === 'type') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-white/10 rounded-2xl px-4 py-4 border border-white/20">
          {worker.photo
            ? <img src={worker.photo} className="w-16 h-16 rounded-xl object-cover shrink-0 border-2 border-white/20" alt="" />
            : <div className="w-16 h-16 rounded-xl bg-white/20 text-white flex items-center justify-center text-2xl font-bold shrink-0">{worker.fullName[0]}</div>
          }
          <div>
            <p className="text-white font-bold text-xl">{worker.fullName}</p>
            <p className="text-white/50">{worker.role}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setAttendType('clock_in');  setStep('verify'); }}
            className="flex flex-col items-center gap-3 py-8 rounded-2xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all shadow-xl">
            <LogIn size={36} className="text-white" />
            <div className="text-center">
              <p className="text-white font-bold text-xl">Clock In</p>
              <p className="text-green-100 text-xs">Start of shift</p>
            </div>
          </button>
          <button onClick={() => { setAttendType('clock_out'); setStep('verify'); }}
            className="flex flex-col items-center gap-3 py-8 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-95 transition-all shadow-xl">
            <LogOut size={36} className="text-white" />
            <div className="text-center">
              <p className="text-white font-bold text-xl">Clock Out</p>
              <p className="text-red-100 text-xs">End of shift</p>
            </div>
          </button>
        </div>

        <button onClick={() => { setWorker(null); setStep('home'); }}
          className="w-full py-2.5 rounded-xl border border-white/20 text-white/50 text-sm hover:bg-white/10 flex items-center justify-center gap-2">
          <RotateCcw size={13} /> Not you?
        </button>
      </div>
    </Shell>
  );

  // ─ Face verification ─────────────────────────────────────────────────────────
  if (step === 'verify') return (
    <Shell deviceInfo={deviceInfo}>
      <FaceVerify
        worker={worker}
        type={attendType}
        onVerified={(b64, score) => submitAttendance(b64, score)}
        onBack={() => setStep('type')}
      />
    </Shell>
  );

  // ─ Submitting ────────────────────────────────────────────────────────────────
  if (step === 'submitting') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="text-center space-y-4">
        <Loader size={48} className="animate-spin text-white/50 mx-auto" />
        <p className="text-white font-semibold text-lg">Saving attendance…</p>
        <p className="text-white/40 text-sm">Verifying GPS · Uploading photo</p>
      </div>
    </Shell>
  );

  // ─ Fail ──────────────────────────────────────────────────────────────────────
  if (step === 'fail') return (
    <Shell deviceInfo={deviceInfo}>
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 bg-red-900/50 border border-red-700 rounded-2xl flex items-center justify-center mx-auto">
          <XCircle size={32} className="text-red-400" />
        </div>
        <p className="text-white font-bold text-xl">Failed</p>
        <p className="text-red-300 bg-red-900/40 border border-red-800 px-4 py-3 rounded-xl text-sm">{failMsg}</p>
        <button onClick={reset}
          className="w-full py-3 rounded-xl bg-white/10 border border-white/20 text-white font-medium hover:bg-white/20">
          Try Again
        </button>
      </div>
    </Shell>
  );

  // ─ Success ───────────────────────────────────────────────────────────────────
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
          <p className="text-white/50 text-sm mt-1">
            {new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        <div className="bg-white/10 rounded-2xl p-4 border border-white/20 text-left space-y-2">
          {result.data?.selfieUrl && (
            <img src={result.data.selfieUrl} className="w-16 h-16 rounded-xl object-cover mx-auto border-4 border-green-500 mb-3 scale-x-[-1]" alt="Selfie" />
          )}
          <DRow label="Worker"  value={result.data?.workerName} />
          <DRow label="Role"    value={result.data?.workerRole} />
          <DRow label="Branch"  value={deviceInfo?.branchName} />
          <DRow label="GPS"     value={
            result.data?.gpsVerified
              ? <span className="text-green-400 flex items-center gap-1 justify-end"><CheckCircle size={12} /> Verified</span>
              : <span className="text-amber-400 text-xs">Unverified</span>
          } />
          <DRow label="Face"    value={<span className="text-green-400 flex items-center gap-1 justify-end"><ShieldCheck size={12} /> Matched</span>} />
        </div>

        <AutoReset onReset={reset} seconds={8} />
      </div>
    </Shell>
  );

  return null;
}

function DRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/40">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
