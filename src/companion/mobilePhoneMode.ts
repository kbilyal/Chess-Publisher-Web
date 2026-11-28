export function isMobilePhoneDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  const minDim = Math.min(width, height);

  const isIpadDesktop =
    navigator.platform === 'MacIntel' &&
    navigator.maxTouchPoints > 1 &&
    minDim >= 700;

  const isTabletUa =
    isIpadDesktop ||
    /\biPad\b|Tablet|PlayBook|Silk/i.test(ua) ||
    (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua));

  if (isTabletUa) {
    return width > 0 && width <= 640;
  }

  const isPhoneUa =
    (navigator as any).userAgentData?.mobile === true ||
    /iPhone|iPod|Android.*Mobile|Windows Phone|Mobile Safari/i.test(ua);

  return (width > 0 && width <= 640) || (isPhoneUa && minDim > 0 && minDim <= 500);
}

export function installMobilePhoneMode(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const apply = () => {
    document.documentElement.dataset.cpPhone = isMobilePhoneDevice() ? 'true' : 'false';
  };

  apply();
  window.addEventListener('resize', apply, { passive: true });
  window.addEventListener('orientationchange', apply, { passive: true });
  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
  };
}
