import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, AlertCircle, CheckCircle2, CloudDownload, HardDrive } from 'lucide-react';
import { FideStatusResponse } from '../server/fide/types';

interface FideDatabaseStatusProps {
  onDatabaseUpdated?: () => void;
}

export const FideDatabaseStatus: React.FC<FideDatabaseStatusProps> = ({ onDatabaseUpdated }) => {
  const [status, setStatus] = useState<FideStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/fide/status');
      if (res.ok) {
        const data: FideStatusResponse = await res.json();
        setStatus(data);
        if (data.updateInProgress) {
          setUpdating(true);
        } else {
          setUpdating(false);
        }
      }
    } catch (err: any) {
      console.warn('[FideDatabaseStatus] Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/fide/update-rating-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMsg(
          data.result?.message ||
          `Successfully imported ${data.result?.recordCount || 0} players (v${data.result?.listVersion || 'Latest'}).`
        );
        await fetchStatus();
        if (onDatabaseUpdated) {
          onDatabaseUpdated();
        }
      } else {
        setErrorMsg(data.message || 'Failed to update rating database. Existing database was preserved.');
        await fetchStatus();
      }
    } catch (err: any) {
      setErrorMsg(`Connection error: ${err.message || String(err)}. Existing database was preserved.`);
      await fetchStatus();
    } finally {
      setUpdating(false);
    }
  };

  const isAvailable = status?.databaseAvailable;
  const isOffline = status?.offlineFallback;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs text-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-900 text-sm">Authoritative FIDE Rating Database</h3>
        </div>

        <div className="flex items-center gap-2">
          {updating ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-semibold text-[11px] animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Updating Rating List...
            </span>
          ) : isAvailable ? (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[11px] border ${
                isOffline
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {isOffline ? (
                <>
                  <HardDrive className="w-3 h-3" />
                  Cached Offline Database
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Authoritative & Ready
                </>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-[11px]">
              <AlertCircle className="w-3 h-3 text-slate-500" />
              No Database Installed
            </span>
          )}
        </div>
      </div>

      {/* Database Metadata Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1">
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">List Version</div>
          <div className="font-mono font-bold text-slate-900 text-xs mt-0.5">
            {status?.listVersion || '—'}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Effective Date</div>
          <div className="font-mono text-slate-900 text-xs mt-0.5">
            {status?.listDate || '—'}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Indexed Players</div>
          <div className="font-mono font-bold text-slate-900 text-xs mt-0.5">
            {status?.recordCount ? status.recordCount.toLocaleString() : '0'}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Last Sync</div>
          <div className="font-mono text-slate-700 text-[11px] mt-0.5 truncate" title={status?.downloadedAt || ''}>
            {status?.downloadedAt ? new Date(status.downloadedAt).toLocaleString() : 'Never'}
          </div>
        </div>
      </div>

      {/* SHA256 checksum if available */}
      {status?.sha256 && (
        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 overflow-hidden">
          <span className="font-bold text-slate-600">SHA-256:</span>
          <span className="truncate text-slate-600" title={status.sha256}>{status.sha256}</span>
        </div>
      )}

      {/* Error or Success notification */}
      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Update Notice: </span>
            {errorMsg}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{successMsg}</div>
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-slate-500">
          Source: <span className="font-mono text-slate-700">ratings.fide.com (XML format)</span>
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading || updating}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition flex items-center gap-1"
            title="Refresh database status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Check</span>
          </button>

          <button
            type="button"
            onClick={handleUpdate}
            disabled={updating}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5 ${
              updating
                ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <CloudDownload className="w-3.5 h-3.5" />
            <span>{isAvailable ? 'Update Rating List' : 'Download FIDE List'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
