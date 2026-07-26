import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ExternalLink, Clock, BookOpen, Bookmark, Download, ShieldCheck, ShieldAlert, ShieldX, ArrowUp, Home } from 'lucide-react';
import AnalysisPanels from './AnalysisPanels';
import { secureGatewayCall } from '../api/gateway';

// ─── Trust Score Calculation ───────────────────────────────────────────────
function calcTrustScore(fakeNews, bias) {
    let score = 100;
    if (fakeNews) {
        if (fakeNews.is_fake) {
            // Confidence 0–1 → penalty between 40 and 60 points
            score -= 40 + Math.round((fakeNews.confidence || 0) * 20);
        } else {
            // Article is real but slightly penalise low-confidence real news
            score -= Math.round((fakeNews.confidence || 0) * 5);
        }
    }
    if (bias) {
        const bs = bias.bias_score || 'Center';
        const biasConf = bias.confidence || 0;
        if (bs === 'Left-Leaning' || bs === 'Right-Leaning') {
            score -= Math.round(5 + biasConf * 20);
        }
        // Center → slight deduction only if very high confidence (unusual framing)
        if (bs === 'Center' && biasConf > 0.85) score -= 2;
    }
    return Math.max(0, Math.min(100, score));
}

function TrustGauge({ score, ready }) {
    const radius = 80;
    const stroke = 14;
    const cx = 110;
    const cy = 110;
    const startAngle = -210; // degrees, bottom-left
    const endAngle   =  30;  // degrees, bottom-right
    const sweep = endAngle - startAngle; // 240°

    const toRad = (deg) => (deg * Math.PI) / 180;
    const getArcPoint = (angle) => ({
        x: cx + radius * Math.cos(toRad(angle)),
        y: cy + radius * Math.sin(toRad(angle)),
    });

    const describeArc = (fromAngle, toAngle) => {
        const s = getArcPoint(fromAngle);
        const e = getArcPoint(toAngle);
        const largeArc = toAngle - fromAngle > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
    };

    const filledAngle = ready ? startAngle + (sweep * score) / 100 : startAngle;
    const circumference = 2 * Math.PI * radius;
    const dashLen = (sweep / 360) * circumference;

    // Colour ramp: red → orange → yellow → green
    const getColor = (s) => {
        if (s >= 85) return '#10B981';
        if (s >= 65) return '#F59E0B';
        if (s >= 40) return '#F97316';
        return '#EF4444';
    };

    const color = getColor(score);

    const getVerdict = (s) => {
        if (!ready) return { label: 'Analyzing…', icon: null };
        if (s >= 85) return { label: 'Highly Credible', icon: ShieldCheck };
        if (s >= 65) return { label: 'Generally Reliable', icon: ShieldCheck };
        if (s >= 40) return { label: 'Exercise Caution', icon: ShieldAlert };
        return { label: 'Low Credibility', icon: ShieldX };
    };
    const { label, icon: VerdictIcon } = getVerdict(score);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <svg width="220" height="160" viewBox="0 0 220 170" style={{ overflow: 'visible' }}>
                {/* Track */}
                <path
                    d={describeArc(startAngle, endAngle)}
                    fill="none"
                    stroke="var(--border-color)"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                />
                {/* Animated fill */}
                <path
                    d={describeArc(startAngle, endAngle)}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${dashLen} ${circumference}`}
                    strokeDashoffset={ready ? dashLen - (dashLen * score) / 100 : dashLen}
                    style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.25,1,0.5,1), stroke 0.6s ease', transformOrigin: `${cx}px ${cy}px` }}
                />
                {/* Score number */}
                <text x={cx} y={cy + 8} textAnchor="middle" fontFamily="Inter, system-ui" fontWeight={800} fontSize={38} fill={ready ? color : 'var(--text-muted)'}>
                    {ready ? score : '—'}
                </text>
                <text x={cx} y={cy + 32} textAnchor="middle" fontFamily="Inter, system-ui" fontWeight={700} fontSize={13} fill="var(--text-muted)">
                    out of 100
                </text>
                {/* Tick labels */}
                {[0, 50, 100].map((v) => {
                    const angle = startAngle + (sweep * v) / 100;
                    const p = getArcPoint(angle); 
                    const offset = 22;
                    const tx = cx + (radius + offset) * Math.cos(toRad(angle));
                    const ty = cy + (radius + offset) * Math.sin(toRad(angle));
                    return <text key={v} x={tx} y={ty + 5} textAnchor="middle" fontFamily="Inter" fontSize={11} fontWeight={700} fill="var(--text-muted)">{v}</text>;
                })}
            </svg>

            {/* Verdict pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.25rem', borderRadius: '999px', backgroundColor: ready ? `${color}18` : 'var(--bg-secondary)', border: `2px solid ${ready ? `${color}50` : 'var(--border-color)'}`, transition: 'all 0.6s ease' }}>
                {VerdictIcon && <VerdictIcon size={17} color={color} />}
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: ready ? color : 'var(--text-muted)', letterSpacing: '0.01em' }}>{label}</span>
            </div>

            {/* Legend */}
            {ready && (
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.25rem' }}>
                    {[{ c: '#10B981', t: '85–100 Credible' }, { c: '#F59E0B', t: '65–84 Reliable' }, { c: '#F97316', t: '40–64 Caution' }, { c: '#EF4444', t: '0–39 Low' }].map(({ c, t }) => (
                        <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c, display: 'inline-block' }} />{t}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ArticleDetail({
    article,
    onBack,
    summary, setSummary,
    bias, setBias,
    fakeNews, setFakeNews,
    counterArgument, setCounterArgument,
    token,
    onRequireAuth,
    onAnalysisComplete
}) {
    const [hasImage, setHasImage] = useState(!!article?.image_url);
    const [showFloatingDock, setShowFloatingDock] = useState(false);

    useEffect(() => {
        const mainElement = document.querySelector('main');
        if (mainElement) {
            mainElement.scrollTo({ top: 0, behavior: 'smooth' });
        }
        setHasImage(!!article?.image_url);

        // Slide in the floating dock with a stunning scale animation on load, then keep it visible permanently
        setShowFloatingDock(false);
        const timer = setTimeout(() => {
            setShowFloatingDock(true);
        }, 200);
        return () => clearTimeout(timer);
    }, [article]);

    const scrollToTop = () => {
        const mainElement = document.querySelector('main');
        if (mainElement) {
            mainElement.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const [bookmarked, setBookmarked] = useState(false);

    const handleBookmark = async () => {
        if (!token) { onRequireAuth(); return; }
        const action = bookmarked ? 'unsave_article' : 'save_article';
        const url = article.source_url || article.url || '';
        const title = article.title || '';
        await secureGatewayCall(action, { article_url: url, article_title: title }, token);
        setBookmarked(!bookmarked);
    };

    const handlePrint = () => window.print();

    if (!article) return null;

    const words = article.text ? article.text.trim().split(/\s+/).length : 0;
    const readingTime = Math.max(1, Math.ceil(words / 225));

    // Trust Score
    const analysisReady = fakeNews !== null || bias !== null;
    const trustScore = analysisReady ? calcTrustScore(fakeNews, bias) : 0;

    const renderHighlightedText = (text) => {
        if (!text) return null;
        let parts = [{ type: 'text', content: text }];
        const applyHighlight = (phrase, type, color, bgColor) => {
            if (!phrase) return;
            const cleanPhrase = phrase.replace(/[."']$/g, '').trim();
            if (cleanPhrase.length < 10) return;
            const newParts = [];
            parts.forEach(p => {
                if (p.type !== 'text') { newParts.push(p); return; }
                const idx = p.content.toLowerCase().indexOf(cleanPhrase.toLowerCase());
                if (idx !== -1) {
                    newParts.push({ type: 'text', content: p.content.substring(0, idx) });
                    newParts.push({ type: 'highlight', content: p.content.substring(idx, idx + cleanPhrase.length), color, bgColor, label: type });
                    newParts.push({ type: 'text', content: p.content.substring(idx + cleanPhrase.length) });
                } else { newParts.push(p); }
            });
            parts = newParts;
        };
        if (bias && bias.highlight_phrase) {
            const isLeft = bias.bias_score?.includes("Left");
            const isRight = bias.bias_score?.includes("Right");
            const color = isLeft ? '#1D4ED8' : (isRight ? '#B91C1C' : '#6D28D9');
            const bgColor = isLeft ? '#DBEAFE' : (isRight ? '#FEE2E2' : '#EDE9FE');
            applyHighlight(bias.highlight_phrase, `XAI ML attribution: ${bias.bias_score}`, color, bgColor);
        }
        if (fakeNews && fakeNews.highlight_phrase && fakeNews.is_fake) {
            applyHighlight(fakeNews.highlight_phrase, 'XAI Stylometric Signal (Sensationalism Flag)', '#B91C1C', '#FECACA');
        }
        return parts.map((p, i) => {
            if (p.type === 'text') return <React.Fragment key={i}>{p.content}</React.Fragment>;
            return (
                <mark key={i} style={{
                    backgroundColor: p.bgColor, color: p.color, padding: '0.1rem 0.25rem',
                    borderRadius: '4px', fontWeight: 600, boxShadow: `0 0 0 1px ${p.color}40`, cursor: 'help'
                }} title={p.label}>{p.content}</mark>
            );
        });
    };

    return (
        <div className="fade-in flex-col" style={{ gap: '2rem', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
            <button className="btn" onClick={onBack} style={{
                alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--border-color)',
                color: 'var(--text-muted)', padding: '0.5rem 1rem', borderRadius: '20px', transition: 'all 0.2s', boxShadow: 'none'
            }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                <ArrowLeft size={16} /> <span style={{ fontWeight: 500 }}>Back to Feed</span>
            </button>

            {/* ── TRUST SCORE METER ── */}
            <div style={{
                background: 'var(--card-gradient)',
                border: '1px solid var(--border-color)',
                borderRadius: '20px',
                padding: '2rem 2.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: 'var(--shadow-md)',
                gap: '0.5rem',
            }}>
                <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem', letterSpacing: '-0.01em' }}>
                        Overall Trust Score
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {analysisReady
                            ? 'Aggregated from Fake News Detection & Political Bias Analysis'
                            : 'Run AI analysis below to calculate the Trust Score'}
                    </p>
                </div>
                <TrustGauge score={trustScore} ready={analysisReady} />
                {!analysisReady && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'center', marginTop: '-0.25rem' }}>
                        Score updates automatically once analysis completes ↓
                    </p>
                )}
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', gap: '0.75rem', alignSelf: 'flex-start' }} className="no-print">
                <button onClick={handleBookmark} title={bookmarked ? 'Remove Bookmark' : 'Bookmark Article'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.5rem 1.1rem', borderRadius: '20px', cursor: 'pointer',
                        border: `1px solid ${bookmarked ? '#6366f1' : '#E2E8F0'}`,
                        background: bookmarked ? '#EEF2FF' : 'transparent',
                        color: bookmarked ? '#6366f1' : '#64748B',
                        fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s'
                    }}>
                    <Bookmark size={15} color={bookmarked ? "#6366f1" : "currentColor"} fill={bookmarked ? "#6366f1" : "none"} />
                    {bookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
                <button onClick={handlePrint} title="Download Intelligence Briefing as PDF"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.5rem 1.1rem', borderRadius: '20px', cursor: 'pointer',
                        border: '1px solid #E2E8F0', background: 'transparent',
                        color: '#64748B', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.border = '1px solid #6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                    onMouseOut={e => { e.currentTarget.style.border = '1px solid #E2E8F0'; e.currentTarget.style.color = '#64748B'; }}>
                    <Download size={15} /> Export PDF Briefing
                </button>
            </div>

            {/* Print-only branded header */}
            <div className="print-only" style={{ display: 'none' }}>
                <h2 style={{ color: '#6366f1', fontSize: '1rem', fontWeight: 800, marginBottom: '0.25rem' }}>NewsPulse Intelligence Briefing</h2>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>Generated: {new Date().toLocaleString()} · Powered by Edge AI</p>
                <hr style={{ margin: '0.75rem 0', borderColor: '#E2E8F0' }} />
            </div>

            {/* Reading View */}
            <article className="card" style={{
                padding: '3rem 4rem', borderRadius: '16px', backgroundColor: 'var(--bg-secondary)',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-color)'
            }}>
                {article.source && (() => {
                    let displaySource = article.source;
                    try {
                        if (displaySource.startsWith('http')) {
                            displaySource = new URL(displaySource).hostname.replace('www.', '');
                        }
                    } catch (e) {}
                    return (
                        <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem', wordBreak: 'break-all' }}>
                            <div style={{ flexShrink: 0, width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></div>
                            {displaySource}
                        </div>
                    );
                })()}
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.25, marginBottom: '1.5rem', color: 'var(--text-main)', letterSpacing: '-0.02em', fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {article.title}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '3rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>
                    {article.published && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={16} />
                            <span>{new Date(article.published).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <BookOpen size={16} />
                        <span>{readingTime} min read</span>
                    </div>
                    {article.source_url && (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                            <a href={article.source_url} target="_blank" rel="noreferrer" style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)',
                                textDecoration: 'none', fontWeight: 600, backgroundColor: '#EFF6FF',
                                padding: '0.4rem 0.8rem', borderRadius: '6px', transition: 'background-color 0.2s'
                            }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}>
                                Original Article <ExternalLink size={14} />
                            </a>
                        </div>
                    )}
                </div>
                
                {hasImage && (
                    <div style={{ marginBottom: '2.5rem', borderRadius: '12px', overflow: 'hidden', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)' }}>
                        <img 
                            src={article.image_url} 
                            alt={article.title} 
                            style={{ width: '100%', maxHeight: '500px', objectFit: 'cover' }} 
                            onError={() => setHasImage(false)}
                        />
                    </div>
                )}
                
                <div className="article-content" style={{ fontSize: '1.15rem', lineHeight: 1.85, color: 'var(--text-main)', whiteSpace: 'pre-wrap', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                    {renderHighlightedText(article.text)}
                </div>
            </article>

            {/* Analysis Tools */}
            <div style={{ marginTop: '3rem', padding: '0 1rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                        Intelligence Dashboard
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', marginTop: '0.5rem' }}>
                        Local Edge NLP Analysis for this content
                    </p>
                </div>
                <AnalysisPanels
                    articleText={article.text}
                    articleTitle={article.title}
                    articleUrl={article.source_url || article.url}
                    summary={summary} setSummary={setSummary}
                    bias={bias} setBias={setBias}
                    fakeNews={fakeNews} setFakeNews={setFakeNews}
                    counterArgument={counterArgument} setCounterArgument={setCounterArgument}
                    token={token}
                    onRequireAuth={onRequireAuth}
                    onAnalysisComplete={onAnalysisComplete}
                />
            </div>

            {/* ── STUNNING FLOATING CONTROL DOCK ── */}
            {createPortal(
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    right: '2.5rem',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    background: 'var(--bg-secondary)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '30px',
                    padding: '0.5rem 0.8rem',
                    boxShadow: 'var(--shadow-xl)',
                    transform: showFloatingDock ? 'translateY(0) scale(1)' : 'translateY(80px) scale(0.8)',
                    opacity: showFloatingDock ? 1 : 0,
                    pointerEvents: showFloatingDock ? 'auto' : 'none',
                    transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease',
                }}>
                    {/* Back to Feed button */}
                    <button 
                        onClick={onBack}
                        title="Back to News Feed"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--bg-color)'; e.currentTarget.style.color = 'var(--primary)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                        <Home size={18} />
                    </button>

                    {/* Bookmark/Save button */}
                    <button 
                        onClick={handleBookmark}
                        title={bookmarked ? "Unsave Article" : "Save Article"}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: bookmarked ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--bg-color)'; if(!bookmarked) e.currentTarget.style.color = 'var(--primary)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = bookmarked ? 'var(--primary)' : 'var(--text-muted)'; }}
                    >
                        <Bookmark size={18} fill={bookmarked ? 'var(--primary)' : 'none'} />
                    </button>

                    {/* Vertical Divider */}
                    <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

                    {/* Scroll to Top button */}
                    <button 
                        onClick={scrollToTop}
                        title="Scroll to Top of Article"
                        style={{
                            background: 'var(--primary)',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(11, 126, 226, 0.4)'; }}
                        onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <ArrowUp size={18} />
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
}
