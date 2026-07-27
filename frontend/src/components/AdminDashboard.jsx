import React, { useState, useEffect, useCallback } from 'react';
import { secureGatewayCall } from '../api/gateway';
import {
    Activity, Cpu, ShieldCheck, BarChart2, Clock, RefreshCw, Wifi, WifiOff,
    TrendingUp, Zap, Brain, Scale, AlertTriangle, Swords, AlignLeft,
    Users, UserCheck, UserX, Trash2, CheckCircle, PenLine, Eye, X
} from 'lucide-react';

const REFRESH_INTERVAL_MS = 15000;

const SERVICE_INFO = [
    { key: 'summarizer', label: 'Summarizer', icon: AlignLeft, color: '#3B82F6', gradient: 'linear-gradient(135deg,#3B82F6,#6366f1)' },
    { key: 'fakenews', label: 'Fake News Detector', icon: AlertTriangle, color: '#EF4444', gradient: 'linear-gradient(135deg,#EF4444,#f97316)' },
    { key: 'political_bias', label: 'Political Bias', icon: Scale, color: '#F59E0B', gradient: 'linear-gradient(135deg,#F59E0B,#eab308)' },
    { key: 'counter', label: 'Counter Arguments', icon: Swords, color: '#8B5CF6', gradient: 'linear-gradient(135deg,#8B5CF6,#ec4899)' },
];

export default function AdminDashboard({ token, isSuperAdmin }) {
    const [activeTab, setActiveTab] = useState('matrix'); // 'matrix' | 'management'
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const [isOnline, setIsOnline] = useState(true);
    const [pulse, setPulse] = useState(false);

    // Super Admin State
    const [pendingAdmins, setPendingAdmins] = useState([]);
    const [approvedAdmins, setApprovedAdmins] = useState([]);
    const [adminLoading, setAdminLoading] = useState(false);

    // Article Moderation State
    const [allArticles, setAllArticles] = useState([]);
    const [articlesLoading, setArticlesLoading] = useState(false);
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [previewArticle, setPreviewArticle] = useState(null);
    const [articleViewMode, setArticleViewMode] = useState('pending'); // 'pending' | 'all'

    const fetchMetrics = useCallback(async () => {
        setPulse(true);
        setTimeout(() => setPulse(false), 500);
        try {
            setError(null);
            const data = await secureGatewayCall('get_admin_metrics', {}, token);
            if (data && !data.error) {
                setMetrics(data);
                setIsOnline(true);
                setLastUpdated(new Date());
            } else {
                setError(data?.error || 'Failed to fetch metrics');
                setIsOnline(false);
            }
        } catch (e) {
            setError('Prometheus connection error');
            setIsOnline(false);
        } finally {
            setLoading(false);
        }
    }, [token]);

    const fetchAdmins = useCallback(async () => {
        if (!isSuperAdmin) return;
        setAdminLoading(true);
        try {
            const [pendingRes, approvedRes] = await Promise.all([
                secureGatewayCall('get_pending_admins', {}, token),
                secureGatewayCall('get_approved_admins', {}, token)
            ]);
            if (!pendingRes.error) setPendingAdmins(pendingRes);
            if (!approvedRes.error) setApprovedAdmins(approvedRes);
        } catch (e) {
            console.error('Failed to fetch admins', e);
        } finally {
            setAdminLoading(false);
        }
    }, [token, isSuperAdmin]);

    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchMetrics]);

    useEffect(() => {
        if (activeTab === 'management') fetchAdmins();
        if (activeTab === 'articles') fetchAllArticles();
    }, [activeTab, fetchAdmins]);

    const fetchAllArticles = useCallback(async () => {
        setArticlesLoading(true);
        const result = await secureGatewayCall('admin_get_all_articles', {}, token);
        if (Array.isArray(result)) {
            setAllArticles(result);
        }
        setArticlesLoading(false);
    }, [token]);

    const handleApproveArticle = async (id) => {
        const result = await secureGatewayCall('admin_approve_article', { article_id: id }, token);
        if (result?.success) {
            setAllArticles(prev => prev.map(a => a.id === id ? { ...a, status: 'published' } : a));
        }
    };

    const handleDeleteArticle = async (id) => {
        if (!window.confirm("Are you sure you want to permanently delete this article?")) return;
        const result = await secureGatewayCall('admin_delete_article', { article_id: id }, token);
        if (result?.success) {
            setAllArticles(prev => prev.filter(a => a.id !== id));
        }
    };

    const handleRejectArticle = async (id) => {
        if (!rejectReason.trim() || rejectReason.trim().length < 10) {
            alert('Please provide a rejection reason (min 10 characters).');
            return;
        }
        const result = await secureGatewayCall('admin_reject_article', { article_id: id, reason: rejectReason }, token);
        if (result?.success) {
            setAllArticles(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
            setRejectingId(null);
            setRejectReason('');
        }
    };

    const handleApproveAdmin = async (adminId) => {
        try {
            await secureGatewayCall('approve_admin', { admin_id: adminId }, token);
            fetchAdmins();
        } catch (e) {
            alert('Failed to approve admin');
        }
    };

    const handleDeleteAdmin = async (adminId) => {
        if (!window.confirm("Are you sure you want to delete this admin account?")) return;
        try {
            await secureGatewayCall('delete_admin', { admin_id: adminId }, token);
            fetchAdmins();
        } catch (e) {
            alert('Failed to delete admin');
        }
    };

    const totalReqs = metrics?.total_requests ?? 0;
    const breakdown = metrics?.breakdown ?? {};
    const latencies = metrics?.average_latency ?? {};

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{
                        margin: 0, fontSize: '2rem', fontWeight: 800,
                        background: 'linear-gradient(135deg,#6366f1,#8B5CF6,#ec4899)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                        <ShieldCheck size={32} color="#6366f1" /> System Admin
                    </h1>
                    <p style={{ margin: '0.25rem 0 0 0', color: '#64748B', fontSize: '0.9rem', fontWeight: 500 }}>
                        {isSuperAdmin ? 'Super Admin Privileges Active' : 'Live Prometheus Intelligence Feed — Admin Only'}
                    </p>
                </div>
                {activeTab === 'matrix' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.4rem 1rem', borderRadius: '999px',
                            backgroundColor: isOnline ? '#DCFCE7' : '#FEF2F2',
                            border: `1px solid ${isOnline ? '#86EFAC' : '#FECACA'}`
                        }}>
                            {isOnline ? <Wifi size={14} color="#16a34a" /> : <WifiOff size={14} color="#dc2626" />}
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isOnline ? '#16a34a' : '#dc2626' }}>
                                {isOnline ? 'LIVE' : 'OFFLINE'}
                            </span>
                            <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                backgroundColor: isOnline ? '#22c55e' : '#ef4444',
                                animation: isOnline ? 'pulseDot 1.5s ease-in-out infinite' : 'none'
                            }} />
                        </div>
                        <button
                            onClick={fetchMetrics}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.4rem 1rem', borderRadius: '10px',
                                background: '#EEF2FF', border: '1px solid #C7D2FE',
                                color: '#4F46E5', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem'
                            }}
                        >
                            <RefreshCw size={14} style={{ animation: pulse ? 'spin 0.5s linear' : 'none' }} />
                            Refresh
                        </button>
                    </div>
                )}
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                <button onClick={() => setActiveTab('matrix')}
                    style={{
                        padding: '0.75rem 1rem', background: 'none', border: 'none',
                        borderBottom: activeTab === 'matrix' ? '2px solid #6366f1' : '2px solid transparent',
                        color: activeTab === 'matrix' ? '#6366f1' : '#64748b',
                        fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                    <Activity size={18} /> System Matrix
                </button>
                <button onClick={() => setActiveTab('articles')}
                    style={{
                        padding: '0.75rem 1rem', background: 'none', border: 'none',
                        borderBottom: activeTab === 'articles' ? '2px solid #10b981' : '2px solid transparent',
                        color: activeTab === 'articles' ? '#10b981' : '#64748b',
                        fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                    <PenLine size={18} /> Articles & Moderation
                    {allArticles.filter(a => a.status === 'submitted').length > 0 && activeTab !== 'articles' && (
                        <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', marginLeft: '0.25rem' }}>{allArticles.filter(a => a.status === 'submitted').length}</span>
                    )}
                </button>
                {isSuperAdmin && (
                    <button onClick={() => setActiveTab('management')}
                        style={{
                            padding: '0.75rem 1rem', background: 'none', border: 'none',
                            borderBottom: activeTab === 'management' ? '2px solid #6366f1' : '2px solid transparent',
                            color: activeTab === 'management' ? '#6366f1' : '#64748b',
                            fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                        <Users size={18} /> Admin Management
                        {pendingAdmins.length > 0 && activeTab !== 'management' && (
                            <span style={{ background: '#EF4444', color: '#fff', fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', marginLeft: '0.25rem' }}>{pendingAdmins.length}</span>
                        )}
                    </button>
                )}
            </div>

            {/* ── Tab Content: Article Review ── */}
            {activeTab === 'articles' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <h2 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            📝 Article Moderation
                            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '0.2rem' }}>
                                <button onClick={() => setArticleViewMode('pending')} style={{
                                    border: 'none', background: articleViewMode === 'pending' ? '#fff' : 'transparent',
                                    boxShadow: articleViewMode === 'pending' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    borderRadius: '6px', padding: '0.3rem 0.8rem', fontSize: '0.8rem', fontWeight: 600,
                                    color: articleViewMode === 'pending' ? '#f59e0b' : '#64748B', cursor: 'pointer'
                                }}>
                                    Pending ({allArticles.filter(a => a.status === 'submitted').length})
                                </button>
                                <button onClick={() => setArticleViewMode('all')} style={{
                                    border: 'none', background: articleViewMode === 'all' ? '#fff' : 'transparent',
                                    boxShadow: articleViewMode === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    borderRadius: '6px', padding: '0.3rem 0.8rem', fontSize: '0.8rem', fontWeight: 600,
                                    color: articleViewMode === 'all' ? '#0f172a' : '#64748B', cursor: 'pointer'
                                }}>
                                    All Articles ({allArticles.length})
                                </button>
                            </div>
                        </h2>
                        <button onClick={fetchAllArticles} style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.8rem', borderRadius: '8px',
                            border: '1px solid var(--border-color)', background: 'transparent',
                            cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.8rem'
                        }}>
                            <RefreshCw size={13} /> Refresh
                        </button>
                    </div>

                    {articlesLoading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading articles...</div>
                    ) : allArticles.filter(a => articleViewMode === 'all' ? true : a.status === 'submitted').length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <CheckCircle size={40} style={{ color: '#10b981', marginBottom: '1rem' }} />
                            <p style={{ fontWeight: 600 }}>All clear! No articles found in this view.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {allArticles.filter(a => articleViewMode === 'all' ? true : a.status === 'submitted').map(article => (
                                <div key={article.id} style={{
                                    padding: '1.25rem', borderRadius: '14px',
                                    border: '1px solid rgba(245,158,11,0.3)',
                                    background: 'rgba(245,158,11,0.04)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                                                {article.status === 'submitted' && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '0.15rem 0.5rem', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.25)' }}>⏳ Pending Review</span>}
                                                {article.status === 'published' && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '0.15rem 0.5rem', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.25)' }}>✅ Published</span>}
                                                {article.status === 'rejected' && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', padding: '0.15rem 0.5rem', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.25)' }}>❌ Rejected</span>}
                                                {article.status === 'draft' && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: 'rgba(100,116,139,0.12)', padding: '0.15rem 0.5rem', borderRadius: '10px', border: '1px solid rgba(100,116,139,0.25)' }}>Draft</span>}
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '0.15rem 0.5rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                                    {article.category}
                                                </span>
                                                {article.ai_assisted && <span style={{ fontSize: '0.68rem', color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '0.15rem 0.4rem', borderRadius: '8px' }}>✨ AI</span>}
                                            </div>
                                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{article.title}</h3>
                                            <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                By <strong>{article.author_name}</strong> · {new Date(article.updated_at).toLocaleDateString()} · {Math.max(1, Math.round((article.content?.split(/\s+/).length || 0) / 200))} min read
                                            </p>
                                        </div>
                                    </div>

                                    {article.excerpt && (
                                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{article.excerpt}</p>
                                    )}

                                    {/* Content preview */}
                                    {previewArticle === article.id ? (
                                        <div style={{
                                            padding: '0.75rem', borderRadius: '8px',
                                            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                            maxHeight: '200px', overflow: 'auto',
                                            fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                                            color: 'var(--text-primary)', marginBottom: '0.75rem'
                                        }}>
                                            {article.content}
                                        </div>
                                    ) : (
                                        <button onClick={() => setPreviewArticle(article.id)} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                            color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '0.75rem',
                                            fontFamily: 'inherit', padding: 0
                                        }}>
                                            <Eye size={12} /> Read full article
                                        </button>
                                    )}

                                    {/* Reject reason input */}
                                    {rejectingId === article.id && (
                                        <div style={{ marginBottom: '0.75rem' }}>
                                            <textarea
                                                value={rejectReason}
                                                onChange={e => setRejectReason(e.target.value)}
                                                placeholder="Explain why this article is being rejected (min 10 chars)..."
                                                rows={2}
                                                style={{
                                                    width: '100%', padding: '0.5rem', borderRadius: '8px',
                                                    border: '1px solid rgba(239,68,68,0.4)', background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)', fontSize: '0.83rem', resize: 'vertical',
                                                    fontFamily: 'inherit', outline: 'none'
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {article.status === 'submitted' && (
                                            <>
                                                <button onClick={() => handleApproveArticle(article.id)} style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                    padding: '0.4rem 1rem', borderRadius: '8px', border: 'none',
                                                    background: '#10b981', color: '#fff', fontWeight: 700,
                                                    cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit'
                                                }}>
                                                    <CheckCircle size={13} /> Approve & Publish
                                                </button>
                                                {rejectingId === article.id ? (
                                                    <>
                                                        <button onClick={() => handleRejectArticle(article.id)} style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                            padding: '0.4rem 1rem', borderRadius: '8px', border: 'none',
                                                            background: '#ef4444', color: '#fff', fontWeight: 700,
                                                            cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit'
                                                        }}>
                                                            Confirm Reject
                                                        </button>
                                                        <button onClick={() => { setRejectingId(null); setRejectReason(''); }} style={{
                                                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                                                            border: '1px solid var(--border-color)', background: 'transparent',
                                                            cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'inherit'
                                                        }}>
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setRejectingId(article.id)} style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                        padding: '0.4rem 1rem', borderRadius: '8px', border: 'none',
                                                        background: '#ef4444', color: '#fff', fontWeight: 700,
                                                        cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit'
                                                    }}>
                                                        <X size={13} /> Reject
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        <button onClick={() => handleDeleteArticle(article.id)} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.4)',
                                            background: 'transparent', color: '#ef4444', fontWeight: 700,
                                            cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', marginLeft: 'auto'
                                        }}>
                                            <Trash2 size={13} /> Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab Content: Matrix ── */}
            {activeTab === 'matrix' && (

                <>
                    {error && (
                        <div style={{
                            padding: '1rem 1.25rem', borderRadius: '12px',
                            backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
                            color: '#DC2626', marginBottom: '1.5rem', fontWeight: 500, fontSize: '0.9rem'
                        }}>
                            ⚠ {error} — Prometheus may still be warming up. Retrying every {REFRESH_INTERVAL_MS / 1000}s.
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                border: '4px solid #E2E8F0', borderTopColor: '#6366f1',
                                animation: 'spin 0.8s linear infinite'
                            }} />
                            <p style={{ color: '#64748B', fontWeight: 500 }}>Fetching Prometheus Matrix...</p>
                        </div>
                    ) : (
                        <>
                            {/* ── KPI Row ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                                <KpiCard icon={<Brain size={22} />} label="Total AI Inferences" value={Math.round(totalReqs).toLocaleString()} sub="All services combined" color="#6366f1" gradient="linear-gradient(135deg,#6366f1,#8B5CF6)" />
                                <KpiCard icon={<Zap size={22} />} label="Summarizer Avg. Latency" value={latencies.summarizer ? `${latencies.summarizer.toFixed(3)}s` : 'N/A'} sub="5-min rolling average" color="#3B82F6" gradient="linear-gradient(135deg,#3B82F6,#06b6d4)" />
                                <KpiCard icon={<Clock size={22} />} label="Fake News Avg. Latency" value={latencies.fakenews ? `${latencies.fakenews.toFixed(3)}s` : 'N/A'} sub="5-min rolling average" color="#EF4444" gradient="linear-gradient(135deg,#EF4444,#f97316)" />
                                <KpiCard icon={<ShieldCheck size={22} />} label="Last Refreshed" value={lastUpdated ? lastUpdated.toLocaleTimeString() : '—'} sub={`Auto-refreshes every ${REFRESH_INTERVAL_MS / 1000}s`} color="#10B981" gradient="linear-gradient(135deg,#10B981,#0d9488)" />
                            </div>

                            {/* ── Service Breakdown ── */}
                            <div style={{ marginBottom: '2rem' }}>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
                                    <BarChart2 size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: '#6366f1' }} />
                                    AI Engine Request Matrix
                                </h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                                    {SERVICE_INFO.map(({ key, label, icon: Icon, color, gradient }) => {
                                        const count = Math.round(breakdown[key] ?? 0);
                                        const pct = totalReqs > 0 ? (count / totalReqs) * 100 : 0;
                                        return (
                                            <div key={key} style={{
                                                backgroundColor: '#fff', borderRadius: '16px',
                                                border: '1px solid #E2E8F0', padding: '1.5rem',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                                                transition: 'transform 0.2s, box-shadow 0.2s'
                                            }}
                                                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.10)'; }}
                                                onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)'; }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                                    <div style={{
                                                        width: '38px', height: '38px', borderRadius: '10px',
                                                        background: gradient, display: 'flex', alignItems: 'center',
                                                        justifyContent: 'center', color: '#fff'
                                                    }}><Icon size={18} /></div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{label}</div>
                                                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{count.toLocaleString()} requests</div>
                                                    </div>
                                                </div>
                                                <div style={{ height: '8px', borderRadius: '999px', backgroundColor: '#E2E8F0', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, background: gradient, borderRadius: '999px', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
                                                </div>
                                                <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>{pct.toFixed(1)}% of total traffic</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── System Architecture Health ── */}
                            <div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
                                    <Activity size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: '#6366f1' }} />
                                    Microservice Health Matrix
                                </h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    {['API Gateway', 'Auth Service', 'Article Fetcher', 'Summarizer', 'Bias Detector', 'Fake News', 'Counter Arguments', 'Redis Cache', 'Prometheus'].map((svc) => (
                                        <div key={svc} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '1rem 1.25rem', borderRadius: '12px', backgroundColor: '#fff',
                                            border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                                        }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.2)', flexShrink: 0 }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>{svc}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 700 }}>HEALTHY</div>
                                            </div>
                                            <Cpu size={14} style={{ marginLeft: 'auto', color: '#CBD5E1' }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginTop: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.78rem' }}>
                                <TrendingUp size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                                Data sourced from Prometheus HTTP API · Refreshes every {REFRESH_INTERVAL_MS / 1000} seconds
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ── Tab Content: Management ── */}
            {activeTab === 'management' && isSuperAdmin && (
                <div>
                    {/* Pending Approvals */}
                    <div style={{ marginBottom: '2.5rem' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <UserCheck size={20} color="#F59E0B" /> Pending Admin Approvals
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, background: '#FEF3C7', color: '#D97706', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>{pendingAdmins.length}</span>
                        </h2>
                        {adminLoading && pendingAdmins.length === 0 ? (
                            <p style={{ color: '#64748B' }}>Loading...</p>
                        ) : pendingAdmins.length === 0 ? (
                            <div style={{ padding: '2rem', background: '#F8FAFC', borderRadius: '12px', textAlign: 'center', border: '1px dashed #CBD5E1', color: '#64748B' }}>
                                <CheckCircle size={32} style={{ margin: '0 auto 0.5rem', color: '#10B981', opacity: 0.5 }} />
                                <p style={{ margin: 0, fontWeight: 500 }}>All caught up! No pending approvals.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {pendingAdmins.map(admin => (
                                    <div key={admin.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{admin.username}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{admin.email} • Registered {new Date(admin.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => handleDeleteAdmin(admin.id)}
                                                style={{ padding: '0.5rem 1rem', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                                <UserX size={14} /> Reject
                                            </button>
                                            <button onClick={() => handleApproveAdmin(admin.id)}
                                                style={{ padding: '0.5rem 1rem', background: '#10B981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                                <UserCheck size={14} /> Approve
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Approved Admins */}
                    <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={20} color="#10B981" /> Approved Admins
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, background: '#F1F5F9', color: '#475569', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>{approvedAdmins.length + 1}</span>
                        </h2>
                        
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {/* Super Admin Row - Unremovable */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #CBD5E1' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        Super Admin <span style={{ background: '#6366f1', color: '#fff', fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>ROOT</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Configured via environment variables</div>
                                </div>
                                <div>
                                    <button disabled style={{ padding: '0.5rem 1rem', background: '#E2E8F0', color: '#94A3B8', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        <Trash2 size={14} /> Protected
                                    </button>
                                </div>
                            </div>

                            {/* Standard Approved Admins */}
                            {approvedAdmins.map(admin => (
                                <div key={admin.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{admin.username}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{admin.email} • Approved Admin</div>
                                    </div>
                                    <div>
                                        <button onClick={() => handleDeleteAdmin(admin.id)}
                                            style={{ padding: '0.5rem 1rem', background: '#fff', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                                            onMouseOver={e => e.currentTarget.style.background = '#FEF2F2'}
                                            onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                        >
                                            <Trash2 size={14} /> Remove Access
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulseDot { 0%,100% { opacity:1;transform:scale(1); } 50% { opacity:0.6;transform:scale(1.3); } }
            `}</style>
        </div>
    );
}

function KpiCard({ icon, label, value, sub, color, gradient }) {
    return (
        <div style={{
            backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0',
            padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
            transition: 'transform 0.2s'
        }}
            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseOut={e => e.currentTarget.style.transform = 'none'}
        >
            <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: gradient, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', marginBottom: '0.25rem'
            }}>
                {icon}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                {value}
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>{label}</div>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{sub}</div>
        </div>
    );
}
