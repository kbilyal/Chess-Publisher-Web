import React from 'react';
import { Pin, ShieldCheck } from 'lucide-react';
import { Tournament } from '../types';
import './chess-results-pin-board.css';

export const CHESS_RESULTS_PIN_BOARD_MAX_LENGTH = 599;

type Props = {
  tournament: Tournament;
  onUpdateTournament: (updater: (previous: Tournament) => Tournament) => void;
  disabled?: boolean;
};

export function ChessResultsPinBoard({ tournament, onUpdateTournament, disabled = false }: Props) {
  const enabled = tournament.chessResults?.pinBoardEnabled === true;
  const text = String(tournament.chessResults?.pinBoardText || '').slice(0, CHESS_RESULTS_PIN_BOARD_MAX_LENGTH);
  const hasText = text.trim().length > 0;

  const updateEnabled = (nextEnabled: boolean) => {
    onUpdateTournament(previous => ({
      ...previous,
      chessResults: {
        ...previous.chessResults,
        pinBoardEnabled: nextEnabled
      }
    }));
  };

  const updateText = (value: string) => {
    const limited = value.slice(0, CHESS_RESULTS_PIN_BOARD_MAX_LENGTH);
    onUpdateTournament(previous => ({
      ...previous,
      chessResults: {
        ...previous.chessResults,
        pinBoardText: limited
      }
    }));
  };

  return (
    <div className="companion-cr-pinboard" data-chess-results-pin-board="true">
      <div className="companion-cr-pinboard-head">
        <div className="companion-cr-pinboard-title">
          <span className="companion-cr-pinboard-icon"><Pin size={16} /></span>
          <span>
            <strong>Pin Board / Remarks</strong>
            <small>Optional message published with this tournament on Chess-Results.</small>
          </span>
        </div>
        <label className={`companion-cr-pinboard-toggle ${enabled ? 'is-enabled' : ''}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={event => updateEnabled(event.target.checked)}
            disabled={disabled}
            data-chess-results-pin-board-enabled="true"
          />
          <span>{enabled ? 'Enabled' : 'Off'}</span>
        </label>
      </div>

      <textarea
        value={text}
        onChange={event => updateText(event.target.value)}
        maxLength={CHESS_RESULTS_PIN_BOARD_MAX_LENGTH}
        rows={3}
        disabled={disabled || !enabled}
        placeholder="Example: Round 3 starts at 15:00. Live boards 1–8."
        aria-label="Chess-Results Pin Board / Remarks"
        data-chess-results-pin-board-text="true"
      />

      <div className="companion-cr-pinboard-foot">
        <span className={enabled && hasText ? 'is-ready' : ''}>
          <ShieldCheck size={13} />
          {enabled
            ? hasText
              ? 'Included on the next Chess-Results publish.'
              : 'Enabled, but empty — no remark will be shown.'
            : 'Off — Chess-Results receives an empty remark. Saved text stays as a private draft.'}
        </span>
        <strong>{text.length}/{CHESS_RESULTS_PIN_BOARD_MAX_LENGTH}</strong>
      </div>
    </div>
  );
}
