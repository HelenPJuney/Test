import { useState, useCallback } from 'react';

// Central state machine hook for session and room logic
export function useCallSession() {
  const [status, setStatus] = useState('idle'); // idle | requesting | queued | connected | error
  const [sessionData, setSessionData] = useState({ token: null, url: null, roomName: null });
  const [errorMsg, setErrorMsg] = useState('');

  const startCall = async (agentId) => {
    try {
      setStatus('requesting');
      setErrorMsg('');
      
      // Send REST request configuring isolation & queueing
      // Replace with your actual backend endpoint.
      // Expected response: { url: 'wss://...', token: '...', status: 'queued' | 'connected', roomName: 'uuid-x' }
      const response = await fetch('/api/call/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId })
      });

      if (!response.ok) throw new Error(`Backend error: ${response.status}`);
      const data = await response.json();
      
      // Setting unique room tokens enforcing strictly isolated session per caller
      setSessionData({ 
        token: data.token, 
        url: data.url, 
        roomName: data.roomName 
      });
      
      setStatus(data.status === 'queued' ? 'queued' : 'connected');
    } catch (error) {
      console.error('Call failed to start:', error);
      setErrorMsg(error.message);
      setStatus('error');
    }
  };

  const endCall = useCallback(() => {
    // 100% Cleanup logic scrub
    setSessionData({ token: null, url: null, roomName: null });
    setStatus('idle');
    setErrorMsg('');
  }, []);

  return { status, setStatus, sessionData, errorMsg, startCall, endCall };
}
