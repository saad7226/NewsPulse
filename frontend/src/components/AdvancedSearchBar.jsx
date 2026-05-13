import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, TrendingUp } from 'lucide-react';

const TRENDING_TOPICS = [
  "Artificial Intelligence",
  "Global Politics",
  "Climate Change",
  "Stock Market",
  "Space Exploration",
  "Cybersecurity"
];

const MAX_RECENT_SEARCHES = 5;

export default function AdvancedSearchBar({
  query,
  setQuery,
  activeQuery,
  onSearch,
  onClear
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('np_recent_searches');
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse recent searches", e);
      }
    }
  }, []);

  const saveRecentSearch = (term) => {
    if (!term.trim()) return;
    const termClean = term.trim();
    setRecentSearches(prev => {
      const filtered = prev.filter(t => t.toLowerCase() !== termClean.toLowerCase());
      const updated = [termClean, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem('np_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSuggestions = () => {
    const queryLower = query.toLowerCase().trim();
    if (!queryLower) {
      return [
        ...recentSearches.map(t => ({ text: t, type: 'recent' })),
        ...TRENDING_TOPICS.map(t => ({ text: t, type: 'trending' }))
      ];
    }
    
    // Filter logic
    const matchedRecent = recentSearches.filter(t => t.toLowerCase().includes(queryLower)).map(t => ({ text: t, type: 'recent' }));
    const matchedTrending = TRENDING_TOPICS.filter(t => t.toLowerCase().includes(queryLower)).map(t => ({ text: t, type: 'trending' }));
    
    // Deduplicate
    const combined = [...matchedRecent, ...matchedTrending];
    const seen = new Set();
    return combined.filter(item => {
      const lower = item.text.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  };

  const suggestions = getSuggestions();

  const handleKeyDown = (e) => {
    if (!isFocused) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        const selectedText = suggestions[selectedIndex].text;
        setQuery(selectedText);
        saveRecentSearch(selectedText);
        onSearch(selectedText);
        setIsFocused(false);
      } else {
        saveRecentSearch(query);
        onSearch(query);
        setIsFocused(false);
      }
    } else if (e.key === 'Escape') {
      setIsFocused(false);
    }
  };

  const handleSuggestionClick = (text) => {
    setQuery(text);
    saveRecentSearch(text);
    onSearch(text);
    setIsFocused(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveRecentSearch(query);
    onSearch(query);
    setIsFocused(false);
  };

  const handleClearClick = () => {
    onClear();
    setQuery('');
    // Optionally focus input again
  };

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  return (
    <form ref={wrapperRef} onSubmit={handleSubmit} className="advanced-search-wrapper" style={{ flex: 1, maxWidth: '600px', position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <Search size={18} className="search-icon" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 2 }} />
        
        <input
          type="text"
          className="input-field search-input"
          placeholder="Search global intelligence…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          style={{ 
            paddingLeft: '2.8rem', 
            paddingRight: (query || activeQuery) ? '2.5rem' : '1rem',
            width: '100%',
            height: '46px',
            borderRadius: '23px',
            transition: 'box-shadow 0.2s, border-color 0.2s'
          }}
        />
        
        {(query || activeQuery) && (
          <button 
            type="button" 
            onClick={handleClearClick}
            className="search-clear-btn"
            style={{ 
              position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', 
              background: 'var(--surface)', border: 'none', cursor: 'pointer', 
              color: 'var(--text-muted)', padding: '4px', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
              zIndex: 2
            }}
          >
            <X size={16} />
          </button>
        )}

        {isFocused && (recentSearches.length > 0 || TRENDING_TOPICS.length > 0) && (
          <div className="search-dropdown">
            {/* When user is typing — show filtered Suggestions */}
            {query.trim() ? (
              <>
                {suggestions.length > 0 ? (
                  <>
                    <div className="search-dropdown-header">Suggestions</div>
                    <ul className="search-suggestion-list">
                      {suggestions.map((item, index) => {
                        const isSelected = index === selectedIndex;
                        const lowerQuery = query.toLowerCase();
                        const lowerText = item.text.toLowerCase();
                        const matchStart = lowerText.indexOf(lowerQuery);
                        return (
                          <li
                            key={`${item.type}-${item.text}`}
                            className={`search-suggestion-item ${isSelected ? 'selected' : ''}`}
                            onMouseEnter={() => setSelectedIndex(index)}
                            onClick={() => handleSuggestionClick(item.text)}
                          >
                            <span className="suggestion-icon">
                              {item.type === 'recent' ? <Clock size={14} /> : <TrendingUp size={14} />}
                            </span>
                            <span className="suggestion-text">
                              {matchStart >= 0 ? (
                                <>
                                  {item.text.substring(0, matchStart)}
                                  <strong>{item.text.substring(matchStart, matchStart + query.length)}</strong>
                                  {item.text.substring(matchStart + query.length)}
                                </>
                              ) : (
                                item.text
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <div className="search-dropdown-header" style={{ padding: '1rem', textAlign: 'center' }}>
                    No suggestions found
                  </div>
                )}
              </>
            ) : (
              /* When input is empty — show separate Recent and Trending sections */
              <>
                {recentSearches.length > 0 && (
                  <>
                    <div className="search-dropdown-header">Recent Searches</div>
                    <ul className="search-suggestion-list">
                      {recentSearches.map((text, index) => (
                        <li
                          key={`recent-${text}`}
                          className={`search-suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => handleSuggestionClick(text)}
                        >
                          <span className="suggestion-icon"><Clock size={14} /></span>
                          <span className="suggestion-text">{text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {/* Filter out trending topics already in recent searches */}
                {(() => {
                  const recentLower = recentSearches.map(r => r.toLowerCase());
                  const filteredTrending = TRENDING_TOPICS.filter(t => !recentLower.includes(t.toLowerCase()));
                  if (filteredTrending.length === 0) return null;
                  return (
                    <>
                      <div className="search-dropdown-header">🔥 Trending Topics</div>
                      <ul className="search-suggestion-list">
                        {filteredTrending.map((text, index) => {
                          const adjustedIndex = recentSearches.length + index;
                          return (
                            <li
                              key={`trending-${text}`}
                              className={`search-suggestion-item ${adjustedIndex === selectedIndex ? 'selected' : ''}`}
                              onMouseEnter={() => setSelectedIndex(adjustedIndex)}
                              onClick={() => handleSuggestionClick(text)}
                            >
                              <span className="suggestion-icon"><TrendingUp size={14} /></span>
                              <span className="suggestion-text">{text}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
      <button type="submit" style={{ display: 'none' }}>Search</button>
    </form>
  );
}
