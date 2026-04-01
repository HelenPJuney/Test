import React from 'react';

// Dynamic Agent data source
const agents = [
  { id: 'agent-1', name: 'Sales Support AI', avatar: '💼', desc: 'Pre-sales inquiries & pricing' },
  { id: 'agent-2', name: 'Tech Support AI', avatar: '🛠️', desc: 'Troubleshooting & technical help' },
  { id: 'agent-3', name: 'Billing AI', avatar: '💳', desc: 'Invoice & account management' }
];

export function AgentList({ onCallAgent, disabled }) {
  return (
    <div className="agent-grid">
      {agents.map(agent => (
        <div key={agent.id} className="agent-card">
          <div className="agent-avatar">{agent.avatar}</div>
          <h3>{agent.name}</h3>
          <p style={{ color: '#8b949e', fontSize: '0.9rem' }}>{agent.desc}</p>
          <button 
            className="call-btn" 
            onClick={() => onCallAgent(agent.id)}
            disabled={disabled}
          >
            Call {agent.name.split(' ')[0]}
          </button>
        </div>
      ))}
    </div>
  );
}
