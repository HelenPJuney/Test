import React, { useState } from 'react';
import { AgentList } from './components/AgentList';
import { CallInterface } from './components/CallInterface';
import { ReceiverInterface } from './components/ReceiverInterface';
import { useCallSession } from './hooks/useCallSession';

function App() {
  const [tab, setTab] = useState('caller'); // caller | receiver
  const { status, sessionData, errorMsg, startCall, endCall } = useCallSession();

  return (
    <div className="app-container">
      <h1 className="header-title">LiveKit AI Call Center</h1>
      
      <div className="tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #30363d', marginBottom: '2rem' }}>
        <button 
          style={{ padding: '0.8rem 1.5rem', background: tab === 'caller' ? '#1f6feb' : 'transparent', color: '#fff', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: 'bold' }} 
          onClick={() => setTab('caller')}>
          📞 Caller Interface
        </button>
        <button 
          style={{ padding: '0.8rem 1.5rem', background: tab === 'receiver' ? '#1f6feb' : 'transparent', color: '#fff', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: 'bold' }} 
          onClick={() => setTab('receiver')}>
          🎧 Receiver (Helen)
        </button>
      </div>

      {errorMsg && (
        <div style={{ padding: '1rem', background: 'var(--danger-hover)', color: '#fff', borderRadius: '8px', marginBottom: '1rem' }}>
          Error: {errorMsg}
        </div>
      )}

      {tab === 'caller' && (
        <React.Fragment>
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
        </React.Fragment>
      )}

      {tab === 'receiver' && (
        <ReceiverInterface />
      )}
    </div>
  );
}

export default App;
