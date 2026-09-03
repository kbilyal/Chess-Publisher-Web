import React, { useState } from 'react';
import { Tournament, Player } from '../types';
import { executeRequestedByeTransaction } from '../transactions/playerWorkflow';
import { TransactionManager } from '../transactions/TransactionManager';
import { X, Calendar, AlertCircle, Check } from 'lucide-react';

interface RequestedByesModalProps {
  tournament: Tournament;
  player: Player;
  onClose: () => void;
  onUpdateTournament: (updater: (prev: Tournament) => Tournament) => void;
}

export const RequestedByesModal: React.FC<RequestedByesModalProps> = ({
  tournament,
  player,
  onClose,
  onUpdateTournament
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const totalRounds = parseInt(tournament.settings?.rounds || '5', 10);
  const liveBoards = tournament.pairings?.liveBoards || {};
  const currentRequestedByes = player.requestedByes || {};

  const maxHalfByes = tournament.settings?.maxHalfPointByes ?? 2;
  const currentHalfCount = Object.values(currentRequestedByes).filter(v => v === 'half').length;

  const handleSetBye = async (round: number, type: 'half' | 'zero' | 'none') => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const manager = new TransactionManager<Tournament>();
    try {
      const res = await executeRequestedByeTransaction(
        manager,
        tournament,
        player.localKey,
        round,
        type,
        { maxHalfPointByes: maxHalfByes }
      );

      onUpdateTournament(() => res.tournament);
      setSuccessMessage(`Round ${round} bye set to: ${type === 'half' ? '½-point Bye' : type === 'zero' ? '0-point Bye' : 'Normal Pairing'}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update bye.');
    }
  };

  const roundsList: number[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    roundsList.push(r);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Requested Byes — {player.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              Pairing Rank #{player.pairingNumber} • Max {maxHalfByes} Half-Point Byes (Used: {currentHalfCount}/{maxHalfByes})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {roundsList.map(r => {
              const boards = liveBoards[String(r)] || [];
              const isGenerated = boards.length > 0;
              const byeStatus = currentRequestedByes[String(r)] || 'none';

              return (
                <div key={r} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>Round {r}</span>
                      {isGenerated ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 border border-slate-300 text-slate-600 font-semibold">
                          Generated / Played
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
                          Upcoming Round
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Current Status: <b className="text-slate-700 font-mono">
                        {byeStatus === 'half' ? '½ BYE (Half-Point)' : byeStatus === 'zero' ? '0 BYE (Zero-Point)' : 'Paired normally'}
                      </b>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isGenerated ? (
                      <span className="text-[11px] text-slate-400 italic">Locked</span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSetBye(r, 'none')}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition border ${
                            byeStatus === 'none'
                              ? 'bg-slate-800 border-slate-800 text-white'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Play
                        </button>
                        <button
                          onClick={() => handleSetBye(r, 'half')}
                          disabled={byeStatus !== 'half' && currentHalfCount >= maxHalfByes}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition border ${
                            byeStatus === 'half'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : currentHalfCount >= maxHalfByes
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                          title={currentHalfCount >= maxHalfByes && byeStatus !== 'half' ? `Max ${maxHalfByes} half byes reached` : 'Request ½ BYE'}
                        >
                          ½ BYE
                        </button>
                        <button
                          onClick={() => handleSetBye(r, 'zero')}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition border ${
                            byeStatus === 'zero'
                              ? 'bg-amber-600 border-amber-600 text-white'
                              : 'bg-white border-slate-200 text-amber-700 hover:bg-amber-50'
                          }`}
                        >
                          0 BYE
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
