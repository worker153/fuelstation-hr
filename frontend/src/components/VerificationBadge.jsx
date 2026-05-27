import { CheckCircle, Clock, ShieldHalf, ShieldCheck, XCircle, Eye } from 'lucide-react';

const STATUSES = {
  // New flow
  pending_verification: { label: 'Pending',           bg: 'bg-gray-100    text-gray-600',    icon: Clock       },
  under_review:         { label: 'Under Review',       bg: 'bg-blue-100    text-blue-700',    icon: Eye         },
  partially_verified:   { label: 'Partially Verified', bg: 'bg-amber-100   text-amber-700',   icon: ShieldHalf  },
  pending_approval:     { label: 'Pending Approval',   bg: 'bg-purple-100  text-purple-700',  icon: ShieldHalf  },
  verified:             { label: 'Verified',           bg: 'bg-green-100   text-green-700',   icon: ShieldCheck },
  rejected:             { label: 'Rejected',           bg: 'bg-red-100     text-red-700',     icon: XCircle     },
  // Legacy
  pending:              { label: 'Pending',            bg: 'bg-gray-100    text-gray-600',    icon: Clock       },
  partially_verified_l: { label: 'Partial',            bg: 'bg-amber-100   text-amber-700',   icon: ShieldHalf  },
  fully_verified:       { label: 'Fully Verified',     bg: 'bg-teal-100    text-teal-700',    icon: ShieldCheck },
};

export default function VerificationBadge({ status, size = 'sm' }) {
  const cfg  = STATUSES[status] || STATUSES.pending_verification;
  const Icon = cfg.icon;
  const iconSize = size === 'lg' ? 14 : 11;
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap ${textSize} ${cfg.bg}`}>
      <Icon size={iconSize} />
      {cfg.label}
    </span>
  );
}
