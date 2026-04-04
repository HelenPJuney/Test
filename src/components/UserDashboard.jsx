import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useRemoteParticipants,
} from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

const API = import.meta.env.VITE_BACKEND_URL || '';
const WS_URL = import.meta.env.VITE_BACKEND_WS || (API ? `${API.replace(/^http/, 'ws')}/ws/events` : '');
const IS_LOCALHOST = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const EFFECTIVE_WS = WS_URL || (
  typeof window !== 'undefined' && IS_LOCALHOST
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`
    : ''
);

/* ═══════════════════════════════════════════════════════════════════════════════
   Audio Visualizer — reused from CallerView pattern
   ═══════════════════════════════════════════════════════════════════════════════ */
function AudioVisualizer({ state, icon }) {
  return (
    <div className={`audio-visualizer ${state}`}>
      <div className="viz-ring" />
      <div className="viz-ring" />
      <div className="viz-ring" />
      <div className="viz-ring" />
      <div className="viz-core">{icon || '🎙️'}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Departments Config
   ═══════════════════════════════════════════════════════════════════════════════ */
const DEPARTMENTS = [
  {
    name: 'Billing Department',
    icon: '💰',
    desc: 'Payment issues, invoices, account charges, refunds & subscriptions.',
  },
  {
    name: 'Technical Department',
    icon: '🛠️',
    desc: 'System bugs, crashes, connectivity issues & technical troubleshooting.',
  },
  {
    name: 'Sales Department',
    icon: '📦',
    desc: 'New accounts, pricing plans, upgrades & product inquiries.',
  },
  {
    name: 'General Support',
    icon: '🎧',
    desc: 'Questions, feedback, general assistance & account information.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════════════
   InQueueView — inside LiveKitRoom, listens for TTS + agent join
   ═══════════════════════════════════════════════════════════════════════════════ */
function InQueueView({ sessionData, onEnd, onConnected }) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const agentConnected = sessionData.department === 'Callback'
    ? remoteParticipants.length > 0
    : remoteParticipants.some((p) => p.identity && p.identity.startsWith('agent-'));
  const hadRemoteRef = useRef(false);
  const activeAudioRef = useRef(null);

  // Detect agent connection
  useEffect(() => {
    if (agentConnected) {
      hadRemoteRef.current = true;
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current = null;
      }
      onConnected();
    }
  }, [agentConnected, onConnected]);

  // If the agent leaves after being connected, end the call locally.
  useEffect(() => {
    if (remoteParticipants.length > 0) return;
    if (!hadRemoteRef.current) return;
    onEnd();
  }, [remoteParticipants.length, onEnd]);

  // Listen for TTS data messages
  useEffect(() => {
    const handleData = (payload, _participant, _kind, topic) => {
      if (agentConnected || topic !== 'tts') return;
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data.action === 'play_tts' && data.text) {
          fetch(`${API}/tts/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
            body: JSON.stringify({ text: data.text, voice: 'en_US-ryan-high', room_id: room.name }),
          })
            .then((r) => r.blob())
            .then((blob) => {
              if (agentConnected) return;
              if (activeAudioRef.current) activeAudioRef.current.pause();

              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              activeAudioRef.current = audio;
              audio.play().catch(() => {});
              audio.onended = () => {
                URL.revokeObjectURL(url);
                if (activeAudioRef.current === audio) activeAudioRef.current = null;
              };
            })
            .catch((e) => console.warn('[TTS] Play error:', e));
        }
      } catch (e) { /* ignore */ }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => room.off(RoomEvent.DataReceived, handleData);
  }, [room, agentConnected]);

  const handleEndCall = useCallback(() => {
    if (sessionData.sessionId) {
      fetch(`${API}/cc/call/${sessionData.sessionId}`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': '1' },
      }).catch(() => {});
    }
    room.disconnect();
    onEnd();
  }, [room, sessionData.sessionId, onEnd]);

  return (
    <div className="ivr-screen glass-card-static">
      <AudioVisualizer
        state={agentConnected ? 'listening' : 'routing'}
        icon={agentConnected ? '🟢' : '⏳'}
      />

      {!agentConnected ? (
        <>
          <p className="ivr-status-text">
            Waiting in {sessionData.department} Queue
          </p>
          {sessionData.department !== 'Callback' ? (
            <p className="ivr-detail-text">
              Position <strong style={{ color: 'var(--accent-indigo)' }}>#{sessionData.queuePosition}</strong> · Estimated wait:{' '}
              <strong style={{ color: 'var(--accent-cyan)' }}>
                {Math.ceil(sessionData.waitSeconds / 60)} min
              </strong>
            </p>
          ) : (
            <p className="ivr-detail-text">
              Joining your callback room. Agent should connect in a few seconds.
            </p>
          )}
          <span
            className="incoming-dept-badge"
            style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', marginBottom: '1.5rem', display: 'inline-block' }}
          >
            {sessionData.department}
          </span>
          <p className="ivr-detail-text" style={{ marginTop: '1rem' }}>
            Please hold for the next available agent. Audio announcements will play automatically.
          </p>
        </>
      ) : (
        <>
          <div className="connected-badge">
            <span className="dot" />
            Connected to Agent
          </div>
          <p className="ivr-status-text" style={{ color: 'var(--accent-emerald)' }}>
            You are now speaking with a live agent.
          </p>
        </>
      )}

      <button className="btn btn-danger" onClick={handleEndCall} id="end-call-btn">
        ✕ End Call
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   UserDashboard — Main export
   States: email → departments → calling → in-queue → connected
   ═══════════════════════════════════════════════════════════════════════════════ */
export function UserDashboard() {
  const [phase, setPhase] = useState('email'); // email | departments | calling | in-queue | connected | offline | error
  const [email, setEmail] = useState(() => localStorage.getItem('cc_user_email') || '');
  const [userId, setUserId] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [sessionData, setSessionData] = useState({});
  const [offlineMsg, setOfflineMsg] = useState('');
  const [error, setError] = useState('');
  const [outboundCallback, setOutboundCallback] = useState(null);
  const normalizedEmail = email.trim().toLowerCase();

  // ── Listen for Callback via WebSocket ────────────────────────────────────
  useEffect(() => {
    if (!normalizedEmail || !normalizedEmail.includes('@') || !EFFECTIVE_WS) return;
    
    let ws = null;
    let reconnectTimer = null;

    const connectWs = () => {
      ws = new WebSocket(EFFECTIVE_WS);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventEmail = (data.user_email || '').trim().toLowerCase();
          if (data.type === 'caller_pickup' && eventEmail === normalizedEmail) {
            setOutboundCallback({ room: data.room });
          }
        } catch (e) { /* ignore */ }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWs, 3000);
      };
    };

    connectWs();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [normalizedEmail, EFFECTIVE_WS]);

  // ── Accept Callback ──────────────────────────────────────────────────────
  const handleAcceptCallback = useCallback(async () => {
    if (!outboundCallback) return;
    try {
      const res = await fetch(`${API}/cc/outbound/caller-token?room=${encodeURIComponent(outboundCallback.room)}&user_email=${encodeURIComponent(normalizedEmail)}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (!res.ok) throw new Error('Failed to get callback token');
      const data = await res.json();
      
      setSessionData({
        token: data.token,
        url: data.url,
        room: outboundCallback.room,
        department: 'Callback',
        queuePosition: 1,
        waitSeconds: 0,
      });
      setOutboundCallback(null);
      setPhase('in-queue'); // will transition to connected automatically
    } catch (err) {
      setError(err.message);
    }
  }, [normalizedEmail, outboundCallback]);

  const callbackPopup = outboundCallback && (
    <div className="outbound-popup" style={{ bottom: '2rem', right: '2rem' }}>
      <div className="outbound-label">📞 AGENT IS CALLING YOU BACK!</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', position: 'relative' }}>
        An agent is now ready to speak with you.
      </p>
      <div className="incoming-actions" style={{ position: 'relative' }}>
        <button className="btn btn-success" onClick={handleAcceptCallback} style={{ width: '100%', justifyContent: 'center' }}>
          ✓ Join Call
        </button>
        <button className="btn btn-danger" onClick={() => setOutboundCallback(null)} style={{ marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}>
          ✕ Ignore
        </button>
      </div>
    </div>
  );

  // ── Email submit ─────────────────────────────────────────────────────────
  const handleEmailSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!normalizedEmail || !normalizedEmail.includes('@')) return;
    try {
      const res = await fetch(`${API}/cc/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
      const data = await res.json();
      setUserId(data.user_id);
      localStorage.setItem('cc_user_email', normalizedEmail);
      setPhase('departments');
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  }, [normalizedEmail]);

  // ── Department selected ──────────────────────────────────────────────────
  const handleCallDepartment = useCallback(async (deptName) => {
    const deptToCall = deptName || selectedDepartment;
    if (!deptToCall) return;
    setPhase('calling');
    try {
      const res = await fetch(`${API}/cc/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ email: normalizedEmail, department: deptToCall }),
      });
      if (!res.ok) throw new Error(`Call failed: ${res.status}`);
      const data = await res.json();

      if (data.rejected) {
        setOfflineMsg(data.offline_message || 'We are currently closed.');
        setPhase('offline');
        return;
      }

      setSessionData({
        token: data.token,
        url: data.url,
        room: data.room,
        sessionId: data.session_id,
        callerIdentity: data.caller_identity,
        queuePosition: data.queue_position,
        waitSeconds: data.wait_seconds,
        waitMessage: data.wait_message,
        department: deptToCall,
      });
      setPhase('in-queue');
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  }, [normalizedEmail, selectedDepartment]);

  const resetAll = useCallback(() => {
    setPhase('departments');
    setSessionData({});
    setError('');
    setOfflineMsg('');
  }, []);

  // ── Email Phase ──────────────────────────────────────────────────────────
  if (phase === 'email' || phase === 'error') {
    return (
      <div className="user-dashboard">
        <div className="email-entry glass-card-static">
          {error && <div className="error-toast">⚠️ {error}</div>}

          <h2>
            Welcome to <span className="text-gradient">SR Comsoft</span>
          </h2>
          <p
            className="ivr-detail-text"
            style={{ marginBottom: '2rem', marginTop: '0.5rem' }}
          >
            Enter your email to get started
          </p>

          <form onSubmit={handleEmailSubmit}>
            <input
              type="email"
              className="email-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              id="email-input"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.9rem' }} id="email-continue-btn">
              Continue →
            </button>
          </form>
        </div>
        {callbackPopup}
      </div>
    );
  }

  // ── Department Selection ─────────────────────────────────────────────────
  if (phase === 'departments') {
    return (
      <div className="user-dashboard">
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Choose a Department</h2>
          <p className="ivr-detail-text" style={{ marginBottom: 0 }}>
            Select the team that can best help you
          </p>
          <p className="ivr-detail-text" style={{ marginTop: '0.35rem', fontSize: '0.9rem' }}>
            Stay on this screen to receive callback popups. Start a new call only when you tap call.
          </p>
        </div>

        <div className="dept-grid">
          {DEPARTMENTS.map((dept) => (
            <div
              key={dept.name}
              className="dept-card glass-card"
              onClick={() => setSelectedDepartment(dept.name)}
              style={{ borderColor: selectedDepartment === dept.name ? 'var(--accent-cyan)' : undefined }}
              id={`dept-${dept.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <div className="dept-card-icon">{dept.icon}</div>
              <div className="dept-card-name">{dept.name}</div>
              <div className="dept-card-desc">{dept.desc}</div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}
                onClick={(e) => { e.stopPropagation(); setSelectedDepartment(dept.name); }}
              >
                {selectedDepartment === dept.name ? 'Selected' : 'Select'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ justifyContent: 'center', minWidth: '260px' }}
            disabled={!selectedDepartment}
            onClick={() => handleCallDepartment(selectedDepartment)}
          >
            {selectedDepartment ? `Call ${selectedDepartment}` : 'Select a Department First'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <button
            className="btn btn-ghost"
            onClick={() => { setPhase('email'); setEmail(''); setUserId(null); localStorage.removeItem('cc_user_email'); }}
          >
            ← Change Email
          </button>
        </div>

        {callbackPopup}
      </div>
    );
  }

  // ── Calling / Loading ────────────────────────────────────────────────────
  if (phase === 'calling') {
    return (
      <div className="user-dashboard">
        <div className="ivr-screen glass-card-static">
          <AudioVisualizer state="routing" icon="📞" />
          <p className="ivr-status-text">Connecting...</p>
          <p className="ivr-detail-text">Setting up your call, please wait.</p>
        </div>
        {callbackPopup}
      </div>
    );
  }

  // ── Offline / Rejected ───────────────────────────────────────────────────
  if (phase === 'offline') {
    return (
      <div className="user-dashboard">
        <div className="offline-screen glass-card-static">
          <div className="offline-icon">🌙</div>
          <h2>We're Currently Closed</h2>
          <p>{offlineMsg}</p>
          <button className="btn btn-primary" onClick={resetAll} style={{ marginTop: '2rem' }}>
            ← Back to Departments
          </button>
        </div>
        {callbackPopup}
      </div>
    );
  }

  // ── In Queue / Connected ─────────────────────────────────────────────────
  if ((phase === 'in-queue' || phase === 'connected') && sessionData.token) {
    return (
      <div className="user-dashboard">
        <LiveKitRoom
          video={false}
          audio={true}
          token={sessionData.token}
          serverUrl={sessionData.url}
          connect={true}
          onDisconnected={resetAll}
        >
          <RoomAudioRenderer />
          <InQueueView
            sessionData={sessionData}
            onEnd={resetAll}
            onConnected={() => setPhase('connected')}
          />
        </LiveKitRoom>
        {callbackPopup}
      </div>
    );
  }

  return null;
}

