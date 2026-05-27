/**
 * AttendanceTerminal — public kiosk page for worker clock-in / clock-out.
 *
 * URL forms:
 *   /terminal?token=DEVICE_TOKEN        — device already set up
 *   /terminal                           — shows setup screen (enter registration code)
 *
 * Flow:
 *   setup → ready → select worker → choose type (in/out) → selfie → submit → done
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Leaf, Wifi, WifiOff, Building2, Clock, LogIn, LogOut,
  Camera, UserCircle2, CheckCircle, XCircle, Loader,
  Search, ChevronRight, RefreshCw, AlertTriangle, MapPin,
  Smartphone, Shield, RotateCcw, X
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Device fingerprint — stable across sessions on same browser/device
function getFingerprint() {
  const raw = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    navigator.hardwareConcurrency || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.platform || '',
  ].join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i++) { h = Math.imul(31, h) + raw.charCodeAt(i) | 0; }
  return Math.abs(h).toString(16).padStart(8, '0') + '-' + raw.length;
}

const TOKEN_KEY = 'attendance_device_token';

// ── Selfie capture hook ────────────────────────────────────────────────────────
function useSelfie() {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [preview,   setPreview  ] = useState(null);
  const [base64,    setBase64   ] = useState(null);
  const [error,     setError    ] = useState(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStreaming(true);
    } catch (err) {
      setError(err.name === 'NotAllowedError'
        ? 'Camera permission denied — please allow camera access'
        : 'Camera not available');
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  const capture = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPreview(dataUrl);
    setBase64(dataUrl);
    stop();
  }, [stop]);

  const reset = useCallback(() => {
    setPreview(null);
    setBase64(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, canvasRef, streaming, preview, base64, error, start, stop, capture, reset };
}

// ── Setup Screen ───────────────────────────────────────────────────────────────
function SetupScreen({ onSetup }) {
  const [code,    setCode   ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState('');

  const submit = async e => {
    e.preventDefault();
    if (!code.trim()) return setError('Enter registration code');
    setLoading(true); setError('');
    try {
      const fp = getFingerprint();
      const { data } = await axios.post(`${BASE}/devices/terminal/register`, {
        registrationCode: code.trim().toUpperCase(),
        deviceId:         fp,
      });
      localStorage.setItem(TOKEN_KEY, data.data.deviceToken);
      onSetup(data.data.deviceToken, data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="bg-white/20 rounded-xl p-2.5"><Leaf size={24} className="text-white" /></div>
          <div>
            <p className="text-white font-bold text-xl">FuelStation HR</p>
            <p className="text-brand-300 text-sm">Attendance Terminal</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="text-center mb-5">
            <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Smartphone size={26} className="text-brand-700" />
            </div>
            <p className="font-bold text-gray-900 text-lg">Device Setup</p>
            <p className="text-gray-500 text-sm mt-1">Enter the registration code from your admin dashboard to connect this device</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Registration Code</label>
              <input
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.5rem] font-bold uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="XXXXXX"
                maxLength={6}
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError(''); }}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg text-center">{error}</p>}
            <button type="submit" disabled={loading || code.length !== 6}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-base hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader size={18} className="animate-spin" /> : 'Connect Device'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-4">Ask your company admin for the 6-character registration code</p>
        </div>
      </div>
    </div>
  );
}

// ── Worker Search ──────────────────────────────────────────────────────────────
function WorkerSearch({ token, onSelect }) {
  const [query,   setQuery  ] = useState('');
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState('');
  const timerRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) { setWorkers([]); return; }
    setLoading(true); setError('');
    try {
      const { data } = await axios.get(`${BASE}/devices/terminal/workers`, {
        params: { token, q }
      });
      setWorkers(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed');
    } finally { setLoading(false); }
  }, [token]);

  const handleChange = e => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 400);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 text-lg"
          placeholder="Search worker by name…"
          value={query}
          onChange={handleChange}
          autoFocus
        />
        {loading && <Loader size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 animate-spin" />}
      </div>

      {error && <p className="text-red-300 text-sm text-center">{error}</p>}

      {workers.length > 0 && (
        <div className="space-y-2">
          {workers.map(w => (
            <button key={w._id} onClick={() => onSelect(w)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-left transition-colors">
              {w.photo
                ? <img src={w.photo} className="w-11 h-11 rounded-xl object-cover shrink-0 border-2 border-white/20" alt="" />
                : <div className="w-11 h-11 rounded-xl bg-white/20 text-white flex items-center justify-center font-bold text-lg shrink-0">{w.fullName[0]}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{w.fullName}</p>
                <p className="text-white/60 text-sm">{w.role}</p>
              </div>
              <ChevronRight size={16} className="text-white/40 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && !loading && workers.length === 0 && (
        <p className="text-white/50 text-sm text-center py-4">No workers found — try a different name</p>
      )}
      {query.length < 2 && query.length > 0 && (
        <p className="text-white/40 text-xs text-center">Type at least 2 characters to search</p>
      )}
    </div>
  );
}

// ── Selfie Capture Step ────────────────────────────────────────────────────────
function SelfieStep({ worker, type, selfie, onBack }) {
  const { videoRef, canvasRef, streaming, preview, base64, error, start, capture, reset } = useSelfie();
  const [countdown, setCountdown] = useState(null);
  const cntRef = useRef(null);

  useEffect(() => { start(); }, [start]);

  const startCountdown = () => {
    let c = 3;
    setCountdown(c);
    cntRef.current = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(cntRef.current);
        setCountdown(null);
        capture();
      } else {
        setCountdown(c);
      }
    }, 1000);
  };

  useEffect(() => () => clearInterval(cntRef.current), []);

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* Worker identity confirm */}
      <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 border border-white/20">
        {worker.photo
          ? <img src={worker.photo} className="w-10 h-10 rounded-lg object-cover shrink-0" alt="" />
          : <div className="w-10 h-10 rounded-lg bg-white/20 text-white flex items-center justify-center font-bold shrink-0">{worker.fullName[0]}</div>
        }
        <div>
          <p className="text-white font-semibold text-sm">{worker.fullName}</p>
          <p className="text-white/60 text-xs">{worker.role} · {type === 'clock_in' ? '🟢 Clocking IN' : '🔴 Clocking OUT'}</p>
        </div>
      </div>

      {/* Camera / preview */}
      {!preview && (
        <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '1/1' }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {/* Face guide overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 rounded-full border-4 border-white/50 border-dashed" />
          </div>
          {/* Countdown */}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-white text-8xl font-bold">{countdown}</span>
            </div>
          )}
          {/* Label */}
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <p className="text-white/80 text-sm bg-black/40 mx-4 py-1.5 rounded-lg">
              Position your face in the circle
            </p>
          </div>
          {!streaming && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader size={32} className="text-white animate-spin" />
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '1/1' }}>
          <img src={preview} className="w-full h-full object-cover" alt="Selfie" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 rounded-full border-4 border-green-400 border-opacity-70" />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 text-red-200 px-4 py-3 rounded-xl text-sm text-center border border-red-700">
          {error}
        </div>
      )}

      {/* Buttons */}
      {!preview ? (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onBack}
            className="py-3 rounded-xl border border-white/30 text-white text-sm font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
            <RotateCcw size={15} /> Back
          </button>
          <button onClick={startCountdown} disabled={!streaming || countdown !== null}
            className="py-3 rounded-xl bg-white text-brand-800 text-sm font-bold hover:bg-brand-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Camera size={15} />
            {countdown !== null ? `Taking in ${countdown}…` : 'Take Photo'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={reset}
            className="py-3 rounded-xl border border-white/30 text-white text-sm font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
            <RotateCcw size={15} /> Retake
          </button>
          <button onClick={() => onBack(base64)}
            className={`py-3 rounded-xl text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
              type === 'clock_in'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-red-500   hover:bg-red-600'
            }`}>
            {type === 'clock_in' ? <LogIn size={15} /> : <LogOut size={15} />}
            Confirm &amp; Submit
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Terminal ──────────────────────────────────────────────────────────────
export default function AttendanceTerminal() {
  // Device state
  const [token,      setToken     ] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('token');
    return p || localStorage.getItem(TOKEN_KEY) || '';
  });
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [devLoading, setDevLoading] = useState(false);
  const [devError,   setDevError  ] = useState('');

  // Flow state: 'setup' | 'ready' | 'worker' | 'type' | 'selfie' | 'submitting' | 'done' | 'error'
  const [step,         setStep       ] = useState(token ? 'loading' : 'setup');
  const [worker,       setWorker     ] = useState(null);
  const [attendType,   setAttendType ] = useState('clock_in');
  const [result,       setResult     ] = useState(null);
  const [submitError,  setSubmitError] = useState('');

  // Clock
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Load device info
  const loadDevice = useCallback(async (t) => {
    if (!t) return;
    setDevLoading(true); setDevError('');
    try {
      const { data } = await axios.get(`${BASE}/devices/terminal/info`, { params: { token: t } });
      setDeviceInfo(data.data);
      setStep(data.data.status === 'approved' ? 'ready' : 'not_approved');
    } catch (err) {
      setDevError(err.response?.data?.message || 'Device not found');
      setStep('error_device');
    } finally { setDevLoading(false); }
  }, []);

  useEffect(() => {
    if (token && step === 'loading') loadDevice(token);
  }, [token, step, loadDevice]);

  // Poll device status every 30s
  useEffect(() => {
    if (!token || step === 'setup') return;
    const t = setInterval(() => loadDevice(token), 30000);
    return () => clearInterval(t);
  }, [token, step, loadDevice]);

  // Handle device setup
  const handleSetup = (newToken) => {
    setToken(newToken);
    setStep('loading');
    loadDevice(newToken);
  };

  // Handle GPS
  const getGPS = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true }
    );
  });

  // Submit attendance
  const submit = async (selfieBase64) => {
    setStep('submitting');
    setSubmitError('');
    const gps = await getGPS();

    try {
      const { data } = await axios.post(`${BASE}/attendance/clock`, {
        deviceToken:  token,
        workerId:     worker._id,
        type:         attendType,
        gps,
        selfieBase64: selfieBase64 || undefined,
      });
      setResult(data);
      setStep('done');
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Submission failed');
      setStep('submit_error');
    }
  };

  const reset = () => {
    setWorker(null); setResult(null); setSubmitError('');
    setAttendType('clock_in');
    setStep('ready');
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-brand-900/50 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Leaf size={18} className="text-white" />
          <span className="text-white font-bold text-sm">FuelStation HR</span>
          {deviceInfo && (
            <span className="text-brand-300 text-xs hidden sm:inline">
              · {deviceInfo.branchName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {deviceInfo?.status === 'approved' && (
            <span className="flex items-center gap-1 text-green-400 text-xs">
              <Wifi size={12} /> Live
            </span>
          )}
          <span className="text-white/70 text-sm font-mono">
            {now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>

      {/* Footer */}
      {deviceInfo && (
        <div className="px-5 py-2 text-center">
          <p className="text-white/30 text-xs">
            {deviceInfo.name} · {deviceInfo.branchName}
            {deviceInfo.branchGPS && <> · <MapPin size={9} className="inline" /> GPS enabled</>}
          </p>
        </div>
      )}
    </div>
  );

  // ── Setup ───────────────────────────────────────────────────────────────────
  if (step === 'setup') return <SetupScreen onSetup={handleSetup} />;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (step === 'loading' || devLoading) return (
    <Shell>
      <div className="text-center space-y-4">
        <Loader size={40} className="animate-spin text-white/60 mx-auto" />
        <p className="text-white/60">Connecting to device…</p>
      </div>
    </Shell>
  );

  // ── Device error ────────────────────────────────────────────────────────────
  if (step === 'error_device') return (
    <Shell>
      <div className="bg-red-900/50 border border-red-700 rounded-2xl p-6 text-center space-y-3">
        <XCircle size={40} className="text-red-400 mx-auto" />
        <p className="text-white font-bold text-lg">Device Error</p>
        <p className="text-red-300 text-sm">{devError}</p>
        <button onClick={() => { setStep('setup'); localStorage.removeItem(TOKEN_KEY); setToken(''); }}
          className="w-full py-2.5 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
          Re-setup Device
        </button>
      </div>
    </Shell>
  );

  // ── Not approved ────────────────────────────────────────────────────────────
  if (step === 'not_approved') return (
    <Shell>
      <div className="bg-white rounded-2xl shadow-2xl p-6 text-center space-y-3">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
          <Clock size={28} className="text-amber-600" />
        </div>
        <p className="font-bold text-gray-900 text-lg">Awaiting Approval</p>
        <p className="text-gray-500 text-sm">
          This device is registered but not yet approved by admin.
          {deviceInfo?.status === 'blocked' && <span className="block mt-1 text-red-600 font-medium">⛔ This device has been blocked.</span>}
        </p>
        <p className="text-xs text-gray-400">Ask your company admin to approve this device in the dashboard</p>
        <button onClick={() => loadDevice(token)}
          className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 flex items-center justify-center gap-2">
          <RefreshCw size={14} /> Check Again
        </button>
      </div>
    </Shell>
  );

  // ── Ready — main attendance screen ──────────────────────────────────────────
  if (step === 'ready') return (
    <Shell>
      <div className="space-y-5">
        {/* Date display */}
        <div className="text-center">
          <p className="text-white/60 text-sm">
            {now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-white text-5xl font-bold font-mono mt-1 tracking-tight">
            {now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-brand-300 text-sm mt-1 flex items-center justify-center gap-1">
            <Building2 size={12} /> {deviceInfo?.branchName}
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center">
          <UserCircle2 size={32} className="text-white/60 mx-auto mb-2" />
          <p className="text-white font-semibold text-lg">Search your name to clock in / out</p>
          <p className="text-white/50 text-sm mt-0.5">Type at least 2 letters of your name</p>
        </div>

        <WorkerSearch token={token} onSelect={w => { setWorker(w); setStep('type'); }} />
      </div>
    </Shell>
  );

  // ── Clock type selection ─────────────────────────────────────────────────────
  if (step === 'type' && worker) return (
    <Shell>
      <div className="space-y-4">
        {/* Worker card */}
        <div className="flex items-center gap-3 bg-white/10 rounded-2xl px-4 py-4 border border-white/20">
          {worker.photo
            ? <img src={worker.photo} className="w-16 h-16 rounded-xl object-cover shrink-0 border-2 border-white/20" alt="" />
            : <div className="w-16 h-16 rounded-xl bg-white/20 text-white flex items-center justify-center font-bold text-2xl shrink-0">{worker.fullName[0]}</div>
          }
          <div>
            <p className="text-white font-bold text-lg">{worker.fullName}</p>
            <p className="text-white/60 text-sm">{worker.role}</p>
            <p className="text-white/40 text-xs mt-0.5">{deviceInfo?.branchName}</p>
          </div>
        </div>

        <p className="text-white/70 text-center text-sm">What are you doing?</p>

        {/* Clock In / Out buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setAttendType('clock_in'); setStep('selfie'); }}
            className="flex flex-col items-center gap-3 py-6 rounded-2xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all shadow-lg">
            <LogIn size={32} className="text-white" />
            <div className="text-center">
              <p className="text-white font-bold text-lg">Clock In</p>
              <p className="text-green-100 text-xs">Start of shift</p>
            </div>
          </button>
          <button
            onClick={() => { setAttendType('clock_out'); setStep('selfie'); }}
            className="flex flex-col items-center gap-3 py-6 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-95 transition-all shadow-lg">
            <LogOut size={32} className="text-white" />
            <div className="text-center">
              <p className="text-white font-bold text-lg">Clock Out</p>
              <p className="text-red-100 text-xs">End of shift</p>
            </div>
          </button>
        </div>

        <button onClick={() => { setWorker(null); setStep('ready'); }}
          className="w-full py-2.5 rounded-xl border border-white/20 text-white/60 text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
          <RotateCcw size={14} /> Not you? Go back
        </button>
      </div>
    </Shell>
  );

  // ── Selfie capture ──────────────────────────────────────────────────────────
  if (step === 'selfie' && worker) return (
    <Shell>
      <div className="space-y-4">
        <p className="text-white/80 text-center text-sm font-medium">
          {attendType === 'clock_in' ? '🟢 Clocking IN' : '🔴 Clocking OUT'} — Take a selfie to confirm
        </p>
        <SelfieStep
          worker={worker}
          type={attendType}
          selfie={null}
          onBack={(base64) => {
            if (base64) submit(base64);
            else setStep('type');
          }}
        />
      </div>
    </Shell>
  );

  // ── Submitting ──────────────────────────────────────────────────────────────
  if (step === 'submitting') return (
    <Shell>
      <div className="text-center space-y-4">
        <Loader size={48} className="animate-spin text-white/60 mx-auto" />
        <p className="text-white font-semibold text-lg">Recording attendance…</p>
        <p className="text-white/50 text-sm">Verifying location &amp; uploading selfie</p>
      </div>
    </Shell>
  );

  // ── Submit error ─────────────────────────────────────────────────────────────
  if (step === 'submit_error') return (
    <Shell>
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 bg-red-900/50 rounded-2xl flex items-center justify-center mx-auto border border-red-700">
          <XCircle size={32} className="text-red-400" />
        </div>
        <p className="text-white font-bold text-xl">Attendance Failed</p>
        <p className="text-red-300 text-sm bg-red-900/40 px-4 py-3 rounded-xl border border-red-800">
          {submitError}
        </p>
        <button onClick={reset}
          className="w-full py-3 rounded-xl bg-white/10 border border-white/20 text-white font-medium hover:bg-white/20 transition-colors">
          Try Again
        </button>
      </div>
    </Shell>
  );

  // ── Done / success ──────────────────────────────────────────────────────────
  if (step === 'done' && result) return (
    <Shell>
      <div className="space-y-5 text-center">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-2xl ${
          attendType === 'clock_in' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {attendType === 'clock_in'
            ? <LogIn  size={40} className="text-white" />
            : <LogOut size={40} className="text-white" />
          }
        </div>

        <div>
          <p className="text-white text-3xl font-bold">
            {attendType === 'clock_in' ? 'Clocked In!' : 'Clocked Out!'}
          </p>
          <p className="text-white/60 mt-1 text-sm">
            {now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {/* Worker info */}
        <div className="bg-white/10 rounded-2xl p-4 border border-white/20 text-left space-y-2">
          {result.data?.selfieUrl && (
            <img src={result.data.selfieUrl} className="w-16 h-16 rounded-xl object-cover mx-auto border-2 border-white/30 mb-3" alt="Selfie" />
          )}
          <ResultRow label="Worker"  value={result.data?.workerName} />
          <ResultRow label="Role"    value={result.data?.workerRole} />
          <ResultRow label="Branch"  value={deviceInfo?.branchName} />
          <ResultRow label="Status"  value={
            result.data?.gpsVerified
              ? <span className="text-green-400 flex items-center gap-1"><CheckCircle size={12} /> GPS verified</span>
              : <span className="text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> GPS unverified</span>
          } />
        </div>

        {/* Auto-reset countdown */}
        <AutoReset onReset={reset} seconds={8} />
      </div>
    </Shell>
  );

  return null;
}

function ResultRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function AutoReset({ onReset, seconds }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(v => {
        if (v <= 1) { clearInterval(t); onReset(); return 0; }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onReset]);

  return (
    <div className="space-y-2">
      <div className="w-full bg-white/10 rounded-full h-1.5">
        <div className="bg-white/40 h-1.5 rounded-full transition-all duration-1000"
          style={{ width: `${(left / seconds) * 100}%` }} />
      </div>
      <p className="text-white/40 text-xs">Returning to home in {left}s…</p>
      <button onClick={onReset}
        className="w-full py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-colors">
        Done — Next Worker
      </button>
    </div>
  );
}
