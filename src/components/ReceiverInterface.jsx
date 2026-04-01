import React, { useState, useEffect } from 'react';
import { 
  LiveKitRoom, 
  RoomAudioRenderer, 
  DisconnectButton,
  useRoomContext
} from '@livekit/components-react';

function ActiveReceiverLayout({ onHardTeardown }) {
  const room = useRoomContext();
  const [participants, setParticipants] = useState([]);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const handleDisconnect = () => onHardTeardown();
    const updateParticipants = () => {
      const parts = [...room.remoteParticipants.values()]
        .filter(p => !p.identity.startsWith('helen') && !p.identity.startsWith('piper'));
      setParticipants(parts);
    };
    
    room.on('disconnected', handleDisconnect);
    room.on('participantConnected', updateParticipants);
    room.on('participantDisconnected', updateParticipants);
    
    // Initial fetch
    updateParticipants();

    // Poll queue logic mock via room size, since room holds queued participants naturally
    const pollId = setInterval(() => {
        setQueueCount(room.remoteParticipants.size);
    }, 5000);

    return () => {
      room.off('disconnected', handleDisconnect);
      room.off('participantConnected', updateParticipants);
      room.off('participantDisconnected', updateParticipants);
      clearInterval(pollId);
    };
  }, [room, onHardTeardown]);

  return (
    <div className="call-interface">
      <h2 style={{ color: '#56d364' }}>🟢 Receiver Online</h2>
      <p style={{ margin: '0.5rem 0', color: '#a0aec0' }}>Waiting for incoming calls routing from LLM...</p>
      
      <div style={{ background: '#0f1117', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
         <p>Total Active connections in room: {participants.length}</p>
         {participants.map(p => (
           <div key={p.identity} style={{ color: '#90cdf4', padding: '0.3rem 0' }}>
             📞 Caller ID: {p.identity}
           </div>
         ))}
      </div>

      <div style={{ margin: '2rem 0', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <p style={{color: '#a0aec0'}}>Audio Active</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DisconnectButton className="call-btn end-btn">
          Go Offline
        </DisconnectButton>
      </div>
    </div>
  );
}

export function ReceiverInterface() {
  const [status, setStatus] = useState('offline'); // offline | requesting | online | error
  const [tokenData, setTokenData] = useState({ token: null, url: null });

  const goOnline = async () => {
    try {
      setStatus('requesting');
      const response = await fetch(`/livekit/receiver-token?identity=helen-receiver&name=Helen`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (!response.ok) throw new Error('Token fetch failed');
      const data = await response.json();
      setTokenData({ token: data.token, url: 'wss://sch-natyyy4y.livekit.cloud' });
      setStatus('online');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  const goOffline = () => {
    setTokenData({ token: null, url: null });
    setStatus('offline');
  };

  if (['offline', 'error'].includes(status)) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
         <h2>Receiver Dashboard</h2>
         <p style={{ color: '#718096', marginBottom: '1.5rem' }}>Start listening for routed callers dynamically.</p>
         <button className="call-btn" onClick={goOnline}>🎧 Go Online (Listen for Calls)</button>
      </div>
    );
  }

  if (status === 'requesting') return <div className="card"><h2>Connecting to LiveKit...</h2></div>;

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <LiveKitRoom
        video={false}
        audio={true}
        token={tokenData.token}
        serverUrl={tokenData.url}
        connect={true}
        onDisconnected={goOffline}
      >
        <ActiveReceiverLayout onHardTeardown={goOffline} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
