import React, { useState, useEffect } from 'react';
import { runAllTests, TestReport } from '../engine/testSuite';
import { CheckCircle2, XCircle, Play, RefreshCw, X, ShieldCheck, Bug, Terminal } from 'lucide-react';

interface TestRunnerModalProps {
  onClose: () => void;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ onClose }) => {
  const [report, setReport] = useState<TestReport | null>(null);
  const [running, setRunning] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const executeTests = async () => {
    setRunning(true);
    try {
      const res = await runAllTests();
      setReport(res);
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    executeTests();
  }, []);

  const categories = ['all', 'Dutch Engine', 'Berger Engine', 'Tie-Breaks', 'TRF Serialization'];
  const filteredResults = report ? (
    activeCategory === 'all'
      ? report.results
      : report.results.filter(r => r.category === activeCategory)
  ) : [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-3xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                FIDE & TRF Automated Compliance Test Suite
              </h3>
              <p className="text-[11px] text-slate-500">
                Verifies Swiss Dutch System, Berger Round Robin, FIDE 2026 Tie-Breaks, and TRF16/26 column alignment.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Report Overview Bar */}
        {report && (
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
              <span className="text-[10px] text-slate-500 block">Total Tests</span>
              <span className="text-sm font-bold text-slate-800">{report.total}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
              <span className="text-[10px] text-slate-500 block">Passed</span>
              <span className="text-sm font-bold text-emerald-600">{report.passed}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
              <span className="text-[10px] text-slate-500 block">Failed</span>
              <span className={`text-sm font-bold ${report.failed > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {report.failed}
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
              <span className="text-[10px] text-slate-500 block">Duration</span>
              <span className="text-sm font-bold text-blue-600">{report.durationMs} ms</span>
            </div>
          </div>
        )}

        {/* Filter Bar & Re-run */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={executeTests}
            disabled={running}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            <span>Re-Run All Tests</span>
          </button>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto max-h-[340px] space-y-2 border border-slate-200 rounded-lg p-2 bg-slate-50">
          {running ? (
            <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Executing test suite...</span>
            </div>
          ) : (
            filteredResults.map(r => (
              <div
                key={r.id}
                className={`p-3 rounded-lg border transition ${
                  r.passed
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-rose-50 border-rose-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {r.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span className="font-mono text-xs text-blue-600">{r.id}</span>
                        <span className="truncate">{r.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 font-mono text-[10px] text-slate-700 border border-slate-200">
                          {r.category}
                        </span>
                        {r.fideRule && (
                          <span className="text-indigo-700 font-mono text-[10px]">
                            {r.fideRule}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                    {r.durationMs} ms
                  </span>
                </div>

                {/* Error log if failed */}
                {!r.passed && r.error && (
                  <div className="mt-2 p-2 bg-rose-100/70 border border-rose-300 rounded font-mono text-[11px] text-rose-900">
                    {r.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
          <span>Engine: Gacrux 1.9.57 / FIDE Dutch System 2026 Compliant</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
