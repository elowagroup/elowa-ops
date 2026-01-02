import React from 'react';

interface EventBadgeProps {
  type: 'OPEN' | 'CLOSED';
}

export const EventBadge: React.FC<EventBadgeProps> = ({ type }) => {
  return (
    <span className={`text-[10px] font-black px-5 py-2.5 rounded-full uppercase tracking-widest shadow-sm ${
      type === 'CLOSED'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-amber-100 text-amber-700'
    }`}>
      {type}
    </span>
  );
};
