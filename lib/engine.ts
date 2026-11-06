import rules from "./rules.json";

// Pure deterministic rule engine. Every money amount is an integer in 만원.
export type Profile = {income:number; income_type:"employee"|"self_employed"; fixed_expense:number; living_expense:number; debt_payment:number};
export type Assets = {deposit:number; domestic:number; overseas:number; etf:number; coin:number; other:number};
export type Risk = {answers:number[];score:number;type:string;interests:string[]};
export type Goal = {type:string; name:string;target_amount:number;months:number} | null;
export type Allocation = {surplus:number;emergencyTarget:number;emergencyHeld:number;emergencyMonthly:number;goalExisting:number;goalMonthly:number;goalTarget:number;goalMonths:number;goalType:string;longTerm:number;safe:number;overseas:number;domestic:number;individual:number;coin:number;risky:number;riskPct:number;totalAssets:number;warnings:string[];alternatives:string[];steps:string[]};
export type ProposalRequest = {change_type:"ratio"|"risk"|"long_term_amount"|"coin"; value:number};
const n = (v:number)=>Math.round(v);
const clamp=(v:number, min:number, max:number)=>Math.max(min,Math.min(max,v));
export const sumAssets = (a:Assets)=>a.deposit+a.domestic+a.overseas+a.etf+a.coin+a.other;
export function riskFromAnswers(answers:number[],interests:string[]=[]):Risk {
  if(answers.length!==5||answers.some(v=>![5,10,15,20].includes(v)))throw Error("투자성향 5문항을 모두 선택해 주세요.");
  const score=answers.reduce((x,y)=>x+y,0);
  // The document specifies a 25–100 raw score. '바로 판다' + <=40 is stable type.
  const band=rules.riskBands.find(b=>score<=b.max) ?? rules.riskBands[4];
  return {answers,score,type:(answers[2]===5&&score<=40)?"안정형":band.label,interests};
}
export function bandFromRisk(risk:Risk){return rules.riskBands.find(b=>b.label===risk.type) ?? rules.riskBands.find(b=>risk.score<=b.max)!;}
export function freeDiagnose(income:number,expense:number,assets:number){
  if([income,expense,assets].some(x=>!Number.isInteger(x)||x<0||x>1e9))throw Error("0 이상의 정수(만원 단위)를 입력해 주세요.");
  const surplus=Math.max(0,income-expense);
  const i=rules.annualReturn.safe/12;
  const months=120;
  const factor=Math.pow(1+i,months);
  const future=n(assets*factor+surplus*(factor-1)/i);
  return {surplus,future,warning:income<=expense?"여유자금이 없어요. 지출부터 점검해 보세요.":null,assumption:"연 3%, 월 복리, 세금·수수료 제외한 가정치"};
}
export function computeBlueprint(profile:Profile, assets:Assets, risk:Risk,goal:Goal):Allocation {
  const surplus=Math.max(0,profile.income-profile.fixed_expense-profile.living_expense-profile.debt_payment);
  const k=rules.emergencyMonths[profile.income_type];
  const emergencyTarget=(profile.fixed_expense+profile.living_expense)*k;
  const emergencyHeld=Math.min(assets.deposit,emergencyTarget);
  const goalExisting=Math.max(0,assets.deposit-emergencyTarget);
  const warnings:string[]=[]; const alternatives:string[]=[];
  if(profile.fixed_expense+profile.living_expense+profile.debt_payment>profile.income*rules.spendingWarningRate)warnings.push("월 지출이 소득의 80%를 넘어요. 먼저 지출을 점검해 보세요.");
  if(surplus<=0)warnings.push("월 여유자금이 0만 원이에요. 비용을 조정한 뒤 계획을 시작해 보세요.");
  let goalMonthly=0;let goalTarget=0;let goalMonths=0;let goalType="none";
  if(goal){
    goalTarget=goal.target_amount;goalMonths=goal.months;goalType=goal.type;
    const need=Math.max(0,goal.target_amount-goalExisting);
    const required=Math.ceil(need/goal.months);
    goalMonthly=Math.min(surplus,required);
    if(required>surplus){
      warnings.push(`이 기한에는 월 ${required}만 원이 필요한데 여유자금은 ${surplus}만 원이에요.`);
      alternatives.push(surplus>0?`기한을 ${Math.ceil(need/surplus)}개월로 연장하기`:`월 여유자금을 먼저 확보하기`);
      alternatives.push(`목표 금액을 ${(goalExisting+surplus*goal.months).toLocaleString("ko-KR")}만 원 이하로 조정하기`);
    }
  }
  const afterGoal=Math.max(0,surplus-goalMonthly);
  const emergencyMonthly=Math.min(afterGoal, Math.max(0,Math.ceil((emergencyTarget-assets.deposit)/rules.emergencyRebuildMonths)));
  const longTerm=Math.max(0,surplus-goalMonthly-emergencyMonthly);
  const riskPct=bandFromRisk(risk).risk;
  const risky=n(longTerm*riskPct);
  const safe=longTerm-risky;
  // Base composition holds index-like assets only. User-requested individual/coin allocations
  // are separately checked by validateProposal, never by free-text AI.
  const overseas=n(risky*rules.foreignIndexRate);
  const domestic=risky-overseas;
  const steps=[`비상금 ${emergencyTarget}만 원 먼저 확보`,...(goal?[`매달 목표 자금 ${goalMonthly}만 원 적립`]:[]),`장기 자금 ${longTerm}만 원을 위험 허용 범위에 나누어 적립`];
  return {surplus,emergencyTarget,emergencyHeld,emergencyMonthly,goalExisting,goalMonthly,goalTarget,goalMonths,goalType,longTerm,safe,overseas,domestic,individual:0,coin:0,risky,riskPct:riskPct*100,totalAssets:sumAssets(assets),warnings,alternatives,steps};
}
export function growth(initial:number,monthly:number,annual:number,months:number){
  const r=annual/12;
  if(r===0)return initial+monthly*months;
  const f=Math.pow(1+r,months);
  return initial*f+monthly*(f-1)/r;
}
export function simulateFuture(allocation:Allocation, months=120,overrideMonthly?:number){
  const period=clamp(Math.floor(months),1,360);
  const fullMonthly=overrideMonthly===undefined?allocation.longTerm:clamp(n(overrideMonthly),0,1000000);
  const safeShare=allocation.longTerm>0?allocation.safe/allocation.longTerm:1;
  const safeMonthly=fullMonthly*safeShare;
  const riskyMonthly=fullMonthly-safeMonthly;
  // Long-term new contributions only: other current holdings appear separately on the dashboard.
  const initialSafe=0; // RQ-9 projects the long-term bucket only; existing holdings stay in dashboard.
  const rows=[];
  for(let m=0;m<=period;m++){
    const safe=growth(initialSafe,safeMonthly,rules.annualReturn.safe,m);
    const pessimistic=safe+growth(0,riskyMonthly,rules.annualReturn.riskPessimistic,m);
    const base=safe+growth(0,riskyMonthly,rules.annualReturn.riskBase,m);
    const optimistic=safe+growth(0,riskyMonthly,rules.annualReturn.riskOptimistic,m);
    rows.push({month:m,pessimistic:n(pessimistic),base:n(base),optimistic:n(optimistic),contributed:n(fullMonthly*m)});
  }
  return {rows,monthly:fullMonthly,assumptions:"안전자산 연 3%, 위험자산 연 0%/5%/8%. 예시 추정치이며 세금·수수료·물가·목표 자금 사용액 미반영."};
}
export function adjustAfterCheckin(a:Allocation,saved:{goal:number;emergency:number;safe:number;risky_overseas:number;risky_domestic:number;individual?:number;coin?:number},remainingMonths:number,totalGoalSaved?:number){
  const diffs={goal:saved.goal-a.goalMonthly,emergency:saved.emergency-a.emergencyMonthly,longTerm:(saved.safe+saved.risky_overseas+saved.risky_domestic+(saved.individual??0)+(saved.coin??0))-a.longTerm};
  const remaining=Math.max(0,a.goalTarget-a.goalExisting-(totalGoalSaved??saved.goal)); // cumulative saved goal amount
  const required=remainingMonths>0?Math.ceil(remaining/remainingMonths):remaining;
  const delta=Math.max(0,required-a.goalMonthly);
  return {diffs,choices:[{name:"기한 유지",goalMonthly:required,longTerm:Math.max(0,a.longTerm-delta)},{name:"월 배분 유지",goalMonthly:a.goalMonthly,longTerm:a.longTerm,extensionMonths:a.goalMonthly>0?Math.ceil(remaining/a.goalMonthly):null}]};
}
export function validateProposal(a:Allocation,risk:Risk,proposal:ProposalRequest){
  if(!Number.isFinite(proposal.value)||proposal.value<0||proposal.value>1000000)return {allowed:false,reason:"유효한 값을 입력해 주세요.",after:a};
  let after={...a};let reason="";
  const cap=bandFromRisk(risk).risk*100;
  switch(proposal.change_type){
    case "ratio": { // overseas share of risky amount
      if(proposal.value>100){reason="해외 비중은 최대 100%까지예요.";break;}
      const indexMoney=a.risky-a.individual-a.coin;
      after.overseas=n(indexMoney*proposal.value/100);after.domestic=indexMoney-after.overseas;break;
    }
    case "risk": {
      if(proposal.value>cap){reason=`${risk.type}은 위험자산을 장기자금의 ${cap}% 이하로만 배분할 수 있어요.`;break;}
      const risky=n(a.longTerm*proposal.value/100);after.risky=risky;after.safe=a.longTerm-risky;after.individual=0;after.coin=0;after.overseas=n(risky*rules.foreignIndexRate);after.domestic=risky-after.overseas;break;
    }
    case "coin": {
      const max=bandFromRisk(risk).coin*100;
      if(!risk.interests.includes("coin") || max===0){reason=`${risk.type}은 코인 배분 대상이 아니에요.`;break;}
      if(proposal.value>max){reason=`코인은 위험자산의 최대 ${max}%까지만 가능해요.`;break;}
      if(a.risky<=0){reason="위험자산에 배정된 금액이 없어 가상자산 비중을 변경할 수 없어요.";break;}
      const coin=n(a.risky*proposal.value/100);const indexMoney=a.risky-coin-a.individual;
      if(indexMoney/a.risky < rules.indexMinOfRisk){reason="위험자산 중 지수형을 70% 이상 유지해야 해요.";break;}
      after.coin=coin;after.overseas=n(indexMoney*rules.foreignIndexRate);after.domestic=indexMoney-after.overseas;break;
    }
    case "long_term_amount": {
      // Cannot take money from protected emergency/goal buckets, so only lower within the surplus.
      if(proposal.value>a.longTerm){reason="목표·비상금에 배정된 돈은 장기 투자로 돌릴 수 없어요.";break;}
      const longTerm=n(proposal.value);after.longTerm=longTerm;after.risky=n(longTerm*a.riskPct/100);after.safe=longTerm-after.risky;
      after.individual=0;after.coin=0;after.overseas=n(after.risky*rules.foreignIndexRate);after.domestic=after.risky-after.overseas;break;
    }
    default:reason="지원하지 않는 조정 방식입니다.";
  }
  return {allowed:reason==="",reason,after};
}
export const ruleVersion=rules.version;
