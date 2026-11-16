#!/usr/bin/env python3
"""Upgrade the currently deployed public Hub script to calendar status v2.

Patches the live asset assembled by the deployment workflow rather than
replacing the rest of the production website. Replaces v1 on subsequent deploys.
"""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('Usage: patch-tournament-calendar-status.py <tournaments.js>')
path = Path(sys.argv[1])
source = path.read_text(encoding='utf-8')
anchor = '  const statusLabel=status=>'
if source.count(anchor) != 1:
    raise SystemExit('Expected exactly one statusLabel anchor; deployment refused')

helper = r"""  // hub-calendar-status-v2: calendar dates override stale API/live round status.
  function hubCalendarDay(value){
    if(!value)return '';
    const raw=String(value).trim();
    let match=/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(raw);
    let year,month,day;
    if(match){[,year,month,day]=match;}
    else {
      match=/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:$|\s)/.exec(raw);
      if(match){day=match[1].padStart(2,'0');month=match[2].padStart(2,'0');year=match[3];}
      else {
        match=/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(raw);
        if(!match)return '';
        const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const index=months.indexOf(match[2].slice(0,3).toLowerCase());
        if(index<0)return '';
        day=match[1].padStart(2,'0');month=String(index+1).padStart(2,'0');year=match[3];
      }
    }
    const key=year+'-'+month+'-'+day;
    const d=new Date(key+'T12:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===key?key:'';
  }
  function hubDateRange(value){
    if(typeof value!=='string')return null;
    const raw=value.trim();
    // Accept a two-date range only if both days can be validated.
    const iso=[...raw.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m=>hubCalendarDay(m[0]));
    if(iso.length===2&&iso.every(Boolean))return {start:iso[0],end:iso[1]};
    const euro=[...raw.matchAll(/\d{1,2}[./]\d{1,2}[./]\d{4}/g)].map(m=>hubCalendarDay(m[0]));
    if(euro.length===2&&euro.every(Boolean))return {start:euro[0],end:euro[1]};
    const compact=/^(\d{1,2})\s*[-–]\s*(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw);
    if(compact){
      const part=(day)=>hubCalendarDay(day+'.'+compact[3]+'.'+compact[4]);
      const start=part(compact[1]),end=part(compact[2]);
      if(start&&end)return {start,end};
    }
    return null;
  }
  function hubToday(){
    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const get=type=>parts.find(p=>p.type===type)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  function hubApplyCalendarStatus(t){
    if(!t||typeof t!=='object')return t;
    const dates=t.dates||t.tournament?.dates||{};
    const pick=(...values)=>values.map(hubCalendarDay).find(Boolean)||'';
    const range=hubDateRange(t.date);
    // Include the exact field used by tournamentDateBlock(), plus API alternatives.
    const start=pick(t.startDate,t.dateFrom,t.fromDate,t.start,dates.start,dates.startDate,t.tournament?.startDate,range?.start,t.date);
    const end=pick(t.endDate,t.dateTo,t.toDate,t.end,dates.end,dates.endDate,t.tournament?.endDate,range?.end,t.date)||start;
    if(!start&&!end)return t; // Unknown dates: never invent a lifecycle.
    if(start&&end&&end<start)return t; // Contradictory calendar values.
    const today=hubToday();
    if(end&&today>end)t.status='completed';
    else if(start&&today<start)t.status='upcoming';
    else if(start&&end)t.status='live';
    return t;
  }
"""

versions=('  // hub-calendar-status-v1:', '  // hub-calendar-status-v2:')
existing=[source.find(version) for version in versions if version in source]
if len(existing)>1:
    raise SystemExit('Multiple calendar helpers detected; deployment refused')
if existing:
    start=existing[0]
    end=source.index(anchor)
    if start>=end:
        raise SystemExit('Calendar helper is not before statusLabel anchor')
    source=source[:start]+helper+source[end:]
else:
    source=source.replace(anchor,helper+anchor,1)

old='      tournaments=Array.isArray(payload)?payload:(payload.tournaments||[]);'
new='      tournaments=(Array.isArray(payload)?payload:(payload.tournaments||[])).map(hubApplyCalendarStatus);'
if old in source:
    if source.count(old)!=1:
        raise SystemExit('Directory assignment ambiguous')
    source=source.replace(old,new,1)
elif source.count(new)!=1:
    raise SystemExit('Expected directory integration not found; deployment refused')

original='      detailData=data;'
patched='      hubApplyCalendarStatus(data);\n      detailData=data;'
if patched not in source:
    if source.count(original)!=1:
        raise SystemExit('Expected tournament detail integration not found; deployment refused')
    source=source.replace(original,patched,1)

if source.count('hub-calendar-status-v2')!=1 or 'hub-calendar-status-v1' in source:
    raise SystemExit('Calendar upgrade validation failed')
path.write_text(source, encoding='utf-8')
print('Public Hub calendar status v2 installed or updated')
