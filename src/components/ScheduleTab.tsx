import React from 'react';
import { Tournament, ScheduleRow } from '../types';
import { Calendar, Clock, Plus, Trash2, Sparkles, CheckCircle2 } from 'lucide-react';

interface ScheduleTabProps {
  tournament: Tournament;
  onUpdateTournament: (updater: (prev: Tournament) => Tournament) => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  tournament,
  onUpdateTournament
}) => {
  const { schedule, settings } = tournament;
  const rows = schedule.rows || [];

  const updateScheduleField = <K extends keyof typeof schedule>(key: K, value: typeof schedule[K]) => {
    onUpdateTournament(prev => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [key]: value
      }
    }));
  };

  const handleAddRow = () => {
    const nextNo = String(rows.length + 1);
    const newRow: ScheduleRow = {
      no: nextNo,
      dateTime: settings.startDate || "2026-10-02T10:00",
      event: `Round ${rows.length + 1}`,
      description: `Round ${rows.length + 1}`
    };

    updateScheduleField('rows', [...rows, newRow]);
  };

  const handleDeleteRow = (idx: number) => {
    const nextRows = rows.filter((_, i) => i !== idx).map((r, i) => ({
      ...r,
      no: String(i + 1)
    }));
    updateScheduleField('rows', nextRows);
  };

  const handleUpdateRow = (idx: number, field: keyof ScheduleRow, value: string) => {
    const nextRows = [...rows];
    nextRows[idx] = {
      ...nextRows[idx],
      [field]: value
    };
    updateScheduleField('rows', nextRows);
  };

  const handleGenerateSmartSchedule = () => {
    const numRounds = parseInt(settings.rounds) || 7;
    const startDate = new Date(settings.startDate || "2026-10-02T10:00");
    const newRows: ScheduleRow[] = [];

    for (let r = 1; r <= numRounds; r++) {
      const roundDate = new Date(startDate);
      // Daily round allocation
      roundDate.setDate(startDate.getDate() + (r - 1));
      roundDate.setHours(10, 0, 0, 0);

      const pad = (n: number) => String(n).padStart(2, '0');
      const dtString = `${roundDate.getFullYear()}-${pad(roundDate.getMonth() + 1)}-${pad(roundDate.getDate())}T${pad(roundDate.getHours())}:${pad(roundDate.getMinutes())}`;

      newRows.push({
        no: String(r),
        dateTime: dtString,
        event: `Round ${r}`,
        description: `Round ${r} of ${numRounds} (Session Time Control: ${settings.timeControl})`
      });
    }

    updateScheduleField('rows', newRows);
    alert(`Smart Schedule generated ${numRounds} daily round sessions starting from ${settings.startDate}!`);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 text-slate-800">
      {/* 1. Key Ceremonies & Technical Meetings */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Key Ceremonies & Organization Milestones
          </h2>
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            FIDE General Schedule
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Registration Opens</label>
            <input
              type="datetime-local"
              value={schedule.registrationOpens}
              onChange={e => updateScheduleField('registrationOpens', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Registration Closes</label>
            <input
              type="datetime-local"
              value={schedule.registrationCloses}
              onChange={e => updateScheduleField('registrationCloses', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Technical Meeting (Captains/Arbiters)</label>
            <input
              type="datetime-local"
              value={schedule.technicalMeeting}
              onChange={e => updateScheduleField('technicalMeeting', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Opening Ceremony</label>
            <input
              type="datetime-local"
              value={schedule.openingCeremony}
              onChange={e => updateScheduleField('openingCeremony', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Closing Ceremony</label>
            <input
              type="datetime-local"
              value={schedule.closingCeremony}
              onChange={e => updateScheduleField('closingCeremony', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Award & Prize Ceremony</label>
            <input
              type="datetime-local"
              value={schedule.awardCeremony}
              onChange={e => updateScheduleField('awardCeremony', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>
        </div>
      </section>

      {/* 2. Round-by-Round Session Schedule */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              Round & Event Schedule
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dates in this schedule are strictly serialized to TRF26 record 132 and Chess-Results XML.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateSmartSchedule}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate Smart Schedule</span>
            </button>
            <button
              onClick={handleAddRow}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Event Row</span>
            </button>
          </div>
        </div>

        {/* Schedule Table */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold font-mono border-b border-slate-200">
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3 w-48">Date & Time</th>
                <th className="py-2.5 px-3 w-44">Event Name</th>
                <th className="py-2.5 px-3">Description & Notes</th>
                <th className="py-2.5 px-3 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No schedule rows defined yet. Click "Generate Smart Schedule" or "Add Event Row".
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                      {row.no || idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="datetime-local"
                        value={row.dateTime}
                        onChange={e => handleUpdateRow(idx, 'dateTime', e.target.value)}
                        className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.event}
                        onChange={e => handleUpdateRow(idx, 'event', e.target.value)}
                        placeholder="e.g. Round 1"
                        className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-slate-900 font-bold text-xs focus:outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.description}
                        onChange={e => handleUpdateRow(idx, 'description', e.target.value)}
                        placeholder="Session notes / time controls"
                        className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => handleDeleteRow(idx)}
                        className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
