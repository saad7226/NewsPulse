import React, { useState, useEffect } from 'react';
import { FileSearch, AlignLeft, ShieldAlert, Scale, Swords } from 'lucide-react';
import { secureGatewayCall } from '../api/gateway';
import { useToast } from '../context/ToastContext';

export default function AnalysisPanels({
    articleText,
    articleTitle,
    articleUrl,
    summary, setSummary,
    bias, setBias,
    fakeNews, setFakeNews,
    counterArgument, setCounterArgument,
    token,
    onRequireAuth,
    onAnalysisComplete
}) {

    const [isSystemData, setIsSystemData] = useState({ summary: false, bias: false, fakeNews: false, counter: false });
    const { addToast, updateToast } = useToast();

    useEffect(() => {
        // Only restore previous results if the user is logged in.
        // Pass the token so the backend filters results to THIS user's own
        // previously generated analysis — never another user's or background data.
        if (!articleUrl || !token) return;

        const checkSystemData = async () => {
            try {
                const res = await secureGatewayCall('check_system_analysis', { article_url: articleUrl }, token);
                if (res && !res.error) {
                    // Summary: analysis_by_url returns {found, summary:{summary,summary_type,...}}
                    // renderSummary expects {summary, summary_type, ...} — unwrap the inner object
                    if (res.summary && !summary) {
                        setSummary(res.summary.summary || res.summary);
                        setIsSystemData(prev => ({ ...prev, summary: true }));
                    }
                    // Bias: analysis_by_url returns {found, bias_score, confidence, ...} — flat, works as-is
                    if (res.bias && !bias) {
                        setBias(res.bias);
                        setIsSystemData(prev => ({ ...prev, bias: true }));
                    }
                    // FakeNews: analysis_by_url returns {found, is_fake, confidence, ...} — flat, works as-is
                    if (res.fakenews && !fakeNews) {
                        setFakeNews(res.fakenews);
                        setIsSystemData(prev => ({ ...prev, fakeNews: true }));
                    }
                    // Counter: analysis_by_url returns {found, counter_argument, timestamp} — flat, works as-is
                    if (res.counter && !counterArgument) {
                        setCounterArgument(res.counter);
                        setIsSystemData(prev => ({ ...prev, counter: true }));
                    }
                }
            } catch (err) {
                console.warn("System analysis check failed:", err);
            }
        };
        checkSystemData();
        // eslint-disable-next-line
    }, [articleUrl, token]);

    const [loadings, setLoadings] = useState({
        summary: false,
        bias: false,
        fakeNews: false,
        counterArgument: false
    });

    const handleAction = async (actionType) => {
        if (!token) {
            onRequireAuth();
            return;
        }

        setLoadings(prev => ({ ...prev, [actionType]: true }));
        
        let label = "Analysis";
        if (actionType === 'summarize') label = "Summary";
        else if (actionType === 'political_bias') label = "Political Bias";
        else if (actionType === 'fake_news') label = "Fake News Detection";
        else if (actionType === 'counter_argument') label = "Counter Arguments";
        
        const toastId = addToast(`Generating ${label}...`, 'loading', 60000); // 60s fallback duration

        try {
            const result = await secureGatewayCall(actionType, {
                text: articleText,
                article_title: articleTitle,
                article_url: articleUrl
            }, token);

            switch (actionType) {
                case 'summarize': setSummary(result); break;
                case 'political_bias': setBias(result); break;
                case 'fake_news': setFakeNews(result); break;
                case 'counter_argument': setCounterArgument(result); break;
                default: break;
            }
            if (onAnalysisComplete) {
                onAnalysisComplete();
            }
            updateToast(toastId, `${label} Generation Complete`, 'success', 3000);
        } catch (e) {
            console.error(`Error in handleAction for ${actionType}:`, e);
            const errorMsg = e.response?.data?.payload?.error || `We encountered an error analyzing ${actionType.replace('_', ' ')}. Please try again later.`;
            const errorObj = { error: errorMsg };

            switch (actionType) {
                case 'summarize': setSummary(errorObj); break;
                case 'political_bias': setBias(errorObj); break;
                case 'fake_news': setFakeNews(errorObj); break;
                case 'counter_argument': setCounterArgument(errorObj); break;
                default: break;
            }
            updateToast(toastId, `Failed to generate ${label}`, 'error', 4000);
        } finally {
            setLoadings(prev => ({ ...prev, [actionType]: false }));
            setIsSystemData(prev => ({ ...prev, 
                [actionType === 'political_bias' ? 'bias' : 
                (actionType === 'fake_news' ? 'fakeNews' : 
                (actionType === 'summarize' ? 'summary' : 
                (actionType === 'counter_argument' ? 'counter' : '')))]: false 
            }));
        }
    };

    return (
        <div className="fade-in flex-col" style={{ gap: '2rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <ActionButton
                    icon={<AlignLeft size={18} />}
                    label="Generate Summary"
                    loadingText="Summarizing..."
                    loading={loadings.summary}
                    onClick={() => handleAction('summarize')}
                />
                <ActionButton
                    icon={<Scale size={18} />}
                    label="Detect Political Bias"
                    loadingText="Analyzing Bias..."
                    loading={loadings.bias}
                    onClick={() => handleAction('political_bias')}
                />
                <ActionButton
                    icon={<ShieldAlert size={18} />}
                    label="Check Fake News"
                    loadingText="Cross-checking..."
                    loading={loadings.fakeNews}
                    onClick={() => handleAction('fake_news')}
                />
                <ActionButton
                    icon={<Swords size={18} />}
                    label="Counter Arguments"
                    loadingText="Generating..."
                    loading={loadings.counterArgument}
                    onClick={() => handleAction('counter_argument')}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {loadings.summary    && !summary          && <SkeletonPanel label="Article Summary" />}
                {loadings.bias       && !bias              && <SkeletonPanel label="Political Bias" />}
                {loadings.fakeNews   && !fakeNews          && <SkeletonPanel label="Fake News Detection" />}
                {loadings.counterArgument && !counterArgument && <SkeletonPanel label="Counter Arguments" />}

                {summary          && <ResultCard title="Article Summary"     icon={<AlignLeft className="logo-icon" />}   data={summary}          renderData={renderSummary}  isSystem={isSystemData.summary} />}
                {bias             && <ResultCard title="Political Bias"       icon={<Scale className="logo-icon" />}       data={bias}             renderData={renderBias}     isSystem={isSystemData.bias} />}
                {fakeNews         && <ResultCard title="Fake News Detection"  icon={<ShieldAlert className="logo-icon" />} data={fakeNews}         renderData={renderFakeNews} isSystem={isSystemData.fakeNews} />}
                {counterArgument  && <ResultCard title="Counter Arguments"   icon={<Swords className="logo-icon" />}      data={counterArgument}  renderData={renderCounter}  isSystem={isSystemData.counter} />}
            </div>
        </div>
    );
}

// ------ Sub Components ------ //

// ─── Skeleton Panel (shown while AI is working) ────────────────────────────
function SkeletonPanel({ label }) {
    return (
        <div className="card fade-in" style={{
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            padding: '1.5rem 2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.5rem' }}>
                <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0 }} />
                <div className="skeleton skeleton-text-lg" style={{ width: '55%' }} />
            </div>
            <div className="skeleton skeleton-text" style={{ width: '100%' }} />
            <div className="skeleton skeleton-text" style={{ width: '88%' }} />
            <div className="skeleton skeleton-text" style={{ width: '75%' }} />
            <div className="skeleton" style={{ height: '60px', borderRadius: '10px', marginTop: '0.25rem' }} />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: 'pulse-ring 1.5s ease-in-out infinite' }} />
                AI is analyzing · {label}
            </div>
        </div>
    );
}

function ActionButton({ icon, label, loadingText, loading, onClick }) {
    return (
        <button
            className="btn card"
            onClick={onClick}
            disabled={loading}
            style={{
                border: `1px solid ${loading ? 'var(--primary)' : 'var(--border-color)'}`,
                color: 'var(--primary)',
                backgroundColor: loading ? 'rgba(79,70,229,0.06)' : 'var(--surface-color)',
                padding: '1rem 1.5rem',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontWeight: 600,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: loading ? '0 0 0 3px rgba(79,70,229,0.12)' : 'var(--shadow-sm)',
                animation: loading ? 'glow-pulse 2s ease-in-out infinite' : 'none',
                fontSize: '0.9rem',
            }}
            onMouseOver={e => {
                if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.style.borderColor = 'var(--primary)';
                }
            }}
            onMouseOut={e => {
                if (!loading) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                }
            }}
        >
            {loading
                ? <div className="loader-spinner" style={{ borderColor: 'rgba(79,70,229,0.3)', borderTopColor: 'var(--primary)', width: '18px', height: '18px' }} />
                : icon}
            {loading ? loadingText : label}
        </button>
    );
}

function ResultCard({ title, icon, data, renderData, isSystem }) {
    return (
        <div className="card fade-in" style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--surface-color)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)',
            padding: '1.5rem 2rem'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
                marginBottom: '1.5rem',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '1rem'
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: 'rgba(79,70,229,0.1)', color: 'var(--primary)'
                }}>
                    {icon}
                </div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>{title}</h3>
                {isSystem && (
                    <span style={{
                        marginLeft: 'auto', padding: '0.2rem 0.6rem',
                        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)',
                        fontSize: '0.7rem', borderRadius: '4px', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        border: '1px solid var(--border-color)', whiteSpace: 'nowrap'
                    }}>
                        Background
                    </span>
                )}
            </div>
            <div style={{ flex: 1, color: 'var(--text-label)', fontSize: '1rem', lineHeight: 1.7 }}>
                {renderData(data)}
            </div>
        </div>
    );
}

// ------ Renderers based on Python backend payload expectations ------ //

function renderSummary(data) {
    if (data.error) return (
        <div style={{
            padding: '1rem',
            borderRadius: '10px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            fontSize: '0.95rem'
        }}>
            ⚠ {data.error}
        </div>
    );
    return (
        <div className="flex-col" style={{ gap: '0.85rem' }}>
            <p style={{ color: 'var(--text-main)', lineHeight: 1.75, margin: 0 }}>
                {data.summary}
            </p>
            <div style={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                fontSize: '0.8rem',
                color: '#94a3b8',
                borderTop: '1px solid #E2E8F0',
                paddingTop: '0.6rem'
            }}>
                {data.length_sentences != null && (
                    <span>📄 {data.length_sentences} sentences</span>
                )}
                {data.summary_type && (
                    <span>🔬 {data.summary_type === 'abstractive' ? 'AI-generated' : 'Extractive'}</span>
                )}
                {data.generation_time_seconds != null ? (
                    <span>⏱ {data.generation_time_seconds.toFixed(2)}s</span>
                ) : (
                    <span>⏱ Background</span>
                )}
            </div>
        </div>
    );
}

function renderBias(data) {
    if (data.error) return <div style={{ color: 'red' }}>{data.error}</div>;
    const isLeft = data.bias_score?.includes("Left");
    const isRight = data.bias_score?.includes("Right");
    const color = isLeft ? '#3B82F6' : (isRight ? '#EF4444' : '#8B5CF6'); // Blue, Red, Purple

    return (
        <div className="flex-col" style={{ gap: '1rem' }}>
            <h4 style={{ color, fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                {data.bias_score}
            </h4>
            <p style={{ margin: 0 }}><strong>Confidence:</strong> {Math.round(data.confidence * 100)}%</p>

            {data.highlight_phrase && (
                <div style={{
                    marginTop: '0.5rem',
                    padding: '1rem 1.25rem',
                    borderLeft: `4px solid ${color}`,
                    backgroundColor: isLeft ? '#DBEAFE' : (isRight ? '#FEE2E2' : '#EDE9FE'),
                    borderRadius: '0 8px 8px 0',
                    color: '#334155'
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color, textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
                        XAI Influential Phrase Highlight
                    </div>
                    <p style={{ margin: 0, fontSize: '0.95rem', fontStyle: 'italic', lineHeight: 1.6 }}>"{data.highlight_phrase}"</p>
                </div>
            )}

            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>
                Generation time: {data.generation_time_seconds ? `${data.generation_time_seconds}s` : 'Background'}
            </p>
        </div>
    );
}

function ScoreBar({ label, value, colorLow, colorHigh }) {
    const pct = Math.round((value ?? 0) * 100);
    // Interpolate color: green at 0%, red at 100%
    const barColor = pct > 60 ? colorHigh : (pct > 30 ? '#F59E0B' : colorLow);
    return (
        <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>{label}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: barColor }}>{pct}%</span>
            </div>
            <div style={{
                height: '7px',
                borderRadius: '999px',
                backgroundColor: '#E2E8F0',
                overflow: 'hidden'
            }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    backgroundColor: barColor,
                    borderRadius: '999px',
                    transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                }} />
            </div>
        </div>
    );
}

function renderFakeNews(data) {
    if (data.error) return (
        <div style={{
            padding: '1rem',
            borderRadius: '10px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            fontSize: '0.95rem'
        }}>
            ⚠ {data.error}
        </div>
    );

    const isFake = data.is_fake;
    const confidencePct = Math.round((data.confidence ?? 0) * 100);
    const timeTaken = data.generation_time_seconds?.toFixed(2) ?? '—';
    const isOverride = data.verdict_method?.includes('factcheck_override');

    return (
        <div className="flex-col" style={{ gap: '1.1rem' }}>

            {/* ── Main Verdict ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{
                    padding: '0.4rem 1.1rem',
                    borderRadius: '999px',
                    fontWeight: 700,
                    fontSize: '1rem',
                    letterSpacing: '0.01em',
                    backgroundColor: isFake ? '#FEE2E2' : '#DCFCE7',
                    color: isFake ? '#B91C1C' : '#15803D',
                    border: `1px solid ${isFake ? '#FECACA' : '#86EFAC'}`
                }}>
                    {isFake ? '⚠ Likely Fake' : '✓ Credible'}
                </span>
                <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                    {confidencePct}% confidence
                </span>
            </div>

            {/* ── Verdict Method Badge ── */}
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: isOverride ? '#EFF6FF' : '#F5F3FF',
                border: `1px solid ${isOverride ? '#BFDBFE' : '#DDD6FE'}`,
                alignSelf: 'flex-start'
            }}>
                <span style={{ fontSize: '1rem' }}>{isOverride ? '🏛️' : '⚖️'}</span>
                <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: isOverride ? '#1D4ED8' : '#6D28D9'
                }}>
                    {isOverride
                        ? 'Verdict overridden by Fact-Check consensus'
                        : 'Verdict by weighted ensemble (ML + Linguistics)'}
                </span>
            </div>

            {/* ── Analysis Breakdown ── */}
            <div style={{
                padding: '1rem 1.1rem',
                borderRadius: '10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0'
            }}>
                <p style={{
                    margin: '0 0 0.85rem 0',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: '#94A3B8'
                }}>
                    Analysis Breakdown
                </p>
                <ScoreBar
                    label="AI Model Score (Fake-News BERT)"
                    value={data.ml_score}
                    colorLow="#22C55E"
                    colorHigh="#EF4444"
                />
                <ScoreBar
                    label="Linguistic Sensationalism"
                    value={data.style_score}
                    colorLow="#22C55E"
                    colorHigh="#F97316"
                />
                {isOverride && (
                    <p style={{
                        margin: '0.6rem 0 0 0',
                        fontSize: '0.78rem',
                        color: '#1D4ED8',
                        fontStyle: 'italic'
                    }}>
                        ℹ AI score dampened to ×0.25 — mainstream corroboration found.
                    </p>
                )}
            </div>

            {/* ── XAI Highlight ── */}
            {data.highlight_phrase && data.is_fake && (
                <div style={{
                    padding: '1rem 1.25rem',
                    borderLeft: `4px solid #B91C1C`,
                    backgroundColor: '#FECACA',
                    borderRadius: '0 8px 8px 0',
                    color: '#334155'
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
                        XAI Sensationalism Signal Detected
                    </div>
                    <p style={{ margin: 0, fontSize: '0.95rem', fontStyle: 'italic', lineHeight: 1.6 }}>"{data.highlight_phrase}"</p>
                </div>
            )}

            {/* ── NewsAPI Fact-Check Row ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 0.9rem',
                borderRadius: '8px',
                backgroundColor: data.verified_by_factcheck ? '#F0FDF4' : '#F8FAFC',
                border: `1px solid ${data.verified_by_factcheck ? '#86EFAC' : '#E2E8F0'}`
            }}>
                <span style={{ fontSize: '1.1rem' }}>
                    {data.verified_by_factcheck ? '✅' : '🔍'}
                </span>
                <span style={{
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    color: data.verified_by_factcheck ? '#15803D' : '#64748b'
                }}>
                    {data.verified_by_factcheck
                        ? 'Corroborating sources found via NewsAPI fact-check'
                        : 'No corroborating sources found in NewsAPI'}
                </span>
            </div>

            {/* ── Time taken ── */}
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                Analysis completed in {timeTaken ? `${timeTaken}s` : 'Background'}
            </p>
        </div>
    );
}


function renderCounter(data) {
    if (data.error) return (
        <div style={{
            padding: '1rem',
            borderRadius: '10px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            fontSize: '0.95rem'
        }}>
            ⚠ {data.error}
        </div>
    );

    // Split bullet points — model outputs "• point" or "- point" or newline-separated
    const raw = (data.counter_argument || "").trim();
    const bullets = raw
        .split(/\n+/)
        .map(l => l.replace(/^[•\-\*]\s*/, "").trim())
        .filter(Boolean);

    return (
        <div className="flex-col" style={{ gap: '0.75rem' }}>
            {bullets.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {bullets.map((b, i) => (
                        <li key={i} style={{ color: 'var(--text-main)', lineHeight: 1.7, fontSize: '0.97rem' }}>{b}</li>
                    ))}
                </ul>
            ) : (
                <p style={{ color: 'var(--text-main)', lineHeight: 1.7 }}>{raw}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '0.6rem', marginTop: '0.2rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1rem' }}>⚡</span> Generative AI Counter Analysis
                </p>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                    {data.generation_time_seconds != null ? `⏱ ${data.generation_time_seconds.toFixed(2)}s` : '⏱ Cached'}
                </p>
            </div>
        </div>
    );
}
