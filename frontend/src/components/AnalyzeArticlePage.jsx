import React, { useState } from 'react';
import { Link2, FileText, ArrowRight, Loader2, AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import { secureGatewayCall } from '../api/gateway';
import AnalysisPanels from './AnalysisPanels';
import { useToast } from '../context/ToastContext';

// ── Synthetic URL helper ───────────────────────────────────────────────────────
// Generates a stable, unique key for text-mode analyses so the backend's
// article_url deduplication condition is satisfied (no real URL is available).
async function generateSyntheticUrl(text) {
    const sample = text.slice(0, 500);
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(sample);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        return `newspulse://analyze/text/${hex}`;
    } catch {
        // Fallback: simple length+first-chars key
        const safe = sample.replace(/\W/g, '').slice(0, 16);
        return `newspulse://analyze/text/${safe}${text.length}`;
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Domains that don't work well with scraping
const BLOCKED_DOMAINS = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com'];

function isDomainBlocked(url) {
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        return BLOCKED_DOMAINS.some(d => hostname.includes(d));
    } catch {
        return false;
    }
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AnalyzeArticlePage({ token, onRequireAuth, onAnalysisComplete }) {
    const { addToast, updateToast } = useToast();

    // Input mode: 'text' or 'url'
    const [mode, setMode] = useState('text');

    // Input values
    const [textInput, setTextInput] = useState('');
    const [urlInput, setUrlInput] = useState('');

    // URL fetch state
    const [fetchState, setFetchState] = useState('idle'); // idle | loading | success | error
    const [fetchError, setFetchError] = useState('');

    // Article data passed to AnalysisPanels
    const [articleText, setArticleText] = useState('');
    const [articleTitle, setArticleTitle] = useState('');
    const [articleUrl, setArticleUrl] = useState('');
    const [articleSource, setArticleSource] = useState('');

    // Analysis results
    const [summary, setSummary] = useState(null);
    const [bias, setBias] = useState(null);
    const [fakeNews, setFakeNews] = useState(null);
    const [counterArgument, setCounterArgument] = useState(null);

    // ── Reset analysis results when input changes ───────────────────────────
    const resetAnalysis = () => {
        setSummary(null);
        setBias(null);
        setFakeNews(null);
        setCounterArgument(null);
        setFetchState('idle');
        setFetchError('');
        setArticleText('');
        setArticleTitle('');
        setArticleUrl('');
        setArticleSource('');
    };

    const handleModeSwitch = (newMode) => {
        setMode(newMode);
        resetAnalysis();
    };

    // ── TEXT MODE: Confirm text input ────────────────────────────────────────
    const handleTextConfirm = async () => {
        const trimmed = textInput.trim();
        if (trimmed.length < 50) {
            setFetchError('Please enter at least 50 characters of article text.');
            return;
        }
        // Generate a stable synthetic URL so backends can deduplicate + save to DB
        const syntheticUrl = await generateSyntheticUrl(trimmed);
        setFetchError('');
        setArticleText(trimmed);
        setArticleTitle('User-Provided Text');
        setArticleUrl(syntheticUrl);
        setArticleSource('Direct Input');
        setFetchState('success');
        
        addToast('Text confirmed and ready for analysis.', 'success');

        // Clear any old analysis
        setSummary(null);
        setBias(null);
        setFakeNews(null);
        setCounterArgument(null);
    };

    // ── URL MODE: Fetch article ──────────────────────────────────────────────
    const handleUrlFetch = async () => {
        const trimmedUrl = urlInput.trim();

        if (!isValidUrl(trimmedUrl)) {
            setFetchError('Please enter a valid URL starting with http:// or https://');
            return;
        }
        if (isDomainBlocked(trimmedUrl)) {
            setFetchError('Social media URLs (Twitter, Facebook, Instagram, YouTube) cannot be parsed. Please use a news article URL.');
            return;
        }

        setFetchState('loading');
        setFetchError('');
        setSummary(null);
        setBias(null);
        setFakeNews(null);
        setCounterArgument(null);

        const toastId = addToast('Fetching article...', 'loading', 15000);

        try {
            // The article_fetcher GET /fetch?url= endpoint returns an array
            const result = await secureGatewayCall('fetch_articles', { url: trimmedUrl }, token);

            if (!result || result.error) {
                setFetchState('error');
                setFetchError(result?.error || 'Could not extract content from this URL. The site may be paywalled or JavaScript-only.');
                updateToast(toastId, 'Failed to extract content', 'error');
                return;
            }

            // fetch_articles returns an array — take the first item
            const article = Array.isArray(result) ? result[0] : result;

            if (!article || !article.text || article.text.trim().length < 80) {
                setFetchState('error');
                setFetchError('Could not extract enough article text from this URL. The page may require a subscription or JavaScript to load.');
                updateToast(toastId, 'Failed to extract content', 'error');
                return;
            }

            setArticleText(article.text);
            setArticleTitle(article.title || 'Fetched Article');
            setArticleUrl(trimmedUrl);
            setArticleSource(article.source || new URL(trimmedUrl).hostname.replace('www.', ''));
            setFetchState('success');
            updateToast(toastId, 'Article fetched successfully!', 'success');

        } catch (err) {
            setFetchState('error');
            setFetchError('Failed to fetch the article. Please check your connection or try another URL.');
            updateToast(toastId, 'Failed to fetch article', 'error');
        }
    };

    const hasArticle = fetchState === 'success' && articleText.length > 0;

    return (
        <div className="fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>

            {/* ── Page Header ────────────────────────────────────────────── */}
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    margin: '0 0 0.4rem 0',
                    letterSpacing: '-0.02em'
                }}>
                    🔬 Analyze Any Article
                </h1>
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1rem', lineHeight: 1.6 }}>
                    Paste an article URL or raw text to get instant AI-powered analysis — summary, fake news detection, political bias, and counter arguments.
                </p>
            </div>

            {/* ── Mode Toggle ────────────────────────────────────────────── */}
            <div style={{
                display: 'inline-flex',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '4px',
                marginBottom: '1.5rem',
                gap: '4px'
            }}>
                <ModeTab
                    active={mode === 'url'}
                    icon={<Link2 size={15} />}
                    label="Article URL"
                    onClick={() => handleModeSwitch('url')}
                />
                <ModeTab
                    active={mode === 'text'}
                    icon={<FileText size={15} />}
                    label="Paste Text"
                    onClick={() => handleModeSwitch('text')}
                />
            </div>

            {/* ── Input Card ─────────────────────────────────────────────── */}
            <div className="card" style={{
                borderRadius: '16px',
                border: '1px solid var(--border-color)',
                padding: '1.75rem',
                marginBottom: '2rem',
                backgroundColor: 'var(--surface-color)',
                boxShadow: 'var(--shadow-md)'
            }}>
                {mode === 'url' ? (
                    <UrlInputSection
                        urlInput={urlInput}
                        setUrlInput={setUrlInput}
                        onFetch={handleUrlFetch}
                        fetchState={fetchState}
                        fetchError={fetchError}
                        articleTitle={articleTitle}
                        articleSource={articleSource}
                        articleText={articleText}
                    />
                ) : (
                    <TextInputSection
                        textInput={textInput}
                        setTextInput={setTextInput}
                        onConfirm={handleTextConfirm}
                        fetchError={fetchError}
                        articleText={articleText}
                        onReset={resetAnalysis}
                    />
                )}
            </div>

            {/* ── Analysis Panels ────────────────────────────────────────── */}
            {hasArticle && (
                <div className="fade-in">
                    {/* Article info strip */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem 1.25rem',
                        borderRadius: '10px',
                        background: 'rgba(79,70,229,0.06)',
                        border: '1px solid rgba(79,70,229,0.2)',
                        marginBottom: '1.5rem',
                        flexWrap: 'wrap'
                    }}>
                        <CheckCircle2 size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                                {articleTitle}
                            </span>
                            {articleSource && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: '0.5rem' }}>
                                    · {articleSource}
                                </span>
                            )}
                        </div>
                        <span style={{
                            fontSize: '0.75rem',
                            color: '#6366f1',
                            fontWeight: 700,
                            background: 'rgba(99,102,241,0.1)',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            whiteSpace: 'nowrap'
                        }}>
                            {articleText.split(/\s+/).filter(Boolean).length} words
                        </span>
                    </div>

                    <AnalysisPanels
                        articleText={articleText}
                        articleTitle={articleTitle}
                        articleUrl={articleUrl}
                        summary={summary} setSummary={setSummary}
                        bias={bias} setBias={setBias}
                        fakeNews={fakeNews} setFakeNews={setFakeNews}
                        counterArgument={counterArgument} setCounterArgument={setCounterArgument}
                        token={token}
                        onRequireAuth={onRequireAuth}
                        onAnalysisComplete={onAnalysisComplete}
                    />
                </div>
            )}

            {/* ── Empty state hint ───────────────────────────────────────── */}
            {!hasArticle && fetchState !== 'loading' && (
                <div style={{
                    textAlign: 'center',
                    padding: '3rem 2rem',
                    color: 'var(--text-muted)',
                    border: '2px dashed var(--border-color)',
                    borderRadius: '16px',
                    backgroundColor: 'var(--bg-secondary)'
                }}>
                    <Globe size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                    <p style={{ margin: 0, fontWeight: 500, fontSize: '1rem' }}>
                        {mode === 'url'
                            ? 'Enter a news article URL above and click "Fetch & Analyze"'
                            : 'Paste your article text above and click "Confirm Text"'
                        }
                    </p>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', opacity: 0.7 }}>
                        Then use the AI analysis buttons to generate insights
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Sub-Components ─────────────────────────────────────────────────────────────

function ModeTab({ active, icon, label, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1.1rem',
                borderRadius: '9px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
                background: active ? 'var(--surface-color)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
            }}
        >
            {icon}
            {label}
        </button>
    );
}

function UrlInputSection({ urlInput, setUrlInput, onFetch, fetchState, fetchError, articleTitle, articleSource, articleText }) {
    const isLoading = fetchState === 'loading';
    const isSuccess = fetchState === 'success';

    return (
        <div>
            <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--text-label)',
                marginBottom: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                🔗 News Article URL
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !isLoading) onFetch(); }}
                    placeholder="https://www.bbc.com/news/article-example"
                    disabled={isLoading}
                    style={{
                        flex: 1,
                        minWidth: '220px',
                        padding: '0.75rem 1rem',
                        borderRadius: '10px',
                        border: `1.5px solid ${fetchState === 'error' ? '#EF4444' : 'var(--border-color)'}`,
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-main)',
                        fontSize: '0.95rem',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = fetchState === 'error' ? '#EF4444' : 'var(--border-color)'}
                />
                <button
                    onClick={onFetch}
                    disabled={isLoading || !urlInput.trim()}
                    className="btn"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.75rem 1.4rem',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        opacity: (!urlInput.trim() || isLoading) ? 0.6 : 1,
                        cursor: (!urlInput.trim() || isLoading) ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {isLoading
                        ? <><div className="loader-spinner" style={{ width: '15px', height: '15px', borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Fetching...</>
                        : <><ArrowRight size={15} /> Fetch & Analyze</>
                    }
                </button>
            </div>

            {/* Error Message */}
            {fetchState === 'error' && fetchError && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                    marginTop: '0.85rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#DC2626',
                    fontSize: '0.9rem',
                    lineHeight: 1.5
                }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{fetchError}</span>
                </div>
            )}

            {/* Success preview */}
            {isSuccess && articleTitle && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                    marginTop: '0.85rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #86EFAC',
                    color: '#15803D',
                    fontSize: '0.9rem'
                }}>
                    <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                        <strong>Article extracted successfully!</strong>
                        <br />
                        <span style={{ fontWeight: 500, color: '#166534' }}>
                            {articleTitle}{articleSource ? ` · ${articleSource}` : ''} · {articleText.split(/\s+/).filter(Boolean).length} words
                        </span>
                    </div>
                </div>
            )}

            <p style={{ margin: '0.85rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                ✅ Works with: BBC, Reuters, AP News, Dawn, The Guardian, CNN and most major news outlets.<br />
                ❌ Won't work with: Twitter/X, Facebook, Instagram, YouTube, or paywalled sites (WSJ, FT).
            </p>
        </div>
    );
}

function TextInputSection({ textInput, setTextInput, onConfirm, fetchError, articleText, onReset }) {
    const isConfirmed = articleText.length > 0;
    const wordCount = textInput.trim().split(/\s+/).filter(Boolean).length;

    return (
        <div>
            <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--text-label)',
                marginBottom: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                📝 Article Text
            </label>
            <textarea
                value={textInput}
                onChange={e => { setTextInput(e.target.value); if (isConfirmed) onReset(); }}
                placeholder="Paste the full article text here. The more text you provide, the better the AI analysis will be. Aim for at least 100 words..."
                rows={10}
                style={{
                    width: '100%',
                    padding: '1rem',
                    borderRadius: '10px',
                    border: `1.5px solid ${fetchError ? '#EF4444' : 'var(--border-color)'}`,
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.7,
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                onBlur={e => e.target.style.borderColor = fetchError ? '#EF4444' : 'var(--border-color)'}
            />

            {/* Word count + confirm row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.82rem', color: wordCount < 30 ? '#F59E0B' : 'var(--text-muted)', fontWeight: 500 }}>
                    {wordCount} words {wordCount < 30 ? '— add more text for better results' : wordCount >= 100 ? '✓ Good length' : ''}
                </span>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                    {textInput.trim() && (
                        <button
                            onClick={() => { setTextInput(''); onReset(); }}
                            style={{
                                padding: '0.6rem 1rem',
                                borderRadius: '9px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'all 0.2s'
                            }}
                        >
                            Clear
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        disabled={textInput.trim().length < 50}
                        className="btn"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.6rem 1.3rem',
                            borderRadius: '9px',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            opacity: textInput.trim().length < 50 ? 0.5 : 1,
                            cursor: textInput.trim().length < 50 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <CheckCircle2 size={15} />
                        {isConfirmed ? 'Re-confirm Text' : 'Confirm Text'}
                    </button>
                </div>
            </div>

            {/* Error */}
            {fetchError && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    marginTop: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#DC2626',
                    fontSize: '0.875rem'
                }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    {fetchError}
                </div>
            )}
        </div>
    );
}
