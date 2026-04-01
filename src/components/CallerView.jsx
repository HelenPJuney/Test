import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useParticipants,
} from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

/* ═══════════════════════════════════════════════════════════════════════════════
   BACKEND_BASE — resolves to the Vite proxy or the ngrok URL
   ═══════════════════════════════════════════════════════════════════════════════ */
const API = '';  // empty = same origin (Vite proxy handles it)

/* ═══════════════════════════════════════════════════════════════════════════════
   Audio Visualizer Component — Pulsing concentric rings
   State drives the animation class: idle | listening | speaking | routing
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
   IVR Active Room — The main call experience inside LiveKitRoom
   Handles: TTS playback, speech recognition, Gemini classification, routing
   ═══════════════════════════════════════════════════════════════════════════════ */
function IvrActiveRoom({ sessionData, onRouted, onEnd }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const agentConnected = participants.some(
    p => p.identity && p.identity.includes('helen-receiver')
  );

  // IVR state machine
  const [ivrState, setIvrState] = useState('greeting');
  // greeting → listening → confirming → classifying → routing → routed | connected
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState('Connecting...');
  const [detailText, setDetailText] = useState('');
  const [routingResult, setRoutingResult] = useState(null);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const isListeningRef = useRef(false);

  // ── Play audio from a URL (used for TTS WAVs) ─────────────────────────
  const playAudio = useCallback((url) => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = reject;
      audio.play().catch(reject);
    });
  }, []);

  // ── Play TTS from backend endpoint ─────────────────────────────────────
  const playTtsFromEndpoint = useCallback(async (endpoint) => {
    try {
      const res = await fetch(`${API}${endpoint}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (!res.ok) throw new Error(`TTS fetch failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      await playAudio(url);
    } catch (e) {
      console.warn('[TTS] Playback error:', e);
    }
  }, [playAudio]);

  // ── Web Speech API — potato-friendly STT (runs in browser, not on PC) ──
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Web Speech API not supported');
      setDetailText('Speech recognition not available in this browser.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event) => {
      // Reset silence timer on each result
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);

      // 5-second silence threshold
      silenceTimerRef.current = setTimeout(() => {
        if (finalTranscript.trim().length > 5) {
          // Got enough speech — move to confirmation
          recognition.stop();
          isListeningRef.current = false;
          setTranscript(finalTranscript.trim());
          handleConfirmation(finalTranscript.trim());
        }
      }, 5000);
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setDetailText('Microphone access denied. Please allow microphone.');
      }
    };

    recognition.onend = () => {
      // If we're still in listening state, restart (continuous mode can stop randomly)
      if (isListeningRef.current) {
        try { recognition.start(); } catch (e) { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    recognition.start();
  }, []);

  // ── Confirmation flow: "That's it sir?" ────────────────────────────────
  const handleConfirmation = useCallback(async (currentTranscript) => {
    setIvrState('confirming');
    setStatusText('Confirming your request...');
    setDetailText('');

    // Play "That's it sir?" TTS
    await playTtsFromEndpoint('/ivr/confirmation-prompt');

    // Brief listen for "yes" / "no" — simplified: auto-proceed after 4s
    setDetailText('Say "yes" to confirm, or continue speaking...');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // No speech API — just auto-confirm
      setTimeout(() => classifyAndRoute(currentTranscript), 3000);
      return;
    }

    const confirmRec = new SpeechRecognition();
    confirmRec.continuous = false;
    confirmRec.interimResults = false;
    confirmRec.lang = 'en-US';

    let answered = false;
    const autoTimer = setTimeout(() => {
      if (!answered) {
        answered = true;
        confirmRec.stop();
        classifyAndRoute(currentTranscript);
      }
    }, 8000);

    confirmRec.onresult = (event) => {
      const text = event.results[0][0].transcript.toLowerCase().trim();
      if (!answered) {
        answered = true;
        clearTimeout(autoTimer);
        confirmRec.stop();

        if (text.includes('yes') || text.includes('yeah') || text.includes('correct') || text.includes('right')) {
          classifyAndRoute(currentTranscript);
        } else if (text.includes('no') || text.includes('nah') || text.includes('wait')) {
          // Go back to listening
          setIvrState('listening');
          setStatusText('Listening...');
          setDetailText('Please describe your issue.');
          setTranscript('');
          startListening();
        } else {
          // Ambiguous — append and route
          classifyAndRoute(currentTranscript + ' ' + text);
        }
      }
    };

    confirmRec.onerror = () => {
      if (!answered) {
        answered = true;
        clearTimeout(autoTimer);
        classifyAndRoute(currentTranscript);
      }
    };

    try { confirmRec.start(); } catch (e) {
      if (!answered) {
        answered = true;
        clearTimeout(autoTimer);
        classifyAndRoute(currentTranscript);
      }
    }
  }, [playTtsFromEndpoint, startListening]);

  // ── Classify intent with Gemini and route ──────────────────────────────
  const classifyAndRoute = useCallback(async (finalText) => {
    setIvrState('classifying');
    setStatusText('Analyzing your request...');
    setDetailText('Our AI is determining the best department for you.');

    try {
      const res = await fetch(`${API}/ivr/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
        body: JSON.stringify({
          session_id: sessionData.sessionId,
          room_id: sessionData.roomName,
          transcript: finalText,
          caller_id: sessionData.identity,
        }),
      });

      if (!res.ok) throw new Error(`IVR process error: ${res.status}`);
      const data = await res.json();

      setRoutingResult(data);
      setIvrState('routing');
      setStatusText(`Routing to ${data.department}`);
      setDetailText(data.routing_message);

      // Play routing announcement TTS
      const deptSlug = data.department.toLowerCase().replace(/\s+/g, '-');
      await playTtsFromEndpoint(`/ivr/routing-audio/${deptSlug}`);

      // Signal parent that routing is complete
      onRouted(data);

    } catch (err) {
      console.error('[IVR] Classification failed:', err);
      setStatusText('Routing to Support Department');
      setDetailText('Connecting you to general support.');
      
      // Fallback: route to support
      const fallback = { department: 'Support Department', urgency: 3, routing_message: 'Routing to Support Department.' };
      setRoutingResult(fallback);
      setIvrState('routing');
      onRouted(fallback);
    }
  }, [sessionData, playTtsFromEndpoint, onRouted]);

  // ── Startup: Play greeting then start listening ────────────────────────
  useEffect(() => {
    let mounted = true;

    async function startIvr() {
      // Small delay for room to connect
      await new Promise(r => setTimeout(r, 1500));
      if (!mounted) return;

      setIvrState('greeting');
      setStatusText('AI Assistant');
      setDetailText('Playing greeting...');

      // Play pre-cached greeting
      await playTtsFromEndpoint('/ivr/greeting');
      if (!mounted) return;

      // Transition to listening
      setIvrState('listening');
      setStatusText('Listening...');
      setDetailText('Please describe your issue. I\'ll route you to the best department.');
      startListening();
    }

    startIvr();

    return () => {
      mounted = false;
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── Handle TTS data channel messages (queue announcements) ─────────────
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
          .then(r => r.blob())
          .then(blob => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.play().catch(() => {});
            audio.onended = () => URL.revokeObjectURL(url);
          })
          .catch(e => console.warn('[TTS] Data channel play error:', e));
        }
      } catch (e) { /* ignore parse errors */ }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => room.off(RoomEvent.DataReceived, handleData);
  }, [room, agentConnected]);

  // ── If agent connects (after routing), switch to connected view ────────
  if (agentConnected && ivrState !== 'connected') {
    setIvrState('connected');
    setStatusText('Connected to Agent');
    setDetailText('You are now speaking with a live agent.');
  }

  // ── Determine visualizer state ─────────────────────────────────────────
  const vizState = {
    greeting: 'speaking',
    listening: 'listening',
    confirming: 'speaking',
    classifying: 'routing',
    routing: 'routing',
    routed: 'routing',
    connected: 'listening',
  }[ivrState] || 'idle';

  const vizIcon = {
    greeting: '🤖',
    listening: '🎙️',
    confirming: '❓',
    classifying: '🧠',
    routing: '✨',
    connected: '🟢',
  }[ivrState] || '🎙️';

  return (
    <div className="ivr-screen glass-card-static">
      <AudioVisualizer state={vizState} icon={vizIcon} />

      <p className="ivr-status-text">{statusText}</p>
      <p className="ivr-detail-text">{detailText}</p>

      {/* Live transcript box */}
      {(ivrState === 'listening' || ivrState === 'confirming' || ivrState === 'classifying') && transcript && (
        <div className="ivr-transcript-box">
          <p className="ivr-transcript-label">Your words</p>
          <p className="ivr-transcript-text">"{transcript}"</p>
        </div>
      )}

      {/* Routing result badge */}
      {routingResult && (ivrState === 'routing' || ivrState === 'routed') && (
        <div style={{ marginBottom: '1.5rem' }}>
          <span className="incoming-dept-badge" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
            {routingResult.department}
          </span>
          <UrgencyBar level={routingResult.urgency} />
        </div>
      )}

      {/* Connected state */}
      {ivrState === 'connected' && (
        <div className="connected-badge" style={{ justifyContent: 'center' }}>
          <span className="dot" />
          Speaking with Agent
        </div>
      )}

      <button className="btn btn-danger" onClick={onEnd} id="end-call-btn">
        ✕ End Call
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Urgency Bar — Visual 1-5 indicator
   ═══════════════════════════════════════════════════════════════════════════════ */
function UrgencyBar({ level }) {
  return (
    <div className="urgency-bar" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`urgency-dot ${i <= level ? 'active' : ''} ${
            level <= 2 ? 'low' : level <= 3 ? 'medium' : 'high'
          }`}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CallerView — Top-level caller component
   States: idle → calling (IVR) → routed/connected
   ═══════════════════════════════════════════════════════════════════════════════ */
export function CallerView() {
  const [phase, setPhase] = useState('idle'); // idle | requesting | active | error
  const [sessionData, setSessionData] = useState({});
  const [error, setError] = useState('');

  const startCall = async () => {
    setPhase('requesting');
    setError('');
    try {
      const res = await fetch(`${API}/livekit/caller-token?caller_id=web-caller`, {
        headers: { 'ngrok-skip-browser-warning': '1' },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setSessionData({
        token: data.token,
        url: data.url || data.livekit_url,
        roomName: data.room,
        sessionId: data.session_id,
        identity: data.identity,
      });
      setPhase('active');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  const endCall = useCallback(() => {
    if (sessionData.sessionId) {
      fetch(`${API}/livekit/caller-queue/${sessionData.sessionId}`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': '1' },
      }).catch(() => {});
    }
    setSessionData({});
    setPhase('idle');
    setError('');
  }, [sessionData.sessionId]);

  const handleRouted = useCallback((result) => {
    console.log('[IVR] Routed:', result);
    // The caller stays in the room — agent will join the same room via accept-call
  }, []);

  // ── Idle: Big call button ──────────────────────────────────────────────
  if (phase === 'idle' || phase === 'error') {
    return (
      <div className="caller-idle glass-card-static">
        {error && (
          <div className="error-toast">
            ⚠️ {error}
          </div>
        )}
        <h2>Need Help?</h2>
        <p className="subtitle">
          Call our AI assistant. It will understand your issue and
          route you to the perfect department — instantly.
        </p>
        <button className="call-button" onClick={startCall} id="start-call-btn">
          📞
        </button>
        <p className="call-button-label">Tap to call</p>
      </div>
    );
  }

  // ── Requesting ─────────────────────────────────────────────────────────
  if (phase === 'requesting') {
    return (
      <div className="caller-idle glass-card-static">
        <AudioVisualizer state="routing" icon="⏳" />
        <p className="ivr-status-text">Connecting...</p>
        <p className="ivr-detail-text">Establishing secure connection</p>
      </div>
    );
  }

  // ── Active call (IVR + Connected) ──────────────────────────────────────
  if (phase === 'active' && sessionData.token) {
    return (
      <LiveKitRoom
        video={false}
        audio={true}
        token={sessionData.token}
        serverUrl={sessionData.url}
        connect={true}
        onDisconnected={endCall}
      >
        <RoomAudioRenderer />
        <IvrActiveRoom
          sessionData={sessionData}
          onRouted={handleRouted}
          onEnd={endCall}
        />
      </LiveKitRoom>
    );
  }

  return null;
}
