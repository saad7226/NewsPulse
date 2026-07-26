import React from 'react';
import { User, LogIn, Clock, Activity, ArrowLeft, BarChart, Server, Bookmark, ShieldCheck, Sun, Moon, Lock, Microscope, PenLine, Newspaper } from 'lucide-react';

export default function Sidebar({ 
    user, 
    globalProfile,
    isAdmin,
    timeline, 
    loading, 
    error, 
    selectedHistoryItem, 
    onSelectHistoryItem, 
    onSelectProfile,
    onBackToFeed,
    onNavigateDashboard,
    onNavigateAdmin,
    onNavigateSaved,
    onNavigateAnalyze,
    onNavigateWriter,
    onNavigateCommunity,
    onLoginClick,
    onAdminLoginClick,
    currentView,
    darkMode,
    onToggleDarkMode,
    isMobileOpen,
    onCloseMobile
}) {
    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const navBtnStyle = (active) => ({
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.6rem 1rem',
        borderRadius: '8px',
        border: `1px solid ${active ? 'rgba(79,70,229,0.35)' : 'var(--border-color)'}`,
        background: active ? 'rgba(79,70,229,0.12)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--text-label)',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontSize: '0.875rem',
        marginBottom: '0.6rem',
        fontFamily: 'inherit',
        boxShadow: 'none',
    });

    return (
        <>
            {isMobileOpen && (
                <div className="sidebar-overlay" onClick={onCloseMobile} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
            )}
            <div className={`sidebar ${isMobileOpen ? 'open' : ''}`}> 
            {/* ── Nav Section ─────────────────────────────── */}
            <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                
                {/* Dark Mode Toggle row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        NewsPulse
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sun size={13} style={{ color: 'var(--text-muted)', opacity: darkMode ? 0.4 : 1, transition: 'opacity 0.2s' }} />
                        <button
                            className={`dark-mode-toggle ${darkMode ? 'dark' : 'light'}`}
                            onClick={onToggleDarkMode}
                            aria-label="Toggle dark mode"
                            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            <div className="toggle-knob">{darkMode ? '🌙' : '☀️'}</div>
                        </button>
                        <Moon size={13} style={{ color: 'var(--text-muted)', opacity: darkMode ? 1 : 0.4, transition: 'opacity 0.2s' }} />
                    </div>
                </div>

                <button
                    onClick={onNavigateDashboard}
                    style={navBtnStyle(currentView === 'dashboard')}
                    onMouseOver={e => { if(currentView !== 'dashboard') e.currentTarget.style.background = 'rgba(79,70,229,0.07)'; }}
                    onMouseOut={e => { if(currentView !== 'dashboard') e.currentTarget.style.background = 'transparent'; }}
                >
                    <BarChart size={15} /> Global Intelligence
                </button>

                <button
                    onClick={onNavigateAnalyze}
                    style={{
                        ...navBtnStyle(currentView === 'analyze'),
                        background: currentView === 'analyze' ? 'rgba(16,185,129,0.12)' : 'transparent',
                        border: `1px solid ${currentView === 'analyze' ? 'rgba(16,185,129,0.35)' : 'var(--border-color)'}`,
                        color: currentView === 'analyze' ? '#10b981' : 'var(--text-label)',
                    }}
                    onMouseOver={e => { if(currentView !== 'analyze') { e.currentTarget.style.background = 'rgba(16,185,129,0.07)'; e.currentTarget.style.color = '#10b981'; } }}
                    onMouseOut={e => { if(currentView !== 'analyze') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-label)'; } }}
                    title="Analyze any article by URL or pasted text"
                >
                    <Microscope size={15} /> Analyze Article
                </button>

                <button
                    onClick={onNavigateCommunity}
                    style={{
                        ...navBtnStyle(currentView === 'community'),
                        background: currentView === 'community' ? 'rgba(245,158,11,0.12)' : 'transparent',
                        border: `1px solid ${currentView === 'community' ? 'rgba(245,158,11,0.35)' : 'var(--border-color)'}`,
                        color: currentView === 'community' ? '#f59e0b' : 'var(--text-label)',
                    }}
                    onMouseOver={e => { if(currentView !== 'community') { e.currentTarget.style.background = 'rgba(245,158,11,0.07)'; e.currentTarget.style.color = '#f59e0b'; } }}
                    onMouseOut={e => { if(currentView !== 'community') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-label)'; } }}
                    title="Browse articles written by community members"
                >
                    <Newspaper size={15} /> Community
                </button>

                {user && (
                    <button
                        onClick={onNavigateWriter}
                        style={{
                            ...navBtnStyle(currentView === 'writer'),
                            background: currentView === 'writer' ? 'rgba(16,185,129,0.12)' : 'var(--gradient-primary)',
                            border: currentView === 'writer' ? '1px solid rgba(16,185,129,0.35)' : 'none',
                            color: '#fff',
                            boxShadow: currentView === 'writer' ? 'none' : '0 4px 12px rgba(79,70,229,0.3)',
                        }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(79,70,229,0.4)'; }}
                        onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.3)'; }}
                        title="Write and publish your articles"
                    >
                        <PenLine size={15} /> ✍️ Write Article
                    </button>
                )}

                {/* System Matrix — ONLY for verified admin users */}
                {isAdmin && (
                    <button
                        onClick={onNavigateAdmin}
                        style={{
                            ...navBtnStyle(currentView === 'admin'),
                            background: currentView === 'admin' ? '#1E293B' : '#0F172A',
                            border: '1px solid #334155',
                            color: '#F8FAFC',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#1E293B'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = '#0F172A'; e.currentTarget.style.transform = 'none'; }}
                        title="Admin System Matrix"
                    >
                        <ShieldCheck size={15} color="#38BDF8" /> System Matrix
                    </button>
                )}

                {user && (
                    <button
                        onClick={onNavigateSaved}
                        style={navBtnStyle(currentView === 'saved')}
                        onMouseOver={e => { if (currentView !== 'saved') e.currentTarget.style.background = 'rgba(79,70,229,0.07)'; }}
                        onMouseOut={e => { if (currentView !== 'saved') e.currentTarget.style.background = 'transparent'; }}
                    >
                        <Bookmark size={15} /> Bookmarks
                    </button>
                )}
                
                <button
                    onClick={onBackToFeed}
                    style={navBtnStyle(false)}
                    onMouseOver={e => { e.currentTarget.style.background = 'rgba(79,70,229,0.07)'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                    <ArrowLeft size={15} /> News Feed
                </button>

                {user ? (
                    <button 
                        onClick={onSelectProfile}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.7rem 1rem', borderRadius: '10px',
                            border: `1px solid ${currentView === 'profile' ? 'rgba(79,70,229,0.3)' : 'transparent'}`,
                            background: currentView === 'profile' ? 'rgba(79,70,229,0.1)' : 'transparent',
                            color: currentView === 'profile' ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
                            fontSize: '0.875rem', fontFamily: 'inherit'
                        }}
                        onMouseOver={e => { if(currentView !== 'profile') e.currentTarget.style.background = 'rgba(79,70,229,0.05)'; }}
                        onMouseOut={e => { if(currentView !== 'profile') e.currentTarget.style.background = 'transparent'; }}
                    >
                        {globalProfile?.profile_picture ? (
                            <img src={globalProfile.profile_picture} alt={user} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                            <User size={17} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {globalProfile?.full_name ? `${globalProfile.full_name.split(' ')[0]}'s Profile` : `${user}'s Profile`}
                        </span>
                    </button>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <button 
                            onClick={onLoginClick}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                justifyContent: 'center', padding: '0.7rem 1rem', borderRadius: '10px',
                                border: '1px solid transparent', background: 'var(--gradient-primary)',
                                color: '#ffffff', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem',
                                fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(79,70,229,0.35)',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'none'}
                        >
                            <LogIn size={17} /> Sign In to Unlock AI
                        </button>
                        {/* Discreet Admin Login — only shown when nobody is logged in */}
                        <button
                            onClick={onAdminLoginClick}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', padding: '0.45rem 1rem', borderRadius: '8px',
                                border: '1px solid #334155', background: '#0F172A',
                                color: '#94A3B8', fontWeight: 600, cursor: 'pointer',
                                fontSize: '0.78rem', fontFamily: 'inherit', transition: 'all 0.2s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = '#F8FAFC'; e.currentTarget.style.borderColor = '#475569'; }}
                            onMouseOut={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#334155'; }}
                            title="Sign in with admin credentials to access the System Matrix"
                        >
                            <ShieldCheck size={13} color="#38BDF8" /> Admin Login
                        </button>
                    </div>
                )}
            </div>

            {/* ── History Section Header ───────────────── */}
            <div style={{ padding: '1rem 1.25rem 0.6rem', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Intelligence History
                </span>
            </div>

            {/* ── History Timeline ─────────────────────── */}
            <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {!user ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        <User size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
                        <span>Sign in to view your AI history.</span>
                    </div>
                ) : loading ? (
                    /* Skeleton loading for history */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
                        {[1,2,3,4].map(i => (
                            <div key={i} style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <div className="skeleton skeleton-text" style={{ width: '45%', marginBottom: '0.5rem' }} />
                                <div className="skeleton skeleton-text" style={{ width: '90%' }} />
                                <div className="skeleton skeleton-text" style={{ width: '70%' }} />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div style={{ color: '#EF4444', fontSize: '0.85rem', padding: '1rem', textAlign: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '8px', margin: '0.5rem' }}>
                        {error}
                    </div>
                ) : timeline.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        <Activity size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
                        <span>No history yet. Analyze an article!</span>
                    </div>
                ) : (
                    timeline.map((item) => {
                        const Icon = item.icon;
                        const uniqueKey = `${item.type}-${item.id}`;
                        const isSelected = selectedHistoryItem && `${selectedHistoryItem.type}-${selectedHistoryItem.id}` === uniqueKey;

                        return (
                            <button
                                key={uniqueKey}
                                onClick={() => onSelectHistoryItem(item)}
                                style={{
                                    border: `1px solid ${isSelected ? 'var(--border-strong)' : 'transparent'}`,
                                    background: isSelected ? 'rgba(79,70,229,0.08)' : 'transparent',
                                    padding: '0.85rem',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.18s',
                                    textAlign: 'left',
                                    width: '100%',
                                    fontFamily: 'inherit',
                                }}
                                onMouseOver={e => { if(!isSelected) e.currentTarget.style.background = 'rgba(79,70,229,0.05)'; }}
                                onMouseOut={e => { if(!isSelected) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{ color: item.color, marginTop: '2px', flexShrink: 0 }}>
                                    <Icon size={16} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: item.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            {item.title}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0, marginLeft: '0.5rem' }}>
                                            {formatDate(item.created_at)}
                                        </div>
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 500, 
                                        lineHeight: 1.4,
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                                    }}>
                                        {item.article_title || 'Unknown Source Article Title'}
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
            </div>
        </>
    );
}
