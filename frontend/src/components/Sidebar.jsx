import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, Leaf } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/workers',   icon: Users,           label: 'Workers' }
];

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="flex flex-col h-full bg-brand-800 text-white w-64">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-brand-700">
        <div className="bg-brand-500 rounded-lg p-1.5">
          <Leaf size={20} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-sm leading-none">FuelStation HR</p>
          <p className="text-brand-300 text-xs mt-0.5 truncate max-w-[140px]">
            {user?.company?.name}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
              ${isActive
                ? 'bg-brand-700 text-white font-medium'
                : 'text-brand-200 hover:bg-brand-700/60 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="border-t border-brand-700 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-brand-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-brand-300 text-xs capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-brand-200 hover:text-white
                     hover:bg-brand-700/60 rounded-lg text-sm transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
