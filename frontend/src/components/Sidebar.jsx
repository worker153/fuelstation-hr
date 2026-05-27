import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, LogOut, Leaf, ShieldCheck, UserCog,
  Building2, Briefcase, Clock, ReceiptText, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ onClose }) {
  const { user, logout, isSuperAdmin, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard',      show: true },
    { to: '/workers',        icon: Users,           label: 'Workers',         show: true },
    { to: '/active-workers', icon: Briefcase,       label: 'Active Workers',  show: true },
    { to: '/branches',       icon: Building2,       label: 'Branches',        show: isSuperAdmin() || can('manageBranches') || can('viewWorkers') },
    { to: '/shifts',         icon: Clock,           label: 'Shifts',          show: isSuperAdmin() || can('manageBranches') || can('viewWorkers') },
    { to: '/payroll',        icon: ReceiptText,     label: 'Payroll',         show: isSuperAdmin() || can('manageBranches') },
    { to: '/shortages',      icon: AlertTriangle,   label: 'Shortages',       show: isSuperAdmin() || can('manageBranches') || can('submitShortages') },
    { to: '/approval-queue', icon: ShieldCheck,     label: 'Approval Queue',  show: isSuperAdmin() },
    { to: '/staff',          icon: UserCog,         label: 'Staff',           show: isSuperAdmin() },
  ].filter(item => item.show);

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
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
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

      {/* Role badge */}
      {user?.role && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-700/50 rounded-lg">
            <ShieldCheck size={13} className="text-brand-300" />
            <span className="text-xs text-brand-300 capitalize font-medium">
              {user.role === 'super_admin' ? 'Super Admin' : user.role.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      )}

      {/* User info + logout */}
      <div className="border-t border-brand-700 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-brand-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-brand-300 text-xs truncate">{user?.email}</p>
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
