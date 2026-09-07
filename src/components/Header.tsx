import React, { useEffect, useRef, useState } from 'react';
import { Tournament, TabType } from '../types';
import {
  Trophy, Plus, ShieldCheck, FlaskConical, RotateCcw, Calendar, Users,
  LayoutGrid, Award, Globe, Download, Upload, Printer, Sliders, Cloud,
  Menu, X, MoreHorizontal, ChevronRight, CircleDot
} from 'lucide-react';

type HeaderTab = TabType | 'onlinecloud';

interface HeaderProps {
  tournament: Tournament;
  activeTab: HeaderTab;
  onSelectTab: (tab: HeaderTab) => void;
  onOpenTestRunner: () => void;
  onLoadSampleTournament: () => void;
  onCreateNewTournament: () => void;
  onOpenResetTournament?: () => void;
  onUndoReset?: () => void;
  canUndoReset?: boolean;
  onExportPortableJson?: () => void;
  onImportPortableJson?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  tournament,
  activeTab,
  onSelectTab,
  onOpenTestRunner,
  onLoadSampleTournament,
  onCreateNewTournament,
  onOpenResetTournament,
  onUndoReset,
  canUndoReset = false,
  onExportPortableJson,
  onImportPortableJson
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const playerCount = tournament.players?.length || 0;
  const liveBoards = tournament.pairings.liveBoards || {};
  const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const currentRound = generatedRounds.length ? generatedRounds[generatedRounds.length - 1] : 0;

  const navTabs: { id: HeaderTab; label: string; short: string; icon: React.ComponentType<{ className?: string }>; badge?: number | string }[] = [
    { id: 'setup', label: 'Tournament Setup', short: 'Setup', icon: Trophy },
    { id: 'players', label: 'Players', short: 'Players', icon: Users, badge: playerCount || undefined },
    { id: 'pairings', label: 'Pairings & Results', short: 'Pairings', icon: LayoutGrid, badge: currentRound > 0 ? `R${currentRound}` : undefined },
    { id: 'standings', label: 'Standings', short: 'Standings', icon: Award },
    { id: 'tiebreaks', label: 'Tie-Breaks', short: 'Tie-Breaks', icon: Sliders, badge: tournament.regulations?.tieBreaks?.length || undefined },
    { id: 'schedule', label: 'Schedule', short: 'Schedule', icon: Calendar },
    { id: 'chessresults', label: 'Chess-Results', short: 'Chess-Results', icon: Globe },
    { id: 'onlinecloud', label: 'Online & Cloud', short: 'Cloud', icon: Cloud },
    { id: 'export', label: 'Export & Print', short: 'Export', icon: Printer }
  ];

  const activeMeta = navTabs.find(tab => tab.id === activeTab) || navTabs[0];

  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const selectTab = (tab: HeaderTab) => {
    onSelectTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      <aside className={`cpv6-sidebar ${mobileOpen ? 'cpv6-sidebar-open' : ''}`} aria-label="Tournament workspace navigation">
        <div className="cpv6-brand">
          <div className="cpv6-brand-mark"><Trophy className="w-5 h-5" /></div>
          <div className="min-w-0">
            <div className="cpv6-brand-name">Chess-Publisher</div>
            <div className="cpv6-brand-subtitle">Tournament workspace</div>
          </div>
          <button className="cpv6-icon-button cpv6-sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="cpv6-tournament-card">
          <div className="cpv6-eyebrow">CURRENT TOURNAMENT</div>
          <div className="cpv6-tournament-name">{tournament.name || 'Untitled tournament'}</div>
          <div className="cpv6-tournament-stats">
            <span><Users className="w-3.5 h-3.5" /> {playerCount} players</span>
            <span><CircleDot className="w-3.5 h-3.5" /> {currentRound > 0 ? `Round ${currentRound}` : 'Not started'}</span>
          </div>
        </div>

        <nav className="cpv6-sidebar-nav">
          <div className="cpv6-eyebrow cpv6-nav-label">WORKSPACE</div>
          {navTabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`cpv6-nav-item ${active ? 'cpv6-nav-item-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="cpv6-nav-text">{tab.label}</span>
                {tab.badge !== undefined && <span className="cpv6-nav-badge">{tab.badge}</span>}
                {active && <ChevronRight className="w-4 h-4 cpv6-nav-chevron" />}
              </button>
            );
          })}
        </nav>

        <div className="cpv6-sidebar-footer">
          <div className="cpv6-compliance-pill"><ShieldCheck className="w-4 h-4" /> FIDE 2026 workspace</div>
          <div className="cpv6-sidebar-note">Existing tournament engine and rules remain unchanged.</div>
        </div>
      </aside>

      {mobileOpen && <button className="cpv6-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}

      <header className="cpv6-topbar">
        <div className="cpv6-topbar-left">
          <button className="cpv6-icon-button cpv6-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="w-5 h-5" />
          </button>
          <div className="cpv6-context">
            <div className="cpv6-context-title">{activeMeta.label}</div>
            <div className="cpv6-context-subtitle">{tournament.name || 'Untitled tournament'}</div>
          </div>
        </div>

        <div className="cpv6-topbar-actions">
          <button type="button" onClick={onCreateNewTournament} className="cpv6-action cpv6-action-primary">
            <Plus className="w-4 h-4" /><span>New</span>
          </button>

          {onExportPortableJson && (
            <button type="button" onClick={onExportPortableJson} className="cpv6-action cpv6-action-secondary cpv6-action-desktop">
              <Download className="w-4 h-4" /><span>Backup</span>
            </button>
          )}

          {onImportPortableJson && (
            <label className="cpv6-action cpv6-action-secondary cpv6-action-desktop cursor-pointer">
              <Upload className="w-4 h-4" /><span>Import</span>
              <input type="file" accept=".json" onChange={onImportPortableJson} className="hidden" />
            </label>
          )}

          <div className="cpv6-more" ref={moreRef}>
            <button type="button" className="cpv6-icon-button" onClick={() => setMoreOpen(v => !v)} aria-label="More tournament actions" aria-expanded={moreOpen}>
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {moreOpen && (
              <div className="cpv6-more-menu">
                <button type="button" onClick={() => { onLoadSampleTournament(); setMoreOpen(false); }}>
                  <RotateCcw className="w-4 h-4" /><span>Load sample tournament</span>
                </button>
                {onExportPortableJson && (
                  <button type="button" className="cpv6-mobile-only" onClick={() => { onExportPortableJson(); setMoreOpen(false); }}>
                    <Download className="w-4 h-4" /><span>Portable backup</span>
                  </button>
                )}
                {onImportPortableJson && (
                  <label className="cpv6-more-file cpv6-mobile-only">
                    <Upload className="w-4 h-4" /><span>Import JSON</span>
                    <input type="file" accept=".json" onChange={e => { onImportPortableJson(e); setMoreOpen(false); }} className="hidden" />
                  </label>
                )}
                {onOpenResetTournament && (
                  <button type="button" className="cpv6-danger-action" onClick={() => { onOpenResetTournament(); setMoreOpen(false); }}>
                    <RotateCcw className="w-4 h-4" /><span>Reset tournament…</span>
                  </button>
                )}
                {canUndoReset && onUndoReset && (
                  <button type="button" className="cpv6-warning-action" onClick={() => { onUndoReset(); setMoreOpen(false); }}>
                    <RotateCcw className="w-4 h-4" /><span>Undo last reset</span>
                  </button>
                )}
                <div className="cpv6-more-separator" />
                <button type="button" onClick={() => { onOpenTestRunner(); setMoreOpen(false); }}>
                  <FlaskConical className="w-4 h-4" /><span>Compliance test suite</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="cpv6-mobile-nav" aria-label="Mobile workspace navigation">
        {navTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => selectTab(tab.id)} className={active ? 'cpv6-mobile-nav-active' : ''}>
              <Icon className="w-5 h-5" />
              <span>{tab.short}</span>
              {tab.badge !== undefined && <small>{tab.badge}</small>}
            </button>
          );
        })}
      </nav>
    </>
  );
};
