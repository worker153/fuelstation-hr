import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, LogOut, Leaf, ShieldCheck, UserCog,
  Building2, Briefcase, Clock, CalendarCheck, ReceiptText,
  AlertTriangle, Smartphone, KeyRound, Coffee, AlertOctagon, BookOpen, FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ onClose }) {
  const { user, logout, isSuperAdmin, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const groups = [
    {
      label: null,
      items: [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true },
      ],
    },
    {
      label: 'People',
      items: [
        { to: '/workers',        icon: Users,     label: 'Workers',        show: true },
        { to: '/active-workers', icon: Briefcase, label: 'Active Workers', show: true },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/branches',   icon: Building2,    label: 'Branches',   show: isSuperAdmin() || can('manageBranches') || can('viewWorkers') },
        { to: '/shifts',     icon: Clock,        label: 'Shifts',     show: isSuperAdmin() || can('manageBranches') || can('viewWorkers') },
        { to: '/attendance', icon: CalendarCheck, label: 'Attendance', show: isSuperAdmin() || can('manageBranches') },
        { to: '/breaks',     icon: Coffee,       label: 'Breaks',     show: isSuperAdmin() || can('manageBranches') },
        { to: '/payroll',    icon: ReceiptText,  label: 'Payroll',    show: isSuperAdmin() || can('manageBranches') },
        { to: '/shortages',  icon: AlertTriangle,  label: 'Shortages',   show: isSuperAdmin() || can('manageBranches') || can('submitShortages') },
        { to: '/offences',   icon: AlertOctagon,   label: 'Disciplinary',show: isSuperAdmin() || can('bookOffences') },
      ],
    },
    {
      label: 'Admin',
      items: [
        { to: '/approval-queue',     icon: ShieldCheck, label: 'Approval Queue',    show: isSuperAdmin() },
        { to: '/staff',              icon: UserCog,     label: 'Staff',              show: isSuperAdmin() },
        { to: '/attendance-devices', icon: Smartphone,  label: 'Attendance Devices', show: isSuperAdmin() },
        { to: '/worker-pins',        icon: KeyRound,    label: 'Worker PINs',        show: isSuperAdmin() },
      ],
    },
    {
      label: 'Resources',
      items: [
        { to: '/documents', icon: FileText,  label: 'Documents',       show: isSuperAdmin() || can('manageBranches') },
        { to: '/handbook',  icon: BookOpen,  label: 'Worker Handbook', show: true  },
      ],
    },
  ];

  return (
    <aside className="flex flex-col h-full bg-brand-800 text-white w-64">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-brand-700">
        <div className="bg-brand-600 rounded-xl p-2 shrink-0">
          <Leaf size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight">FuelStation HR</p>
          <p className="text-brand-300 text-xs truncate mt-0.5">{user?.company?.name}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {groups.map((group, gi) => {
          const visible = group.items.filter(i => i.show);
          if (!visible.length) return null;
          return (
            <div key={gi}>
              {group.label && (
                <p className="text-[10px] uppercase tracking-widest font-semibold text-brand-400 px-3 mb-2">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                      ${isActive
                        ? 'bg-brand-700 text-white'
                        : 'text-brand-200 hover:bg-brand-700/60 hover:text-white'
                      }`
                    }
                  >
                    <Icon size={17} className="shrink-0" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom user area */}
      <div className="border-t border-brand-700 px-3 py-3 space-y-1">

        {/* Role badge */}
        {user?.role && (
          <div className="flex items-center gap-2 px-3 py-1 mb-1">
            <ShieldCheck size={12} className="text-brand-400 shrink-0" />
            <span className="text-[11px] text-brand-400 font-semibold uppercase tracking-wider">
              {user.role === 'super_admin' ? 'Super Admin' : user.role.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        {/* Avatar + name */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-700/40">
          <div className="bg-brand-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{user?.name}</p>
            <p className="text-brand-300 text-[11px] truncate mt-0.5">{user?.email}</p>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-brand-300
                     hover:text-white hover:bg-brand-700/60 rounded-xl text-sm transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
