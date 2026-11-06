// Optional Anthropic bridge. No personal identifiers; no product/stock/coin advice.
const DISCLAIMER="일반적인 자산관리 정보이며 투자 권유·개별 상품 추천이 아닙니다. 수익이나 원금은 보장되지 않습니다.";
export function fallbackAnswer(question:string){
  if(/코인|가상자산/.test(question))return "가상자산은 가격 변동성이 매우 크므로 비상금과 가까운 목표 자금에는 적절하지 않습니다. 현재 투자 성향과 위험자산 한도를 먼저 확인해 주세요.";
  if(/해외|국내|비중|바꿔|조정/.test(question))return "장기 투자 안에서 해외와 국내 지수형 자산을 나누는 이유는 시장과 환율 위험을 분산하기 위해서예요. 아래 '설계도 조정' 기능을 통해 규칙 엔진이 허용하는 범위인지 확인할 수 있습니다.";
  if(/비상금|예금|목표/.test(question))return "가까운 시일 내 필요한 돈과 비상금은 원금 보전을 우선 고려해 주세요. 투자 가능 자금과 별도로 구분하면 급전이 필요할 때 투자자산을 처분할 위험을 줄일 수 있습니다.";
  return "분산은 한 종류의 자산에만 의존하지 않는 방법이에요. 투자 기간, 손실 감내 수준, 비상금과 목표 자금을 구분하는 것이 중요합니다. 아래 공부 카드도 확인해 보세요.";
}
export function disclaimer(){return DISCLAIMER;}
const block=/\b(?:ETF\s*\d+|S&P\s*500|나스닥|삼성전자|애플|테슬라|비트코인|이더리움)\b|매수하세요|매도하세요|지금\s*사세요|수익\s*보장|원금\s*보장|확실한\s*수익|100\s*%/i;
function answerSafe(s:string){return s.length<900&&!block.test(s)&&!/[0-9]/.test(s)&&!/@/.test(s);}
export async function getAiAnswer(question:string,context:{type:string;allocation:{riskPct:number;goalMonths:number;surplus:number}}){
  const key=process.env.ANTHROPIC_API_KEY,model=process.env.ANTHROPIC_MODEL;
  if(process.env.AI_ENABLED!=="true"||!key||!model)return {text:fallbackAnswer(question),ai:false};
  const control=new AbortController();const timeout=setTimeout(()=>control.abort(),15000);
  try{
    const reply=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",signal:control.signal,cache:"no-store",
      headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},
      body:JSON.stringify({model,max_tokens:400,
        system:"한국어 해요체로 간결한 자산 유형 교육만 제공하세요. 특정 금융상품·종목·코인 이름, 투자 지시, 확정 수익 표현, 숫자를 일절 언급하지 마세요. 이름·이메일을 받지 마세요. 위험 감내, 분산, 비상금 원칙을 설명하세요. 제안된 자산 배분의 실제 변경은 별도 규칙 엔진이 담당하니 본인이 계산하거나 조정 결과를 약속하지 마세요. 재무 외 질문은 거절하세요.",
        messages:[{role:"user",content:`투자성향: ${context.type}. 질문: ${question.replace(/\d/g,"_").replace(/[^가-힣ㄱ-ㅎa-zA-Z ,.!?]/g,"").slice(0,250)}`} ]})
    });
    if(!reply.ok)throw Error("AI 요청 실패");
    const json=await reply.json();
    const text=(json.content??[]).filter((x:{type:string})=>x.type==="text").map((x:{text:string})=>x.text).join(" ").trim();
    if(!answerSafe(text))throw Error("검사에서 거절된 AI 답변");
    return {text,ai:true};
  }finally{clearTimeout(timeout);}
}
