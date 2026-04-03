import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
} from '@livekit/components-react';

const API = import.meta.env.VITE_BACKEND_URL || '';
const WS_URL = import.meta.env.VITE_BACKEND_WS || '';

/* ═══════════════════════════════════════════════════════════════════════════════
   Department options
   ═══════════════════════════════════════════════════════════════════════════════ */
const DEPT_OPTIONS = [
  'Billing Department',
  'Technical Department',
  'Sales Department',
  'General Support',
];

/* ═══════════════════════════════════════════════════════════════════════════════
   ActiveCallView — Renders inside LiveKitRoom when agent is on a call
   ═══════════════════════════════════════════════════════════════════════════════ */
function ActiveCallView({ callInfo, onEndCall }) {
  const room = useRoomContext();

  const handleEnd = useCallback(() => {
    room.disconnect();
    onEndCall();
  }, [room, onEndCall]);

  return (
    <div className="incoming-call-popup" style={{ borderColor: 'rgba(52, 211, 153, 0.4)', background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.08), rgba(34, 211, 238, 0.08))' }}>
      <div className="incoming-label" style={{ color: 'var(--accent-emerald)' }}>
        <span className="ring-indicator" style={{ background: 'var(--accent-emerald)' }} />
        ACTIVE CALL
      </div>
      <div className="incoming-caller-info" style={{ position: 'relative' }}>
        <div>
          <div className="incoming-caller-name">
            📞 {callInfo.callerId || callInfo.userEmail || 'Unknown Caller'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span className="incoming-dept-badge">{callInfo.department}</span>
            {callInfo.sessionId && (
              <span className="queue-meta" style={{ alignSelf: 'center' }}>
                Session: {callInfo.sessionId.substring(0, 8)}...
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="incoming-actions">
        <button className="btn btn-danger" onClick={handleEnd}>
          ✕ End Call
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   OutboundPopup — 10-second countdown popup for outbound callbacks
   ═══════════════════════════════════════════════════════════════════════════════ */
function OutboundPopup({ outbound, onAccept, onDecline }) {
  const [countdown, setCountdown] = useState(30);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [reason, setReason] = useState('');
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <div className="outbound-popup">
      <div className="outbound-countdown">⏱️ {countdown}s</div>
      <div className="outbound-label">📤 OUTBOUND CALLBACK REQUEST</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', position: 'relative' }}>
        A caller waited in queue but left. You have an available callback.
      </p>
      <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500, marginBottom: '1rem', position: 'relative' }}>
        📧 {outbound.user_email} · {outbound.department}
      </p>

      {!showDeclineForm ? (
        <div className="incoming-actions" style={{ position: 'relative' }}>
          <button className="btn btn-success" onClick={() => onAccept(outbound)}>
            ✓ Accept Callback
          </button>
          <button className="btn btn-danger" onClick={() => setShowDeclineForm(true)}>
            ✕ Decline
          </button>
        </div>
      ) : (
        <div className="decline-form">
          <label>Reason</label>
          <input
            type="text"
            className="agent-name-input"
            placeholder="e.g. On break"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ marginBottom: '0.75rem' }}
          />
          <label>Ignore outbound calls for</label>
          <select
            className="decline-select"
            value={snoozeMinutes}
            onChange={(e) => setSnoozeMinutes(Number(e.target.value))}
          >
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
          <button
            className="btn btn-danger"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => onDecline(outbound, reason, snoozeMinutes)}
          >
            Confirm Decline & Snooze
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SnoozeWidget — visible when agent has active snooze
   ═══════════════════════════════════════════════════════════════════════════════ */
function SnoozeWidget({ snoozeUntil, onResume }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const until = new Date(snoozeUntil);
      const diff = Math.max(0, Math.floor((until - now) / 1000));
      if (diff <= 0) {
        setRemaining('Expired');
        return;
      }
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [snoozeUntil]);

  if (!snoozeUntil) return null;

  return (
    <div className="snooze-widget">
      <div>
        <div className="snooze-label">⏱️ Outbound Snooze Active</div>
        <div className="snooze-timer">{remaining} remaining</div>
      </div>
      <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }} onClick={onResume}>
        Resume Now
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   AgentDashboard — Main export
   States: login → online → in-call
   ═══════════════════════════════════════════════════════════════════════════════ */
export function AgentDashboard() {
  const [phase, setPhase] = useState('login'); // login | online | in-call
  const [agentName, setAgentName] = useState('');
  const [department, setDepartment] = useState(DEPT_OPTIONS[0]);
  const [agentIdentity, setAgentIdentity] = useState('');
  const [seqNumber, setSeqNumber] = useState(0);

  const [wsStatus, setWsStatus] = useState('connecting');
  const [backendOverride, setBackendOverride] = useState(localStorage.getItem('agent_backend_url') || '');

  // Online dashboard state
  const [queueCallers, setQueueCallers] = useState([]);
  const [deptAgents, setDeptAgents] = useState([]);
  const [outboundPopup, setOutboundPopup] = useState(null);
  const [snoozeUntil, setSnoozeUntil] = useState(null);

  // In-call state
  const [callToken, setCallToken] = useState(null);
  const [callUrl, setCallUrl] = useState('');
  const [callInfo, setCallInfo] = useState({});

  // UI state
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'agents' | 'history'
  const [historyRecords, setHistoryRecords] = useState([]);

  const wsRef = useRef(null);
  const pollTimerRef = useRef(null);
  const agentPollTimerRef = useRef(null);
  const agentIdentityRef = useRef(''); // ← always up-to-date, avoids stale closure in WS handler

  // Keep ref in sync with state
  useEffect(() => { agentIdentityRef.current = agentIdentity; }, [agentIdentity]);

  const effectiveAPI = backendOverride || API;
  const effectiveWS = effectiveAPI ? (effectiveAPI.replace(/^http/, 'ws') + '/ws/events') : WS_URL;

  // ── Login ────────────────────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    if (!agentName.trim()) return;
    let identity = localStorage.getItem('agent_identity');
    if (!identity) {
      identity = `agent-${agentName.trim().toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substring(2, 8)}`;
      localStorage.setItem('agent_identity', identity);
    }
    setAgentIdentity(identity);

    if (backendOverride) {
      localStorage.setItem('agent_backend_url', backendOverride);
    }
    const targetIdentity = identity || agentIdentity;

    try {
      const res = await fetch(`${effectiveAPI}/cc/agent/online`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ agent_identity: targetIdentity, agent_name: agentName.trim(), department }),
      });
      if (!res.ok) throw new Error(`Login failed: ${res.status}`);
      const data = await res.json();
      setSeqNumber(data.sequence_number);
      setPhase('online');
    } catch (err) {
      console.error('Agent login error:', err);
    }
  }, [agentName, department]);

  // ── Go Offline ───────────────────────────────────────────────────────────
  const handleGoOffline = useCallback(async () => {
    try {
      await fetch(`${effectiveAPI}/cc/agent/offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ agent_identity: agentIdentity }),
      });
    } catch (err) {
      console.error('Offline error:', err);
    }
    setPhase('login');
    // NOTE: intentionally NOT clearing agent_identity from localStorage
    // so the same agent reconnects with the same identity on next login
    setAgentIdentity('');
    setSeqNumber(0);
    setQueueCallers([]);
    setDeptAgents([]);
    setOutboundPopup(null);
    setSnoozeUntil(null);
  }, [agentIdentity]);

  // ── Polling: Queue + Agent list ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'online' && phase !== 'in-call') return;

    const pollQueue = async () => {
      try {
        const res = await fetch(`${effectiveAPI}/cc/queue?department=${encodeURIComponent(department)}`, {
          headers: { 'ngrok-skip-browser-warning': '1' },
        });
        if (res.ok) {
          const data = await res.json();
          setQueueCallers(data.callers || []);
        }
      } catch (e) { /* ignore */ }
    };

    const pollAgents = async () => {
      try {
        const res = await fetch(`${effectiveAPI}/cc/agent/department/${encodeURIComponent(department)}`, {
          headers: { 'ngrok-skip-browser-warning': '1' },
        });
        if (res.ok) {
          const data = await res.json();
          setDeptAgents(data.agents || []);

          // Check snooze status for self
          const self = (data.agents || []).find((a) => a.agent_identity === agentIdentity);
          if (self?.ignore_outbounds_until) {
            setSnoozeUntil(self.ignore_outbounds_until);
          } else {
            setSnoozeUntil(null);
          }
        }
      } catch (e) { /* ignore */ }
    };

    pollQueue();
    pollAgents();
    pollTimerRef.current = setInterval(pollQueue, 2000);
    agentPollTimerRef.current = setInterval(pollAgents, 3000);

    return () => {
      clearInterval(pollTimerRef.current);
      clearInterval(agentPollTimerRef.current);
    };
  }, [phase, department, agentIdentity]);

  // ── WebSocket: Outbound callback events ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'online' && phase !== 'in-call') return;
    if (!agentIdentity) return;

    let ws;
    const connectWs = () => {
      let targetWs;
      if (effectiveWS) {
        targetWs = effectiveWS;
      } else {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host.includes('vercel.app') ? 'localhost:8000' : window.location.host;
        targetWs = `${proto}//${host}/ws/events`;
      }

      console.log('[WS] Connecting to:', targetWs, '| identity:', agentIdentityRef.current);
      ws = new WebSocket(targetWs);

      ws.onopen = () => {
        console.log('[WS] Connected');
        setWsStatus('connected');
      };

      ws.onerror = () => setWsStatus('error');

      ws.onclose = () => {
        setWsStatus('reconnecting');
        setTimeout(() => {
          if (wsRef.current === ws) connectWs(); // only reconnect if still the active ws
        }, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] msg:', data.type, '| target:', data.target_agent, '| me:', agentIdentityRef.current);
          if (
            data.type === 'outbound_callback' &&
            data.target_agent === agentIdentityRef.current && // ← use ref, never stale
            agentIdentityRef.current !== ''
          ) {
            console.log('[WS] ✅ Outbound popup triggered!');
            setOutboundPopup(data);
          }
        } catch (e) { /* ignore parse errors */ }
      };

      wsRef.current = ws;
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      wsRef.current = null;
    };
  }, [phase, agentIdentity, effectiveWS]);

  // ── Accept call from queue ───────────────────────────────────────────────
  const handleAcceptCall = useCallback(async (caller) => {
    try {
      const res = await fetch(
        `${API}/cc/agent/accept/${caller.session_id}?agent_identity=${encodeURIComponent(agentIdentity)}&agent_name=${encodeURIComponent(agentName)}`,
        {
          method: 'POST',
          headers: { 'ngrok-skip-browser-warning': '1' },
        }
      );
      if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
      const data = await res.json();

      setCallToken(data.token);
      setCallUrl(data.url);
      setCallInfo({
        sessionId: data.session_id,
        room: data.room,
        callerId: data.caller_id,
        userEmail: data.user_email,
        department,
      });
      setPhase('in-call');
    } catch (err) {
      console.error('Accept call error:', err);
    }
  }, [agentIdentity, agentName, department]);

  // ── End call ─────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    try {
      await fetch(`${API}/cc/agent/end-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({
          agent_identity: agentIdentity,
          session_id: callInfo.sessionId,
        }),
      });
    } catch (err) {
      console.error('End call error:', err);
    }
    setCallToken(null);
    setCallUrl('');
    setCallInfo({});
    setPhase('online');
  }, [agentIdentity, callInfo.sessionId]);

  // ── Accept outbound ──────────────────────────────────────────────────────
  const handleAcceptOutbound = useCallback(async (ob) => {
    try {
      const res = await fetch(`${effectiveAPI}/cc/outbound/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ outbound_id: ob.outbound_id, agent_identity: agentIdentity }),
      });
      if (!res.ok) throw new Error(`Outbound accept failed: ${res.status}`);
      const data = await res.json();

      setCallToken(data.token);
      setCallUrl(data.url);
      setCallInfo({
        sessionId: `outbound-${ob.outbound_id}`,
        room: data.room,
        callerId: ob.user_email,
        userEmail: ob.user_email,
        department: ob.department,
      });
      setOutboundPopup(null);
      setPhase('in-call');
    } catch (err) {
      console.error('Outbound accept error:', err);
    }
  }, [agentIdentity]);

  // ── Decline outbound ─────────────────────────────────────────────────────
  const handleDeclineOutbound = useCallback(async (ob, reason, snoozeMinutes) => {
    try {
      const res = await fetch(`${API}/cc/outbound/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({
          outbound_id: ob.outbound_id,
          agent_identity: agentIdentity,
          reason,
          snooze_minutes: snoozeMinutes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSnoozeUntil(data.snooze_until);
      }
    } catch (err) {
      console.error('Decline error:', err);
    }
    setOutboundPopup(null);
  }, [agentIdentity]);

  // ── History polling ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'online' && phase !== 'in-call') return;
    const fetchHistory = async () => {
      try {
        const res = await fetch(
          `${effectiveAPI}/cc/outbound/history?department=${encodeURIComponent(department)}&limit=30`,
          { headers: { 'ngrok-skip-browser-warning': '1' } }
        );
        if (res.ok) {
          const data = await res.json();
          setHistoryRecords(data.history || []);
        }
      } catch (e) { /* ignore */ }
    };
    fetchHistory();
    const iv = setInterval(fetchHistory, 10000); // refresh every 10s
    return () => clearInterval(iv);
  }, [phase, department, effectiveAPI]);

  // ── Resume outbound ──────────────────────────────────────────────────────
  const handleResume = useCallback(async () => {
    try {
      await fetch(`${effectiveAPI}/cc/outbound/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ agent_identity: agentIdentity }),
      });
      setSnoozeUntil(null);
    } catch (err) {
      console.error('Resume error:', err);
    }
  }, [agentIdentity]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Login Phase
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'login') {
    return (
      <div className="agent-login glass-card-static">
        <h2>Agent Login</h2>
        <p className="ivr-detail-text" style={{ marginBottom: '1.5rem', marginTop: '0.5rem' }}>
          Sign in to start receiving calls
        </p>

        <div className="form-group">
          <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '0.3rem' }}>
            Backend URL (Local or Ngrok)
          </label>
          <input
            type="text"
            className="agent-name-input"
            placeholder="http://localhost:8000"
            value={backendOverride}
            onChange={(e) => setBackendOverride(e.target.value)}
            style={{ marginBottom: '1rem' }}
          />
        </div>

        <input
          type="text"
          className="agent-name-input"
          placeholder="Your name"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          id="agent-name-input"
          autoFocus
        />

        <select
          className="decline-select"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          id="agent-dept-select"
        >
          {DEPT_OPTIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '0.9rem', marginTop: '0.5rem' }}
          onClick={handleLogin}
          disabled={!agentName.trim()}
          id="agent-go-online-btn"
        >
          Go Online →
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Online / In-Call Dashboard 
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="agent-panel">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="agent-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          Agent Panel
          <span className="agent-seq-badge">
            Agent {seqNumber} · {department.split(' ')[0]}
          </span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`agent-status-badge ${phase === 'in-call' ? 'badge-busy' : 'badge-online'}`} title={`WS: ${wsStatus}`}>
            <span className={`status-dot ${wsStatus}`} style={phase === 'in-call' ? { background: 'var(--accent-amber)' } : {}} />
            {phase === 'in-call' ? 'Busy' : (wsStatus === 'connected' ? 'Online' : 'Reconnecting...')}
          </span>
          <button className="btn btn-ghost" onClick={handleGoOffline} id="agent-go-offline-btn">
            Go Offline
          </button>
        </div>
      </div>

      {/* ── Active Call (in-call phase) ──────────────────────────────────── */}
      {phase === 'in-call' && callToken && (
        <LiveKitRoom
          video={false}
          audio={true}
          token={callToken}
          serverUrl={callUrl}
          connect={true}
          onDisconnected={handleEndCall}
        >
          <RoomAudioRenderer />
          <ActiveCallView callInfo={callInfo} onEndCall={handleEndCall} />
        </LiveKitRoom>
      )}

      {/* ── Outbound Callback Popup ─────────────────────────────────────── */}
      {outboundPopup && phase === 'online' && (
        <OutboundPopup
          outbound={outboundPopup}
          onAccept={handleAcceptOutbound}
          onDecline={handleDeclineOutbound}
        />
      )}

      {/* ── Snooze Widget ───────────────────────────────────────────────── */}
      <SnoozeWidget snoozeUntil={snoozeUntil} onResume={handleResume} />

      {/* ── Tab Nav ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {[['queue', '📞 Queue'], ['agents', '👥 Agents'], ['history', '📋 History']].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: activeTab === tab ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.06)',
              color: activeTab === tab ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {label}
            {tab === 'queue' && queueCallers.length > 0 && (
              <span style={{ marginLeft: '0.4rem', background: 'var(--accent-cyan)', color: '#000', borderRadius: '10px', padding: '0 5px', fontSize: '0.72rem' }}>
                {queueCallers.length}
              </span>
            )}
            {tab === 'history' && historyRecords.filter(r => r.status === 'pending').length > 0 && (
              <span style={{ marginLeft: '0.4rem', background: 'var(--accent-amber)', color: '#000', borderRadius: '10px', padding: '0 5px', fontSize: '0.72rem' }}>
                {historyRecords.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Queue Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="glass-card-static">
          <div className="queue-dashboard-title">
            <h3>Call Queue — {department}</h3>
            <span className="queue-count-badge">{queueCallers.length} waiting</span>
          </div>
          <div className="queue-list">
            {queueCallers.length === 0 && (
              <div className="queue-empty">🎉 No callers waiting — all clear!</div>
            )}
            {queueCallers.map((caller) => (
              <div key={caller.session_id} className="queue-item">
                <div className="queue-item-info">
                  <span className="queue-caller-id">📞 {caller.caller_id}</span>
                  <span className="queue-meta">
                    #{caller.position} · Waiting {caller.wait_sec}s
                    {caller.user_email && ` · ${caller.user_email}`}
                  </span>
                </div>
                {phase === 'online' && (
                  <button
                    className="btn btn-success"
                    onClick={() => handleAcceptCall(caller)}
                    style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
                  >
                    ✓ Accept
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agents Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'agents' && (
        <div className="glass-card-static">
          <div className="queue-dashboard-title">
            <h3>Department Agents</h3>
            <span className="queue-count-badge">{deptAgents.length} registered</span>
          </div>
          <div className="agent-list">
            {deptAgents.length === 0 && (
              <div className="queue-empty">No agents registered in this department</div>
            )}
            {deptAgents.map((a) => (
              <div key={a.agent_identity} className="agent-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="agent-seq-badge" style={{ minWidth: '1.8rem', textAlign: 'center', padding: '0.2rem 0.5rem' }}>
                    {a.sequence_number}
                  </span>
                  <span className="agent-list-name">
                    {a.agent_name}
                    {a.agent_identity === agentIdentity ? ' (You)' : ''}
                  </span>
                </div>
                <span className={`agent-status-badge ${a.status === 'online' ? 'badge-online' : a.status === 'busy' ? 'badge-busy' : 'badge-offline'}`}>
                  <span
                    className="status-dot"
                    style={{
                      background:
                        a.status === 'online' ? 'var(--accent-emerald)' :
                        a.status === 'busy' ? 'var(--accent-amber)' :
                        'var(--text-muted)',
                      width: '6px', height: '6px', animation: 'none',
                    }}
                  />
                  {a.status === 'online' ? 'Online' : a.status === 'busy' ? 'On a call' : a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── History Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="glass-card-static">
          <div className="queue-dashboard-title">
            <h3>Callback History</h3>
            <span className="queue-count-badge">{historyRecords.length} records</span>
          </div>
          <div className="queue-list">
            {historyRecords.length === 0 && (
              <div className="queue-empty">No callback records yet</div>
            )}
            {historyRecords.map((r) => {
              const statusColor =
                r.status === 'completed' ? 'var(--accent-emerald)' :
                r.status === 'pending' ? 'var(--accent-amber)' :
                r.status === 'assigned' ? 'var(--accent-cyan)' :
                'var(--text-muted)';
              const statusIcon =
                r.status === 'completed' ? '✅' :
                r.status === 'pending' ? '⏳' :
                r.status === 'assigned' ? '📡' : '❌';
              const when = r.created_at
                ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--';
              return (
                <div key={r.id} className="queue-item">
                  <div className="queue-item-info">
                    <span className="queue-caller-id">{statusIcon} {r.user_email}</span>
                    <span className="queue-meta">
                      {r.department} · {when} · {r.attempts} attempt{r.attempts !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {r.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
