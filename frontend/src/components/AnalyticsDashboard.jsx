import React, { useState, useEffect } from 'react';
import { secureGatewayCall } from '../api/gateway';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Cell as PieCell
} from 'recharts';
import { Activity, ShieldAlert, BarChart2 } from 'lucide-react';

export default function AnalyticsDashboard({ token }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                const res = await secureGatewayCall('get_global_stats', {}, token);
                if (res.error) throw new Error(res.error);
                setStats(res);
            } catch (err) {
                setError(err.message || 'Failed to fetch global analytics');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [token]);

    if (loading) {
        return (
            <div className="card fade-in" style={{ padding: '3rem', textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                <p style={{ color: 'var(--text-muted)' }}>Aggregating system-wide telemetry...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card fade-in" style={{ padding: '2rem', color: '#B91C1C', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5' }}>
                <strong>Error: </strong> {error}
            </div>
        );
    }

    if (!stats) return null;

    const fakeNewsData = [
        { name: 'Credible', value: stats.fakenews?.credible_count || 0, color: '#10B981' },
        { name: 'Fake News', value: stats.fakenews?.fake_count || 0, color: '#EF4444' }
    ];

    const biasData = [
        { name: 'Left-Leaning', count: stats.bias?.distribution?.left || 0, color: '#3B82F6' },
        { name: 'Center', count: stats.bias?.distribution?.center || 0, color: '#8B5CF6' },
        { name: 'Right-Leaning', count: stats.bias?.distribution?.right || 0, color: '#EF4444' }
    ];

    const totalAnalyses = (stats.fakenews?.total || 0) + (stats.bias?.total || 0);

    return (
        <div className="fade-in flex-col" style={{ gap: '2rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
                    Global Intelligence Platform
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                    Real-time aggregated analytics from our Edge AI microservices across all tracked articles.
                </p>
            </div>

            {/* Top Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: '#EFF6FF', color: '#3B82F6', borderRadius: '12px' }}>
                        <Activity size={28} />
                    </div>
                    <div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>{totalAnalyses}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>TOTAL ML INFERENCES</div>
                    </div>
                </div>
                
                <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: '#FEF2F2', color: '#EF4444', borderRadius: '12px' }}>
                        <ShieldAlert size={28} />
                    </div>
                    <div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>{stats.fakenews?.fake_count || 0}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>FAKE STORIES BLOCKED</div>
                    </div>
                </div>

                <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: '#F5F3FF', color: '#8B5CF6', borderRadius: '12px' }}>
                        <BarChart2 size={28} />
                    </div>
                    <div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>{stats.bias?.total || 0}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>POLITICAL BIAS SCANS</div>
                    </div>
                </div>
            </div>

            {/* Charts Area */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
                
                {/* Fake News Pie Chart */}
                <div className="card" style={{ padding: '2rem', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                        Platform Veracity Distribution
                    </h3>
                    <div style={{ flex: 1, position: 'relative', minHeight: '250px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={fakeNewsData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {fakeNewsData.map((entry, index) => (
                                        <PieCell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => [value, 'Articles']} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {stats.fakenews?.total || 0}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem' }}>
                         {fakeNewsData.map(d => (
                             <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                 <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: d.color }}></div>
                                 <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>{d.name} ({d.value})</span>
                             </div>
                         ))}
                    </div>
                </div>

                {/* Political Bias Bar Chart */}
                <div className="card" style={{ padding: '2rem', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                        Media Bias Spectrum
                    </h3>
                    <div style={{ flex: 1, minHeight: '250px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={biasData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }} barSize={50}>
                                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{fill: 'var(--bg-secondary)'}} contentStyle={{ borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                    {biasData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
