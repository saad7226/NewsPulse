import React, { useState } from 'react';
import { Send, FileText } from 'lucide-react';

export default function InputSection({ onProcess }) {
    const [inputType, setInputType] = useState('text'); // 'text' or 'url'
    const [inputValue, setInputValue] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim().length > 10) {
            onProcess(inputValue.trim());
        }
    };

    return (
        <section className="card fade-in" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                <button
                    className={`btn ${inputType === 'text' ? 'btn-primary' : ''}`}
                    onClick={() => setInputType('text')}
                    style={{ backgroundColor: inputType === 'text' ? 'var(--primary)' : 'transparent', color: inputType === 'text' ? 'white' : 'var(--text-main)', border: inputType === 'text' ? 'none' : '1px solid var(--border-color)' }}
                >
                    Paste Article Text
                </button>
                <button
                    className={`btn ${inputType === 'url' ? 'btn-primary' : ''}`}
                    onClick={() => setInputType('url')}
                    style={{ backgroundColor: inputType === 'url' ? 'var(--primary)' : 'transparent', color: inputType === 'url' ? 'white' : 'var(--text-main)', border: inputType === 'url' ? 'none' : '1px solid var(--border-color)' }}
                >
                    Enter URL (Coming Soon)
                </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-col" style={{ gap: '1rem' }}>
                {inputType === 'text' ? (
                    <textarea
                        className="input-field"
                        rows="6"
                        placeholder="Paste the full news article here to begin analysis..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        required
                        style={{ resize: 'vertical' }}
                    />
                ) : (
                    <input
                        type="url"
                        className="input-field"
                        placeholder="https://example.com/news-article (Note: Gateway proxy needed for URL fetching)"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        disabled
                    />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" disabled={inputValue.trim().length < 10 || inputType === 'url'}>
                        <FileText size={18} />
                        Load Article for Analysis
                    </button>
                </div>
            </form>
        </section>
    );
}
