import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Delete, Loader, ChevronLeft, ChevronRight, LogOut, X,
  Clock, Calendar, Gauge, Droplets, Fuel, Home, BarChart2,
  FileText, Banknote, CheckCircle, AlertTriangle,
} from 'lucide-react';
import axios from 'axios';
import * as faceapi from '@vladmandic/face-api';

const BASE    = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const fmt     = n  => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const fmtL    = n  => n == null ? '—' : `${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 1 })}L`;
const fmtNum  = n  => n == null ? '—' : Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOKEN_KEY   = 'attendance_device_token';
const MODEL_URL   = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';
const THRESHOLD   = 0.58;
const STABLE_NEEDED = 3;
const MONTHS      = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let faceModelsLoaded = false;
async function loadFaceModels(onProgress) {
  if (faceModelsLoaded) return;
  onProgress?.(10);
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  onProgress?.(50);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  onProgress?.(80);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  onProgress?.(100);
  faceModelsLoaded = true;
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d   = new Date(dateStr);
  const dow = DAY_NAMES[d.getDay()];
  return `${dow} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function fmtMonthYear(m, y) {
  return `${MONTHS_SHORT[(m || 1) - 1]} ${y}`;
}

// ── Bottom-sheet detail modal ──────────────────────────────────────────────────
function DetailSheet({ title, emoji, rows, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">{emoji}</span>
            <p className="font-bold text-gray-800 text-base">{title}</p>
            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              {rows.length}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {rows.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No records</p>
          ) : rows.map((row, i) => (
            <div key={i} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Calendar size={15} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{fmtDate(row.date)}</p>
                    {row.sub && <p className="text-xs text-gray-500 mt-0.5">{row.sub}</p>}
                  </div>
                </div>
                {row.badge && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${row.badgeCls}`}>
                    {row.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PIN Pad ────────────────────────────────────────────────────────────────────
function PinPad({ pin, onChange, onSubmit, loading, error }) {
  const press = d => {
    if (pin.length < 4) {
      const next = pin + d;
      onChange(next);
      if (next.length === 4) setTimeout(() => onSubmit(next), 180);
    }
  };
  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],[null,'0','del']];
  return (
    <div className="px-6 pb-6">
      <div className="flex justify-center gap-5 mb-7">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all duration-200
            ${pin.length > i ? 'bg-brand-600 border-brand-600 scale-110' : 'bg-transparent border-gray-300'}`} />
        ))}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl mb-4 text-center font-medium">{error}</p>}
      <div className="space-y-3">
        {KEYS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-3">
            {row.map((key, ki) => {
              if (key === null) return <div key={ki} />;
              if (key === 'del') return (
                <button key={ki} onClick={() => onChange(pin.slice(0,-1))}
                  className="h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center transition-all">
                  <Delete size={22} className="text-gray-600" />
                </button>
              );
              return (
                <button key={ki} onClick={() => press(key)} disabled={pin.length === 4 || loading}
                  className="h-16 rounded-2xl bg-gray-50 hover:bg-brand-50 active:bg-brand-100 active:scale-95
                             border border-gray-200 hover:border-brand-300 flex flex-col items-center
                             justify-center transition-all disabled:opacity-50 select-none">
                  <span className="text-2xl font-bold text-gray-800">{key}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 mt-5 text-brand-600">
          <Loader size={18} className="animate-spin" />
          <span className="text-sm font-medium">Checking…</span>
        </div>
      )}
    </div>
  );
}

// ── Tappable stat card ─────────────────────────────────────────────────────────
function StatCard({ value, label, emoji, color, onClick, hasDetail }) {
  return (
    <button onClick={onClick}
      className={`bg-white rounded-2xl p-4 shadow-sm text-center w-full transition-all
        ${hasDetail ? 'active:scale-95 active:shadow-md' : 'cursor-default'}`}>
      <p className={`text-4xl font-extrabold ${color}`}>{value}</p>
      <p className="text-sm text-gray-500 font-medium mt-1">{emoji} {label}</p>
      {hasDetail && value > 0 && (
        <p className="text-xs text-brand-500 font-medium mt-1.5">Tap to see details →</p>
      )}
    </button>
  );
}

// ── Per-pump meter card ────────────────────────────────────────────────────────
function PumpReadingCard({ pump }) {
  const { pumpName, nozzle1: n1, nozzle2: n2, litres, productType } = pump;
  const hasMeter = n1?.opening != null || n2?.opening != null;
  const isClosed = n1?.closing != null || n2?.closing != null;

  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-100">
        <div className="flex items-center gap-2">
          <Fuel size={13} className="text-brand-500" />
          <span className="text-xs font-bold text-gray-700">{pumpName}</span>
          {productType && (
            <span className="text-[10px] bg-brand-100 text-brand-700 font-semibold px-1.5 py-0.5 rounded-full">
              {productType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isClosed && litres != null && (
            <span className="text-xs font-black text-brand-700">{fmtL(litres)}</span>
          )}
          {isClosed
            ? <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">Closed</span>
            : hasMeter
            ? <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Open</span>
            : null
          }
        </div>
      </div>
      {!hasMeter ? (
        <p className="text-xs text-gray-400 text-center py-3">Supervisor hasn't entered opening meter yet</p>
      ) : (
        <div className="px-3 py-2.5 space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Outer Nozzle</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Open:</span>
              <span className="font-semibold text-gray-700">{fmtNum(n1?.opening)}</span>
              {n1?.closing != null && (
                <>
                  <span className="text-gray-300">→</span>
                  <span className="text-gray-500">Close:</span>
                  <span className="font-semibold text-green-700">{fmtNum(n1.closing)}</span>
                  {n1.litresSold != null && (
                    <span className="ml-auto text-xs font-bold text-brand-600">{fmtL(n1.litresSold)}</span>
                  )}
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Inner Nozzle</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Open:</span>
              <span className="font-semibold text-gray-700">{fmtNum(n2?.opening)}</span>
              {n2?.closing != null && (
                <>
                  <span className="text-gray-300">→</span>
                  <span className="text-gray-500">Close:</span>
                  <span className="font-semibold text-green-700">{fmtNum(n2.closing)}</span>
                  {n2.litresSold != null && (
                    <span className="ml-auto text-xs font-bold text-brand-600">{fmtL(n2.litresSold)}</span>
                  )}
                </>
              )}
            </div>
          </div>
          {!isClosed && (
            <p className="text-[10px] text-gray-400 italic pt-0.5">Closing meter not entered yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Face-scan clock step ───────────────────────────────────────────────────────
function ClockStep({ worker, deviceToken, clockType, onSuccess, onSkip }) {
  const [progress,  setProgress ] = useState(0);
  const [liveScore, setLiveScore] = useState(null);
  const [err,       setErr      ] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,      setDone     ] = useState(false);
  const [result,    setResult   ] = useState(null);

  const videoRef   = useRef(null);
  const overlayRef = useRef(null);
  const streamRef  = useRef(null);
  const loopRef    = useRef(null);
  const stableRef  = useRef(0);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!worker.hasFace) return;
    let cancelled = false;
    (async () => {
      try {
        await loadFaceModels(p => { if (!cancelled) setProgress(p); });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      } catch (e) {
        if (!cancelled) setErr('Camera error: ' + (e.message || e));
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [worker.hasFace, stopCamera]);

  const doSubmit = useCallback(async (faceMatchScore = null) => {
    setSubmitting(true);
    try {
      const res = await axios.post(`${BASE}/attendance/clock`, {
        deviceToken,
        workerId:      worker._id,
        type:          clockType,
        faceMatchScore,
      });
      stopCamera();
      setResult(res.data);
      setDone(true);
    } catch (e) {
      const msg = e.response?.data?.message || 'Clock failed — try again';
      setErr(msg);
      setSubmitting(false);
    }
  }, [deviceToken, worker._id, clockType, stopCamera]);

  useEffect(() => {
    if (!worker.hasFace || !worker.faceDescriptor?.length || done || submitting) return;
    const refDesc = new Float32Array(worker.faceDescriptor);
    const loop = async () => {
      const video = videoRef.current, overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) {
        loopRef.current = requestAnimationFrame(loop); return;
      }
      try {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks().withFaceDescriptor();
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        overlay.width = video.videoWidth; overlay.height = video.videoHeight;
        if (det) {
          const dist  = faceapi.euclideanDistance(refDesc, det.descriptor);
          const score = Math.round(Math.max(0, Math.min(100, (1 - dist) * 145)));
          setLiveScore(score);
          const matched = dist < THRESHOLD;
          ctx.strokeStyle = matched ? '#22c55e' : dist < 0.65 ? '#f59e0b' : '#ef4444';
          ctx.lineWidth = 3;
          const b = det.detection.box;
          ctx.strokeRect(b.x, b.y, b.width, b.height);
          if (matched) {
            stableRef.current++;
            if (stableRef.current >= STABLE_NEEDED) { doSubmit(score); return; }
          } else stableRef.current = 0;
        } else { setLiveScore(null); stableRef.current = 0; }
      } catch {}
      loopRef.current = requestAnimationFrame(loop);
    };
    loopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRef.current);
  }, [worker.hasFace, worker.faceDescriptor, done, submitting, doSubmit]);

  const typeLabel = clockType === 'clock_in' ? 'Clock In' : 'Clock Out';
  const typeBg    = clockType === 'clock_in' ? 'bg-green-600'  : 'bg-red-500';

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <p className="text-2xl font-black text-gray-800 mb-1">
            {clockType === 'clock_in' ? 'Clocked In!' : 'Clocked Out!'}
          </p>
          <p className="text-gray-500 text-sm mb-1">{worker.fullName}</p>
          {result?.data?.timeStr && (
            <p className="text-brand-600 font-black text-3xl mt-2">{result.data.timeStr}</p>
          )}
          {result?.data?.pumpAssignment?.islandName && (
            <div className="mt-4 bg-brand-50 rounded-2xl px-4 py-3 text-left">
              <p className="text-xs font-semibold text-brand-500 mb-0.5">⛽ Assigned To</p>
              <p className="text-sm font-bold text-brand-800">{result.data.pumpAssignment.islandName}</p>
            </div>
          )}
          <button onClick={onSuccess}
            className="mt-6 w-full bg-brand-600 text-white font-bold py-4 rounded-2xl active:scale-95">
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className={`${typeBg} px-6 py-7 text-center`}>
          {worker.photo
            ? <img src={worker.photo} alt="" className="w-16 h-16 rounded-full object-cover border-3 border-white/40 mx-auto mb-3" />
            : <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 text-white text-2xl font-bold">
                {worker.fullName?.[0]}
              </div>
          }
          <p className="text-white font-bold text-lg">{worker.fullName}</p>
          <p className="text-white/70 text-sm">{typeLabel}</p>
        </div>

        <div className="px-5 py-5">
          {err && (
            <div className="bg-red-50 text-red-600 rounded-xl px-3 py-2.5 text-sm text-center font-medium mb-4">
              {err}
            </div>
          )}

          {!worker.hasFace ? (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm mb-6">No face scan required — tap to confirm</p>
              <button onClick={() => doSubmit(null)} disabled={submitting}
                className={`w-full py-4 rounded-2xl text-white font-bold text-base ${typeBg} active:scale-95 disabled:opacity-60`}>
                {submitting ? <Loader size={20} className="animate-spin mx-auto" /> : `Confirm ${typeLabel}`}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-sm text-gray-500">Look at the camera</p>
              <div className="relative rounded-2xl overflow-hidden bg-black mx-auto"
                   style={{ width: '100%', maxWidth: 260, aspectRatio: '1/1' }}>
                <video ref={videoRef} muted playsInline autoPlay
                  className="w-full h-full object-cover scale-x-[-1]" />
                <canvas ref={overlayRef}
                  className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none" />
                {progress < 100 && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-white">
                    <Loader size={24} className="animate-spin" />
                    <p className="text-sm">Loading… {progress}%</p>
                  </div>
                )}
                {submitting && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader size={28} className="animate-spin text-white" />
                  </div>
                )}
              </div>
              {liveScore != null && (
                <div className="flex items-center gap-2 max-w-[260px] mx-auto">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div style={{ width: `${liveScore}%` }}
                      className={`h-full rounded-full transition-all ${
                        liveScore >= 70 ? 'bg-green-500' : liveScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                  </div>
                  <span className={`text-xs font-bold w-8 ${
                    liveScore >= 70 ? 'text-green-600' : liveScore >= 50 ? 'text-amber-500' : 'text-red-500'
                  }`}>{liveScore}%</span>
                </div>
              )}
              {liveScore == null && progress >= 100 && !submitting && (
                <p className="text-center text-xs text-gray-400">Position your face in frame…</p>
              )}
            </div>
          )}

          <button onClick={onSkip}
            className="w-full mt-4 text-xs text-gray-400 hover:text-gray-600 transition-colors text-center py-2">
            Skip for now →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function WorkerDashboard() {
  const now = new Date();
  const [step,          setStep        ] = useState('pin');
  const [pin,           setPin         ] = useState('');
  const [error,         setError       ] = useState('');
  const [loading,       setLoading     ] = useState(false);
  const [data,          setData        ] = useState(null);
  const [month,         setMonth       ] = useState(now.getMonth() + 1);
  const [year,          setYear        ] = useState(now.getFullYear());
  const [sheet,         setSheet       ] = useState(null);
  const [docs,          setDocs        ] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError,   setPickerError ] = useState('');
  const [activeTab,     setActiveTab   ] = useState('home');
  const [salesPeriod,   setSalesPeriod ] = useState('month'); // 'today' | 'month' | 'year'
  const [historyData,   setHistoryData ] = useState(null);
  const [historyLoading,setHistoryLoading] = useState(false);
  const [breakStatus,   setBreakStatus ] = useState(null);
  const [breakLoading,  setBreakLoading] = useState(false);
  const [breakActing,   setBreakActing ] = useState(false);
  const [breakErr,      setBreakErr    ] = useState('');
  const [breakConfirm,  setBreakConfirm] = useState(null); // { type, label, allowedMinutes }

  const deviceToken = localStorage.getItem(TOKEN_KEY) || '';

  const load = async (p, mo, yr) => {
    setLoading(true); setError('');
    try {
      const [dashRes, docsRes] = await Promise.all([
        axios.get(`${BASE}/shortages/worker/dashboard?pin=${p}&month=${mo}&year=${yr}`),
        axios.get(`${BASE}/documents/worker?pin=${p}`).catch(() => ({ data: { data: { pending: [], signed: [] } } })),
      ]);
      const dashData = dashRes.data.data;
      setData(dashData);
      setDocs(docsRes.data.data);
      setStep('dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid PIN — try again');
      setPin('');
    } finally { setLoading(false); }
  };

  const loadHistory = useCallback(async (p) => {
    if (!p) return;
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${BASE}/worker/history?pin=${p}&year=${now.getFullYear()}`);
      setHistoryData(res.data.data);
    } catch {} finally { setHistoryLoading(false); }
  }, [now.getFullYear()]);

  const loadBreakStatus = useCallback(async (wId) => {
    if (!deviceToken || !wId) return;
    setBreakLoading(true);
    try {
      const res = await axios.get(`${BASE}/breaks/status`, { params: { deviceToken, workerId: wId } });
      setBreakStatus(res.data.data);
    } catch { setBreakStatus(null); } finally { setBreakLoading(false); }
  }, [deviceToken]);

  const doStartBreak = async (breakType, workerId) => {
    setBreakActing(true); setBreakErr('');
    try {
      await axios.post(`${BASE}/breaks/start`, { deviceToken, workerId, breakType });
      setBreakConfirm(null);
      await loadBreakStatus(workerId);
    } catch (e) { setBreakErr(e.response?.data?.message || 'Could not start break'); }
    finally { setBreakActing(false); }
  };

  const doEndBreak = async (workerId) => {
    setBreakActing(true); setBreakErr('');
    try {
      await axios.post(`${BASE}/breaks/end`, { deviceToken, workerId });
      await loadBreakStatus(workerId);
    } catch (e) { setBreakErr(e.response?.data?.message || 'Could not end break'); }
    finally { setBreakActing(false); }
  };

  useEffect(() => {
    if (step === 'dashboard' && !historyData && pin) loadHistory(pin);
  }, [step, historyData, pin, loadHistory]);

  useEffect(() => {
    if (step === 'dashboard' && deviceToken && data?.worker?._id) loadBreakStatus(data.worker._id);
  }, [step, deviceToken, data?.worker?._id, loadBreakStatus]);

  const handleSelectPump = async (pumpId) => {
    setPickerLoading(true); setPickerError('');
    try {
      await axios.post(`${BASE}/worker/select-pump`, { pin, pumpId });
      await load(pin, month, year);
    } catch (err) {
      setPickerError(err.response?.data?.message || 'Failed to select pump — try again');
      setPickerLoading(false);
    }
  };

  const changeMonth = (dir) => {
    let mo = month + dir, yr = year;
    if (mo < 1)  { mo = 12; yr--; }
    if (mo > 12) { mo = 1;  yr++; }
    setMonth(mo); setYear(yr);
    if (pin) load(pin, mo, yr);
  };

  const openSheet = (type) => {
    if (!data) return;
    const { shortages, attendanceDays } = data;
    if (type === 'present') {
      setSheet({ title: 'Days Present', emoji: '✅', rows: (attendanceDays || []).map(d => ({
        date: d.date, badge: fmtTime(d.clockIn), badgeCls: 'bg-green-100 text-green-700',
        sub: d.clockOut ? `Clocked out: ${fmtTime(d.clockOut)}` : 'No clock-out recorded',
      }))});
    }
    if (type === 'late')   setSheet({ title: 'Came Late',     emoji: '🕐', rows: shortages.filter(s => s.source === 'late_arrival').map(s => ({ date: s.date, badge: fmt(s.amount), badgeCls: 'bg-amber-100 text-amber-700', sub: s.notes || 'Late arrival' }))});
    if (type === 'absent') setSheet({ title: 'Marked Absent', emoji: '❌', rows: shortages.filter(s => s.source === 'absent').map(s => ({ date: s.date, badge: fmt(s.amount), badgeCls: 'bg-red-100 text-red-700', sub: s.notes || 'Absent' }))});
    if (type === 'noshow') setSheet({ title: 'Did Not Come',  emoji: '❌', rows: shortages.filter(s => s.source === 'no_clockin').map(s => ({ date: s.date, badge: fmt(s.amount), badgeCls: 'bg-red-100 text-red-700', sub: s.notes || 'Did not come in' }))});
    if (type === 'early')  setSheet({ title: 'Left Early',    emoji: '🚪', rows: shortages.filter(s => s.source === 'early_departure').map(s => ({ date: s.date, badge: fmt(s.amount), badgeCls: 'bg-orange-100 text-orange-700', sub: s.notes || 'Left early' }))});
    if (type === 'litres') {
      const rows = (data.pump?.dailyLitres || []).map(d => ({
        date: d.date, badge: fmtL(d.litres), badgeCls: 'bg-brand-100 text-brand-700', sub: d.islandName || '',
      }));
      setSheet({ title: 'Litres Sold', emoji: '⛽', rows });
    }
  };

  // ── PIN screen ─────────────────────────────────────────────────────────────
  if (step === 'pin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden">
          <div className="bg-brand-600 px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">👤</span>
            </div>
            <h1 className="text-white text-xl font-bold">Worker Portal</h1>
            <p className="text-brand-100 text-sm mt-1">Enter your 4-digit PIN</p>
          </div>
          <PinPad pin={pin} onChange={setPin} onSubmit={p => load(p, month, year)} loading={loading} error={error} />
        </div>
      </div>
    );
  }

  // ── Clock-in / clock-out step (approved device only) ────────────────────────
  if (step === 'clockin' || step === 'clockout') {
    const clockType = step === 'clockin' ? 'clock_in' : 'clock_out';
    return (
      <ClockStep
        worker={data.worker}
        deviceToken={deviceToken}
        clockType={clockType}
        onSuccess={async () => { await load(pin, month, year); }}
        onSkip={() => setStep('dashboard')}
      />
    );
  }

  // ── Pump picker ─────────────────────────────────────────────────────────────
  if (step === 'pump-picker') {
    const pumpData  = data?.pump;
    const island    = pumpData?.assignment;
    const pumps     = pumpData?.islandPumps || [];
    const firstName = data?.worker?.fullName?.split(' ')[0] || 'there';

    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden">
          <div className="bg-brand-600 px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">⛽</span>
            </div>
            <h1 className="text-white text-xl font-bold">Welcome, {firstName}!</h1>
            <p className="text-brand-100 text-sm mt-1">
              You're assigned to <span className="font-bold text-white">{island?.islandName || 'your island'}</span>
            </p>
          </div>
          <div className="px-5 py-5">
            <p className="text-sm font-semibold text-gray-600 text-center mb-4">
              Which pump will you be selling from today?
            </p>
            <div className="space-y-3">
              {pumps.map(p => {
                const isAvailable = !p.inUse && p.status === 'active';
                const statusLabel = p.inUse ? 'In Use' : p.status === 'faulty' ? 'Faulty' : p.status === 'out_of_stock' ? 'No Fuel' : 'Available';
                const statusCls   = p.inUse ? 'bg-red-100 text-red-600' : p.status === 'faulty' ? 'bg-orange-100 text-orange-600' : p.status === 'out_of_stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
                return (
                  <button key={p.pumpId} disabled={!isAvailable || pickerLoading} onClick={() => handleSelectPump(p.pumpId)}
                    className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border-2 transition-all
                      ${isAvailable ? 'border-brand-200 bg-brand-50 hover:border-brand-500 hover:bg-brand-100 active:scale-95 cursor-pointer' : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isAvailable ? 'bg-brand-100' : 'bg-gray-100'}`}>
                        <Fuel size={18} className={isAvailable ? 'text-brand-600' : 'text-gray-400'} />
                      </div>
                      <div className="text-left">
                        <p className={`font-bold text-base ${isAvailable ? 'text-gray-800' : 'text-gray-400'}`}>{p.pumpName}</p>
                        <p className="text-xs text-gray-400">{p.productType}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${statusCls}`}>{statusLabel}</span>
                  </button>
                );
              })}
            </div>
            {pickerError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl mt-4 text-center font-medium">{pickerError}</p>}
            {pickerLoading && (
              <div className="flex items-center justify-center gap-2 mt-4 text-brand-600">
                <Loader size={18} className="animate-spin" />
                <span className="text-sm font-medium">Selecting pump…</span>
              </div>
            )}
            <button onClick={() => { setStep('pin'); setPin(''); setData(null); }}
              className="w-full mt-5 text-xs text-gray-400 hover:text-gray-600 transition-colors text-center py-1">
              ← Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const { worker, attendance, salary, shortages, period } = data;
  const pct = salary.baseSalary > 0
    ? Math.max(0, Math.round((salary.expectedPay / salary.baseSalary) * 100))
    : 100;

  const pumpData   = data.pump;
  const breakdown  = pumpData?.todayPumpBreakdown || [];
  const grandTotal = breakdown.reduce((s, p) => s + (p.litres || 0), 0);
  const isMultiPump = breakdown.length > 1;

  const todayStatus    = pumpData?.todayStatus || {};

  const OFFENCE_LABELS = {
    late_arrival: 'Late Arrival', absent_without_notice: 'Absent Without Notice',
    improper_uniform: 'Improper Uniform', rude_to_customer: 'Rude to Customer',
    cash_shortage: 'Cash Shortage', fuel_shortage: 'Fuel Shortage',
    negligence: 'Negligence', theft_fraud: 'Theft / Fraud',
    disobedience: 'Disobedience', mobile_phone_misuse: 'Phone Misuse',
    fighting_misconduct: 'Fighting / Misconduct', damage_to_property: 'Damage to Property',
    abandoning_post: 'Abandoning Post', insubordination: 'Insubordination',
    sleeping_on_duty: 'Sleeping on Duty', other: 'Other',
  };
  const SEVERITY_CLS = { minor: 'bg-yellow-100 text-yellow-700', moderate: 'bg-orange-100 text-orange-600', serious: 'bg-red-100 text-red-600', gross: 'bg-red-200 text-red-800' };

  const NAV = [
    { id: 'home',    icon: Home,      label: 'Home'    },
    { id: 'sales',   icon: Droplets,  label: 'Sales'   },
    { id: 'records', icon: FileText,  label: 'Records' },
    { id: 'salary',  icon: Banknote,  label: 'Salary'  },
  ];

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      {sheet && <DetailSheet title={sheet.title} emoji={sheet.emoji} rows={sheet.rows} onClose={() => setSheet(null)} />}

      {/* Top bar */}
      <div className="bg-brand-600 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {worker.photo
              ? <img src={worker.photo} alt="" className="w-11 h-11 rounded-full object-cover border-2 border-white/40" />
              : <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold">
                  {worker.fullName?.[0]?.toUpperCase()}
                </div>
            }
            <div>
              <p className="text-white font-bold text-base leading-tight">{worker.fullName}</p>
              <p className="text-brand-100 text-xs">{worker.role} · {worker.branchName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {todayStatus.clockedIn && (
              <span className="flex items-center gap-1 text-xs bg-white/20 text-white px-2 py-1 rounded-full font-medium">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                {todayStatus.clockedOut ? 'Clocked Out' : 'Clocked In'}
              </span>
            )}
            <button onClick={() => { setStep('pin'); setPin(''); setData(null); setHistoryData(null); }}
              className="flex items-center gap-1 text-white/70 hover:text-white text-xs transition-colors">
              <LogOut size={14} /> Exit
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── HOME TAB ─────────────────────────────────────────────────────── */}
        {activeTab === 'home' && (
          <>
            {/* Clock-in card — approved device only */}
            {deviceToken && !todayStatus.clockedIn && (
              <div className="rounded-2xl p-4 flex items-center justify-between shadow-sm bg-green-50 border border-green-200">
                <div>
                  <p className="font-bold text-sm text-green-800">You haven't clocked in yet</p>
                  <p className="text-xs text-gray-500 mt-0.5">Tap to record your arrival</p>
                </div>
                <button onClick={() => setStep('clockin')}
                  className="px-4 py-2.5 rounded-xl text-white text-sm font-bold active:scale-95 bg-green-600">
                  🟢 Clock In
                </button>
              </div>
            )}

            {/* Clock-out card — approved device only (face scan required) */}
            {todayStatus.clockedIn && !todayStatus.clockedOut && (
              deviceToken ? (
                <div className="rounded-2xl p-4 flex items-center justify-between shadow-sm bg-red-50 border border-red-200">
                  <div>
                    <p className="font-bold text-sm text-red-700">Ready to clock out?</p>
                    <p className="text-xs text-gray-500 mt-0.5">Face scan required</p>
                  </div>
                  <button onClick={() => setStep('clockout')}
                    className="px-4 py-2.5 rounded-xl text-white text-sm font-bold active:scale-95 bg-red-500">
                    🔴 Clock Out
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl p-4 shadow-sm bg-red-50 border border-red-200 text-center">
                  <p className="text-2xl mb-1">📱</p>
                  <p className="text-sm font-semibold text-red-700">Clock Out Requires Terminal</p>
                  <p className="text-xs text-gray-400 mt-1">Use the approved attendance device to clock out with face scan</p>
                </div>
              )
            )}

            {/* Inline pump picker — shown whenever needsPicker (any device) */}
            {pumpData?.needsPicker && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 flex items-center justify-between border-b border-amber-100">
                  <div>
                    <p className="font-bold text-amber-800 text-sm">⛽ Select Your Pump</p>
                    <p className="text-xs text-amber-600 mt-0.5">Which pump are you selling from today?</p>
                  </div>
                  {pickerLoading && <Loader size={14} className="animate-spin text-amber-500" />}
                </div>
                <div className="px-4 py-3 space-y-2">
                  {(pumpData?.islandPumps || []).map(p => {
                    const avail = !p.inUse && p.status === 'active';
                    const statusLabel = p.inUse ? 'In Use' : p.status !== 'active' ? 'Unavailable' : 'Available';
                    const statusCls   = p.inUse ? 'bg-red-100 text-red-600' : p.status !== 'active' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-700';
                    return (
                      <button key={p.pumpId} disabled={!avail || pickerLoading} onClick={() => handleSelectPump(p.pumpId)}
                        className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border-2 transition-all
                          ${avail ? 'border-amber-300 bg-white active:scale-95 hover:border-amber-500' : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'}`}>
                        <div className="flex items-center gap-2">
                          <Fuel size={15} className={avail ? 'text-brand-600' : 'text-gray-300'} />
                          <span className={`font-semibold text-sm ${avail ? 'text-gray-800' : 'text-gray-400'}`}>{p.pumpName}</span>
                          {p.productType && <span className="text-[10px] text-gray-400">({p.productType})</span>}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusCls}`}>{statusLabel}</span>
                      </button>
                    );
                  })}
                  {pickerError && <p className="text-xs text-red-600 text-center font-medium">{pickerError}</p>}
                </div>
              </div>
            )}

            {/* Break section — clocked in and not clocked out */}
            {todayStatus.clockedIn && !todayStatus.clockedOut && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">☕</span>
                    <p className="font-bold text-gray-800 text-sm">Break</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {breakLoading && <Loader size={13} className="animate-spin text-gray-400" />}
                    <button onClick={() => loadBreakStatus(data.worker._id)}
                      className="text-[10px] text-brand-500 font-semibold px-2 py-1 rounded-lg bg-brand-50 active:scale-95">
                      Refresh
                    </button>
                  </div>
                </div>
                {!deviceToken ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-2xl mb-1">📱</p>
                    <p className="text-sm font-semibold text-gray-600">Use Attendance Terminal</p>
                    <p className="text-xs text-gray-400 mt-1">Break can only be started from the approved station device</p>
                  </div>
                ) : breakErr ? (
                  <p className="text-xs text-red-600 bg-red-50 px-4 py-2 text-center font-medium">{breakErr}</p>
                ) : breakStatus?.activeBreak ? (
                  <div className="px-4 py-4">
                    <div className={`rounded-xl p-3 mb-3 ${breakStatus.activeBreak.isOverdue ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className={`font-bold text-sm ${breakStatus.activeBreak.isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                          {breakStatus.activeBreak.label}
                          {breakStatus.activeBreak.isOverdue ? ' — OVERDUE ⚠️' : ''}
                        </p>
                        <span className={`text-xs font-black ${breakStatus.activeBreak.isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                          {breakStatus.activeBreak.elapsedMinutes} / {breakStatus.activeBreak.allowedMinutes} min
                        </span>
                      </div>
                      {breakStatus.activeBreak.isOverdue && (
                        <p className="text-xs text-red-600">{breakStatus.activeBreak.excessMinutes} min over limit</p>
                      )}
                    </div>
                    <button onClick={() => doEndBreak(data.worker._id)} disabled={breakActing}
                      className="w-full py-3 bg-green-600 text-white font-bold rounded-xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 text-sm">
                      {breakActing ? <Loader size={15} className="animate-spin" /> : '✓ End Break'}
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-3">
                    {(breakStatus?.availableBreaks || []).length === 0 && !breakLoading && (
                      <p className="text-xs text-gray-400 text-center py-2">No breaks available right now</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {(breakStatus?.availableBreaks || []).map(b => {
                        const off = b.taken || !b.inWindow;
                        return (
                          <button key={b.type} disabled={off || breakActing}
                            onClick={() => !off && setBreakConfirm(b)}
                            className={`px-3 py-3 rounded-xl border-2 text-left transition-all active:scale-95
                              ${b.taken ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                               : b.inWindow ? 'border-brand-200 bg-brand-50 hover:border-brand-400'
                               : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'}`}>
                            <p className={`text-xs font-bold ${b.taken || !b.inWindow ? 'text-gray-400' : 'text-brand-700'}`}>
                              {b.label}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {b.taken ? '✓ Done' : b.inWindow ? `${b.allowedMinutes} min` : `From ${b.windowStart}`}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    {breakStatus?.todayBreaks?.some(b => b.status === 'overstayed') && (
                      <p className="text-xs text-amber-600 text-center mt-2 font-medium">
                        ⚠️ You exceeded break time today
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Break confirm sheet */}
            {breakConfirm && (
              <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setBreakConfirm(null)}>
                <div className="absolute inset-0 bg-black/40" />
                <div className="relative bg-white rounded-t-3xl shadow-2xl px-5 pt-4 pb-8" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-center mb-4">
                    <div className="w-10 h-1 bg-gray-300 rounded-full" />
                  </div>
                  <div className="text-center mb-6">
                    <p className="text-4xl mb-2">☕</p>
                    <p className="font-bold text-gray-800 text-xl">{breakConfirm.label}</p>
                    <p className="text-gray-500 text-sm mt-1">You have <strong>{breakConfirm.allowedMinutes} minutes</strong></p>
                    <p className="text-xs text-gray-400 mt-0.5">{breakConfirm.windowStart} – {breakConfirm.windowEnd}</p>
                  </div>
                  {breakErr && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center mb-3 font-medium">{breakErr}</p>}
                  <button onClick={() => doStartBreak(breakConfirm.type, data.worker._id)} disabled={breakActing}
                    className="w-full py-4 bg-brand-600 text-white font-bold rounded-2xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 text-base">
                    {breakActing ? <Loader size={18} className="animate-spin" /> : 'Start Break'}
                  </button>
                  <button onClick={() => { setBreakConfirm(null); setBreakErr(''); }}
                    className="w-full py-3 mt-2 text-gray-500 text-sm font-medium text-center">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Month selector */}
            <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm">
              <button onClick={() => changeMonth(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <ChevronLeft size={20} className="text-gray-500" />
              </button>
              <p className="font-bold text-gray-800 text-base">{MONTHS[period.month - 1]} {period.year}</p>
              <button onClick={() => changeMonth(1)}
                disabled={period.month === now.getMonth()+1 && period.year === now.getFullYear()}
                className="p-2 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-30">
                <ChevronRight size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Salary card */}
            <div className="bg-brand-600 rounded-3xl p-6 text-white shadow-lg">
              <p className="text-brand-100 text-sm font-medium mb-1">Expected Pay This Month</p>
              <p className="text-5xl font-extrabold tracking-tight">{fmt(salary.expectedPay)}</p>
              <div className="mt-4 bg-white/20 rounded-full h-2.5">
                <div className="bg-white h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-xs text-brand-100">
                <span>Base: {fmt(salary.baseSalary)}</span>
                <span>Deducted: {fmt(salary.totalDeducted)}</span>
              </div>
              {salary.bonus > 0 && <p className="text-xs text-brand-100 mt-1">+ Bonus: {fmt(salary.bonus)}</p>}
            </div>

            {/* Today's pump */}
            {pumpData && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge size={15} className="text-brand-500" />
                    <p className="font-bold text-gray-800">{isMultiPump ? "Today's Sales" : "Today's Pump"}</p>
                  </div>
                  {isMultiPump && grandTotal > 0 && <span className="text-sm font-black text-brand-700">{fmtL(grandTotal)} total</span>}
                  {!isMultiPump && breakdown[0]?.litres != null && <span className="text-sm font-bold text-brand-600">{fmtL(breakdown[0].litres)} sold</span>}
                </div>
                {!pumpData.assignment ? (
                  <div className="px-4 py-5 text-center text-gray-400 text-sm">No pump assigned today</div>
                ) : (
                  <div className="px-4 py-3 space-y-3">
                    {!isMultiPump && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{pumpData.assignment.islandName}</span>
                        {breakdown[0] && (
                          <>
                            <span className="text-gray-300">›</span>
                            <span className="text-sm font-bold text-gray-800">{breakdown[0].pumpName}</span>
                            {breakdown[0].productType && <span className="text-[10px] bg-brand-100 text-brand-700 font-semibold px-1.5 py-0.5 rounded-full">{breakdown[0].productType}</span>}
                          </>
                        )}
                        {!breakdown.length && <span className="text-sm font-bold text-gray-800">{pumpData.assignment.assignedPumps?.[0]?.pumpName || '—'}</span>}
                      </div>
                    )}
                    {breakdown.length > 0 ? (
                      <div className="space-y-2">
                        {breakdown.map((p, i) => (
                          <div key={p.pumpId || i}>
                            {isMultiPump && (
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1">
                                {p.islandName} · {p.pumpName}
                                {i < breakdown.length - 1 && <span className="ml-1 text-orange-400">(previous)</span>}
                              </p>
                            )}
                            <PumpReadingCard pump={p} />
                          </div>
                        ))}
                        {isMultiPump && grandTotal > 0 && (
                          <div className="flex items-center justify-between bg-brand-50 rounded-xl px-3 py-2.5">
                            <span className="text-sm font-bold text-brand-700">Grand Total Sold Today</span>
                            <span className="text-base font-black text-brand-700">{fmtL(grandTotal)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl px-3 py-4 text-center">
                        <Fuel size={20} className="text-gray-300 mx-auto mb-1.5" />
                        <p className="text-xs text-gray-400">
                          {pumpData.assignment.assignedPumps?.length === 1
                            ? "Supervisor hasn't entered your opening meter yet"
                            : 'Meter readings not entered yet for today'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Attendance stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard value={attendance.daysPresent}   label="Days Present"  emoji="✅" color="text-green-600"  hasDetail={attendance.daysPresent > 0}   onClick={() => attendance.daysPresent > 0 && openSheet('present')} />
              <StatCard value={attendance.noShowDays}    label="Did Not Come"  emoji="❌" color="text-red-500"    hasDetail={attendance.noShowDays > 0}    onClick={() => attendance.noShowDays > 0 && openSheet('noshow')} />
              <StatCard value={attendance.lateDays}      label="Came Late"     emoji="🕐" color="text-amber-500"  hasDetail={attendance.lateDays > 0}      onClick={() => attendance.lateDays > 0 && openSheet('late')} />
              <StatCard value={attendance.earlyExitDays} label="Left Early"    emoji="🚪" color="text-orange-500" hasDetail={attendance.earlyExitDays > 0} onClick={() => attendance.earlyExitDays > 0 && openSheet('early')} />
            </div>

            {/* Deductions */}
            {shortages.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-bold text-gray-800">💸 Deductions</p>
                  <span className="text-sm font-bold text-red-600">- {fmt(salary.totalDeducted)}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {shortages.map(s => (
                    <div key={s._id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtDate(s.date)}{s.notes ? ` · ${s.notes.replace(/\(deadline.*\)/, '').trim()}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-red-500 shrink-0 ml-3">- {fmt(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <p className="text-3xl mb-2">🎉</p>
                <p className="font-bold text-gray-800">No Deductions!</p>
                <p className="text-sm text-gray-400 mt-1">Great work this month</p>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 pb-2">
              Values may change until payroll is finalised
            </p>

            {/* Documents */}
            {docs && (docs.pending?.length > 0 || docs.signed?.length > 0) && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="font-bold text-gray-800">📄 Company Documents</p>
                </div>
                {docs.pending?.length > 0 && (
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
                    <p className="text-xs font-bold text-amber-700 mb-2">⚠️ Requires your signature</p>
                    {docs.pending.map(d => (
                      <div key={d._id} className="flex items-center justify-between py-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                        <a href="/worker" className="text-xs text-brand-600 font-semibold underline shrink-0 ml-2">Sign →</a>
                      </div>
                    ))}
                  </div>
                )}
                {docs.signed?.map(d => (
                  <div key={d._id} className="px-4 py-3 flex items-center gap-3 border-b border-gray-50">
                    <span className="text-xl shrink-0">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{d.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Signed {d.signedAt ? new Date(d.signedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                    <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full shrink-0">✓ SIGNED</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SALES TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'sales' && (
          <>
            {/* Period toggle */}
            <div className="flex bg-white rounded-2xl shadow-sm p-1 gap-1">
              {[['today','Today'],['month','Month'],['year','Year']].map(([id, label]) => (
                <button key={id} onClick={() => setSalesPeriod(id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    salesPeriod === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Today */}
            {salesPeriod === 'today' && (
              <div className="space-y-3">
                <div className="bg-brand-600 rounded-2xl p-5 text-white text-center shadow-lg">
                  <p className="text-brand-100 text-sm mb-1">Total Sold Today</p>
                  <p className="text-4xl font-extrabold">{grandTotal > 0 ? fmtL(grandTotal) : '—'}</p>
                  {grandTotal === 0 && <p className="text-brand-200 text-xs mt-1">No meter readings recorded yet</p>}
                </div>
                {breakdown.length > 0 && breakdown.map((p, i) => (
                  <div key={i} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-700">{p.pumpName}</p>
                      {p.litres != null && <span className="text-sm font-black text-brand-700">{fmtL(p.litres)}</span>}
                    </div>
                    <div className="px-4 py-3">
                      <PumpReadingCard pump={p} />
                    </div>
                  </div>
                ))}
                {breakdown.length === 0 && (
                  <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                    <Fuel size={32} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No readings entered yet today</p>
                  </div>
                )}
              </div>
            )}

            {/* Month */}
            {salesPeriod === 'month' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm">
                  <button onClick={() => changeMonth(-1)} className="p-2 rounded-xl hover:bg-gray-100">
                    <ChevronLeft size={20} className="text-gray-500" />
                  </button>
                  <p className="font-bold text-gray-800">{MONTHS[period.month - 1]} {period.year}</p>
                  <button onClick={() => changeMonth(1)}
                    disabled={period.month === now.getMonth()+1 && period.year === now.getFullYear()}
                    className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30">
                    <ChevronRight size={20} className="text-gray-500" />
                  </button>
                </div>
                <div className="bg-brand-600 rounded-2xl p-5 text-white text-center shadow-lg">
                  <p className="text-brand-100 text-sm mb-1">Total This Month</p>
                  <p className="text-4xl font-extrabold">{pumpData?.monthlyLitres > 0 ? fmtL(pumpData.monthlyLitres) : '—'}</p>
                </div>
                {(pumpData?.dailyLitres || []).length > 0 ? (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">Daily Breakdown</p>
                    <div className="divide-y divide-gray-50">
                      {[...(pumpData.dailyLitres || [])].reverse().map((d, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-3">
                          <p className="text-sm text-gray-700">{fmtDate(d.date)}</p>
                          <span className="text-sm font-bold text-brand-700">{fmtL(d.litres)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                    <Droplets size={32} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No sales recorded this month</p>
                  </div>
                )}
              </div>
            )}

            {/* Year */}
            {salesPeriod === 'year' && (
              historyLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-600">
                  <Loader size={28} className="animate-spin" />
                  <p className="text-sm text-gray-400">Loading yearly data…</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-brand-600 rounded-2xl p-5 text-white text-center shadow-lg">
                    <p className="text-brand-100 text-sm mb-1">Total This Year ({now.getFullYear()})</p>
                    <p className="text-4xl font-extrabold">{historyData?.yearlyLitres > 0 ? fmtL(historyData.yearlyLitres) : '—'}</p>
                  </div>
                  {(historyData?.yearlyByMonth || []).length > 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">Monthly Breakdown</p>
                      <div className="divide-y divide-gray-50">
                        {[...(historyData.yearlyByMonth || [])].reverse().map((m, i) => {
                          const [yr, mo] = m.month.split('-');
                          return (
                            <div key={i} className="flex items-center justify-between px-4 py-3">
                              <p className="text-sm text-gray-700">{MONTHS_SHORT[+mo - 1]} {yr}</p>
                              <span className="text-sm font-bold text-brand-700">{fmtL(m.litres)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                      <BarChart2 size={32} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">No sales data for this year</p>
                    </div>
                  )}
                </div>
              )
            )}
          </>
        )}

        {/* ── RECORDS TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'records' && (
          historyLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-600">
              <Loader size={28} className="animate-spin" />
              <p className="text-sm text-gray-400">Loading records…</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Offences */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                  Offences ({(historyData?.offences || []).length})
                </p>
                {(historyData?.offences || []).length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="font-bold text-gray-700">No Offences on Record</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
                    {(historyData?.offences || []).map((o, i) => (
                      <div key={i} className="px-4 py-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800">{OFFENCE_LABELS[o.offenceType] || o.offenceType}</p>
                            {o.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{o.description}</p>}
                            <p className="text-xs text-gray-400 mt-1">{fmtDate(o.date)}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${SEVERITY_CLS[o.severity] || 'bg-gray-100 text-gray-600'}`}>
                              {o.severity}
                            </span>
                            {o.deductionAmount > 0 && (
                              <span className="text-xs font-bold text-red-500">-{fmt(o.deductionAmount)}</span>
                            )}
                            {o.status === 'dismissed' && (
                              <span className="text-[10px] font-semibold text-green-600">Dismissed</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Deductions history */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                  Deductions This Month
                </p>
                {shortages.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                    <p className="text-3xl mb-2">🎉</p>
                    <p className="font-bold text-gray-700">No Deductions This Month</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
                    {shortages.map(s => (
                      <div key={s._id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(s.date)}</p>
                        </div>
                        <span className="text-sm font-bold text-red-500 shrink-0 ml-3">-{fmt(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ── SALARY TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'salary' && (
          historyLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-600">
              <Loader size={28} className="animate-spin" />
              <p className="text-sm text-gray-400">Loading salary history…</p>
            </div>
          ) : (historyData?.salaryHistory || []).length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-bold text-gray-700 text-base">No Finalised Salary Yet</p>
              <p className="text-sm text-gray-400 mt-1">Records appear here once payroll is finalised by admin</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                {(historyData?.salaryHistory || []).length} payroll record{(historyData?.salaryHistory || []).length !== 1 ? 's' : ''}
              </p>
              {(historyData?.salaryHistory || []).map((s, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div>
                      <p className="font-bold text-gray-800 text-base">{fmtMonthYear(s.month, s.year)}</p>
                      {s.finalisedAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Finalised {new Date(s.finalisedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    {s.paid
                      ? <span className="flex items-center gap-1 text-xs font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                          <CheckCircle size={11} /> Paid
                        </span>
                      : <span className="flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                          <Clock size={11} /> Pending
                        </span>
                    }
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Gross Salary</span>
                      <span className="font-semibold text-gray-800">{fmt(s.grossSalary)}</span>
                    </div>
                    {s.bonus > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Bonus</span>
                        <span className="font-semibold text-green-600">+{fmt(s.bonus)}</span>
                      </div>
                    )}
                    {(s.shortage + s.absenceDeduction) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Deductions</span>
                        <span className="font-semibold text-red-500">-{fmt(s.shortage + s.absenceDeduction)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100 mt-1">
                      <span className="font-bold text-gray-700">Net Pay</span>
                      <span className="font-black text-brand-700 text-base">{fmt(s.netPay)}</span>
                    </div>
                  </div>
                  {s.paid && (
                    <div className="bg-green-50 px-4 py-2.5 text-center">
                      <p className="text-xs text-green-700 font-semibold">
                        ✓ {fmtMonthYear(s.month, s.year)} salary has been paid
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Bottom navigation ───────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-lg mx-auto flex">
          {NAV.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                activeTab === id ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
              }`}>
              <Icon size={22} />
              <span className="text-[10px] font-semibold">{label}</span>
              {activeTab === id && <div className="absolute bottom-0 w-8 h-0.5 bg-brand-600 rounded-full" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
