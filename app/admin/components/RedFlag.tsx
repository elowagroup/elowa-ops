/**
 * RedFlag Component
 *
 * Silent alarm system.
 * - Red dot appears when thresholds crossed
 * - Never explains itself unless clicked
 * - Silence increases anxiety
 */

"use client";

import { useState } from 'react';

interface RedFlagProps {
  active: boolean;
  message?: string;
  severity?: 'warning' | 'critical';
}

export function RedFlag({
  active,
  message,
  severity = 'critical'
}: RedFlagProps) {
  const [expanded, setExpanded] = useState(false);

  if (!active) return null;

  const dotColor = severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500';
  const borderColor = severity === 'critical' ? 'border-rose-800' : 'border-amber-800';
  const bgColor = severity === 'critical' ? 'bg-rose-950' : 'bg-amber-950';
  const textColor = severity === 'critical' ? 'text-rose-400' : 'text-amber-400';

  return (
    <div className="relative">
      {/* Silent red dot */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`${dotColor} h-3 w-3 rounded-full animate-pulse cursor-pointer hover:scale-125 transition-transform`}
        aria-label="Flag"
      />

      {/* Expansion on click */}
      {expanded && message && (
        <div className={`absolute top-6 right-0 ${bgColor} border ${borderColor} rounded-lg p-3 min-w-[200px] z-10 shadow-xl`}>
          <p className={`text-xs ${textColor} font-semibold`}>
            {message}
          </p>
        </div>
      )}
    </div>
  );
}
