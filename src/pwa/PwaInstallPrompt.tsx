import React, { useEffect, useState } from 'react';
import { Download, Share2, Smartphone, X } from 'lucide-react';
import './pwa-install.css';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const isiOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

export function PwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => standalone());
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('cp-pwa-install-dismissed') === '1');
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  if (installed || dismissed || !isMobile() || (!promptEvent && !isiOS())) return null;

  const install = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setPromptEvent(null);
      }
      return;
    }
    if (isiOS()) setShowIosHelp(true);
  };

  const dismiss = () => {
    sessionStorage.setItem('cp-pwa-install-dismissed', '1');
    setDismissed(true);
  };

  return (
    <aside className="pwa-install-card" aria-label="Install Chess-Publisher app">
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label="Dismiss install suggestion"><X size={16} /></button>
      <img src="/icons/chess-publisher-icon-192.png" alt="" className="pwa-install-icon" />
      <div className="pwa-install-copy">
        <strong>Install Chess-Publisher</strong>
        <span>Open it as its own phone app — without browser tabs or the address bar.</span>
        {showIosHelp && <span className="pwa-ios-help"><Share2 size={14} /> Tap Share, then <b>Add to Home Screen</b>.</span>}
      </div>
      <button type="button" className="pwa-install-button" onClick={install}>
        {isiOS() && !promptEvent ? <Smartphone size={17} /> : <Download size={17} />}
        {isiOS() && !promptEvent ? 'How to install' : 'Install app'}
      </button>
    </aside>
  );
}
