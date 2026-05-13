import React, { useState, useEffect } from 'react';
import { 
    User, LogOut, ArrowLeft, ShieldCheck, Zap, 
    Activity, Clock, AlignLeft, AlertTriangle, Scale, MessageSquare, ExternalLink,
    CheckCircle
} from 'lucide-react';
import { secureGatewayCall } from '../api/gateway';

export default function UserProfile({ user, onLogout, onBack }) {
    const [historyLoading, setHistoryLoading] = useState(false);
    const [timeline, setTimeline] = useState([]);
    const [error, setError] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setHistoryLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const data = await secureGatewayCall('get_user_history', {}, token);
            if (data && !data.error) {
                const unified = [];
                if (data.summaries) data.summaries.forEach(i => unified.push({ ...i, type: 'summary', icon: AlignLeft, color: '#3B82F6', title: 'Article Summary' }));
                if (data.fakenews) data.fakenews.forEach(i => unified.push({ ...i, type: 'fakenews', icon: AlertTriangle, color: '#EF4444', title: 'Fake News Check' }));
                if (data.biases) data.biases.forEach(i => unified.push({ ...i, type: 'bias', icon: Scale, color: '#F59E0B', title: 'Political Bias' }));
                if (data.counters) data.counters.forEach(i => unified.push({ ...i, type: 'counter', icon: MessageSquare, color: '#8B5CF6', title: 'Counter Argument' }));

                unified.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                setTimeline(unified);
            } else {
                setError(data.error || "Failed to load history");
            }
        } catch (err) {
            setError(err.message || "An error occurred fetching history.");
        } finally {
            setHistoryLoading(false);
        }
    };

    if (!user) return null;

    // Helper to format date cleanly
    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const formatTime = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="fade-in" style={{ 
            display: 'flex', 
            height: 'calc(100vh - 120px)',
            minHeight: '650px',
            maxWidth: '1300px', 
            margin: '0 auto',
            width: '100%',
            gap: '1.5rem',
            overflow: 'hidden' 
        }}>
            
            {/* LEFT SIDEBAR */}
            <div style={{
                width: '340px',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #E2E8F0', zIndex: 2 }}>
                    <button
                        className="btn"
                        onClick={onBack}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            background: 'transparent',
                            border: '1px solid #E2E8F0',
                            color: '#334155',
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            transition: 'all 0.2s',
                            boxShadow: 'none',
                            marginBottom: '1rem',
                            fontWeight: 600
                        }}
                        onMouseOver={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                    >
                        <ArrowLeft size={16} /> Back to News Feed
                    </button>
                    
                    <button 
                        onClick={() => setSelectedItem(null)}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid transparent',
                            background: selectedItem === null ? '#EEF2FF' : 'transparent',
                            color: selectedItem === null ? 'var(--primary)' : '#475569',
                            fontWeight: selectedItem === null ? 700 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'left'
                        }}
                        onMouseOver={e => { if(selectedItem !== null) e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                        onMouseOut={e => { if(selectedItem !== null) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                        <User size={18} /> Profile Overview
                    </button>
                </div>

                <div style={{ padding: '1.5rem 1.5rem 0.75rem 1.5rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Intelligence History
                    </span>
                </div>

                <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {historyLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                            <Clock size={24} style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem' }} />
                            <span style={{ fontSize: '0.9rem' }}>Loading queries...</span>
                        </div>
                    ) : error ? (
                        <div style={{ color: '#EF4444', fontSize: '0.85rem', padding: '1rem', textAlign: 'center', backgroundColor: '#FEF2F2', borderRadius: '8px' }}>
                            {error}
                        </div>
                    ) : timeline.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94A3B8', fontSize: '0.9rem' }}>
                            <Activity size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                            <span>No history found.</span>
                        </div>
                    ) : (
                        timeline.map((item, idx) => {
                            const Icon = item.icon;
                            // Make uniqueness robust, some DB IDs might overlap between tables
                            const uniqueKey = `${item.type}-${item.id}`;
                            const isSelected = selectedItem && `${selectedItem.type}-${selectedItem.id}` === uniqueKey;

                            return (
                                <button
                                    key={uniqueKey}
                                    onClick={() => setSelectedItem(item)}
                                    style={{
                                        border: '1px solid transparent',
                                        background: isSelected ? '#F8FAFC' : 'transparent',
                                        padding: '1rem',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '0.85rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        textAlign: 'left',
                                        borderColor: isSelected ? '#CBD5E1' : 'transparent',
                                        boxShadow: isSelected ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                    onMouseOver={e => { if(!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                                    onMouseOut={e => { if(!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                                >
                                    <div style={{ color: item.color, marginTop: '2px' }}>
                                        <Icon size={18} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: item.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {item.title}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600 }}>
                                                {formatDate(item.created_at)}
                                            </div>
                                        </div>
                                        <div style={{ 
                                            fontSize: '0.9rem', color: isSelected ? '#0F172A' : '#334155', fontWeight: 600, 
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

            {/* RIGHT MAIN PANEL */}
            <div className="card fade-in" style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '16px',
                padding: 0,
                overflowX: 'hidden',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                border: '1px solid #E2E8F0'
            }}>
                {selectedItem === null ? (
                    /* OVERVIEW SCREEN */
                    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '6rem 4rem 4rem 4rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                            <div style={{
                                width: '90px', height: '90px', borderRadius: '50%', backgroundColor: '#EEF2FF',
                                color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 1.5rem', border: '3px solid #C7D2FE',
                                boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.1)'
                            }}>
                                <User size={44} />
                            </div>
                            
                            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
                                Welcome back, {user}
                            </h2>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', color: '#15803D', backgroundColor: '#DCFCE7', padding: '0.5rem 1.25rem', borderRadius: '999px', width: 'fit-content', margin: '0 auto' }}>
                                <ShieldCheck size={18} />
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Premium AI Access Active</span>
                            </div>
                        </div>

                        <div style={{ padding: '4rem', flex: 1 }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '2rem', color: '#0f172a' }}>Your Architecture Specs</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                                <div className="card" style={{ padding: '1.75rem', backgroundColor: '#ffffff', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                                    <div style={{ color: 'var(--primary)', marginBottom: '1rem', width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Zap size={24} />
                                    </div>
                                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0f172a' }}>Edge AI Inference</h4>
                                    <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.6 }}>Unlimited localized NLP via `qwen2.5` & `DistilRoBERTa`. 100% private, zero external model APIs.</p>
                                </div>
                                <div className="card" style={{ padding: '1.75rem', backgroundColor: '#ffffff', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                                    <div style={{ color: '#10B981', marginBottom: '1rem', width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Activity size={24} />
                                    </div>
                                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0f172a' }}>Decentralized History</h4>
                                    <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.6 }}>Database-per-Service architecture. Your logs are persistently segregated across SQLite micro-dbs.</p>
                                </div>
                            </div>
                            
                            <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '3rem 0 2rem 0' }} />
                            
                            <button 
                                onClick={onLogout}
                                className="btn fade-in" 
                                style={{ 
                                    backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '0.85rem 2.5rem',
                                    fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', fontSize: '1rem', borderRadius: '8px'
                                }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                            >
                                <LogOut size={20} /> Terminate Session
                            </button>
                        </div>
                    </div>
                ) : (
                    /* SPECIFIC HISTORY ITEM VIEW */
                    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                        <div style={{ 
                            padding: '3rem 4rem 2rem 4rem', 
                            borderBottom: '1px solid #E2E8F0', 
                            backgroundColor: '#F8FAFC',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div style={{ 
                                    width: '32px', height: '32px', borderRadius: '8px', 
                                    backgroundColor: `${selectedItem.color}1A`,
                                    color: selectedItem.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `1px solid ${selectedItem.color}33`
                                }}>
                                    {selectedItem.icon && React.createElement(selectedItem.icon, { size: 16 })}
                                </div>
                                <span style={{ fontWeight: 800, color: selectedItem.color, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {selectedItem.title}
                                </span>
                                <span style={{ color: '#64748B', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto', fontWeight: 500 }}>
                                    <Clock size={16} /> {formatDate(selectedItem.created_at)} at {formatTime(selectedItem.created_at)}
                                </span>
                            </div>
                            
                            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 1.25rem 0', lineHeight: 1.25, letterSpacing: '-0.02em', fontFamily: 'Inter, system-ui, sans-serif' }}>
                                {selectedItem.article_title || 'Unknown Source'}
                            </h2>
                            
                            <a href={selectedItem.article_url} target="_blank" rel="noreferrer" style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '0.5rem', 
                                color: 'var(--primary)', textDecoration: 'none', fontWeight: 600,
                                backgroundColor: '#EFF6FF', padding: '0.6rem 1.25rem', borderRadius: '8px',
                                transition: 'background-color 0.2s', fontSize: '0.95rem',
                                border: '1px solid #BFDBFE'
                            }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                            >
                                Read Original Article <ExternalLink size={16} />
                            </a>
                        </div>
                        
                        <div style={{ padding: '3rem 4rem', flex: 1 }}>
                            
                            {/* ── RENDER ACCORDING TO TYPE ── */}
                            
                            {/* SUMMARY */}
                            {selectedItem.type === 'summary' && (
                                <div style={{ fontSize: '1.15rem', lineHeight: 1.85, color: '#334155', whiteSpace: 'pre-wrap', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                    {selectedItem.summary_text}
                                </div>
                            )}
                            
                            {/* FAKE NEWS BUG FIX */}
                            {selectedItem.type === 'fakenews' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '650px' }}>
                                    <div style={{ 
                                        display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '2rem', 
                                        borderRadius: '16px', backgroundColor: selectedItem.is_fake ? '#FEF2F2' : '#F0FDF4',
                                        border: `1px solid ${selectedItem.is_fake ? '#FECACA' : '#BBF7D0'}`
                                    }}>
                                        <div style={{ 
                                            width: '64px', height: '64px', borderRadius: '50%', 
                                            backgroundColor: selectedItem.is_fake ? '#FEE2E2' : '#DCFCE7',
                                            color: selectedItem.is_fake ? '#DC2626' : '#16A34A',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {selectedItem.is_fake ? <AlertTriangle size={32} /> : <CheckCircle size={32} />}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.95rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                                                Classification Result
                                            </div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: selectedItem.is_fake ? '#B91C1C' : '#15803D', letterSpacing: '-0.01em' }}>
                                                {selectedItem.is_fake ? 'Likely Fake News' : 'Credible Real News'}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="card" style={{ padding: '2rem', boxShadow: 'none', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            <span style={{ fontWeight: 700, color: '#475569', fontSize: '1.05rem' }}>Overall Confidence</span>
                                            <span style={{ fontWeight: 800, color: selectedItem.is_fake ? '#EF4444' : '#10B981', fontSize: '1.1rem' }}>
                                                {Math.round((selectedItem.confidence || 0) * 100)}%
                                            </span>
                                        </div>
                                        <div style={{ width: '100%', height: '10px', backgroundColor: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                            <div style={{ 
                                                width: `${Math.round((selectedItem.confidence || 0) * 100)}%`, 
                                                height: '100%', 
                                                backgroundColor: selectedItem.is_fake ? '#EF4444' : '#10B981',
                                                borderRadius: '999px',
                                                transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* POLITICAL BIAS BUG FIX */}
                            {selectedItem.type === 'bias' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '650px' }}>
                                    <div style={{ 
                                        display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '2rem', 
                                        borderRadius: '16px', backgroundColor: '#F8FAFC',
                                        border: '1px solid #E2E8F0'
                                    }}>
                                        <div style={{ 
                                            width: '64px', height: '64px', borderRadius: '50%', 
                                            backgroundColor: '#EEF2FF', color: 'var(--primary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Scale size={32} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.95rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                                                Detected Bias
                                            </div>
                                            <div style={{ 
                                                fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.01em',
                                                color: selectedItem.bias_score?.includes('Left') ? '#3B82F6' : (selectedItem.bias_score?.includes('Right') ? '#EF4444' : '#8B5CF6') 
                                            }}>
                                                {selectedItem.bias_score || 'Unknown / Center'}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="card" style={{ padding: '2rem', boxShadow: 'none', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            <span style={{ fontWeight: 700, color: '#475569', fontSize: '1.05rem' }}>Machine Learning Confidence</span>
                                            <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>
                                                {Math.round((selectedItem.confidence || 0) * 100)}%
                                            </span>
                                        </div>
                                        <div style={{ width: '100%', height: '10px', backgroundColor: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                            <div style={{ 
                                                width: `${Math.round((selectedItem.confidence || 0) * 100)}%`, 
                                                height: '100%', 
                                                backgroundColor: 'var(--primary)',
                                                borderRadius: '999px',
                                                transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* COUNTER ARGUMENTS */}
                            {selectedItem.type === 'counter' && (
                                <div style={{ fontSize: '1.15rem', lineHeight: 1.85, color: '#334155' }}>
                                    <div style={{ 
                                        padding: '0.6rem 1.25rem', backgroundColor: '#F3E8FF', color: '#7E22CE', 
                                        borderRadius: '8px', fontSize: '0.9rem', fontWeight: 800,
                                        display: 'inline-block', marginBottom: '2rem', letterSpacing: '0.05em',
                                        textTransform: 'uppercase', border: '1px solid #E9D5FF'
                                    }}>
                                        Topic Domain: {selectedItem.domain || "Article Analysis"}
                                    </div>
                                    {/* Handle counter arguments nicely. Often it comes through with bullet points already. */}
                                    {selectedItem.arguments_json ? (
                                        <div 
                                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                                            dangerouslySetInnerHTML={{ __html: selectedItem.arguments_json.replace(/\n/g, '<br />') }} 
                                        />
                                    ) : (
                                        <p>No counter arguments collected for this post.</p>
                                    )}
                                </div>
                            )}
                            
                        </div>
                    </div>
                )}
            </div>
            
            <style>{`
                .sidebar-scroll::-webkit-scrollbar {
                    width: 6px;
                }
                .sidebar-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .sidebar-scroll::-webkit-scrollbar-thumb {
                    background-color: #CBD5E1;
                    border-radius: 20px;
                }
            `}</style>
        </div>
    );
}
