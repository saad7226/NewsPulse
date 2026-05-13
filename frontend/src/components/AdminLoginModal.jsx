import React, { useState } from 'react';
import { ShieldCheck, Eye, EyeOff, X, Loader, AlertCircle, UserPlus, LogIn, CheckCircle } from 'lucide-react';
import { secureGatewayCall } from '../api/gateway';

const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
    border: '1px solid #334155', background: '#1E293B',
    color: '#F8FAFC', fontSize: '0.9rem', fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box',
};
const labelStyle = {
    display: 'block', fontSize: '0.75rem', fontWeight: 700,
    color: '#94A3B8', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '0.4rem',
};

function PasswordInput({ value, onChange, placeholder, autoComplete }) {
    const [show, setShow] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
                placeholder={placeholder} autoComplete={autoComplete}
                style={{ ...inputStyle, paddingRight: '2.75rem' }}
                onFocus={e => e.target.style.borderColor = '#38BDF8'}
                onBlur={e => e.target.style.borderColor = '#334155'}
            />
            <button type="button" onClick={() => setShow(s => !s)}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
    );
}

export default function AdminLoginModal({ onClose, onAdminLogin }) {
    const [tab, setTab] = useState('login'); // 'login' | 'register'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Login fields
    const [loginUser, setLoginUser] = useState('');
    const [loginPass, setLoginPass] = useState('');

    // Register fields
    const [regUser, setRegUser] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPass, setRegPass] = useState('');

    const clearMessages = () => { setError(''); setSuccess(''); };

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!loginUser.trim() || !loginPass.trim()) { setError('Both fields required.'); return; }
        setLoading(true); clearMessages();
        try {
            const result = await secureGatewayCall('admin_login', { username: loginUser.trim(), password: loginPass });
            if (result?.error) {
                setError(result.error);
            } else if (result?.access_token && result?.is_admin) {
                onAdminLogin(result);
            } else {
                setError('Access denied. Invalid admin credentials.');
            }
        } catch (err) {
            setError(err?.message || 'Invalid admin credentials. Access denied.');
        } finally { setLoading(false); }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!regUser.trim() || !regEmail.trim() || !regPass.trim()) {
            setError('All fields are required.'); return;
        }
        setLoading(true); clearMessages();
        try {
            const result = await secureGatewayCall('admin_register', {
                username: regUser.trim(), email: regEmail.trim(),
                password: regPass,
            });
            if (result?.error) {
                throw new Error(result.error);
            }
            if (result?.message) {
                setSuccess('Registration submitted! Awaiting Super Admin approval.');
                setTab('login');
                setLoginUser(regUser.trim());
                setRegUser(''); setRegEmail(''); setRegPass('');
            }
        } catch (err) {
            setError(err?.message || 'Registration failed.');
        } finally { setLoading(false); }
    };

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: '22px', padding: '2.5rem', width: '100%', maxWidth: '440px', boxShadow: '0 30px 80px rgba(0,0,0,0.7)', position: 'relative' }}>

                {/* Close */}
                <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
                    onMouseOver={e => e.currentTarget.style.color = '#F8FAFC'} onMouseOut={e => e.currentTarget.style.color = '#64748b'}>
                    <X size={20} />
                </button>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #0369A1, #0F172A)', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', boxShadow: '0 0 24px rgba(56,189,248,0.2)' }}>
                        <ShieldCheck size={28} color="#38BDF8" />
                    </div>
                    <h2 style={{ margin: '0 0 0.25rem', color: '#F8FAFC', fontWeight: 800, fontSize: '1.4rem', fontFamily: 'Inter, sans-serif' }}>System Matrix</h2>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Admin restricted zone</p>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', background: '#1E293B', borderRadius: '10px', padding: '4px', marginBottom: '1.75rem' }}>
                    {[['login', <LogIn size={14} />, 'Sign In'], ['register', <UserPlus size={14} />, 'Register']].map(([id, icon, label]) => (
                        <button key={id} onClick={() => { setTab(id); clearMessages(); }}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.2s',
                                background: tab === id ? '#0F172A' : 'transparent',
                                color: tab === id ? '#38BDF8' : '#64748b',
                                boxShadow: tab === id ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                            }}>
                            {icon} {label}
                        </button>
                    ))}
                </div>

                {/* Error / Success messages */}
                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#FCA5A5', fontSize: '0.85rem' }}>
                        <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
                    </div>
                )}
                {success && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#6EE7B7', fontSize: '0.85rem' }}>
                        <CheckCircle size={15} style={{ flexShrink: 0 }} /> {success}
                    </div>
                )}

                {/* ── Sign In Tab ── */}
                {tab === 'login' && (
                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={labelStyle}>Admin Username</label>
                            <input type="text" value={loginUser} onChange={e => { setLoginUser(e.target.value); clearMessages(); }}
                                placeholder="Enter your admin username" autoComplete="username" style={inputStyle}
                                onFocus={e => e.target.style.borderColor = '#38BDF8'} onBlur={e => e.target.style.borderColor = '#334155'} />
                        </div>
                        <div>
                            <label style={labelStyle}>Password</label>
                            <PasswordInput value={loginPass} onChange={e => { setLoginPass(e.target.value); clearMessages(); }}
                                placeholder="Enter your password" autoComplete="current-password" />
                        </div>
                        <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.85rem', borderRadius: '10px', background: loading ? '#334155' : 'linear-gradient(135deg, #0369A1, #38BDF8)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s', marginTop: '0.5rem', boxShadow: loading ? 'none' : '0 4px 20px rgba(56,189,248,0.3)' }}
                            onMouseOver={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseOut={e => e.currentTarget.style.transform = 'none'}>
                            {loading ? <><Loader size={17} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</> : <><ShieldCheck size={17} /> Access System Matrix</>}
                        </button>
                    </form>
                )}

                {/* ── Register Tab ── */}
                {tab === 'register' && (
                    <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                                <label style={labelStyle}>Username</label>
                                <input type="text" value={regUser} onChange={e => { setRegUser(e.target.value); clearMessages(); }}
                                    placeholder="Admin username" style={inputStyle}
                                    onFocus={e => e.target.style.borderColor = '#38BDF8'} onBlur={e => e.target.style.borderColor = '#334155'} />
                            </div>
                            <div>
                                <label style={labelStyle}>Email</label>
                                <input type="email" value={regEmail} onChange={e => { setRegEmail(e.target.value); clearMessages(); }}
                                    placeholder="Admin email" style={inputStyle}
                                    onFocus={e => e.target.style.borderColor = '#38BDF8'} onBlur={e => e.target.style.borderColor = '#334155'} />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Password</label>
                            <PasswordInput value={regPass} onChange={e => { setRegPass(e.target.value); clearMessages(); }}
                                placeholder="Create a strong password" autoComplete="new-password" />
                        </div>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#475569', textAlign: 'center' }}>
                            ⏳ New accounts require Super Admin approval before login
                        </p>
                        <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.85rem', borderRadius: '10px', background: loading ? '#334155' : 'linear-gradient(135deg, #065F46, #10B981)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s', marginTop: '0.5rem', boxShadow: loading ? 'none' : '0 4px 20px rgba(16,185,129,0.3)' }}
                            onMouseOver={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseOut={e => e.currentTarget.style.transform = 'none'}>
                            {loading ? <><Loader size={17} style={{ animation: 'spin 1s linear infinite' }} /> Registering…</> : <><UserPlus size={17} /> Create Admin Account</>}
                        </button>
                    </form>
                )}

                <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#334155', fontSize: '0.75rem' }}>
                    🔒 This area is restricted to authorized administrators only
                </p>
            </div>
        </div>
    );
}
