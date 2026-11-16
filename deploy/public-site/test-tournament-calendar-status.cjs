#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const file=process.argv[2];
if(!file)throw new Error('Usage: node test-tournament-calendar-status.cjs site/tournaments.js');
const source=fs.readFileSync(file,'utf8');
const marker='  // hub-calendar-status-v2:';
const anchor='  const statusLabel=status=>';
const a=source.indexOf(marker),b=source.indexOf(anchor,a);
assert.ok(a>=0&&b>a,'Deployed asset must include the v2 helper');
assert.ok(source.includes('map(hubApplyCalendarStatus)'),'Directory integration absent');
assert.ok(source.includes('hubApplyCalendarStatus(data);'),'Detail integration absent');

const context=vm.createContext({Date,Intl});
vm.runInContext(source.slice(a,b),context,{timeout:2500});
const resolve=value=>context.hubApplyCalendarStatus({status:'live',...value}).status;
const today=context.hubToday();
const cases=[
  ['single-day ISO',{date:'2026-09-05'},'completed'],
  ['multi-day ISO',{startDate:'2026-10-01',endDate:'2026-10-03'},'completed'],
  ['nested dates',{dates:{start:'2026-10-01',end:'2026-10-03'}},'completed'],
  ['date range ISO',{date:'2026-10-01 – 2026-10-03'},'completed'],
  ['date range compact',{date:'01–03.10.2026'},'completed'],
  ['dates day/month/year',{startDate:'01/10/2026',endDate:'03/10/2026'},'completed'],
  ['dates day.month.year',{startDate:'01.10.2026',endDate:'03.10.2026'},'completed'],
  ['dates with month name',{startDate:'01 Oct 2026',endDate:'03 Oct 2026'},'completed'],
  ['upcoming',{startDate:'2099-01-01',endDate:'2099-01-03'},'upcoming'],
  ['last scheduled day inclusive',{startDate:today,endDate:today},'live'],
  ['unknown date',{startDate:'not a date'},'live'],
  ['impossible date',{startDate:'2030-02-30',endDate:'2030-02-31'},'live'],
  ['inverted dates',{startDate:'2026-09-05',endDate:'2026-09-04'},'live']
];
for(const [label,record,expected] of cases){
  assert.equal(resolve(record),expected,label);
}
console.log(cases.length+' public tournament calendar lifecycle assertions: PASS');
