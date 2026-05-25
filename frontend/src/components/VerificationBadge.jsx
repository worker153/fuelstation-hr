import { CheckCircle, Clock, ShieldHalf } from 'lucide-react';

const STATUSES = {
  pending:            { label: 'Pending',            bg: 'bg-amber-100  text-amber-700',  icon: Clock },
  partially_verified: { label: 'Partially Verified', bg: 'bg-blue-100   text-blue-700',   icon: ShieldHalf },
  fully_verified:     { label: 'Fully Verified',     bg: 'bg-green-100  text-green-700',  icon: CheckCircle },
  verified:           { label: 'Verified',            bg: 'bg-green-100  text-green-700',  icon: CheckCircle }
};

export default function VerificationBadge({ status }) {
  const cfg  = STATUSES[status] || STATUSES.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}
