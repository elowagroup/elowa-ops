import React from 'react';

interface EventBadgeProps {
  type: 'OPEN' | 'CLOSED' | 'CLEAN' | 'NOT_CLEAN' | 'NOT_OPENED';
}

export const EventBadge: React.FC<EventBadgeProps> = ({ type }) => {
  const getClasses = () => {
    switch (type) {
      case 'CLOSED':
        return 'bg-emerald-100 text-emerald-700';
      case 'OPEN':
        return 'bg-amber-100 text-amber-700';
      case 'CLEAN':
        return 'bg-emerald-950 text-emerald-400 border border-emerald-800';
      case 'NOT_CLEAN':
        return 'bg-rose-950 text-rose-400 border border-rose-800';
      case 'NOT_OPENED':
        return 'bg-slate-800 text-slate-400 border border-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <span className={`text-[10px] font-black px-5 py-2.5 rounded-full uppercase tracking-widest shadow-sm ${getClasses()}`}>
      {type === 'NOT_CLEAN' ? 'NOT CLEAN' : type === 'NOT_OPENED' ? 'NOT OPENED' : type}
    </span>
  );
};
