import React, { useState, useEffect } from 'react';
import { secureGatewayCall } from '../api/gateway';
import { BookmarkCheck, ExternalLink, Trash2, BookmarkX, Clock } from 'lucide-react';

export default function SavedArticles({ token }) {
    const [saved, setSaved] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await secureGatewayCall('get_saved_articles', {}, token);
                if (Array.isArray(data)) setSaved(data);
                else setError(data?.error || 'Failed to load saved articles');
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    const handleUnsave = async (article_url) => {
        try {
            await secureGatewayCall('unsave_article', { article_url }, token);
            setSaved(prev => prev.filter(a => a.article_url !== article_url));
        } catch (e) {
            console.error('Failed to unsave:', e);
        }
    };

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #E2E8F0', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
            Loading Bookmarked Articles...
            <style>{`@keyframes spin { from {transform:rotate(0deg);} to {transform:rotate(360deg);} }`}</style>
        </div>
    );

    return (
        <div className="saved-articles-container" style={{ padding: '2rem 1rem', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
                <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: 'linear-gradient(135deg,var(--primary),#8B5CF6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                }}>
                    <BookmarkCheck size={22} />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>Bookmarked Articles</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{saved.length} saved article{saved.length !== 1 ? 's' : ''}</p>
                </div>
            </div>

            {error && (
                <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', marginBottom: '1rem' }}>
                    ⚠ {error}
                </div>
            )}

            {saved.length === 0 && !error ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                    <BookmarkX size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ fontSize: '1rem', fontWeight: 500 }}>No bookmarked articles yet.</p>
                    <p style={{ fontSize: '0.85rem' }}>Click the 🔖 bookmark icon on any article to save it here.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {saved.map(article => (
                        <div key={article.id} style={{
                            display: 'flex', alignItems: 'center', gap: '1rem',
                            padding: '1.25rem 1.5rem', borderRadius: '14px', backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)',
                            transition: 'box-shadow 0.2s, transform 0.2s'
                        }}
                            onMouseOver={e => {
                                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: 'rgba(99, 102, 241, 0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, color: 'var(--primary)'
                            }}>
                                <BookmarkCheck size={18} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                }}>
                                    {article.article_title}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                                    <Clock size={11} />
                                    Saved {new Date(article.saved_at).toLocaleString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                <a
                                    href={article.article_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '34px', height: '34px', borderRadius: '8px',
                                        backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: 'none',
                                        cursor: 'pointer', textDecoration: 'none', transition: 'background 0.15s'
                                    }}
                                    title="Open Article"
                                >
                                    <ExternalLink size={15} />
                                </a>
                                <button
                                    onClick={() => handleUnsave(article.article_url)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '34px', height: '34px', borderRadius: '8px',
                                        backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#DC2626', border: 'none',
                                        cursor: 'pointer', transition: 'background 0.15s'
                                    }}
                                    title="Remove Bookmark"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
