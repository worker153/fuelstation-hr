/**
 * PWAInstallBanner
 *
 * Reusable install prompt shown on any page that should be installable
 * as a PWA app. Pass the manifest URL for the specific page.
 *
 * Usage:
 *   <PWAInstallBanner manifest="/terminal-manifest.json" />
 *   <PWAInstallBanner manifest="/shortage-manifest.json" dark />
 */
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

function usePWAInstall(manifest) {
  const [prompt,       setPrompt      ] = useState(null);
  const [installed,    setInstalled   ] = useState(false);
  const [isIOS,        setIsIOS       ] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Swap <link rel="manifest"> to the page-specific manifest
    const link = document.querySelector('link[rel="manifest"]');
    const prev = link?.getAttribute('href');
    if (link && manifest) link.setAttribute('href', manifest);

    // Detect platform
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );

    const onPrompt = e => { e.preventDefault(); setPrompt(e); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (link && prev) link.setAttribute('href', prev);
    };
  }, [manifest]);

  const triggerInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  return { prompt, installed, isIOS, isStandalone, triggerInstall };
}

export default function PWAInstallBanner({ manifest, dark = false }) {
  const { prompt, installed, isIOS, isStandalone, triggerInstall } = usePWAInstall(manifest);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed,    setDismissed   ] = useState(false);

  // Hide if already installed, already standalone, or dismissed
  if (isStandalone || installed || dismissed) return null;
  // Hide if nothing to show
  if (!prompt && !isIOS) return null;

  const bannerCls = dark
    ? 'bg-black/30 backdrop-blur border border-white/20'
    : 'bg-white/15 backdrop-blur border border-white/25';

  return (
    <>
      {/* ── Install Banner ──────────────────────────────────────────────────── */}
      <div className={`w-full px-3 py-2`}>
        <div className={`${bannerCls} rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl`}>
          <div className="bg-white/20 rounded-xl p-2 shrink-0">
            <Download size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Install as App</p>
            <p className="text-white/60 text-xs">Full screen · Works offline · Home screen icon</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setDismissed(true)}
              className="text-white/40 hover:text-white/70 text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              Later
            </button>
            {prompt && (
              <button
                onClick={triggerInstall}
                className="bg-white text-brand-800 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-brand-50 transition-colors shadow-md"
              >
                Install
              </button>
            )}
            {isIOS && !prompt && (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="bg-white text-brand-800 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-brand-50 transition-colors shadow-md"
              >
                How?
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── iOS Step-by-step guide modal ─────────────────────────────────────── */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-black text-gray-900 text-lg mb-1 text-center">
              Install on iPhone / iPad
            </p>
            <p className="text-gray-400 text-xs text-center mb-5">
              Must be opened in Safari
            </p>
            <div className="space-y-4">
              {[
                { step: '1', text: 'Tap the Share button',        sub: '⬆️ at the bottom of Safari' },
                { step: '2', text: 'Tap "Add to Home Screen"',    sub: 'Scroll down in the share sheet' },
                { step: '3', text: 'Tap "Add" to confirm',        sub: 'The app icon appears on your home screen' },
              ].map(({ step, text, sub }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">{step}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{text}</p>
                    <p className="text-gray-500 text-xs">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setShowIOSGuide(false); setDismissed(true); }}
              className="w-full mt-6 py-3 bg-brand-600 text-white font-bold rounded-2xl text-sm"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
