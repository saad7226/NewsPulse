import React, { useState, useRef, useEffect, useCallback } from 'react';
import { secureGatewayCall } from '../api/gateway';
import {
    Sparkles, Save, Send, Trash2, ChevronDown, Loader2,
    FileText, List, Type, AlignLeft, Wand2, CheckCircle,
    AlertCircle, PenLine, X, Eye, EyeOff, RotateCcw, Copy, Check
} from 'lucide-react';

const CATEGORIES = [
    "General", "Politics", "Technology", "Science",
    "Health", "Sports", "Business", "Entertainment", "World", "Opinion"
];

const AI_ACTIONS = [
    { key: 'outline',  label: 'Generate Outline',   icon: List,      color: '#8b5cf6', desc: 'Create article structure' },
    { key: 'intro',    label: 'Write Introduction',  icon: AlignLeft, color: '#3b82f6', desc: 'Hook the reader instantly' },
    { key: 'improve',  label: 'Improve Paragraph',   icon: Wand2,     color: '#10b981', desc: 'Enhance selected text' },
    { key: 'expand',   label: 'Expand Notes',        icon: Type,      color: '#f59e0b', desc: 'Turn bullets into prose' },
    { key: 'title',    label: 'Suggest Titles',      icon: Sparkles,  color: '#ec4899', desc: 'Get 3 headline options' },
    { key: 'excerpt',  label: 'Generate Excerpt',    icon: FileText,  color: '#06b6d4', desc: 'Create feed preview text' },
    { key: 'grammar',  label: 'Fix Grammar',         icon: CheckCircle, color: '#84cc16', desc: 'Proofread and correct' },
];

function StatusBadge({ status }) {
    const config = {
        draft:     { color: '#64748b', bg: 'rgba(100,116,139,0.12)', label: 'Draft' },
        submitted: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: '⏳ Under Review' },
        published: { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  label: '✅ Published' },
        rejected:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: '❌ Rejected' },
    }[status] || { color: '#64748b', bg: 'rgba(100,116,139,0.12)', label: status };

    return (
        <span style={{
            padding: '0.25rem 0.75rem', borderRadius: '20px',
            fontSize: '0.75rem', fontWeight: 700,
            color: config.color, background: config.bg,
            border: `1px solid ${config.color}30`
        }}>
            {config.label}
        </span>
    );
}

export default function ArticleWriter({ token, user, initialArticle, onClose }) {
    // ── Editor state ──────────────────────────────────────────────────────────
    const [title, setTitle] = useState(initialArticle?.title || '');
    const [content, setContent] = useState(initialArticle?.content || '');
    const [excerpt, setExcerpt] = useState(initialArticle?.excerpt || '');
    const [category, setCategory] = useState(initialArticle?.category || 'General');
    const [tags, setTags] = useState(initialArticle?.tags || []);
    const [tagInput, setTagInput] = useState('');

    // ── Draft / Article state ─────────────────────────────────────────────────
    const [articleId, setArticleId] = useState(initialArticle?.id || null);
    const [status, setStatus] = useState(initialArticle?.status || 'draft');
    const [rejectionReason, setRejectionReason] = useState(initialArticle?.rejection_reason || '');
    const [aiAssisted, setAiAssisted] = useState(initialArticle?.ai_assisted || false);
    const [lastSaved, setLastSaved] = useState(null);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [aiAction, setAiAction] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [alert, setAlert] = useState(null); // {type: 'success'|'error', msg}

    const contentRef = useRef(null);
    const autoSaveTimer = useRef(null);

    // ── Show alert helper ─────────────────────────────────────────────────────
    const showAlert = useCallback((type, msg) => {
        setAlert({ type, msg });
        setTimeout(() => setAlert(null), 4000);
    }, []);

    // ── Auto-save on content change ───────────────────────────────────────────
    useEffect(() => {
        if (!title && !content) return;
        if (status !== 'draft') return;

        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
            handleSave(true); // silent auto-save
        }, 3000);
        return () => clearTimeout(autoSaveTimer.current);
    }, [title, content, excerpt, category, tags]);

    // ── Save Draft ────────────────────────────────────────────────────────────
    const handleSave = async (silent = false) => {
        if (!title.trim() || !content.trim()) {
            if (!silent) showAlert('error', 'Title and content are required.');
            return;
        }
        if (!silent) setSaving(true);
        try {
            const params = {
                title: title.trim(),
                content: content.trim(),
                excerpt: excerpt.trim(),
                category,
                tags,
                ai_assisted: aiAssisted,
            };

            let result;
            if (articleId) {
                result = await secureGatewayCall('update_article', { ...params, article_id: articleId }, token);
            } else {
                result = await secureGatewayCall('create_article', params, token);
                if (result?.id) setArticleId(result.id);
            }

            if (result?.id) {
                setStatus(result.status || 'draft');
                setLastSaved(new Date());
                if (!silent) showAlert('success', 'Draft saved successfully!');
            } else {
                if (!silent) showAlert('error', result?.error || 'Save failed.');
            }
        } catch (e) {
            if (!silent) showAlert('error', 'Save failed. Check your connection.');
        }
        if (!silent) setSaving(false);
    };

    // ── Submit for Review ─────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!articleId) {
            showAlert('error', 'Please save your draft first.');
            return;
        }
        if (content.trim().length < 100) {
            showAlert('error', 'Article is too short (minimum 100 characters).');
            return;
        }
        setSubmitting(true);
        try {
            const result = await secureGatewayCall('submit_article', { article_id: articleId }, token);
            if (result?.success) {
                setStatus('submitted');
                showAlert('success', '🎉 Article submitted for admin review!');
            } else {
                showAlert('error', result?.error || 'Submission failed.');
            }
        } catch (e) {
            showAlert('error', 'Submission failed.');
        }
        setSubmitting(false);
    };

    // ── AI Writing Assist ─────────────────────────────────────────────────────
    const handleAIAssist = async (action) => {
        setAiLoading(true);
        setAiAction(action);
        setAiResult(null);

        const selectedText = window.getSelection()?.toString() || '';
        const contentToSend = selectedText || content;

        try {
            const result = await secureGatewayCall('ai_write_assist', {
                action: action.key,
                content: contentToSend.substring(0, 3000),
                topic: title,
            }, token);

            if (result?.result) {
                setAiResult(result.result);
                setAiAssisted(true);
            } else {
                showAlert('error', result?.error || 'AI assist failed.');
            }
        } catch (e) {
            showAlert('error', 'AI service unavailable. Try again.');
        }
        setAiLoading(false);
    };

    // ── Insert AI Result ──────────────────────────────────────────────────────
    const insertAIResult = () => {
        if (!aiResult) return;
        setContent(prev => prev ? `${prev}\n\n${aiResult}` : aiResult);
        setAiResult(null);
        setAiAction(null);
        setAiAssisted(true);
        showAlert('success', 'AI content inserted!');
    };

    const copyAIResult = async () => {
        await navigator.clipboard.writeText(aiResult || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Tag handling ──────────────────────────────────────────────────────────
    const addTag = (e) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            if (tags.length < 5 && !tags.includes(tagInput.trim())) {
                setTags(prev => [...prev, tagInput.trim()]);
            }
            setTagInput('');
        }
    };

    const removeTag = (tag) => setTags(prev => prev.filter(t => t !== tag));

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.round(wordCount / 200));
    const isEditable = status === 'draft' || status === 'rejected';

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'var(--bg-primary)',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'inherit'
        }}>
            {/* ── Top Bar ──────────────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1.5rem',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                gap: '1rem', flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <PenLine size={20} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        Article Writer
                    </span>
                    <StatusBadge status={status} />
                    {lastSaved && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Saved {lastSaved.toLocaleTimeString()}
                        </span>
                    )}
                    {aiAssisted && (
                        <span style={{
                            fontSize: '0.7rem', fontWeight: 700, color: '#8b5cf6',
                            background: 'rgba(139,92,246,0.1)', padding: '0.2rem 0.5rem',
                            borderRadius: '10px', border: '1px solid rgba(139,92,246,0.2)'
                        }}>
                            ✨ AI Assisted
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {wordCount} words · {readTime} min read
                    </span>
                    <button
                        onClick={() => setShowPreview(!showPreview)}
                        title={showPreview ? 'Edit mode' : 'Preview mode'}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.8rem', borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: showPreview ? 'rgba(79,70,229,0.1)' : 'transparent',
                            color: showPreview ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit'
                        }}
                    >
                        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showPreview ? 'Edit' : 'Preview'}
                    </button>
                    {isEditable && (
                        <button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.4rem 0.9rem', borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent', color: 'var(--text-label)',
                                cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit'
                            }}
                        >
                            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                            Save Draft
                        </button>
                    )}
                    {isEditable && (
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !articleId}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.4rem 1rem', borderRadius: '8px',
                                background: 'var(--gradient-primary)', color: '#fff',
                                border: 'none', cursor: submitting || !articleId ? 'not-allowed' : 'pointer',
                                fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit',
                                opacity: submitting || !articleId ? 0.6 : 1
                            }}
                        >
                            {submitting ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                            Submit for Review
                        </button>
                    )}
                    <button onClick={onClose} style={{
                        padding: '0.4rem', borderRadius: '8px', border: 'none',
                        background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)'
                    }}>
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* ── Alert ────────────────────────────────────────────────────────── */}
            {alert && (
                <div style={{
                    padding: '0.6rem 1.5rem',
                    background: alert.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    borderBottom: `1px solid ${alert.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    color: alert.type === 'success' ? '#10b981' : '#ef4444',
                    fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    {alert.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                    {alert.msg}
                </div>
            )}

            {/* ── Rejection notice ──────────────────────────────────────────────── */}
            {status === 'rejected' && rejectionReason && (
                <div style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(239,68,68,0.08)',
                    borderBottom: '1px solid rgba(239,68,68,0.15)',
                    color: '#ef4444', fontSize: '0.85rem'
                }}>
                    <strong>Rejection reason:</strong> {rejectionReason} — Edit your article and resubmit.
                </div>
            )}

            {/* ── Main Layout ───────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ── Editor Panel ──────────────────────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Metadata bar */}
                    <div style={{
                        padding: '0.75rem 1.5rem',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap',
                        background: 'var(--bg-secondary)', flexShrink: 0
                    }}>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            disabled={!isEditable}
                            style={{
                                padding: '0.35rem 0.75rem', borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit'
                            }}
                        >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {tags.map(tag => (
                                <span key={tag} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                                    padding: '0.2rem 0.6rem', borderRadius: '12px',
                                    background: 'rgba(79,70,229,0.1)', color: 'var(--primary)',
                                    fontSize: '0.75rem', fontWeight: 600
                                }}>
                                    #{tag}
                                    {isEditable && (
                                        <X size={10} style={{ cursor: 'pointer' }} onClick={() => removeTag(tag)} />
                                    )}
                                </span>
                            ))}
                            {isEditable && tags.length < 5 && (
                                <input
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={addTag}
                                    placeholder="+ add tag, press Enter"
                                    style={{
                                        border: 'none', background: 'transparent',
                                        color: 'var(--text-primary)', fontSize: '0.75rem',
                                        outline: 'none', minWidth: '120px', fontFamily: 'inherit'
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Title input */}
                    <div style={{ padding: '1.5rem 2rem 0.5rem', flexShrink: 0 }}>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Article Title..."
                            disabled={!isEditable}
                            style={{
                                width: '100%', border: 'none', outline: 'none',
                                fontSize: '1.8rem', fontWeight: 800,
                                color: 'var(--text-primary)', background: 'transparent',
                                fontFamily: 'inherit', lineHeight: 1.2
                            }}
                        />
                    </div>

                    {/* Excerpt input */}
                    <div style={{ padding: '0.25rem 2rem 0.75rem', flexShrink: 0 }}>
                        <input
                            value={excerpt}
                            onChange={e => setExcerpt(e.target.value)}
                            placeholder="Short excerpt / subtitle (shown in news feed preview)..."
                            disabled={!isEditable}
                            style={{
                                width: '100%', border: 'none', outline: 'none',
                                fontSize: '1rem', fontStyle: 'italic',
                                color: 'var(--text-muted)', background: 'transparent',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>

                    <div style={{ width: 'calc(100% - 4rem)', margin: '0 2rem', height: '1px', background: 'var(--border-color)' }} />

                    {/* Content area or preview */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '1rem 2rem' }}>
                        {showPreview ? (
                            <div style={{
                                maxWidth: '720px', margin: '0 auto',
                                color: 'var(--text-primary)', lineHeight: 1.8, fontSize: '1.05rem'
                            }}>
                                <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    {title || 'Untitled'}
                                </h1>
                                {excerpt && <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '1.5rem' }}>{excerpt}</p>}
                                <div style={{ whiteSpace: 'pre-wrap' }}>{content || <em style={{ color: 'var(--text-muted)' }}>No content yet...</em>}</div>
                            </div>
                        ) : (
                            <textarea
                                ref={contentRef}
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="Start writing your article here...\n\nTip: Select any text, then click an AI tool to improve it!"
                                disabled={!isEditable}
                                style={{
                                    width: '100%', maxWidth: '720px', display: 'block',
                                    margin: '0 auto', minHeight: '60vh',
                                    border: 'none', outline: 'none', resize: 'none',
                                    fontSize: '1.05rem', lineHeight: 1.8,
                                    color: 'var(--text-primary)', background: 'transparent',
                                    fontFamily: 'inherit'
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* ── AI Sidebar ─────────────────────────────────────────────────── */}
                <div style={{
                    width: '280px', flexShrink: 0,
                    borderLeft: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'auto'
                }}>
                    <div style={{
                        padding: '1rem 1rem 0.5rem',
                        borderBottom: '1px solid var(--border-color)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <Sparkles size={15} style={{ color: '#8b5cf6' }} />
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                AI Writing Assistant
                            </span>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                            Select text in your article, then click an action
                        </p>
                    </div>

                    <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {AI_ACTIONS.map(action => (
                            <button
                                key={action.key}
                                onClick={() => handleAIAssist(action)}
                                disabled={aiLoading || !isEditable}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                    padding: '0.6rem 0.75rem', borderRadius: '10px',
                                    border: `1px solid ${aiAction?.key === action.key ? action.color + '40' : 'var(--border-color)'}`,
                                    background: aiAction?.key === action.key ? `${action.color}12` : 'var(--bg-primary)',
                                    cursor: aiLoading || !isEditable ? 'not-allowed' : 'pointer',
                                    opacity: aiLoading || !isEditable ? 0.5 : 1,
                                    transition: 'all 0.2s', textAlign: 'left',
                                    fontFamily: 'inherit'
                                }}
                            >
                                <action.icon size={15} style={{ color: action.color, flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {action.label}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        {action.desc}
                                    </div>
                                </div>
                                {aiLoading && aiAction?.key === action.key && (
                                    <Loader2 size={13} className="spin" style={{ marginLeft: 'auto', color: action.color }} />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* AI Result Box */}
                    {aiResult && (
                        <div style={{
                            margin: '0 0.75rem', padding: '0.75rem', borderRadius: '10px',
                            border: `1px solid ${aiAction?.color || 'var(--border-color)'}40`,
                            background: `${aiAction?.color || '#8b5cf6'}08`,
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                marginBottom: '0.5rem'
                            }}>
                                <span style={{
                                    fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                                    color: aiAction?.color || '#8b5cf6', letterSpacing: '0.05em'
                                }}>
                                    AI Result
                                </span>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button onClick={copyAIResult} title="Copy" style={{
                                        border: 'none', background: 'transparent',
                                        cursor: 'pointer', padding: '0.2rem',
                                        color: copied ? '#10b981' : 'var(--text-muted)'
                                    }}>
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                    <button onClick={() => { setAiResult(null); setAiAction(null); }} style={{
                                        border: 'none', background: 'transparent',
                                        cursor: 'pointer', padding: '0.2rem', color: 'var(--text-muted)'
                                    }}>
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                            <div style={{
                                fontSize: '0.78rem', color: 'var(--text-primary)',
                                lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '200px',
                                overflow: 'auto', marginBottom: '0.5rem'
                            }}>
                                {aiResult}
                            </div>
                            <button
                                onClick={insertAIResult}
                                style={{
                                    width: '100%', padding: '0.4rem',
                                    borderRadius: '8px', border: 'none',
                                    background: aiAction?.color || '#8b5cf6',
                                    color: '#fff', fontWeight: 700, fontSize: '0.75rem',
                                    cursor: 'pointer', fontFamily: 'inherit'
                                }}
                            >
                                Insert into Article
                            </button>
                        </div>
                    )}

                    {/* Tips section */}
                    <div style={{ padding: '0.75rem', marginTop: 'auto' }}>
                        <div style={{
                            padding: '0.75rem', borderRadius: '10px',
                            background: 'rgba(79,70,229,0.07)',
                            border: '1px solid rgba(79,70,229,0.15)'
                        }}>
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                                💡 <strong>Tip:</strong> Write at least 300 words for a well-rounded article. Use AI tools to outline, draft, and polish!
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
