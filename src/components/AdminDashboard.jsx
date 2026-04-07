import React, { useState, useCallback, useEffect } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || '';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ═══════════════════════════════════════════════════════════════════════════════
   AdminDashboard — standalone admin panel tab
   Sections: Business Hours | Email Settings
   ═══════════════════════════════════════════════════════════════════════════════ */
export function AdminDashboard() {
  const [backendUrl, setBackendUrl] = useState(localStorage.getItem('agent_backend_url') || '');
  const effectiveAPI = backendUrl || API;

  // ── Business Hours state ──────────────────────────────────────────────────
  const [bh, setBh] = useState({
    work_start: '09:00',
    work_end: '18:00',
    work_days: '0,1,2,3,4,5',
    timezone: 'Asia/Kolkata',
    avg_resolution_seconds: 300,
  });
  const [bhSaved, setBhSaved] = useState(false);
  const [bhMsg, setBhMsg] = useState('');

  // ── Email Config state ────────────────────────────────────────────────────
  const [email, setEmail] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
    smtp_use_tls: true,
  });
  const [showPass, setShowPass] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);

  // ── Holiday state ──────────────────────────────────────────────────────────
  const [holiday, setHoliday] = useState({ message: '', until: '' });
  const [holidaySaved, setHolidaySaved] = useState(false);
  const [bhStatus, setBhStatus] = useState(null);

  // ── Load current config on mount ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [cfgRes, emailRes, statusRes] = await Promise.all([
          fetch(`${effectiveAPI}/cc/admin/config`,       { headers: { 'ngrok-skip-browser-warning': '1' } }),
          fetch(`${effectiveAPI}/cc/admin/email-config`, { headers: { 'ngrok-skip-browser-warning': '1' } }),
          fetch(`${effectiveAPI}/cc/business-hours`,     { headers: { 'ngrok-skip-browser-warning': '1' } }),
        ]);
        if (cfgRes.ok) {
          const d = (await cfgRes.json()).config || {};
          setBh({
            work_start: d.work_start || '09:00',
            work_end:   d.work_end   || '18:00',
            work_days:  d.work_days  || '0,1,2,3,4,5',
            timezone:   d.timezone   || 'Asia/Kolkata',
            avg_resolution_seconds: parseInt(d.avg_resolution_seconds || '300', 10),
          });
        }
        if (emailRes.ok) {
          const d = await emailRes.json();
          setEmail(prev => ({
            ...prev,
            smtp_host:    d.smtp_host    || 'smtp.gmail.com',
            smtp_port:    parseInt(d.smtp_port || '587', 10),
            smtp_user:    d.smtp_user    || '',
            smtp_from:    d.smtp_from    || '',
            smtp_use_tls: d.smtp_use_tls !== 'false',
          }));
          setPasswordSet(d.smtp_password_set || false);
        }
        if (statusRes.ok) {
          setBhStatus(await statusRes.json());
        }
      } catch (e) { /* ignore */ }
    };
    load();
  }, [effectiveAPI]);

  // ── Save business hours ───────────────────────────────────────────────────
  const saveBH = useCallback(async () => {
    try {
      const res = await fetch(`${effectiveAPI}/cc/admin/business-hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify(bh),
      });
      if (res.ok) {
        setBhSaved(true);
        setBhMsg('Business hours saved.');
        setTimeout(() => { setBhSaved(false); setBhMsg(''); }, 3000);
        // Refresh status
        const s = await fetch(`${effectiveAPI}/cc/business-hours`, { headers: { 'ngrok-skip-browser-warning': '1' } });
        if (s.ok) setBhStatus(await s.json());
      }
    } catch (e) { setBhMsg('Save failed.'); }
  }, [bh, effectiveAPI]);

  // ── Toggle work day ───────────────────────────────────────────────────────
  const toggleDay = (idx) => {
    const days = bh.work_days ? bh.work_days.split(',').map(Number) : [];
    const updated = days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx].sort();
    setBh(b => ({ ...b, work_days: updated.join(',') }));
  };

  // ── Save email config ─────────────────────────────────────────────────────
  const saveEmail = useCallback(async () => {
    if (!email.smtp_user) { setEmailMsg('Email address is required.'); return; }
    try {
      const res = await fetch(`${effectiveAPI}/cc/admin/email-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify(email),
      });
      if (res.ok) {
        setEmailSaved(true);
        setEmailMsg('Email config saved.');
        setPasswordSet(true);
        setTimeout(() => { setEmailSaved(false); setEmailMsg(''); }, 3000);
      } else {
        setEmailMsg('Save failed.');
      }
    } catch (e) { setEmailMsg('Save failed.'); }
  }, [email, effectiveAPI]);

  // ── Set/clear holiday ─────────────────────────────────────────────────────
  const saveHoliday = useCallback(async () => {
    if (!holiday.message || !holiday.until) return;
    try {
      await fetch(`${effectiveAPI}/cc/holiday`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify(holiday),
      });
      setHolidaySaved(true);
      setTimeout(() => setHolidaySaved(false), 2000);
    } catch (e) { /* ignore */ }
  }, [holiday, effectiveAPI]);

  const clearHoliday = useCallback(async () => {
    try {
      await fetch(`${effectiveAPI}/cc/holiday`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': '1' },
      });
      setBhStatus(s => s ? { ...s, is_holiday: false } : s);
    } catch (e) { /* ignore */ }
  }, [effectiveAPI]);

  const selectedDays = bh.work_days ? bh.work_days.split(',').map(Number) : [];

  return (
    <div className="agent-panel" style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div className="agent-header" style={{ marginBottom: '1.5rem' }}>
        <h2>Admin Console</h2>
        {bhStatus && (
          <span className={`agent-status-badge ${bhStatus.is_open ? 'badge-online' : 'badge-offline'}`}>
            <span className="status-dot" style={{ background: bhStatus.is_open ? 'var(--accent-emerald)' : 'var(--text-muted)' }} />
            {bhStatus.is_open ? 'System Open' : 'System Closed'}
          </span>
        )}
      </div>

      {/* ── Backend URL override ────────────────────────────────────────── */}
      <div className="glass-card-static" style={{ marginBottom: '1.5rem' }}>
        <div className="queue-dashboard-title"><h3>Backend URL</h3></div>
        <input
          type="text" className="agent-name-input" style={{ marginTop: '0.75rem' }}
          placeholder="http://localhost:8000 or ngrok URL"
          value={backendUrl}
          onChange={e => { setBackendUrl(e.target.value); localStorage.setItem('agent_backend_url', e.target.value); }}
        />
      </div>

      {/* ── Business Hours ──────────────────────────────────────────────── */}
      <div className="glass-card-static" style={{ marginBottom: '1.5rem' }}>
        <div className="queue-dashboard-title"><h3>Business Hours</h3></div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: '120px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Open Time</span>
            <input type="time" className="agent-name-input" value={bh.work_start}
              onChange={e => setBh(b => ({ ...b, work_start: e.target.value }))} />
          </label>
          <label style={{ flex: 1, minWidth: '120px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Close Time</span>
            <input type="time" className="agent-name-input" value={bh.work_end}
              onChange={e => setBh(b => ({ ...b, work_end: e.target.value }))} />
          </label>
        </div>

        {/* Day toggles */}
        <div style={{ marginTop: '1rem' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Working Days</span>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {DAY_LABELS.map((day, idx) => (
              <button key={idx} onClick={() => toggleDay(idx)} style={{
                padding: '0.3rem 0.65rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 600,
                background: selectedDays.includes(idx) ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.07)',
                color: selectedDays.includes(idx) ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                outline: selectedDays.includes(idx) ? '1px solid var(--accent-cyan)' : 'none',
              }}>{day}</button>
            ))}
          </div>
        </div>

        <label style={{ marginTop: '1rem', display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Timezone</span>
          <input type="text" className="agent-name-input" value={bh.timezone}
            onChange={e => setBh(b => ({ ...b, timezone: e.target.value }))} placeholder="Asia/Kolkata" />
        </label>

        <label style={{ marginTop: '0.75rem', display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
            Avg Call Resolution Time (seconds) — drives queue wait estimates
          </span>
          <input type="number" className="agent-name-input" value={bh.avg_resolution_seconds} min={30}
            onChange={e => setBh(b => ({ ...b, avg_resolution_seconds: parseInt(e.target.value, 10) || 300 }))} />
        </label>

        {bhMsg && <p style={{ fontSize: '0.8rem', color: bhSaved ? 'var(--accent-emerald)' : 'var(--accent-rose, #f43f5e)', marginTop: '0.5rem' }}>{bhMsg}</p>}
        <button className="btn btn-primary" style={{ marginTop: '1rem', justifyContent: 'center', width: '100%' }} onClick={saveBH}>
          {bhSaved ? '✓ Saved!' : 'Save Business Hours'}
        </button>
      </div>

      {/* ── Holiday Override ────────────────────────────────────────────── */}
      <div className="glass-card-static" style={{ marginBottom: '1.5rem' }}>
        <div className="queue-dashboard-title">
          <h3>Holiday Override</h3>
          {bhStatus?.is_holiday && (
            <span className="queue-count-badge" style={{ background: 'rgba(244,63,94,0.15)', color: '#f43f5e' }}>Active</span>
          )}
        </div>
        <label style={{ marginTop: '1rem', display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Message to callers</span>
          <input type="text" className="agent-name-input" value={holiday.message}
            onChange={e => setHoliday(h => ({ ...h, message: e.target.value }))} placeholder="e.g. Closed for Christmas." />
        </label>
        <label style={{ marginTop: '0.75rem', display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Holiday ends at</span>
          <input type="datetime-local" className="agent-name-input" value={holiday.until}
            onChange={e => setHoliday(h => ({ ...h, until: e.target.value }))} />
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={saveHoliday}>
            {holidaySaved ? '✓ Set!' : 'Set Holiday Mode'}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={clearHoliday}>
            Clear Holiday
          </button>
        </div>
      </div>

      {/* ── Email / SMTP Settings ───────────────────────────────────────── */}
      <div className="glass-card-static" style={{ marginBottom: '1.5rem' }}>
        <div className="queue-dashboard-title">
          <h3>Email Settings</h3>
          {passwordSet && <span className="queue-count-badge" style={{ background: 'rgba(52,211,153,0.15)', color: 'var(--accent-emerald)' }}>Configured</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <label style={{ flex: 2, minWidth: '180px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>SMTP Host</span>
            <input type="text" className="agent-name-input" value={email.smtp_host}
              onChange={e => setEmail(c => ({ ...c, smtp_host: e.target.value }))} placeholder="smtp.gmail.com" />
          </label>
          <label style={{ flex: 1, minWidth: '80px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Port</span>
            <input type="number" className="agent-name-input" value={email.smtp_port}
              onChange={e => setEmail(c => ({ ...c, smtp_port: parseInt(e.target.value, 10) || 587 }))} />
          </label>
        </div>

        <label style={{ marginTop: '0.75rem', display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Sender Email (Gmail address)</span>
          <input type="email" className="agent-name-input" value={email.smtp_user}
            onChange={e => setEmail(c => ({ ...c, smtp_user: e.target.value }))} placeholder="you@gmail.com" />
        </label>

        <label style={{ marginTop: '0.75rem', display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
            App Password <span style={{ color: 'var(--text-muted)' }}>(Gmail → Security → App Passwords)</span>
          </span>
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'} className="agent-name-input"
              value={email.smtp_password} placeholder={passwordSet ? '••••••••••••••• (saved)' : 'Paste app password here'}
              onChange={e => setEmail(c => ({ ...c, smtp_password: e.target.value }))}
              style={{ paddingRight: '3rem' }}
            />
            <button onClick={() => setShowPass(v => !v)} style={{
              position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem',
            }}>{showPass ? 'Hide' : 'Show'}</button>
          </div>
        </label>

        <label style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={email.smtp_use_tls} onChange={e => setEmail(c => ({ ...c, smtp_use_tls: e.target.checked }))} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Use TLS (recommended)</span>
        </label>

        {emailMsg && <p style={{ fontSize: '0.8rem', color: emailSaved ? 'var(--accent-emerald)' : 'var(--accent-rose, #f43f5e)', marginTop: '0.5rem' }}>{emailMsg}</p>}
        <button className="btn btn-primary" style={{ marginTop: '1rem', justifyContent: 'center', width: '100%' }} onClick={saveEmail}>
          {emailSaved ? '✓ Saved!' : 'Save Email Settings'}
        </button>
      </div>
    </div>
  );
}
