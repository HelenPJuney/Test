import React, { useEffect } from 'react';
import { 
  LiveKitRoom, 
  RoomAudioRenderer, 
  DisconnectButton,
  useRoomContext,
  useParticipants
} from '@livekit/components-react';

function ActiveRoomLayout({ onHardTeardown }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const agentConnected = participants.some(p => p.identity && p.identity.includes('helen-receiver'));
  
  // Hardened cleanup listener targeting strict room isolation logic
  useEffect(() => {
    const handleDisconnect = () => {
      console.log('Room natively disconnected, firing cleanup...');
      onHardTeardown();
    };
    
    room.on('disconnected', handleDisconnect);
    return () => {
      room.off('disconnected', handleDisconnect);
    };
  }, [room, onHardTeardown]);

  return (
    <div className="call-interface">
      {!agentConnected ? (
        <div className="status-queued">
          <h2>🕒 Waiting in Queue</h2>
          <p>Please wait... (TTS estimated time will play shortly via real-time audio track)</p>
          <RoomAudioRenderer />
        </div>
      ) : (
        <div className="status-connected">
          <h2 style={{ color: '#56d364' }}>🟢 Connected to Agent</h2>
          <div style={{ margin: '2rem 0', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <p style={{color: '#a0aec0'}}>Audio Active</p>
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
