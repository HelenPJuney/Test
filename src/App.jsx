import React, { useState } from 'react';
import { CallerView } from './components/CallerView';
import { ReceiverView } from './components/ReceiverView';

/**
 * App — Root component with nav tabs for Caller / Agent views.
 * Completely redesigned: dark glassmorphism premium UI.
 */
function App() {
  const [tab, setTab] = useState('caller');

  return (
    <div className="app-shell">
      {/* ── Premium Nav Bar ──────────────────────────────────── */}
      <nav className="nav-bar">
        <div className="nav-brand">
          <div className="nav-logo">📞</div>
          <span className="nav-title">AI Call Center</span>
        </div>

        <div className="nav-tabs">
          <button
            id="tab-caller"
            className={`nav-tab ${tab === 'caller' ? 'active' : ''}`}
            onClick={() => setTab('caller')}
          >
            Call In
          </button>
          <button
            id="tab-receiver"
            className={`nav-tab ${tab === 'receiver' ? 'active' : ''}`}
            onClick={() => setTab('receiver')}
          >
            Agent Panel
          </button>
        </div>

        <div className="nav-status">
          <span className="status-dot"></span>
          System Online
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="main-content">
        {tab === 'caller' && <CallerView />}
        {tab === 'receiver' && <ReceiverView />}
      </main>
    </div>
  );
}

export default App;
