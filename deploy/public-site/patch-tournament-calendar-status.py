#!/usr/bin/env python3
"""Patch the current production Hub script without replacing unrelated UI code."""
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
marker = "  const statusLabel=status=>"
if "hub-calendar-status-v1" in source:
    print("Hub calendar status already installed")
    raise SystemExit(0)
if source.count(marker) != 1:
    raise SystemExit("Expected statusLabel anchor not found exactly once; refusing deployment")

helper = r"""  // hub-calendar-status-v1: derive lifecycle from event calendar, not stale API status.
  function hubCalendarDay(value){
    if(!value)return '';
    const raw=String(value).trim();
    const iso=/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(raw);
    if(iso){
      const day=iso[1];
      const d=new Date(day+'T12:00:00Z');
      return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?day:'';
    }
    return '';
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
    const start=hubCalendarDay(t.startDate||t.dateFrom||t.fromDate||t.start||dates.start||dates.startDate||t.tournament?.startDate);
    const end=hubCalendarDay(t.endDate||t.dateTo||t.toDate||t.end||dates.end||dates.endDate||t.tournament?.endDate)||start;
    const today=hubToday();
    // End date is inclusive. Preserve original status if no usable dates.
    if(start&&end&&end<start)return t;
    if(end&&today>end)t.status='completed';
    else if(start&&today<start)t.status='upcoming';
    else if(start&&end&&end>=start)t.status='live';
    return t;
  }
"""
source = source.replace(marker, helper + marker, 1)
old_dir = "      tournaments=Array.isArray(payload)?payload:(payload.tournaments||[]);"
new_dir = "      tournaments=(Array.isArray(payload)?payload:(payload.tournaments||[])).map(hubApplyCalendarStatus);"
if source.count(old_dir) != 1:
    raise SystemExit("Directory assignment changed; refusing deployment")
source = source.replace(old_dir, new_dir, 1)
old_detail = "      detailData=data;"
new_detail = "      hubApplyCalendarStatus(data);\n      detailData=data;"
if source.count(old_detail) != 1:
    raise SystemExit("Detail assignment changed; refusing deployment")
source = source.replace(old_detail, new_detail, 1)
path.write_text(source, encoding="utf-8")
print("Hub calendar lifecycle patch applied")
