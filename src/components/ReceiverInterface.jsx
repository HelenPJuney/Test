import React, { useState, useEffect } from 'react';
import { 
  LiveKitRoom, 
  RoomAudioRenderer, 
  DisconnectButton,
  useRoomContext
} from '@livekit/components-react';

function ActiveReceiverLayout({ onHardTeardown, currentCall }) {
  const room = useRoomContext();
  
  useEffect(() => {
    const handleDisconnect = () => onHardTeardown();
    room.on('disconnected', handleDisconnect);
    return () => {
      room.off('disconnected', handleDisconnect);
    };
  }, [room, onHardTeardown]);

  return (
    <div className="call-interface">
      <h2 style={{ color: '#56d364' }}>🟢 Connected to Call</h2>
      <p style={{ margin: '0.5rem 0', color: '#a0aec0' }}>Active 1-on-1 session</p>
      
      <div style={{ background: '#0f1117', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
         <p style={{ color: '#90cdf4' }}>📞 Caller ID: {currentCall?.caller_id || 'Unknown'}</p>
         <p style={{ color: '#718096', fontSize: '0.9em' }}>Room: {currentCall?.room_id}</p>
      </div>

      <div style={{ margin: '2rem 0', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <p style={{color: '#a0aec0'}}>Audio Active</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DisconnectButton className="call-btn end-btn">
          End Call
        </DisconnectButton>
      </div>
    </div>
  );
}

export function ReceiverInterface() {
  const [status, setStatus] = useState('offline'); // offline | online | connected | error
  const [queue, setQueue] = useState([]);
  const [tokenData, setTokenData] = useState({ token: null, url: null, room: null });
  const [currentCall, setCurrentCall] = useState(null);
  const [lastQueueCount, setLastQueueCount] = useState(0);

  useEffect(() => {
    if (status !== 'online') return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/livekit/queue-info', {
          headers: { 'ngrok-skip-browser-warning': '1' }
        });
        if (res.ok) {
          const data = await res.json();
          setQueue(data.callers || []);
          
          if (data.callers.length > lastQueueCount) {
             const newest = data.callers[data.callers.length - 1];
             // Trigger native notification or alert
             alert(`New incoming call from ${newest.caller_id}`);
          }
          setLastQueueCount(data.callers.length);
        }
      } catch (err) {
        console.error("Queue poll failed:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [status, lastQueueCount]);

  const goOnline = () => {
    setStatus('online');
    setLastQueueCount(0);
  };

  const goOffline = () => {
    setStatus('offline');
    setTokenData({ token: null, url: null, room: null });
    setCurrentCall(null);
  };

  const endCall = () => {
    setTokenData({ token: null, url: null, room: null });
    setCurrentCall(null);
    setStatus('online'); // Go back to queue monitoring
  };

  const acceptCall = async (caller) => {
    try {
      const res = await fetch(`/livekit/accept-call/${caller.session_id}?identity=helen-receiver&name=Helen`, {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (res.ok) {
        const data = await res.json();
        setTokenData({ 
            token: data.token, 
            url: data.url || 'wss://sch-natyyy4y.livekit.cloud', 
            room: data.room 
        });
        setCurrentCall(caller);
        setStatus('connected');
      } else {
        alert("Failed to accept call");
      }
    } catch (err) {
      console.error(err);
      alert("Error accepting call");
    }
  };

  if (status === 'offline') {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
         <h2>Receiver Dashboard</h2>
         <p style={{ color: '#718096', marginBottom: '1.5rem' }}>Start listening for routed callers dynamically.</p>
         <button className="call-btn" onClick={goOnline}>🎧 Go Online (Listen for Calls)</button>
      </div>
    );
  }

  if (status === 'online') {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: '#56d364' }}>🟢 Receiver Online</h2>
            <button className="call-btn end-btn" style={{ padding: '0.4rem 1rem', background: '#e53e3e' }} onClick={goOffline}>Go Offline</button>
        </div>
        <p style={{ margin: '0.5rem 0', color: '#a0aec0' }}>Monitoring isolated caller queue...</p>
        
        <div style={{ background: '#0f1117', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
           <p style={{ marginBottom: '1rem' }}>Callers in Queue: {queue.length}</p>
           {queue.length === 0 && <p style={{ color: '#718096' }}>No active callers.</p>}
           {queue.map(q => (
             <div key={q.session_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a202c', padding: '0.8rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
               <div>
                 <p style={{ color: '#90cdf4', margin: 0 }}>📞 Caller ID: {q.caller_id}</p>
                 <p style={{ color: '#a0aec0', fontSize: '0.8em', margin: 0 }}>Wait time: {q.wait_sec}s | Pos: {q.position}</p>
               </div>
               <button onClick={() => acceptCall(q)} style={{ background: '#3182ce', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>
                 Accept Call
               </button>
             </div>
           ))}
        </div>
      </div>
    );
  }

  if (status === 'connected') {
      return (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <LiveKitRoom
            video={false}
            audio={true}
            token={tokenData.token}
            serverUrl={tokenData.url}
            connect={true}
            onDisconnected={endCall}
          >
            <ActiveReceiverLayout onHardTeardown={endCall} currentCall={currentCall} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>
      );
  }

  return null;
}
