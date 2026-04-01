import React, { useEffect, useCallback } from 'react';
import { 
  LiveKitRoom, 
  RoomAudioRenderer, 
  DisconnectButton,
  useRoomContext,
  useParticipants,
  useDataChannel
} from '@livekit/components-react';

function ActiveRoomLayout({ onHardTeardown }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const agentConnected = participants.some(p => p.identity && p.identity.includes('helen-receiver'));

  // Listen on the 'tts' topic from the backend's SendDataRequest
  const onTtsMessage = useCallback((msg) => {
    try {
      const text = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(text);
      if (data.action === 'play_tts' && data.text) {
        console.log('[TTS] Playing:', data.text);
        fetch('/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({ text: data.text, voice: 'en_US-ryan-high' })
        })
        .then(res => {
          if (!res.ok) throw new Error(`TTS endpoint error: ${res.status}`);
          return res.blob();
        })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          audio.play().catch(e => console.warn('[TTS] autoplay blocked:', e));
        })
        .catch(e => console.error('[TTS] fetch failed:', e));
      }
    } catch (e) {
      console.warn('[TTS] parse error:', e);
    }
  }, []);

  // Subscribe to 'tts' topic data channel
  useDataChannel('tts', onTtsMessage);

  // Cleanup on disconnect
  useEffect(() => {
    const handleDisconnect = () => {
      console.log('Room disconnected, cleaning up...');
      onHardTeardown();
    };
    room.on('disconnected', handleDisconnect);
    return () => room.off('disconnected', handleDisconnect);
  }, [room, onHardTeardown]);

  return (
    <div className="call-interface">
      {!agentConnected ? (
        <div className="status-queued">
          <h2>🕒 Waiting in Queue</h2>
          <p style={{ color: '#a78bfa' }}>
            Please wait... you will hear an audio announcement shortly.
          </p>
          <RoomAudioRenderer />
        </div>
      ) : (
        <div className="status-connected">
          <h2 style={{ color: '#56d364' }}>🟢 Connected to Agent</h2>
          <div style={{ margin: '2rem 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#a0aec0' }}>Audio Active</p>
          </div>
        </div>
      )}
      
      <div style={{ marginTop: '2rem' }}>
        <DisconnectButton className="call-btn end-btn">
          End Call
        </DisconnectButton>
      </div>
    </div>
  );
}

export function CallInterface({ sessionData, status, onTeardown }) {
  if (!sessionData.token || !sessionData.url) return null;

  return (
    // LiveKitRoom unmounting is essential to completely scrub states when torn down
    <LiveKitRoom
      video={false}
      audio={true}
      token={sessionData.token}
      serverUrl={sessionData.url}
      connect={true}
      onDisconnected={onTeardown} // Fail-safe unmount callback
    >
      <ActiveRoomLayout status={status} onHardTeardown={onTeardown} />
      {/* Renders AI/TTS voice exclusively to this properly isolated room ID */}
      <RoomAudioRenderer /> 
    </LiveKitRoom>
  );
}
