import React, { useState, useEffect, useCallback } from 'react';
import { secureGatewayCall } from '../api/gateway';
import { Loader2, RefreshCw, Eye, Users, TrendingUp, Filter } from 'lucide-react';

const CATEGORIES = ["All", "General", "Politics", "Technology", "Science",
    "Health", "Sports", "Business", "Entertainment", "World", "Opinion"];

function ArticleCard({ article, onClick }) {
    const readTime = Math.max(1, Math.round((article.content?.split(/\s+/).length || 0) / 200));

    return (
        <div
            onClick={() => onClick(article)}
            style={{
                borderRadius: '14px', border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)', padding: '1.25rem',
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', flexDirection: 'column', gap: '0.75rem'
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
        >
            {/* Category + tags */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{
                    padding: '0.2rem 0.6rem', borderRadius: '12px',
                    fontSize: '0.7rem', fontWeight: 700,
                    color: 'var(--primary)', background: 'rgba(79,70,229,0.1)',
                    border: '1px solid rgba(79,70,229,0.2)'
                }}>
                    {article.category}
                </span>
                {article.ai_assisted && (
                    <span style={{
                        fontSize: '0.65rem', color: '#8b5cf6',
                        background: 'rgba(139,92,246,0.1)', padding: '0.2rem 0.4rem',
                        borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)'
                    }}>✨ AI-Assisted</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    👁 {article.views} · {readTime} min read
                </span>
            </div>

            {/* Title */}
            <h3 style={{
                margin: 0, fontSize: '1.05rem', fontWeight: 800,
                color: 'var(--text-primary)', lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>
                {article.title}
            </h3>

            {/* Excerpt */}
            {article.excerpt && (
                <p style={{
                    margin: 0, fontSize: '0.83rem', color: 'var(--text-muted)',
                    lineHeight: 1.55, display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                    {article.excerpt}
                </p>
            )}

            {/* Author + date */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: 'var(--gradient-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 800, fontSize: '0.75rem'
                    }}>
                        {(article.author_name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {article.author_name}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                    </div>
                </div>
                {(article.tags || []).slice(0, 2).map(tag => (
                    <span key={tag} style={{
                        fontSize: '0.68rem', color: 'var(--text-muted)',
                        padding: '0.15rem 0.4rem', borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                    }}>#{tag}</span>
                ))}
            </div>
        </div>
    );
}

function ArticleDetailView({ article, onBack }) {
    const readTime = Math.max(1, Math.round((article.content?.split(/\s+/).length || 0) / 200));

    return (
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem 1.5rem' }}>
            <button onClick={onBack} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem',
                fontFamily: 'inherit'
            }}>
                ← Back to Community
            </button>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <span style={{
                    padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700,
                    color: 'var(--primary)', background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.2)'
                }}>{article.category}</span>
                {article.ai_assisted && <span style={{
                    fontSize: '0.75rem', color: '#8b5cf6', background: 'rgba(139,92,246,0.1)',
                    padding: '0.25rem 0.6rem', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.2)'
                }}>✨ AI-Assisted</span>}
            </div>

            <h1 style={{
                fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)',
                lineHeight: 1.25, marginBottom: '0.75rem'
            }}>
                {article.title}
            </h1>

            {article.excerpt && (
                <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                    {article.excerpt}
                </p>
            )}

            <div style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                paddingBottom: '1.25rem', marginBottom: '1.5rem',
                borderBottom: '1px solid var(--border-color)'
            }}>
                <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: 'var(--gradient-primary)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 800, fontSize: '1rem'
                }}>
                    {(article.author_name || 'U')[0].toUpperCase()}
                </div>
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{article.author_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(article.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        {' · '}{readTime} min read · 👁 {article.views} views
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
                    {(article.tags || []).map(tag => (
                        <span key={tag} style={{
                            fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '10px',
                            border: '1px solid var(--border-color)', color: 'var(--text-muted)'
                        }}>#{tag}</span>
                    ))}
                </div>
            </div>

            <div style={{
                fontSize: '1.05rem', lineHeight: 1.85,
                color: 'var(--text-primary)', whiteSpace: 'pre-wrap'
            }}>
                {article.content}
            </div>
        </div>
    );
}

export default function CommunityFeed({ token, initialSelectedArticle, onBack }) {
    const [articles, setArticles] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('All');
    const [selectedArticle, setSelectedArticle] = useState(initialSelectedArticle || null);

    useEffect(() => {
        if (initialSelectedArticle) {
            setSelectedArticle(initialSelectedArticle);
        }
    }, [initialSelectedArticle]);

    const handleBack = () => {
        setSelectedArticle(null);
        if (onBack) onBack();
    };

    const loadArticles = useCallback(async () => {
        setLoading(true);
        const result = await secureGatewayCall('get_published_articles', {
            category: category === 'All' ? null : category,
            limit: 20,
            offset: 0,
        }, token);
        if (result?.articles) {
            setArticles(result.articles);
            setTotal(result.total);
        }
        setLoading(false);
    }, [token, category]);

    useEffect(() => { loadArticles(); }, [loadArticles]);

    if (selectedArticle) {
        return <ArticleDetailView article={selectedArticle} onBack={handleBack} />;
    }

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    📰 Community Articles
                </h1>
                <p style={{ color: 'var(--text-muted)', margin: '0.4rem 0 0', fontSize: '0.875rem' }}>
                    Articles written by NewsPulse community members · {total} published
                </p>
            </div>

            {/* Category filters */}
            <div style={{
                display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                marginBottom: '1.5rem', alignItems: 'center'
            }}>
                <Filter size={14} style={{ color: 'var(--text-muted)' }} />
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        style={{
                            padding: '0.3rem 0.85rem', borderRadius: '20px', fontFamily: 'inherit',
                            border: `1px solid ${category === cat ? 'var(--primary)' : 'var(--border-color)'}`,
                            background: category === cat ? 'rgba(79,70,229,0.1)' : 'transparent',
                            color: category === cat ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: category === cat ? 700 : 400,
                            cursor: 'pointer', fontSize: '0.78rem'
                        }}
                    >
                        {cat}
                    </button>
                ))}
                <button onClick={loadArticles} style={{
                    marginLeft: 'auto', border: 'none', background: 'transparent',
                    cursor: 'pointer', color: 'var(--text-muted)', padding: '0.3rem'
                }}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Articles */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={32} className="spin" style={{ marginBottom: '1rem' }} />
                    <p>Loading community articles...</p>
                </div>
            ) : articles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <Users size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                    <h3 style={{ color: 'var(--text-primary)', fontWeight: 700 }}>No articles yet</h3>
                    <p style={{ fontSize: '0.875rem' }}>Be the first to publish an article in this category!</p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                    gap: '1rem'
                }}>
                    {articles.map(article => (
                        <ArticleCard
                            key={article.id}
                            article={article}
                            onClick={setSelectedArticle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
