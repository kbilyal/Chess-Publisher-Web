import React, { useState } from 'react';
import { Tournament } from '../types';
import { Lock, Unlock, AlertTriangle, X } from 'lucide-react';

interface ArbiterOverrideModalProps {
  tournament: Tournament;
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (reason: string) => void;
}

export const ArbiterOverrideModal: React.FC<ArbiterOverrideModalProps> = ({
  tournament,
  isOpen,
  onClose,
  onUnlock
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('An official arbiter explanation/reason is required to unlock tie-break configuration.');
      return;
    }

    onUnlock(reason.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 text-slate-800"
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-150 text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-amber-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Change Tie-Break Rules?
              </h3>
              <p className="text-[11px] text-amber-900">
                Tournament In-Progress Protection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="flex items-start gap-2.5 p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 leading-snug">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              The tournament has already started. Changing tie-break rules during an active tournament may conflict with the published tournament regulations and FIDE fair-play standards.
            </span>
          </div>

          <div className="space-y-1">
            <label className="block font-semibold text-slate-800">
              Arbiter Justification / Reason: <span className="text-rose-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder="Enter official tournament committee or chief arbiter justification..."
              rows={3}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            {error && (
              <p className="text-[11px] text-rose-600 font-medium">
                {error}
              </p>
            )}
          </div>

          <p className="text-[10px] text-slate-400">
            This override action will be recorded in the tournament audit log with a high-resolution timestamp.
          </p>

          {/* Footer */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Unlock</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
