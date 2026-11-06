import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Compile the TypeScript rule engine in-memory. No database/AI/network is needed.
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'lib/engine.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText;
const mod={exports:{}};
const engineRequire=(x)=>x==='./rules.json'?require(path.join(root,'lib/rules.json')):require(x);
new Function('require','module','exports',compiled)(engineRequire,mod,mod.exports);
const {freeDiagnose,computeBlueprint,simulateFuture,adjustAfterCheckin,validateProposal,riskFromAnswers}=mod.exports;
const p={income:280,income_type:'employee',fixed_expense:95,living_expense:70,debt_payment:0};
const a={deposit:800,domestic:0,overseas:0,etf:0,coin:0,other:0};
const r={answers:[10,10,10,10,10],score:50,type:'위험중립형',interests:['etf']};
const g={type:'marriage',name:'결혼 자금',target_amount:3000,months:36};

test('SSRD RQ-1 10-year 3% bank-only forecast',()=>{
  const x=freeDiagnose(280,165,800);
  assert.equal(x.surplus,115);
  assert.equal(x.future,17150);
});
test('RQ-1 zero or negative surplus does not become negative monthly deposit',()=>{
  const x=freeDiagnose(100,120,100);
  assert.equal(x.surplus,0);
  assert.match(x.warning,/지출/);
});
test('SSAD sample 1: emergency, goal and long-term buckets',()=>{
  const x=computeBlueprint(p,a,r,g);
  assert.deepEqual([x.surplus,x.emergencyTarget,x.goalExisting,x.goalMonthly,x.longTerm],[115,495,305,75,40]);
  assert.deepEqual([x.safe,x.overseas,x.domestic,x.risky],[24,10,6,16]);
});
test('SSAD sample 2: unreachable goal suggests 41 months or 4445',()=>{
  const x=computeBlueprint(p,a,r,{type:'housing',name:'전세',target_amount:5000,months:36});
  assert.equal(x.goalMonthly,115);
  assert.equal(x.longTerm,0);
  assert.match(x.warnings.join(' '),/131/);
  assert.match(x.alternatives[0],/41개월/);
  assert.match(x.alternatives[1],/4,?445만 원/);
});
test('SSAD future asset scenarios return exact example',()=>{
  const x=simulateFuture(computeBlueprint(p,a,r,g),120);
  const last=x.rows.at(-1);
  assert.deepEqual([last.contributed,last.pessimistic,last.base,last.optimistic],[4800,5274,5838,6281]);
});
test('foreign ratio 80:20 proposal yields 13 vs 3',()=>{
  const x=validateProposal(computeBlueprint(p,a,r,g),r,{change_type:'ratio',value:80});
  assert.equal(x.allowed,true);
  assert.deepEqual([x.after.overseas,x.after.domestic],[13,3]);
});
test('risk proposal refuses anything above category limit',()=>{
  const x=validateProposal(computeBlueprint(p,a,r,g),r,{change_type:'risk',value:80});
  assert.equal(x.allowed,false);
  assert.match(x.reason,/40%/);
});
test('emergency fund receives money before long-term investment',()=>{
  const x=computeBlueprint(p,{...a,deposit:0},r,null);
  assert.equal(x.emergencyTarget,495);
  assert.equal(x.emergencyMonthly,83);
  assert.equal(x.longTerm,32);
});
test('freelance emergency target is six months',()=>{
  const x=computeBlueprint({...p,income_type:'self_employed'},a,r,null);
  assert.equal(x.emergencyTarget,990);
});
test('checkin adjusts with cumulative savings after two checkins',()=>{
  const x=adjustAfterCheckin(computeBlueprint(p,a,r,g),{goal:60,emergency:0,safe:24,risky_overseas:10,risky_domestic:6},34,135);
  assert.equal(x.choices[0].goalMonthly,76);
});
test('coin allocation with no risk amount should not divide by zero',()=>{
  const x=computeBlueprint({...p,income:165},a,{...r,score:90,type:'공격투자형',interests:['coin']},g);
  const proposal=validateProposal(x,{...r,score:90,type:'공격투자형',interests:['coin']},{change_type:'coin',value:10});
  assert.equal(proposal.allowed,false);
});
test('investment questionnaire must contain exactly five valid scores',()=>{
  assert.throws(()=>riskFromAnswers([10,10,10,10]),/5문항/);
  assert.equal(riskFromAnswers([10,10,10,10,10],[]).type,'위험중립형');
});
