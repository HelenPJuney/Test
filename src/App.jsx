import React from 'react';
import { AgentList } from './components/AgentList';
import { CallInterface } from './components/CallInterface';
import { useCallSession } from './hooks/useCallSession';

function App() {
  const { status, sessionData, errorMsg, startCall, endCall } = useCallSession();

  const isCallActive = ['requesting', 'queued', 'connected'].includes(status);

  return (
    <div className="app-container">
      <h1 className="header-title">LiveKit AI Call Center</h1>
      
      {errorMsg && (
        <div style={{ padding: '1rem', background: 'var(--danger-hover)', color: '#fff', borderRadius: '8px', marginBottom: '1rem' }}>
          Error: {errorMsg}
        </div>
      )}

      {status === 'idle' || status === 'error' ? (
        <AgentList 
          onCallAgent={(id) => startCall(id)} 
          disabled={status === 'requesting'} 
        />
      ) : status === 'requesting' ? (
        <div className="call-interface">
          <h2>Requesting Secure Connection...</h2>
        </div>
      ) : (
        <CallInterface 
          sessionData={sessionData} 
          status={status} 
          onTeardown={endCall} 
        />
      )}
    </div>
  );
}

export default App;
