import React from 'react';
import { 
    Clock, AlertTriangle, Scale, CheckCircle, ExternalLink, Download
} from 'lucide-react';
import { usePDF } from 'react-to-pdf';

export default function HistoryDetail({ selectedItem }) {
    if (!selectedItem) return null;

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const formatTime = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };

    const { toPDF, targetRef } = usePDF({filename: `Intelligence_Report_${selectedItem.type}_${selectedItem.id}.pdf`});

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', width: '100%' }}>
            
            {/* Top Navigation / Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 4rem 0 4rem', backgroundColor: '#F8FAFC' }}>
                <button 
                    onClick={() => toPDF()} 
                    style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem', 
                        color: '#4F46E5', textDecoration: 'none', fontWeight: 700,
                        backgroundColor: '#E0E7FF', padding: '0.5rem 1rem', borderRadius: '8px',
                        transition: 'background-color 0.2s', fontSize: '0.9rem',
                        border: '1px solid #C7D2FE', cursor: 'pointer'
                    }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor = '#C7D2FE'}
                    onMouseOut={e => e.currentTarget.style.backgroundColor = '#E0E7FF'}
                >
                    <Download size={14} /> Export Forensic Report (PDF)
                </button>
            </div>

            {/* Content to Export */}
            <div ref={targetRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: '#ffffff' }}>
                <div style={{ 
                    padding: '2rem 4rem 2rem 4rem', 
                    borderBottom: '1px solid #E2E8F0', 
                    backgroundColor: '#F8FAFC',
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
                
                {selectedItem.article_url && !selectedItem.article_url.startsWith('newspulse://') ? (
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
                ) : (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        color: '#6D28D9', fontWeight: 600,
                        backgroundColor: '#F5F3FF', padding: '0.6rem 1.25rem', borderRadius: '8px',
                        fontSize: '0.95rem', border: '1px solid #DDD6FE'
                    }}>
                        📝 Pasted Text Analysis
                    </span>
                )}
            </div>
            
            <div style={{ padding: '3rem 4rem', flex: 1 }}>
                {/* SUMMARY */}
                {selectedItem.type === 'summary' && (
                    <div style={{ fontSize: '1.15rem', lineHeight: 1.85, color: '#334155', whiteSpace: 'pre-wrap', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '900px' }}>
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
                    <div style={{ fontSize: '1.15rem', lineHeight: 1.85, color: '#334155', maxWidth: '900px' }}>
                        <div style={{ 
                            padding: '0.6rem 1.25rem', backgroundColor: '#F3E8FF', color: '#7E22CE', 
                            borderRadius: '8px', fontSize: '0.9rem', fontWeight: 800,
                            display: 'inline-block', marginBottom: '2rem', letterSpacing: '0.05em',
                            textTransform: 'uppercase', border: '1px solid #E9D5FF'
                        }}>
                            Topic Domain: {selectedItem.domain || "Article Analysis"}
                        </div>
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
        </div>
    );
}
