import React, { useState, useEffect } from 'react';
import { Newspaper, UserCircle, LogIn, LogOut, AlignLeft, AlertTriangle, Scale, MessageSquare, Search, X, ShieldCheck, Lock, Menu } from 'lucide-react';
import { secureGatewayCall } from './api/gateway';
import NewsFeed from './components/NewsFeed';
import ArticleDetail from './components/ArticleDetail';
import AuthModal from './components/AuthModal';
import AdminLoginModal from './components/AdminLoginModal';
import Sidebar from './components/Sidebar';
import HistoryDetail from './components/HistoryDetail';
import ProfileOverview from './components/ProfileOverview';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import AdminDashboard from './components/AdminDashboard';
import SavedArticles from './components/SavedArticles';
import AdvancedSearchBar from './components/AdvancedSearchBar';
import AnalyzeArticlePage from './components/AnalyzeArticlePage';

// Decode is_admin from JWT without external libs
function decodeIsAdmin(token) {
    try {
        if (!token) return false;
        const payload = JSON.parse(atob(token.split('.')[1]));
        return !!payload.is_admin;
    } catch { return false; }
}

function decodeIsSuperAdmin(token) {
    try {
        if (!token) return false;
        const payload = JSON.parse(atob(token.split('.')[1]));
        return !!payload.is_super_admin;
    } catch { return false; }
}

function App() {
  // ── Dark Mode ─────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('np-theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('np-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Global Routing State
  const [currentView, setCurrentView] = useState('feed');

  const handleNavigateAnalyze = () => {
    setSelectedArticle(null);
    setSelectedHistoryItem(null);
    setCurrentView('analyze');
  };
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Global Search State (from header navbar)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [activeGlobalQuery, setActiveGlobalQuery] = useState('');

  // Auth State
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(localStorage.getItem('user') || null);
  const [isAdmin, setIsAdmin] = useState(decodeIsAdmin(localStorage.getItem('token')));
  const [isSuperAdmin, setIsSuperAdmin] = useState(decodeIsSuperAdmin(localStorage.getItem('token')));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Analysis Results states for ArticleDetail mapping
  const [summary, setSummary] = useState(null);
  const [bias, setBias] = useState(null);
  const [fakeNews, setFakeNews] = useState(null);
  const [counterArgument, setCounterArgument] = useState(null);

  // Global Sidebar History State
  const [timeline, setTimeline] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Global Profile State (for header and sidebar avatars)
  const [globalProfile, setGlobalProfile] = useState({ full_name: '', profile_picture: '' });

  useEffect(() => {
    if (user && token) {
      fetchHistory();
      fetchGlobalProfile();
    } else {
      setTimeline([]);
      setGlobalProfile({ full_name: '', profile_picture: '' });
    }
  }, [user, token]);

  const fetchGlobalProfile = async () => {
    try {
        const data = await secureGatewayCall('get_profile', {}, token);
        if (data && !data.error) {
            setGlobalProfile({ full_name: data.full_name || '', profile_picture: data.profile_picture || '' });
        }
    } catch (e) {
        console.error("Failed to fetch global profile", e);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
        const data = await secureGatewayCall('get_user_history', {}, token);
        if (data && !data.error) {
            const unified = [];
            if (data.summaries) data.summaries.forEach(i => unified.push({ ...i, type: 'summary', icon: AlignLeft, color: '#3B82F6', title: 'Article Summary' }));
            if (data.fakenews) data.fakenews.forEach(i => unified.push({ ...i, type: 'fakenews', icon: AlertTriangle, color: '#EF4444', title: 'Fake News Check' }));
            if (data.biases) data.biases.forEach(i => unified.push({ ...i, type: 'bias', icon: Scale, color: '#F59E0B', title: 'Political Bias' }));
            if (data.counters) data.counters.forEach(i => unified.push({ ...i, type: 'counter', icon: MessageSquare, color: '#8B5CF6', title: 'Counter Argument' }));

            unified.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setTimeline(unified);
        } else {
            setHistoryError(data.error || "Failed to load history");
        }
    } catch (err) {
        setHistoryError(err.message || "An error occurred fetching history.");
    } finally {
        setHistoryLoading(false);
    }
  };

  const handleSelectArticle = (article) => {
    setSelectedArticle(article);
    setSummary(null);
    setBias(null);
    setFakeNews(null);
    setCounterArgument(null);
    setSelectedHistoryItem(null);
    setCurrentView('article');
  };

  const handleBackToFeed = () => {
    setSelectedArticle(null);
    setSelectedHistoryItem(null);
    setCurrentView('feed');
  };

  const handleSelectHistoryItem = (item) => {
    setSelectedHistoryItem(item);
    setCurrentView('history_detail');
  };

  const handleSelectProfile = () => {
    setSelectedHistoryItem(null);
    setCurrentView('profile');
  };

  const handleLoginSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    setIsAdmin(decodeIsAdmin(newToken));
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', newUser);
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setIsAdmin(false);
    setIsSuperAdmin(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentView('feed');
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('Unauthorized access detected. Logging out...');
      handleLogout();
      setShowAuthModal(true); // Prompt them to sign in again
    };
    window.addEventListener('np-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('np-unauthorized', handleUnauthorized);
  }, []);

  // Called by AdminLoginModal on successful admin login
  const handleAdminLogin = (result) => {
    const t = result.access_token;
    setToken(t);
    setIsAdmin(true);
    setIsSuperAdmin(decodeIsSuperAdmin(t));
    localStorage.setItem('token', t);
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      const adminUser = payload.sub || 'Admin';
      setUser(adminUser);
      localStorage.setItem('user', adminUser);
    } catch { setUser('Admin'); localStorage.setItem('user', 'Admin'); }
    setShowAdminModal(false);
    setCurrentView('admin');
  };

  const handleGlobalSearch = (e) => {
    e.preventDefault();
    const q = globalSearchQuery.trim();
    setActiveGlobalQuery(q);
    setCurrentView('feed');
    setSelectedArticle(null);
  };

  const handleClearGlobalSearch = () => {
    setGlobalSearchQuery('');
    setActiveGlobalQuery('');
  };

  // Header dropdown state
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = React.useRef(null);
  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="app-shell">
      
      {/* GLOBAL SIDEBAR */}
      <Sidebar 
          user={user}
          globalProfile={globalProfile}
          isAdmin={isAdmin}
          timeline={timeline}
          loading={historyLoading}
          error={historyError}
          selectedHistoryItem={selectedHistoryItem}
          onSelectHistoryItem={handleSelectHistoryItem}
          onSelectProfile={handleSelectProfile}
          onBackToFeed={handleBackToFeed}
          onNavigateDashboard={() => setCurrentView('dashboard')}
          onNavigateAdmin={() => setCurrentView('admin')}
          onNavigateSaved={() => setCurrentView('saved')}
          onNavigateAnalyze={handleNavigateAnalyze}
          onLoginClick={() => setShowAuthModal(true)}
          onAdminLoginClick={() => setShowAdminModal(true)}
          currentView={currentView}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(d => !d)}
          isMobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, width: 0 }}>
        
        {/* HEADER / MASTHEAD */}
        <header className="header glass-header" style={{ flexShrink: 0, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1400px', margin: '0 auto', width: '100%', gap: '1.5rem' }}>
            
            {/* Hamburger (mobile only) */}
            <button className="hamburger" onClick={() => setMobileSidebarOpen(o => !o)} aria-label="Toggle menu">
              <Menu size={20} />
            </button>

            {/* ── Logo ── */}
            <a href="/" className="logo" onClick={(e) => { e.preventDefault(); handleBackToFeed(); handleClearGlobalSearch(); }}>
              News<span className="logo-icon">Pulse</span>
            </a>

            {/* ── Global Search Bar ── */}
            <AdvancedSearchBar
              query={globalSearchQuery}
              setQuery={setGlobalSearchQuery}
              activeQuery={activeGlobalQuery}
              onSearch={(q) => {
                if (!q.trim()) return;
                setActiveGlobalQuery(q.trim());
                setCurrentView('feed');
              }}
              onClear={handleClearGlobalSearch}
            />
            
              {/* ── User Dropdown / Sign In ── */}
              <div ref={userMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                {user ? (
                  <>
                    <button
                      onClick={() => setShowUserMenu(m => !m)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        background: 'transparent', border: 'none',
                        color: 'var(--text-main)', fontWeight: 600,
                        cursor: 'pointer', transition: 'color 0.2s', fontSize: '0.95rem', fontFamily: 'inherit'
                      }}
                    >
                      {globalProfile.profile_picture ? (
                          <img src={globalProfile.profile_picture} alt={user} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
                      ) : (
                          <UserCircle size={20} />
                      )}
                      {globalProfile.full_name || user} ▾
                    </button>
                    {showUserMenu && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0,
                        background: '#ffffff', border: '1px solid #E2E8F0',
                        borderRadius: '14px', boxShadow: '0 10px 40px -5px rgba(0,0,0,0.15)',
                        minWidth: '200px', padding: '0.5rem', zIndex: 9999
                      }}>
                        <button onClick={() => { setShowUserMenu(false); handleSelectProfile(); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', transition: 'background 0.15s' }}
                          onMouseOver={e => e.currentTarget.style.background = '#F1F5F9'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <UserCircle size={17} color="#6366f1" /> My Profile &amp; Preferences
                        </button>
                        {/* System Matrix — only visible to admin users */}
                        {isAdmin && (
                          <button onClick={() => { setShowUserMenu(false); setCurrentView('admin'); }}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', transition: 'background 0.15s' }}
                            onMouseOver={e => e.currentTarget.style.background = '#F1F5F9'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                            <ShieldCheck size={17} color="#38BDF8" /> System Matrix
                          </button>
                        )}
                        <hr style={{ margin: '0.4rem 0', border: 'none', borderTop: '1px solid #E2E8F0' }} />
                        <button onClick={() => { setShowUserMenu(false); handleLogout(); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: '#DC2626', transition: 'background 0.15s' }}
                          onMouseOver={e => e.currentTarget.style.background = '#FEF2F2'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <LogOut size={17} color="#DC2626" /> Sign Out
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    className="btn"
                    onClick={() => setShowAuthModal(true)}
                  >
                    <LogIn size={16} /> Sign In
                  </button>
                )}
              </div>
          </div>
        </header>

        {/* DOMAIN ROUTER */}
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', backgroundColor: 'transparent' }}>
            <div style={{ maxWidth: currentView === 'history_detail' || currentView === 'profile' || currentView === 'feed' ? '1200px' : '960px', margin: '0 auto', padding: currentView === 'history_detail' || currentView === 'profile' ? '0' : '2rem 1.5rem', minWidth: 0, width: '100%' }}>
                
                {currentView === 'feed' && (
                    <>
                        {activeGlobalQuery && (
                            <div className="fade-in" style={{ textAlign: 'center', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
                                <p style={{ color: 'var(--text-muted)', maxWidth: '650px', margin: '0 auto', fontSize: '1.05rem', fontWeight: 500 }}>
                                    Showing live results for <strong style={{ color: 'var(--primary)' }}>"{activeGlobalQuery}"</strong>
                                </p>
                            </div>
                        )}
                        <NewsFeed 
                            onSelectArticle={handleSelectArticle}
                            externalQuery={activeGlobalQuery}
                            token={token}
                        />
                    </>
                )}

                {currentView === 'article' && selectedArticle && (
                    <ArticleDetail
                        article={selectedArticle}
                        onBack={handleBackToFeed}
                        summary={summary} setSummary={setSummary}
                        bias={bias} setBias={setBias}
                        fakeNews={fakeNews} setFakeNews={setFakeNews}
                        counterArgument={counterArgument} setCounterArgument={setCounterArgument}
                        token={token}
                        onRequireAuth={() => setShowAuthModal(true)}
                        onAnalysisComplete={() => { if (user && token) { fetchHistory(); } }}
                    />
                )}

                {currentView === 'history_detail' && selectedHistoryItem && (
                    <HistoryDetail selectedItem={selectedHistoryItem} />
                )}

                {currentView === 'profile' && (
                    <ProfileOverview 
                        user={user} 
                        token={token} 
                        onLogout={handleLogout} 
                        onProfileUpdate={fetchGlobalProfile}
                    />
                )}

                {currentView === 'dashboard' && (
                    <AnalyticsDashboard token={token} />
                )}

                {currentView === 'admin' && (
                    isAdmin
                        ? <AdminDashboard token={token} isSuperAdmin={isSuperAdmin} />
                        : <div style={{ padding: '3rem', textAlign: 'center', color: '#DC2626', fontWeight: 700, fontSize: '1.2rem' }}>🔒 Admin Access Only</div>
                )}

                {currentView === 'saved' && (
                    token
                        ? <SavedArticles token={token} />
                        : <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>Please sign in to view bookmarks.</div>
                )}

                {currentView === 'analyze' && (
                    <AnalyzeArticlePage
                        token={token}
                        onRequireAuth={() => setShowAuthModal(true)}
                        onAnalysisComplete={() => { if (user && token) fetchHistory(); }}
                    />
                )}

            </div>
        </main>

      </div>

      {showAuthModal && (
        <AuthModal 
          onClose={() => setShowAuthModal(false)} 
          onLoginSuccess={handleLoginSuccess} 
        />
      )}

      {/* Admin Login Modal — separate dark-themed access for admins */}
      {showAdminModal && (
        <AdminLoginModal
          onClose={() => setShowAdminModal(false)}
          onAdminLogin={handleAdminLogin}
        />
      )}
    </div>
  );
}

export default App;
