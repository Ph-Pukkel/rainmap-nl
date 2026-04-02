'use client';

import { useEffect, useRef } from 'react';

const SESSION_KEY = 'rainmap_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function usePageTracking() {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    const sessionId = getSessionId();

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: window.location.pathname,
        referrer: document.referrer || null,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        sessionId,
      }),
    }).catch(() => {}); // fire-and-forget
  }, []);
}
