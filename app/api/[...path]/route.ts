import { NextRequest,NextResponse } from "next/server";
import { serverSupabase,adminSupabase } from "@/lib/supabase/server";
import { freeDiagnose,computeBlueprint,riskFromAnswers,simulateFuture,validateProposal,adjustAfterCheckin,ruleVersion, type Profile,type Assets,type Risk,type Goal,type Allocation,type ProposalRequest } from "@/lib/engine";
import { getAiAnswer,disclaimer } from "@/lib/ai";
import cards from "@/content/cards.json";
import { randomUUID } from "node:crypto";

export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{path:string[]}>};
const ok=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{"Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>ok({error:message},status);
const int=(v:unknown,max=1_000_000_000)=>typeof v==="number"&&Number.isInteger(v)&&v>=0&&v<=max;
const str=(v:unknown,max=200)=>typeof v==="string"&&v.length<=max;
const money=(v:unknown)=>int(v,100_000_000);
function checkOrigin(req:NextRequest){
  const origin=req.headers.get("origin");
  if(origin&&origin!==req.nextUrl.origin)throw Error("요청 출처가 올바르지 않습니다.");
  const type=req.headers.get("content-type")??"";
  if(!type.startsWith("application/json"))throw Error("JSON 요청만 허용합니다.");
}
async function me(){
  const sb=await serverSupabase();
  const {data:{user},error}=await sb.auth.getUser();
  if(error||!user)throw Error("로그인이 필요합니다.");
  return user;
}
async function body(req:NextRequest){try{return await req.json();}catch{throw Error("JSON 형식이 올바르지 않습니다.");}}
function dbError(err:{message:string}|null){if(err)throw Error("데이터 저장 중 오류가 발생했습니다: "+err.message);}
const getOne=async(db:ReturnType<typeof adminSupabase>,table:string,userId:string)=>{
  const {data,error}=await db.from(table).select("*").eq("user_id",userId).maybeSingle();dbError(error);return data;
};
async function ownState(db:ReturnType<typeof adminSupabase>,uid:string){
  const [profile,risk,goal,assets,blueprint,checks,points,messages,proposals]=await Promise.all([
    getOne(db,"profiles",uid),getOne(db,"risk_profiles",uid),getOne(db,"goals",uid),
    db.from("assets").select("kind,amount").eq("user_id",uid),
    db.from("blueprints").select("*").eq("user_id",uid).eq("status","active").maybeSingle(),
    db.from("checkins").select("*").eq("user_id",uid).order("month",{ascending:false}).limit(36),
    db.from("points_ledger").select("delta").eq("user_id",uid),
    db.from("ai_messages").select("id,role,content,flagged,created_at").eq("user_id",uid).order("created_at",{ascending:true}).limit(50),
    db.from("proposals").select("*").eq("user_id",uid).is("applied_at",null).order("created_at",{ascending:false}).limit(5)
  ]);
  for(const r of [assets,blueprint,checks,points,messages,proposals])dbError(r.error);
  return {profile,risk,goal,assets:assets.data??[],blueprint:blueprint.data??null,checkins:checks.data??[],points:(points.data??[]).reduce((s,x)=>s+(x.delta as number),0),messages:messages.data??[],proposals:proposals.data??[]};
}
async function build(db:ReturnType<typeof adminSupabase>,uid:string){
  const p=await getOne(db,"profiles",uid),r=await getOne(db,"risk_profiles",uid),g=await getOne(db,"goals",uid);
  if(!p||!r)throw Error("재무정보와 투자 성향 진단을 먼저 완료해 주세요.");
  const {data:records,error}=await db.from("assets").select("kind,amount").eq("user_id",uid);dbError(error);
  const asset={deposit:0,domestic:0,overseas:0,etf:0,coin:0,other:0} as Assets;
  for(const record of records??[]){if(record.kind in asset)asset[record.kind as keyof Assets]=record.amount;}
  const profile={income:p.income,income_type:p.income_type,fixed_expense:p.fixed_expense,living_expense:p.living_expense,debt_payment:p.debt_payment} as Profile;
  const risk={score:r.score,answers:r.answers,type:r.type,interests:r.interests} as Risk;
  let goal:Goal=null;
  if(g){const deadline=new Date(g.deadline+"T12:00:00Z"),now=new Date();
    const months=Math.max(1,(deadline.getUTCFullYear()-now.getUTCFullYear())*12+deadline.getUTCMonth()-now.getUTCMonth());
    goal={type:g.type,name:g.name,target_amount:g.target_amount,months};}
  return {allocation:computeBlueprint(profile,asset,risk,goal),profile,risk,goal,asset};
}
async function recordEvent(db:ReturnType<typeof adminSupabase>,uid:string|null,name:string,props:Record<string,unknown>={}){
  const allowed=["visit","free_diag_used","signup","profile_done","risk_done","goal_set","preview_viewed","purchase_clicked","purchase_cancelled","blueprint_viewed","card_viewed","future_viewed","ai_asked","proposal_applied","points_empty_charge_clicked","checkin_done","return_visit"];
  if(!allowed.includes(name))return;
  if(uid){const p=await getOne(db,"profiles",uid);if(!p?.analytics_consent)return;}
  // No user supplied arbitrary props or identifying data.
  await db.from("events").insert({user_id:uid,name,props:Object.fromEntries(Object.entries(props).filter(([k,v])=>["source","reason","card"].includes(k)&&typeof v==="string").slice(0,3))});
}
async function handle(req:NextRequest,ctx:Context):Promise<NextResponse>{
  const {path}=await ctx.params;const route=path.join("/");const method=req.method;
  if(method!=="GET")checkOrigin(req);
  if(route==="diagnose"&&method==="POST"){
    const b=await body(req);if(!money(b.income)||!money(b.expense)||!money(b.assets))throw Error("금액은 0 이상의 정수(만원)로 입력해 주세요.");
    return ok(freeDiagnose(b.income,b.expense,b.assets));
  }
  if(route==="health"&&method==="GET")return ok({status:"ok",service:"moaplan"});
  const user=await me();const uid=user.id;
  const db=adminSupabase();
  if(method==="GET"){
    if(route==="state")return ok(await ownState(db,uid));
    if(route==="blueprints/active")return ok(await db.from("blueprints").select("*").eq("user_id",uid).eq("status","active").maybeSingle().then(r=>{dbError(r.error);return r.data;}));
    if(route==="dashboard"){
      const s=await ownState(db,uid);return ok(s);
    }
    if(route==="cards")return ok(cards);
    if(route==="blueprints/preview"){
      const {data,error}=await db.from("blueprints").select("id,inputs").eq("user_id",uid).eq("status","draft").order("created_at",{ascending:false}).limit(1).maybeSingle();dbError(error);
      if(!data)return fail("미리보기 초안이 없습니다.",404);
      // inputs contains profile/risk; return only public fields, never allocation.
      const b=data.inputs as {surplus?:number;emergencyTarget?:number;emergencyHeld?:number;riskType?:string};
      return ok({id:data.id,surplus:b.surplus,emergencyTarget:b.emergencyTarget,emergencyHeld:b.emergencyHeld,riskType:b.riskType});
    }
    return fail("알 수 없는 경로입니다.",404);
  }
  if(route==="profile"&&method==="PUT"){
    const b=await body(req);
    if(![b.income,b.fixed_expense,b.living_expense,b.debt_payment].every(money)||!["employee","self_employed"].includes(b.income_type)||!str(b.nickname,30))throw Error("재무정보 입력을 확인해 주세요.");
    if(b.income===0)throw Error("월 소득을 입력해 주세요.");
    const {error}=await db.from("profiles").upsert({user_id:uid,nickname:b.nickname,income:b.income,income_type:b.income_type,fixed_expense:b.fixed_expense,living_expense:b.living_expense,debt_payment:b.debt_payment,analytics_consent:b.analytics_consent===true,updated_at:new Date().toISOString()},{onConflict:"user_id"});dbError(error);
    await recordEvent(db,uid,"profile_done");return ok({success:true});
  }
  if(route==="assets"&&method==="PUT"){
    const b=await body(req);const kinds=["deposit","domestic","overseas","etf","coin","other"];
    if(!b||kinds.some(k=>!money(b[k])))throw Error("자산 금액을 확인해 주세요.");
    const {error}=await db.from("assets").upsert(kinds.map(kind=>({user_id:uid,kind,amount:b[kind],updated_at:new Date().toISOString()})),{onConflict:"user_id,kind"});dbError(error);
    return ok({success:true});
  }
  if(route==="risk-profile"&&method==="POST"){
    const b=await body(req);const allowed=["domestic","overseas","etf","coin"];
    if(!Array.isArray(b.interests)||!b.interests.every((x:unknown)=>allowed.includes(String(x))))throw Error("관심 자산 정보가 올바르지 않습니다.");
    const risk=riskFromAnswers(b.answers,b.interests);
    const {error}=await db.from("risk_profiles").upsert({user_id:uid,...risk},{onConflict:"user_id"});dbError(error);
    await recordEvent(db,uid,"risk_done");return ok(risk);
  }
  if(route==="goals"&&method==="POST"){
    const b=await body(req);
    if(b.none===true){dbError((await db.from("goals").delete().eq("user_id",uid)).error);await recordEvent(db,uid,"goal_set");return ok({success:true});}
    if(!["marriage","housing","custom"].includes(b.type)||!str(b.name,60)||!money(b.target_amount)||b.target_amount===0||!/^20\d\d-\d\d-\d\d$/.test(b.deadline))throw Error("목표 정보가 올바르지 않습니다.");
    const deadline=new Date(`${b.deadline}T12:00:00Z`);
    if(!Number.isFinite(deadline.valueOf())||deadline <= new Date()||deadline.getUTCFullYear()>2100)throw Error("미래의 목표 기한을 선택해 주세요.");
    const {error}=await db.from("goals").upsert({user_id:uid,type:b.type,name:b.name,target_amount:b.target_amount,deadline:b.deadline},{onConflict:"user_id"});dbError(error);await recordEvent(db,uid,"goal_set");return ok({success:true});
  }
  if(route==="blueprints/preview"&&method==="POST"){
    const active=await db.from("blueprints").select("id").eq("user_id",uid).eq("status","active").maybeSingle();dbError(active.error);
    if(active.data)throw Error("이미 활성 설계도가 있어요. 설계도 탭에서 확인해 주세요.");
    const {allocation,profile,risk,goal,asset}=await build(db,uid);
    // Preview should have no allocation accessible to browser API or RLS.
    const old=await db.from("blueprints").select("id").eq("user_id",uid).eq("status","draft");dbError(old.error);
    if(old.data?.length)dbError((await db.from("blueprints").delete().eq("user_id",uid).eq("status","draft")).error);
    const {data,error}=await db.from("blueprints").insert({user_id:uid,version:1,status:"draft",inputs:{profile,risk,goal,asset,surplus:allocation.surplus,emergencyTarget:allocation.emergencyTarget,emergencyHeld:allocation.emergencyHeld,riskType:risk.type},rules_version:ruleVersion,allocation,execution_order:allocation.steps}).select("id").single();dbError(error);
    await recordEvent(db,uid,"preview_viewed");
    return ok({id:data!.id,surplus:allocation.surplus,emergencyTarget:allocation.emergencyTarget,emergencyHeld:allocation.emergencyHeld,riskType:risk.type});
  }
  if(route==="purchases"&&method==="POST"){
    const b=await body(req);const id=b.blueprint_id;
    if(typeof id!=="string"||!/^[-\w]{36}$/.test(id))throw Error("구매 정보가 올바르지 않습니다.");
    const d=await db.from("blueprints").select("id,status").eq("id",id).eq("user_id",uid).maybeSingle();dbError(d.error);
    if(!d.data||d.data.status!=="draft")throw Error("미리보기 초안을 다시 만들어 주세요.");
    if(b.action==="cancel"){
      if(!["가격","필요 없음","믿기 어려움","기타"].includes(b.reason))throw Error("취소 이유를 선택해 주세요.");
      dbError((await db.from("purchases").insert({user_id:uid,blueprint_id:id,status:"cancelled",cancel_reason:b.reason,price:1000,is_mock:true})).error);
      await recordEvent(db,uid,"purchase_cancelled",{reason:b.reason});return ok({status:"cancelled"});
    }
    if(b.action!=="complete"||b.mockConfirmed!==true)throw Error("모의 결제 안내에 동의해 주세요.");
    const {error}=await db.rpc("complete_mock_purchase",{p_user:uid,p_blueprint:id});dbError(error);
    await recordEvent(db,uid,"purchase_clicked");return ok({status:"completed",mock:true,pointsGranted:20});
  }
  if(route==="future"&&method==="POST"){
    const b=await body(req);if(!int(b.months,360)||b.months<1||!money(b.monthly))throw Error("시뮬레이션 입력이 올바르지 않습니다.");
    const a=await db.from("blueprints").select("allocation").eq("user_id",uid).eq("status","active").maybeSingle();dbError(a.error);
    if(!a.data)throw Error("설계도부터 받아 주세요.");
    return ok(simulateFuture(a.data.allocation as Allocation,b.months,b.monthly));
  }
  if(route==="checkins"&&method==="POST"){
    const b=await body(req);const keys=["emergency","goal","safe","risky_overseas","risky_domestic","individual","coin","big_expense"];
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(b.month)||keys.some(k=>!money(b[k]))||!str(b.note,300))throw Error("체크인 값이 올바르지 않습니다.");
    const current=new Date().toISOString().slice(0,7);
    if(b.month>current)throw Error("미래 월에는 체크인할 수 없습니다.");
    const a=await db.from("blueprints").select("id,allocation").eq("user_id",uid).eq("status","active").maybeSingle();dbError(a.error);
    if(!a.data)throw Error("설계도부터 생성해 주세요.");
    const clean=Object.fromEntries([...keys,"note"].map(k=>[k,b[k]]));
    const {data,error}=await db.rpc("save_checkin",{p_user:uid,p_blueprint:a.data.id,p_month:b.month,p_data:clean});dbError(error);
    await recordEvent(db,uid,"checkin_done");
    const already=(await db.from("checkins").select("goal").eq("user_id",uid)).data??[];
    const remainingMonths=Math.max(1,(a.data.allocation as Allocation).goalMonths-already.length);
    return ok({success:true,pointsGranted:data===true?2:0,adjustment:adjustAfterCheckin(a.data.allocation as Allocation,clean as never,remainingMonths,already.reduce((sum,r)=>sum+(Number(r.goal)||0),0))});
  }
  if(route==="ai/messages"&&method==="POST"){
    const b=await body(req);if(!str(b.question,400)||b.question.trim().length<2)throw Error("질문을 2~400자 사이로 입력해 주세요.");
    const a=await db.from("blueprints").select("allocation").eq("user_id",uid).eq("status","active").maybeSingle();dbError(a.error);
    const r=await getOne(db,"risk_profiles",uid);
    if(!a.data||!r)throw Error("설계도를 먼저 확인해 주세요.");
    // Only generated answers are charged. Offline fallback is FREE and labeled in UI.
    const aiConfigured=process.env.AI_ENABLED==="true"&&!!process.env.ANTHROPIC_API_KEY&&!!process.env.ANTHROPIC_MODEL;
    let chargeRef:string|null=null;
    if(aiConfigured){
      chargeRef=randomUUID();
      const result=await db.rpc("change_points",{p_user:uid,p_delta:-1,p_reason:"question",p_ref:chargeRef});dbError(result.error);
    }
    let ans:{text:string;ai:boolean};
    try{ans=await getAiAnswer(b.question,{type:r.type,allocation:a.data.allocation as Allocation});}
    catch{
      ans={text:"AI가 일시적으로 응답하지 못했습니다. 포인트는 차감되지 않았습니다. "+"비상금·목표 자금은 장기 투자와 분리하는 원칙을 확인해 주세요.",ai:false};
    }
    // In case AI was skipped without an exception, restore any deducted point.
    if(chargeRef&&!ans.ai){const refund=await db.rpc("change_points",{p_user:uid,p_delta:1,p_reason:"refund",p_ref:chargeRef});dbError(refund.error);}
    dbError((await db.from("ai_messages").insert([
      {user_id:uid,role:"user",content:b.question,points_used:0},
      {user_id:uid,role:"assistant",content:ans.text,points_used:ans.ai?1:0}
    ])).error);
    await recordEvent(db,uid,"ai_asked");return ok({answer:ans.text,ai:ans.ai,disclaimer:disclaimer(),pointsUsed:ans.ai?1:0});
  }
  if(route==="proposals"&&method==="POST"){
    const b=await body(req);const request=b.request as ProposalRequest;
    if(!request||!["ratio","risk","coin","long_term_amount"].includes(request.change_type)||!int(request.value,1_000_000))throw Error("조정 요청 형식이 올바르지 않습니다.");
    const a=await db.from("blueprints").select("id,allocation").eq("user_id",uid).eq("status","active").maybeSingle();dbError(a.error);
    const r=await getOne(db,"risk_profiles",uid);if(!a.data||!r)throw Error("활성 설계도가 없습니다.");
    const check=validateProposal(a.data.allocation as Allocation,r as Risk,request);
    const {data,error}=await db.from("proposals").insert({user_id:uid,blueprint_id:a.data.id,request,before:a.data.allocation,after:check.after,allowed:check.allowed,reason:check.reason}).select("id").single();dbError(error);
    return ok({id:data!.id,...check});
  }
  if(/^proposals\/[a-f\d-]{36}\/apply$/i.test(route)&&method==="POST"){
    const proposalId=path[1];const p=await db.from("proposals").select("*").eq("user_id",uid).eq("id",proposalId).maybeSingle();dbError(p.error);
    if(!p.data||!p.data.allowed||p.data.applied_at)throw Error("이미 처리되었거나 유효하지 않은 제안입니다.");
    const a=await db.from("blueprints").select("allocation,status").eq("user_id",uid).eq("id",p.data.blueprint_id).single();dbError(a.error);
    const r=await getOne(db,"risk_profiles",uid);if(!r||a.data?.status!=="active")throw Error("최신 설계도를 확인해 주세요.");
    const recheck=validateProposal(a.data.allocation as Allocation,r as Risk,p.data.request as ProposalRequest);
    if(!recheck.allowed||JSON.stringify(recheck.after)!==JSON.stringify(p.data.after))throw Error("위험 상한 검증에 실패했습니다.");
    const result=await db.rpc("apply_proposal",{p_user:uid,p_id:proposalId,p_expected:recheck.after});dbError(result.error);
    await recordEvent(db,uid,"proposal_applied");return ok({success:true,blueprintId:result.data,pointsUsed:3});
  }
  if(route==="surveys"&&method==="POST"){
    const b=await body(req);if(!["understanding","trust","value"].includes(b.question)||!int(b.score,5)||b.score<1)throw Error("설문 점수를 확인해 주세요.");
    const active=await db.from("blueprints").select("id").eq("user_id",uid).eq("status","active").maybeSingle();dbError(active.error);
    if(!active.data)throw Error("설계도에서 평가할 수 있습니다.");
    const {error}=await db.from("survey_responses").upsert({user_id:uid,blueprint_id:active.data.id,question:b.question,score:b.score},{onConflict:"user_id,blueprint_id,question"});dbError(error);return ok({success:true});
  }
  if(route==="feedback"&&method==="POST"){
    const b=await body(req);if(!str(b.content,1500)||b.content.trim().length<5)throw Error("의견을 5자 이상 입력해 주세요.");
    dbError((await db.from("feedback").insert({user_id:uid,content:b.content.trim()})).error);return ok({success:true});
  }
  if(route==="events"&&method==="POST"){
    const b=await body(req);if(!str(b.name,50))throw Error("기록 이름이 잘못됐습니다.");
    await recordEvent(db,uid,b.name);return ok({success:true});
  }
  if(route==="ai/report"&&method==="POST"){
    const b=await body(req);if(!str(b.id,36))throw Error("메시지를 찾을 수 없습니다.");
    dbError((await db.from("ai_messages").update({flagged:true}).eq("id",b.id).eq("user_id",uid).eq("role","assistant")).error);return ok({success:true});
  }
  if(route==="points/charge-intent"&&method==="POST"){
    await recordEvent(db,uid,"points_empty_charge_clicked");return ok({message:"포인트 충전은 준비 중이며 실제 결제는 진행되지 않습니다."});
  }
  if(route==="me"&&method==="DELETE"){
    // ON DELETE SET NULL anonymizes events; all other linked rows cascade away.
    const result=await db.auth.admin.deleteUser(uid);dbError(result.error);
    return ok({deleted:true});
  }
  return fail("지원하지 않는 요청입니다.",404);
}
export async function GET(req:NextRequest,ctx:Context){try{return await handle(req,ctx);}catch(e){return fail(e instanceof Error?e.message:"서버 오류",e instanceof Error&&e.message.includes("로그인")?401:400);}}
export async function POST(req:NextRequest,ctx:Context){try{return await handle(req,ctx);}catch(e){return fail(e instanceof Error?e.message:"서버 오류",400);}}
export async function PUT(req:NextRequest,ctx:Context){try{return await handle(req,ctx);}catch(e){return fail(e instanceof Error?e.message:"서버 오류",400);}}
export async function DELETE(req:NextRequest,ctx:Context){try{return await handle(req,ctx);}catch(e){return fail(e instanceof Error?e.message:"서버 오류",400);}}
