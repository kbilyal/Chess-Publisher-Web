import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, Globe, Link2, ShieldCheck, Upload } from 'lucide-react';
import { Tournament } from '../types';
import { chessResultsApi } from '../chessResults/api';
import { buildChessResultsXml } from '../chessResults/publication';

interface Props { tournament: Tournament; onUpdateTournament: (updater: (previous: Tournament) => Tournament) => void; }
const clientId = () => globalThis.crypto?.randomUUID?.() || `cp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isTnr = (value: string) => /^\d+$/.test(String(value || ''));

export const ChessResultsTab: React.FC<Props> = ({ tournament, onUpdateTournament }) => {
  const [busy, setBusy] = useState<'test' | 'create' | 'publish' | 'admin' | 'unlink' | null>(null);
  const [showXml, setShowXml] = useState(false);
  const cr = tournament.chessResults;
  const preview = useMemo(() => {
    try { return { value: buildChessResultsXml(tournament), error: '' }; }
    catch (error: any) { return { value: null, error: error?.message || String(error) }; }
  }, [tournament]);
  const update = (updater: (state: typeof cr) => typeof cr) => onUpdateTournament(previous => ({ ...previous, chessResults: updater(previous.chessResults) }));
  const log = (type: 'info' | 'ok' | 'warn' | 'error', message: string) => update(state => ({ ...state, activityLog: [{ at: new Date().toISOString(), type, message }, ...(state.activityLog || [])].slice(0, 120) }));
  const fail = (operation: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    update(state => ({ ...state, lastError: `Chess-Results ${operation}: ${message}`, uploadStatus: isTnr(state.key) ? 'Action failed — TNR retained' : 'Action failed' }));
    log('error', `${operation} failed: ${message}`);
  };
  const ready = () => { if (!preview.value) throw new Error(preview.error); return preview.value; };
  const testConnection = async () => {
    setBusy('test'); try {
      const result = await chessResultsApi.test();
      update(state => ({ ...state, sidVerified: Boolean(result.sidVerified), lastConnectionTest: new Date().toISOString(), lastError: '' }));
      log('ok', result.sidVerified ? 'Connection test passed: SID/AES verification confirmed by the bridge.' : 'Connection test passed; no SID comparison value was exposed.');
    } catch (error) { fail('connection test', error); } finally { setBusy(null); }
  };
  const create = async () => {
    setBusy('create'); try {
      const payload = ready();
      if (isTnr(cr.key)) throw new Error(`This tournament is already linked to TNR ${cr.key}; a second key will not be requested.`);
      const result = await chessResultsApi.create({ tournament: tournament.name || '', federation: payload.federation, mode: tournament.settings.tournamentType, clientId: cr.clientId || clientId() });
      const key = String(result.key || '').trim(); if (!isTnr(key)) throw new Error('The bridge returned an invalid Chess-Results TNR.');
      onUpdateTournament(previous => ({ ...previous, settings: { ...previous.settings, tnr: key }, chessResults: { ...previous.chessResults, clientId: previous.chessResults.clientId || clientId(), key, mode: previous.settings.tournamentType, federation: payload.federation, createdAt: new Date().toISOString(), freshTnrRequired: false, lastError: '', uploadStatus: 'TNR assigned — not published' } }));
      log('ok', result.recovered ? `Recovered existing TNR ${key}; GETKEY was not requested again.` : `TNR ${key} created and saved. Publish will reuse this exact TNR.`);
    } catch (error) { fail('TNR creation', error); } finally { setBusy(null); }
  };
  const publish = async () => {
    setBusy('publish'); try {
      const initial = ready(); let key = String(cr.key || '').trim(); let created = false;
      if (!isTnr(key)) {
        const result = await chessResultsApi.create({ tournament: tournament.name || '', federation: initial.federation, mode: tournament.settings.tournamentType, clientId: cr.clientId || clientId() });
        key = String(result.key || '').trim(); if (!isTnr(key)) throw new Error('The bridge returned an invalid Chess-Results TNR.'); created = true;
        onUpdateTournament(previous => ({ ...previous, settings: { ...previous.settings, tnr: key }, chessResults: { ...previous.chessResults, clientId: previous.chessResults.clientId || clientId(), key, mode: previous.settings.tournamentType, federation: initial.federation, createdAt: new Date().toISOString(), freshTnrRequired: false, uploadStatus: 'TNR assigned — preparing upload' } }));
        log('ok', `TNR ${key} was saved before upload and will be retained if upload fails.`);
      }
      const publication = buildChessResultsXml(tournament, { requireKey: true, key });
      await chessResultsApi.publish({ key, xml: publication.xml }); const now = new Date().toISOString();
      onUpdateTournament(previous => ({ ...previous, settings: { ...previous.settings, tnr: key }, chessResults: { ...previous.chessResults, key, lastUpload: now, lastError: '', uploadStatus: 'Published / synced', publishCount: (previous.chessResults.publishCount || 0) + 1 } }));
      log('ok', `${created ? 'Published' : 'Updated'} TNR ${key}: ${publication.players} players, ${publication.rounds} configured rounds and ${publication.pairingRecords} pairing records.`);
    } catch (error) { fail('publish', error); } finally { setBusy(null); }
  };
  const openAdmin = async (section: 'admin' | 'upload') => {
    if (!isTnr(cr.key)) return; setBusy('admin'); try {
      const result = await chessResultsApi.adminLink({ key: cr.key, section }); if (!result.url) throw new Error('The bridge did not return an authenticated URL.');
      window.open(result.url, '_blank', 'noopener,noreferrer'); log('ok', `Opened authenticated ${section === 'upload' ? 'Upload Data' : 'Admin'} access for TNR ${cr.key}.`);
    } catch (error) { fail('admin link', error); } finally { setBusy(null); }
  };
  const unlink = async () => {
    if (!isTnr(cr.key) || !window.confirm(`Unlink TNR ${cr.key}? This proceeds only if the bridge confirms the remote tournament was deleted or rejected as stale.`)) return;
    setBusy('unlink'); try {
      const result = await chessResultsApi.unlink({ key: cr.key, clientId: cr.clientId, serverError: cr.lastError || '' }); if (!result.canUnlink) throw new Error(result.reason || 'The bridge could not confirm this TNR is safe to unlink.');
      const oldKey = cr.key; onUpdateTournament(previous => ({ ...previous, settings: { ...previous.settings, tnr: '' }, chessResults: { ...previous.chessResults, clientId: clientId(), key: '', mode: '', federation: '', createdAt: '', lastUpload: '', lastError: '', uploadStatus: 'Not published', publishCount: 0, sidVerified: false, freshTnrRequired: true } })); log('ok', `TNR ${oldKey} was safely unlinked after bridge confirmation.`);
    } catch (error) { fail('unlink', error); } finally { setBusy(null); }
  };
  const disabled = busy !== null || !preview.value;
  return <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 animate-in fade-in duration-200 text-slate-800">
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5"><div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between border-b border-slate-100 pb-4"><div className="flex gap-3"><div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center"><Globe className="w-5 h-5 text-blue-600" /></div><div><h2 className="font-bold text-slate-900">Chess-Results Publication</h2><p className="text-xs text-slate-500">Validated XML through the configured server-side Chess-Results bridge. Credentials never enter the browser.</p></div></div><span className={`text-xs font-semibold px-2.5 py-1 rounded border flex items-center gap-1.5 ${preview.value ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>{preview.value ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{preview.value ? 'Publication payload ready' : 'Validation required'}</span></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs"><Stat label="Publication" value={cr.lastUpload ? 'Published' : 'Not published'} /><Stat label="Database key" value={isTnr(cr.key) ? `TNR ${cr.key}` : 'Assigned on publish'} mono /><Stat label="Last upload" value={cr.lastUpload ? new Date(cr.lastUpload).toLocaleString() : 'Never'} /><Stat label="FIDE Event ID" value={tournament.settings.fideEventId || 'Not configured'} mono /></div>{!preview.value && <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs"><b>Publishing is blocked:</b> {preview.error}</div>}
      <div className="flex flex-wrap gap-2 p-4 rounded-xl bg-slate-50 border border-slate-200"><button onClick={testConnection} disabled={busy !== null} className="button-secondary"><ShieldCheck className="w-4 h-4" />{busy === 'test' ? 'Testing…' : 'Test bridge'}</button><button onClick={create} disabled={disabled || isTnr(cr.key)} className="button-secondary"><Link2 className="w-4 h-4" />{busy === 'create' ? 'Creating…' : 'Create TNR'}</button><button onClick={publish} disabled={disabled} className="button-primary"><Upload className="w-4 h-4" />{busy === 'publish' ? 'Publishing…' : cr.lastUpload ? 'Update tournament' : 'Publish tournament'}</button>{isTnr(cr.key) && <><a href={`https://chess-results.com/tnr${encodeURIComponent(cr.key)}.aspx?lan=1`} target="_blank" rel="noreferrer" className="button-secondary"><ExternalLink className="w-4 h-4" />Open public page</a><button onClick={() => openAdmin('admin')} disabled={busy !== null} className="button-secondary">Open admin</button><button onClick={() => openAdmin('upload')} disabled={busy !== null} className="button-secondary">Upload data</button></>}</div><p className="text-[11px] text-slate-500">A TNR is created only after local validation. The returned key is saved before upload; failed uploads retain it for a safe retry rather than requesting a duplicate TNR.</p></section>
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4"><div className="flex justify-between gap-3 border-b border-slate-100 pb-3"><h3 className="text-sm font-bold flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-indigo-600" />Payload review</h3><button onClick={() => setShowXml(value => !value)} className="button-secondary">{showXml ? 'Hide XML' : 'Inspect XML'}</button></div>{showXml && preview.value && <pre className="max-h-72 overflow-auto p-3 rounded-lg bg-slate-950 text-blue-200 text-[11px] leading-relaxed">{preview.value.xml}</pre>}<div className="text-xs text-slate-600 grid sm:grid-cols-3 gap-3">{preview.value && <><span><b>Players:</b> {preview.value.players}</span><span><b>Configured rounds:</b> {preview.value.rounds}</span><span><b>Pairing records:</b> {preview.value.pairingRecords}</span></>}</div></section>
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3"><div className="flex justify-between gap-3 border-b border-slate-100 pb-3"><h3 className="text-sm font-bold">Publication activity</h3>{isTnr(cr.key) && <button onClick={unlink} disabled={busy !== null} className="text-xs text-rose-700 border border-rose-200 rounded-md px-2 py-1 hover:bg-rose-50">Unlink deleted TNR</button>}</div><div className="font-mono text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-3 min-h-24 max-h-56 overflow-auto space-y-1">{(cr.activityLog || []).length ? cr.activityLog.map((entry, index) => <div key={`${entry.at}-${index}`} className={entry.type === 'error' ? 'text-rose-700' : entry.type === 'ok' ? 'text-emerald-700' : entry.type === 'warn' ? 'text-amber-800' : 'text-slate-600'}>[{new Date(entry.at).toLocaleTimeString()}] {entry.message}</div>) : <span className="text-slate-400 italic">Validated publication activity will appear here.</span>}</div></section>
  </div>;
};
const Stat: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => <div className="bg-slate-50 border border-slate-200 rounded-lg p-3"><span className="block text-slate-500 text-[11px] mb-1">{label}</span><b className={`text-slate-800 text-xs block truncate ${mono ? 'font-mono' : ''}`}>{value}</b></div>;
