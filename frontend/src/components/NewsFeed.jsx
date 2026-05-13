import React, { useState, useEffect, useRef } from 'react';
import { Newspaper, ChevronRight, AlertCircle, RefreshCw, Loader, Search } from 'lucide-react';
import { secureGatewayCall } from '../api/gateway';

const CATEGORIES = ['All', 'Politics', 'Technology', 'Sports', 'Business', 'Entertainment', 'Health', 'Science', 'General'];

const CAT_CONFIG = {
    All:           { emoji: '🌐', color: '#6366f1', bg: '#EEF2FF' },
    Politics:      { emoji: '🏛️', color: '#EF4444', bg: '#FEF2F2' },
    Technology:    { emoji: '💻', color: '#3B82F6', bg: '#EFF6FF' },
    Sports:        { emoji: '⚽', color: '#10B981', bg: '#ECFDF5' },
    Business:      { emoji: '📈', color: '#F59E0B', bg: '#FFFBEB' },
    Entertainment: { emoji: '🎬', color: '#8B5CF6', bg: '#F5F3FF' },
    Health:        { emoji: '🏥', color: '#EC4899', bg: '#FDF2F8' },
    Science:       { emoji: '🔭', color: '#06B6D4', bg: '#ECFEFF' },
    General:       { emoji: '📰', color: '#64748b', bg: '#F8FAFC' },
};

export default function NewsFeed({ onSelectArticle, externalQuery, token }) {
    // All articles fetched from cache/API
    const [allArticles, setAllArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Category filter bar state
    const [selectedCat, setSelectedCat] = useState('All');
    const [userPrefCats, setUserPrefCats] = useState([]); // user's saved preferences

    // If a category has 0 cached articles, we fetch live for it
    const [searching, setSearching] = useState(false);
    const [isLongSearch, setIsLongSearch] = useState(false);
    const [liveArticles, setLiveArticles] = useState(null); // null = not in live mode

    // Track if this is an external query from the navbar
    const prevExternalQuery = useRef(externalQuery);

    // Load user preferences once when token is available
    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                const data = await secureGatewayCall('get_preferences', {}, token);
                if (data && data.preferences) {
                    const parsed = JSON.parse(data.preferences);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setUserPrefCats(parsed);
                        // If only non-General prefs, pre-select first one (if no external query)
                        if (!externalQuery && !(parsed.length === 1 && parsed[0] === 'General')) {
                            setSelectedCat(parsed[0]);
                        }
                    }
                }
            } catch {}
        })();
    }, [token]);

    // Main fetch: load ALL hot_news articles from cache
    const fetchAllNews = async () => {
        setLoading(true);
        setError(null);
        setLiveArticles(null);
        // 30-second timeout so loading never spins forever
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await secureGatewayCall('fetch_articles', { num_articles: 20 });
            if (Array.isArray(response)) {
                setAllArticles(response);
            } else if (response && response.error) {
                throw new Error(response.error);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                setError("Feed took too long to load. Click Sync to try again.");
            } else {
                setError("Failed to load news feed. Ensure backend and Gateway are running.");
            }
        } finally {
            clearTimeout(timeout);
            setLoading(false);
        }
    };

    // Live search for a specific category or external query
    const fetchLive = async (query) => {
        setSearching(true);
        setIsLongSearch(false);
        setLiveArticles(null);

        const timer = setTimeout(() => {
            setIsLongSearch(true);
        }, 8000);

        // Hard cap at 30 seconds — never spin forever
        const hardStop = setTimeout(() => {
            setSearching(false);
            setIsLongSearch(false);
            clearTimeout(timer);
        }, 30000);

        try {
            const response = await secureGatewayCall('search_articles', { query, num_articles: 15 });
            if (Array.isArray(response)) {
                setLiveArticles(response);
            }
        } catch {}
        finally { 
            clearTimeout(timer);
            clearTimeout(hardStop);
            setSearching(false); 
            setIsLongSearch(false);
        }
    };

    // Initial load — all hot news
    useEffect(() => {
        fetchAllNews();
    }, []);

    // Auto-refresh every 10 minutes to match backend refresh interval
    useEffect(() => {
        const interval = setInterval(() => {
            // Only silently refresh if we're in the normal "All" view (not live search)
            if (!externalQuery && !searching) {
                fetchAllNews();
            }
        }, 10 * 60 * 1000); // 10 minutes
        return () => clearInterval(interval);
    }, [externalQuery, searching]);

    // React to external query from navbar
    useEffect(() => {
        if (externalQuery !== prevExternalQuery.current) {
            prevExternalQuery.current = externalQuery;
            if (externalQuery) {
                setSelectedCat('All');
                fetchLive(externalQuery);
            } else {
                // Cleared — go back to cache
                setLiveArticles(null);
                setSelectedCat('All');
            }
        }
    }, [externalQuery]);

    // When user clicks a category tab
    const handleCatSelect = (cat) => {
        setSelectedCat(cat);
        setLiveArticles(null);
        setSearching(false);

        // 'All' and 'General' both show cached articles without live search
        if (cat === 'All' || cat === 'General') return;

        // Check if cached articles have any in this category
        const count = allArticles.filter(a => (a.category || 'General') === cat).length;
        if (count === 0) {
            // Nothing cached for this category → live search (but not for General)
            fetchLive(cat);
        }
    };

    // Determine which articles to display
    const getDisplayedArticles = () => {
        let result = [];
        if (externalQuery) {
            const q = externalQuery.toLowerCase();
            // Keywords with >3 chars for relevance check
            const queryKeywords = q.split(' ').filter(w => w.length > 3);

            // Cache: exact phrase match (strict)
            const cacheHits = allArticles.filter(a =>
                (a.title && a.title.toLowerCase().includes(q)) ||
                (a.text && a.text.toLowerCase().includes(q))
            );

            if (liveArticles && liveArticles.length > 0) {
                // Frontend relevance filter: title must contain at least one keyword
                const relevantLive = liveArticles.filter(a => {
                    const titleLower = (a.title || '').toLowerCase();
                    const textLower = (a.text || '').toLowerCase();
                    // For single-word query: title or text match
                    if (queryKeywords.length <= 1) {
                        return queryKeywords.some(kw => titleLower.includes(kw) || textLower.includes(kw));
                    }
                    // For multi-word query: title must contain at least one keyword
                    // AND (title or text must contain at least one other keyword)
                    const titleMatches = queryKeywords.filter(kw => titleLower.includes(kw));
                    const textMatches = queryKeywords.filter(kw => textLower.includes(kw));
                    return titleMatches.length >= 1 && (titleMatches.length + textMatches.length) >= 2;
                });

                const seen = new Set(cacheHits.map(a => a.title));
                const uniqueLive = relevantLive.filter(a => {
                    if (seen.has(a.title)) return false;
                    seen.add(a.title);
                    return true;
                });
                result = [...cacheHits, ...uniqueLive];
            } else {
                result = cacheHits;
            }
        } else if (liveArticles) {
            result = liveArticles; // category live search result
        } else if (selectedCat === 'All') {
            result = allArticles;
        } else {
            result = allArticles.filter(a => (a.category || 'General') === selectedCat);
        }

        // Strict chronological sort (newest first)
        return result.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
    };

    const displayed = getDisplayedArticles();

    // Count per category from cached articles
    const catCounts = {};
    allArticles.forEach(a => {
        const c = a.category || 'General';
        catCounts[c] = (catCounts[c] || 0) + 1;
    });
    catCounts['All'] = allArticles.length;

    if (loading) {
        return (
            <div className="flex-center flex-col fade-in" style={{ padding: '4rem 2rem', gap: '1rem' }}>
                <div className="loader-spinner" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent', width: 40, height: 40, borderWidth: 3 }}></div>
                <p style={{ color: 'var(--text-muted)' }}>Curating the latest news...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card fade-in" style={{ textAlign: 'center', borderColor: '#EF4444', maxWidth: 600, margin: '2rem auto' }}>
                <AlertCircle size={40} color="#EF4444" style={{ marginBottom: '1rem' }} />
                <h3 style={{ margin: '0 0 1rem 0' }}>An error occurred</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{error}</p>
                <button className="btn btn-primary" onClick={fetchAllNews}><RefreshCw size={16} /> Try Again</button>
            </div>
        );
    }

    return (
        <div className="fade-in" style={{ minWidth: 0, overflow: 'hidden' }}>

            {/* ── Feed Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 'clamp(1.2rem, 3vw, 1.65rem)', fontWeight: 800, margin: 0, color: 'var(--text-main)', fontFamily: "'Playfair Display', serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {externalQuery
                        ? `Results for "${externalQuery}"`
                        : selectedCat === 'All'
                            ? 'Live Global Intel Stream'
                            : `${CAT_CONFIG[selectedCat]?.emoji || ''} ${selectedCat} News`}
                </h2>
                <button className="btn" onClick={fetchAllNews} style={{ flexShrink: 0 }}>
                    <RefreshCw size={14} /> Sync
                </button>
            </div>

            {/* ── Category Filter Bar ── */}
            {!externalQuery && (
                <div className="cat-bar" style={{ marginBottom: '1.5rem' }}>
                    {CATEGORIES.map(cat => {
                        const cfg = CAT_CONFIG[cat] || CAT_CONFIG.General;
                        const isActive = selectedCat === cat;
                        const isPref = cat !== 'All' && userPrefCats.includes(cat);
                        const count = catCounts[cat] || 0;
                        return (
                            <button key={cat} onClick={() => handleCatSelect(cat)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                padding: '0.45rem 0.9rem', borderRadius: '999px',
                                border: `2px solid ${isActive ? cfg.color : isPref ? `${cfg.color}60` : 'var(--border-color)'}`,
                                background: isActive ? cfg.color : isPref ? cfg.bg : 'var(--bg-secondary)',
                                color: isActive ? '#fff' : isPref ? cfg.color : 'var(--text-muted)',
                                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                                transition: 'all 0.2s', flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap',
                            }}>
                                <span>{cfg.emoji}</span>
                                <span>{cat}</span>
                                {cat !== 'All' && count > 0 && (
                                    <span style={{
                                        fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 800,
                                        background: isActive ? 'rgba(255,255,255,0.25)' : `${cfg.color}20`,
                                        color: isActive ? '#fff' : cfg.color,
                                    }}>{count}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Live search spinner ── */}
            {searching && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="loader-spinner" />
                        <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                            {externalQuery ? `Searching for "${externalQuery}"…` : `Fetching ${selectedCat} news live…`}
                        </span>
                    </div>
                    {isLongSearch && (
                        <p style={{ marginTop: '0.85rem', fontSize: '0.88rem', color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: '380px', textAlign: 'center' }}>
                            This is taking a bit longer than usual. Searching multiple global sources...
                        </p>
                    )}
                </div>
            )}

            {/* ── Empty state ── */}
            {!searching && displayed.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                    <Newspaper size={48} style={{ opacity: 0.25, margin: '0 auto 1rem', display: 'block' }} />
                    <p style={{ fontSize: '1.05rem', fontWeight: 500 }}>
                        {externalQuery ? `No articles found matching "${externalQuery}"` : 'No articles found.'}
                    </p>
                    {selectedCat !== 'All' && !externalQuery && (
                        <button className="btn" onClick={() => fetchLive(selectedCat)} style={{ marginTop: '1rem' }}>
                            <Search size={14} /> Search live for {selectedCat}
                        </button>
                    )}
                </div>
            )}

            {/* ── Magazine Grid ── */}
            {!searching && displayed.length > 0 && (
                <div className="magazine-grid fade-in">
                    {displayed.map((article, idx) => {
                        const isHero = idx === 0;
                        const type = isHero ? 'hero' : 'bottom';
                        const cat = article.category || 'General';
                        const catCfg = CAT_CONFIG[cat] || CAT_CONFIG.General;
                        const dateStr = article.published
                            ? new Date(article.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Live';

                        return (
                            <article 
                                className={`editorial-card ${isHero ? 'hero-article' : 'bottom-grid-item'}`} 
                                onClick={() => onSelectArticle(article)} 
                                key={article.id || article.title || idx}
                            >
                                {/* Only render image block when the article actually has one */}
                                {article.image_url && (
                                    <div
                                        className="editorial-image-container"
                                        style={{ height: isHero ? '420px' : '190px', marginBottom: '1rem' }}
                                    >
                                        <img
                                            className="editorial-image"
                                            src={article.image_url}
                                            alt={article.title || 'Article image'}
                                            loading="lazy"
                                            onError={e => {
                                                // If image fails to load, hide the whole container
                                                e.currentTarget.closest('.editorial-image-container').style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}
                                <div className="editorial-tag">
                                    {catCfg.emoji} {cat}
                                </div>
                                <h3 className="editorial-title">
                                    {article.title || 'Untitled Article'}
                                </h3>
                                {isHero && (
                                    <p className="editorial-snippet">
                                        {article.text?.substring(0, 500)}...
                                    </p>
                                )}
                                {!isHero && (
                                    <p className="editorial-snippet" style={{ WebkitLineClamp: 3 }}>
                                        {article.text?.substring(0, 150)}...
                                    </p>
                                )}
                                <div className="editorial-meta">
                                    <span className="editorial-meta-source" title={article.source || 'Unknown'}>{article.source || 'Unknown'}</span>
                                    <span style={{ opacity: 0.5 }}>•</span>
                                    <span>{dateStr}</span>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

