import React, { useState, useEffect, useCallback } from 'react';
import { secureGatewayCall } from '../api/gateway';
import {
    PenLine, Plus, FileText, Clock, CheckCircle, XCircle,
    Loader2, Eye, Edit3, Trash2, Send, RefreshCw, BarChart2
} from 'lucide-react';

const STATUS_CONFIG = {
    draft:     { color: '#64748b', label: 'Draft',          icon: FileText },
    submitted: { color: '#f59e0b', label: 'Under Review',   icon: Clock },
    published: { color: '#10b981', label: 'Published',      icon: CheckCircle },
    rejected:  { color: '#ef4444', label: 'Rejected',       icon: XCircle },
};

function ArticleCard({ article, onView, onEdit, onDelete, onResubmit }) {
    const [deleting, setDeleting] = useState(false);
    const cfg = STATUS_CONFIG[article.status] || STATUS_CONFIG.draft;
    const StatusIcon = cfg.icon;

    return (
        <div style={{
            borderRadius: '14px', border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)', padding: '1.25rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'}
        onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <span style={{
                            padding: '0.15rem 0.5rem', borderRadius: '12px',
                            fontSize: '0.68rem', fontWeight: 700,
                            color: cfg.color, background: `${cfg.color}15`,
                            border: `1px solid ${cfg.color}30`,
                            display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }}>
                            <StatusIcon size={10} /> {cfg.label}
                        </span>
                        <span style={{
                            padding: '0.15rem 0.5rem', borderRadius: '12px',
                            fontSize: '0.68rem', fontWeight: 600,
                            color: 'var(--text-muted)', background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)'
                        }}>
                            {article.category}
                        </span>
                        {article.ai_assisted && (
                            <span style={{
                                fontSize: '0.65rem', color: '#8b5cf6',
                                background: 'rgba(139,92,246,0.1)',
                                padding: '0.15rem 0.4rem', borderRadius: '8px',
                                border: '1px solid rgba(139,92,246,0.2)'
                            }}>✨ AI</span>
                        )}
                    </div>
                    <h3 style={{
                        margin: 0, fontSize: '1rem', fontWeight: 700,
                        color: 'var(--text-primary)', lineHeight: 1.3
                    }}>
                        {article.title}
                    </h3>
                </div>
            </div>

            {/* Excerpt */}
            {article.excerpt && (
                <p style={{
                    margin: 0, fontSize: '0.83rem', color: 'var(--text-muted)',
                    lineHeight: 1.5, display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                    {article.excerpt}
                </p>
            )}

            {/* Rejection reason */}
            {article.status === 'rejected' && article.rejection_reason && (
                <div style={{
                    padding: '0.5rem 0.75rem', borderRadius: '8px',
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                    fontSize: '0.78rem', color: '#ef4444'
                }}>
                    <strong>Reason:</strong> {article.rejection_reason}
                </div>
            )}

            {/* Stats */}
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span>📅 {new Date(article.updated_at).toLocaleDateString()}</span>
                {article.status === 'published' && (
                    <span>👁 {article.views} views</span>
                )}
                <span>{Math.max(1, Math.round(article.content?.split(/\s+/).length / 200))} min read</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {article.status === 'published' && (
                    <button onClick={() => onView(article)} style={btnStyle('#10b981')}>
                        <Eye size={12} /> View
                    </button>
                )}
                {(article.status === 'draft' || article.status === 'rejected') && (
                    <button onClick={() => onEdit(article)} style={btnStyle('var(--primary)')}>
                        <Edit3 size={12} /> Edit
                    </button>
                )}
                {article.status === 'rejected' && (
                    <button onClick={() => onResubmit(article)} style={btnStyle('#f59e0b')}>
                        <RefreshCw size={12} /> Resubmit
                    </button>
                )}
                {(article.status === 'draft' || article.status === 'rejected') && (
                    <button
                        onClick={async () => {
                            if (!window.confirm('Delete this article?')) return;
                            setDeleting(true);
                            await onDelete(article.id);
                            setDeleting(false);
                        }}
                        disabled={deleting}
                        style={btnStyle('#ef4444')}
                    >
                        {deleting ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />} Delete
                    </button>
                )}
            </div>
        </div>
    );
}

function btnStyle(color) {
    return {
        display: 'flex', alignItems: 'center', gap: '0.3rem',
        padding: '0.3rem 0.7rem', borderRadius: '8px',
        border: `1px solid ${color}30`, background: `${color}10`,
        color, fontSize: '0.75rem', fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
    };
}

export default function WriterDashboard({ token, user, onWriteNew, onViewPublished }) {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [editingArticle, setEditingArticle] = useState(null);

    const loadArticles = useCallback(async () => {
        setLoading(true);
        const result = await secureGatewayCall('get_my_articles', {}, token);
        if (Array.isArray(result)) {
            setArticles(result);
        }
        setLoading(false);
    }, [token]);

    useEffect(() => { loadArticles(); }, [loadArticles]);

    const handleDelete = async (id) => {
        const result = await secureGatewayCall('delete_article', { article_id: id }, token);
        if (result?.success) {
            setArticles(prev => prev.filter(a => a.id !== id));
        }
    };

    const filtered = filter === 'all' ? articles : articles.filter(a => a.status === filter);

    const stats = {
        total:     articles.length,
        published: articles.filter(a => a.status === 'published').length,
        submitted: articles.filter(a => a.status === 'submitted').length,
        draft:     articles.filter(a => a.status === 'draft').length,
        rejected:  articles.filter(a => a.status === 'rejected').length,
    };

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        ✍️ My Articles
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        Write, manage, and publish your articles on NewsPulse
                    </p>
                </div>
                <button
                    onClick={onWriteNew}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.65rem 1.25rem', borderRadius: '10px',
                        background: 'var(--gradient-primary)', color: '#fff',
                        border: 'none', fontWeight: 700, cursor: 'pointer',
                        fontSize: '0.875rem', fontFamily: 'inherit',
                        boxShadow: '0 4px 14px rgba(79,70,229,0.35)'
                    }}
                >
                    <Plus size={16} /> Write New Article
                </button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Published', val: stats.published, color: '#10b981' },
                    { label: 'Under Review', val: stats.submitted, color: '#f59e0b' },
                    { label: 'Drafts', val: stats.draft, color: '#64748b' },
                    { label: 'Rejected', val: stats.rejected, color: '#ef4444' },
                ].map(s => (
                    <div key={s.label} style={{
                        padding: '1rem', borderRadius: '12px',
                        border: `1px solid ${s.color}20`,
                        background: `${s.color}08`, textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {['all', 'draft', 'submitted', 'published', 'rejected'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '0.35rem 0.9rem', borderRadius: '20px', fontFamily: 'inherit',
                            border: `1px solid ${filter === f ? 'var(--primary)' : 'var(--border-color)'}`,
                            background: filter === f ? 'rgba(79,70,229,0.1)' : 'transparent',
                            color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: filter === f ? 700 : 400, cursor: 'pointer',
                            fontSize: '0.8rem', textTransform: 'capitalize'
                        }}
                    >
                        {f} {f === 'all' ? `(${stats.total})` : ''}
                    </button>
                ))}
                <button onClick={loadArticles} style={{
                    marginLeft: 'auto', padding: '0.35rem', border: 'none',
                    background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)'
                }}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Articles grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={28} className="spin" style={{ marginBottom: '0.75rem' }} />
                    <p>Loading your articles...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                    <PenLine size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                    <h3 style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {filter === 'all' ? 'No articles yet' : `No ${filter} articles`}
                    </h3>
                    <p style={{ fontSize: '0.875rem' }}>
                        {filter === 'all' && 'Start writing your first article and share your perspective!'}
                    </p>
                    {filter === 'all' && (
                        <button onClick={onWriteNew} style={{
                            marginTop: '1rem', padding: '0.65rem 1.5rem', borderRadius: '10px',
                            background: 'var(--gradient-primary)', color: '#fff',
                            border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                        }}>
                            Write Your First Article
                        </button>
                    )}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1rem' }}>
                    {filtered.map(article => (
                        <ArticleCard
                            key={article.id}
                            article={article}
                            onView={onViewPublished}
                            onEdit={(a) => onWriteNew(a)}
                            onDelete={handleDelete}
                            onResubmit={(a) => onWriteNew(a)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
