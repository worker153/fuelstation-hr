import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

const NotificationContext = createContext(null);

const icons = {
  success: <CheckCircle size={18} className="text-green-500 shrink-0" />,
  error:   <XCircle    size={18} className="text-red-500 shrink-0" />,
  warning: <AlertCircle size={18} className="text-amber-500 shrink-0" />
};

const bgColors = {
  success: 'bg-white border-green-200',
  error:   'bg-white border-red-200',
  warning: 'bg-white border-amber-200'
};

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-3.5 rounded-xl border shadow-lg pointer-events-auto
                        animate-in slide-in-from-right-4 ${bgColors[t.type] || bgColors.success}`}
          >
            {icons[t.type] || icons.success}
            <p className="text-sm text-gray-800 flex-1 leading-snug">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export const useNotify = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotify must be inside <NotificationProvider>');
  return ctx.notify;
};
