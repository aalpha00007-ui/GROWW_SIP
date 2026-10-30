'use client';
// Logs one funnel event when a page is actually shown: once per visit, never on a server re-render or a
// prefetch. The ref keeps React's development double-run from logging it twice.
import { useEffect, useRef } from 'react';
import { postJson } from './post-json';

export function LogEvent({ event, sipId, where }: { event: 'stop_checkin_opened' | 'dip_context_viewed'; sipId?: number; where?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void postJson('/api/events', { event, sipId, where });
  }, [event, sipId, where]);
  return null;
}
