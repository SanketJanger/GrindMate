import { Env } from './types';

const INGEST_URL = "https://usage-analytics-api-518291172957.us-central1.run.app/ingest";

export interface TrackEventParams {
  type: string;
  component: string;
  userId: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export async function trackEvent(env: Env, event: TrackEventParams): Promise<void> {
  // Guest demo account generates no real usage — skip it so the pipeline
  // doesn't fill up with the same seeded activity from every visitor.
  if (event.userId === 'guest_demo') return;

  try {
    const payload = {
      event_id:   crypto.randomUUID(),
      event_type: event.type,
      component:  event.component,
      user_id:    event.userId,
      session_id: event.sessionId,
      timestamp:  new Date().toISOString(),
      latency_ms: null,
      status_code: null,
      endpoint:   null,
      metadata:   event.metadata ? JSON.stringify(event.metadata) : null,
    };

    console.log('[analytics] Sending event:', event.type, event.component);

    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.INGEST_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('[analytics] Failed:', res.status, await res.text());
    } else {
      console.log('[analytics] Event tracked successfully:', event.type);
    }
  } catch (err) {
    // Never let analytics break the main app.
    console.error('[analytics] Error:', err);
  }
}
