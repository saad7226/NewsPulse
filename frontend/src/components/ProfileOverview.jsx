import React, { useState, useEffect, useRef } from 'react';
import { User, LogOut, ShieldCheck, Tag, CheckCircle, Loader, Edit2, Save, Camera, X } from 'lucide-react';
import { secureGatewayCall } from '../api/gateway';

const ALL_CATEGORIES = [
    { id: 'General', emoji: '🌐', color: '#6366f1' },
    { id: 'Politics', emoji: '🏛️', color: '#EF4444' },
    { id: 'Technology', emoji: '💻', color: '#3B82F6' },
    { id: 'Sports', emoji: '⚽', color: '#10B981' },
    { id: 'Business', emoji: '📈', color: '#F59E0B' },
    { id: 'Entertainment', emoji: '🎬', color: '#8B5CF6' },
    { id: 'Health', emoji: '🏥', color: '#EC4899' },
    { id: 'Science', emoji: '🔭', color: '#06B6D4' },
];

export default function ProfileOverview({ user, token, onLogout, onProfileUpdate }) {
    if (!user) return null;

    const [selectedCategories, setSelectedCategories] = useState(['General']);
    const [prefSaving, setPrefSaving] = useState(false);
    const [prefSaved, setPrefSaved] = useState(false);
    const [prefLoading, setPrefLoading] = useState(true);

    // Profile State
    const [isEditing, setIsEditing] = useState(false);
    const [profileData, setProfileData] = useState({
        full_name: '',
        bio: '',
        profile_picture: ''
    });
    const [profileSaving, setProfileSaving] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!token) { setPrefLoading(false); return; }
        (async () => {
            try {
                // Fetch preferences
                const data = await secureGatewayCall('get_preferences', {}, token);
                if (data && data.preferences) {
                    try {
                        const parsed = JSON.parse(data.preferences);
                        if (Array.isArray(parsed) && parsed.length > 0) setSelectedCategories(parsed);
                    } catch {}
                }
                
                // Fetch profile
                const profData = await secureGatewayCall('get_profile', {}, token);
                if (profData && !profData.error) {
                    setProfileData({
                        full_name: profData.full_name || '',
                        bio: profData.bio || '',
                        profile_picture: profData.profile_picture || ''
                    });
                }
            } catch (err) {
                console.error("Failed to fetch profile/preferences", err);
            }
            finally { setPrefLoading(false); }
        })();
    }, [token]);

    const toggleCategory = (id) => {
        setPrefSaved(false);
        setSelectedCategories(prev => {
            if (prev.includes(id)) {
                const next = prev.filter(c => c !== id);
                return next.length === 0 ? [id] : next;
            }
            return [...prev, id];
        });
    };

    const savePreferences = async () => {
        if (!token) return;
        setPrefSaving(true);
        try {
            await secureGatewayCall('update_preferences', { preferences: JSON.stringify(selectedCategories) }, token);
            setPrefSaved(true);
            setTimeout(() => setPrefSaved(false), 3000);
        } catch {}
        finally { setPrefSaving(false); }
    };

    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setProfileData(prev => ({ ...prev, profile_picture: reader.result }));
        };
        reader.readAsDataURL(file);
    };

    const saveProfile = async () => {
        if (!token) return;
        setProfileSaving(true);
        try {
            await secureGatewayCall('update_profile', profileData, token);
            setIsEditing(false);
            if (onProfileUpdate) onProfileUpdate();
        } catch (err) {
            console.error("Error saving profile", err);
        } finally {
            setProfileSaving(false);
        }
    };

    const triggerImageUpload = () => {
        if (isEditing && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    return (
        <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', width: '100%' }}>
            {/* Header Area */}
            <div style={{ padding: '4rem 2rem 3rem 2rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', position: 'relative' }}>
                
                {/* Profile Edit Toggle */}
                <div style={{ position: 'absolute', top: '2rem', right: '2rem' }}>
                    {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn" onClick={() => setIsEditing(false)} style={{ padding: '0.5rem 1rem', background: '#fff', color: '#64748b' }}>
                                <X size={16} /> Cancel
                            </button>
                            <button className="btn btn-primary" onClick={saveProfile} disabled={profileSaving} style={{ padding: '0.5rem 1rem' }}>
                                {profileSaving ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <><Save size={16} /> Save</>}
                            </button>
                        </div>
                    ) : (
                        <button className="btn" onClick={() => setIsEditing(true)} style={{ padding: '0.5rem 1rem', background: '#fff' }}>
                            <Edit2 size={16} /> Edit Profile
                        </button>
                    )}
                </div>

                {/* Avatar */}
                <div 
                    onClick={triggerImageUpload}
                    style={{
                        width: '120px', height: '120px', borderRadius: '50%', backgroundColor: '#EEF2FF',
                        color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.5rem', border: '4px solid #ffffff',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                        position: 'relative', overflow: 'hidden', cursor: isEditing ? 'pointer' : 'default',
                        backgroundImage: profileData.profile_picture ? `url(${profileData.profile_picture})` : 'none',
                        backgroundSize: 'cover', backgroundPosition: 'center'
                    }}
                >
                    {!profileData.profile_picture && <User size={50} />}
                    
                    {/* Hover Overlay in Edit Mode */}
                    {isEditing && (
                        <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', opacity: 0, transition: 'opacity 0.2s',
                        }} onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0}>
                            <Camera size={24} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '0.25rem' }}>Upload</span>
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                </div>

                {/* Name & Bio */}
                {isEditing ? (
                    <div style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                            type="text"
                            name="full_name"
                            value={profileData.full_name}
                            onChange={handleProfileChange}
                            placeholder="Full Name"
                            className="input-field"
                            style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 600, fontFamily: 'Playfair Display, serif' }}
                        />
                        <textarea
                            name="bio"
                            value={profileData.bio}
                            onChange={handleProfileChange}
                            placeholder="Write a short professional bio..."
                            className="input-field"
                            style={{ textAlign: 'center', minHeight: '80px', resize: 'vertical' }}
                        />
                    </div>
                ) : (
                    <>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem', fontFamily: 'Playfair Display, serif' }}>
                            {profileData.full_name || user}
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '1rem', fontWeight: 500, marginBottom: '1.25rem' }}>@{user}</p>
                        
                        {profileData.bio && (
                            <p style={{ maxWidth: '600px', margin: '0 auto 1.5rem auto', color: '#475569', lineHeight: 1.6, fontSize: '1.05rem' }}>
                                {profileData.bio}
                            </p>
                        )}
                    </>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', color: '#15803D', backgroundColor: '#DCFCE7', padding: '0.5rem 1.25rem', borderRadius: '999px', width: 'fit-content', margin: '1rem auto 0' }}>
                    <ShieldCheck size={18} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Premium AI Access Active</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ padding: '3rem 4rem', flex: 1, maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
                
                {/* ── News Category Preferences ── */}
                <div style={{ marginBottom: '3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Tag size={20} color="#fff" />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>News Feed Preferences</h3>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>Select categories to personalize your default feed</p>
                        </div>
                    </div>

                    {prefLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem 0', color: '#94a3b8' }}>
                            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                            <span>Loading preferences…</span>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.85rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                                {ALL_CATEGORIES.map(cat => {
                                    const active = selectedCategories.includes(cat.id);
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => toggleCategory(cat.id)}
                                            style={{
                                                position: 'relative',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                gap: '0.5rem', padding: '1rem', borderRadius: '14px',
                                                border: `2px solid ${active ? cat.color : '#E2E8F0'}`,
                                                background: active ? `${cat.color}18` : '#F8FAFC',
                                                cursor: 'pointer', transition: 'all 0.2s',
                                                fontFamily: 'inherit',
                                                transform: active ? 'scale(1.03)' : 'scale(1)',
                                                boxShadow: active ? `0 4px 14px ${cat.color}30` : 'none',
                                            }}
                                            onMouseOver={e => { if (!active) { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.background = `${cat.color}10`; }}}
                                            onMouseOut={e => { if (!active) { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC'; }}}
                                        >
                                            <span style={{ fontSize: '1.75rem' }}>{cat.emoji}</span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: active ? cat.color : '#64748b', letterSpacing: '0.02em' }}>{cat.id}</span>
                                            {active && (
                                                <div style={{ position: 'absolute', top: '-7px', right: '-7px' }}>
                                                    <CheckCircle size={18} color={cat.color} style={{ background: '#fff', borderRadius: '50%' }} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button
                                    onClick={savePreferences}
                                    disabled={prefSaving}
                                    className="btn btn-primary"
                                    style={{ padding: '0.75rem 2rem', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', opacity: prefSaving ? 0.7 : 1 }}
                                >
                                    {prefSaving ? (
                                        <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                                    ) : 'Save Preferences'}
                                </button>
                                {prefSaved && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10B981', fontWeight: 600, fontSize: '0.9rem' }}>
                                        <CheckCircle size={16} /> Preferences saved!
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '0 0 2rem 0' }} />

                <button
                    onClick={onLogout}
                    className="btn fade-in"
                    style={{
                        backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '0.85rem 2.5rem',
                        fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', fontSize: '1rem', borderRadius: '8px'
                    }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                    onMouseOut={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                >
                    <LogOut size={20} /> Terminate Session
                </button>
            </div>
        </div>
    );
}
