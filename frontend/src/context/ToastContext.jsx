import React, { createContext, useContext, useState, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const ToastContext = createContext();

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    // type can be: 'loading', 'success', 'error', 'info'
    const addToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Math.random().toString(36).substring(2, 9);
        const toast = { id, message, type, duration };
        
        setToasts(prev => [...prev, toast]);

        // If it's a loading toast, it might be removed manually, but we can still give it a very long fallback duration
        if (type !== 'loading') {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Helper to update a loading toast to a success/error toast
    const updateToast = useCallback((id, newMessage, newType = 'success', newDuration = 3000) => {
        setToasts(prev => prev.map(t => 
            t.id === id ? { ...t, message: newMessage, type: newType, duration: newDuration } : t
        ));
        
        setTimeout(() => {
            removeToast(id);
        }, newDuration);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ addToast, removeToast, updateToast }}>
            {children}
            <div className="toast-container">
                {toasts.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

const ToastItem = ({ toast, onRemove }) => {
    // Icons based on type
    const icons = {
        loading: <Loader2 size={20} className="toast-icon-spin text-primary" />,
        success: <CheckCircle2 size={20} className="text-success" />,
        error: <XCircle size={20} className="text-error" />,
        info: <AlertCircle size={20} className="text-info" />
    };

    return (
        <div className={`toast-item toast-${toast.type} slide-in-bottom`}>
            <div className="toast-icon-wrapper">
                {icons[toast.type]}
            </div>
            <div className="toast-content">
                <p className="toast-message">{toast.message}</p>
            </div>
            {toast.type !== 'loading' && (
                <button onClick={onRemove} className="toast-close-btn">
                    ×
                </button>
            )}
        </div>
    );
};
