// S2H CRM: operational pre-opening checks. No external I/O.
export const PREP_STEPS = Object.freeze([
 {key:"composition",label:"공구 구성표 전달",short:"구성표",help:"공구 구성표를 최종 확인하고 셀러에게 전달했는지 체크"},
 {key:"creative",label:"홍보 콘텐츠 전달",short:"홍보물",help:"오픈 카드와 이벤트 카드 등 필요한 홍보물을 전달했는지 체크"},
 {key:"payment",label:"결제 링크 전달",short:"결제 링크",help:"결제 링크가 정상 열리는지 확인하고 셀러에게 전달했는지 체크"},
 {key:"terms",label:"공구 조건 최종 확인",short:"공구 조건",help:"판매 구성, 가격, 혜택 및 공구 기간을 최종 확인했는지 체크"},
 {key:"opening",label:"실제 오픈 확인",short:"오픈 확인",help:"예정일에 실제 판매가 시작됐는지 확인했는지 체크"}
]);
export function prepProgress(buy,day=null){
 const checks=buy?.readiness?.checks||{};
 const relevant=day&&buy?.startDate&&day<buy.startDate?PREP_STEPS.slice(0,4):PREP_STEPS;
 const done=relevant.filter(step=>checks[step.key]?.done===true).length;
 const recorded=Boolean(buy?.readiness?.updatedAt||Object.keys(checks).length);
 return {done,total:relevant.length,missing:relevant.length-done,recorded,complete:done===relevant.length};
}
export function prepDaysBetween(from,to){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from||"")||!/^\d{4}-\d{2}-\d{2}$/.test(to||""))return null;
 return Math.round((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000);
}
export function prepAlerts(buys,today){
 return (buys||[]).filter(b=>b.id&&b.status!=="취소"&&b.startDate&&b.endDate).map(b=>{
  const delta=prepDaysBetween(today,b.startDate);
  if(delta===null||delta>3||delta< -2||b.endDate<today)return null;
  const progress=prepProgress(b,today);
  // An already confirmed opening need not appear simply because its historical fields are uninitialized.
  if(progress.complete)return null;
  return {...b,daysUntil:delta,progress,urgency:delta<=0?"today":delta===1?"tomorrow":"soon"};
 }).filter(Boolean).sort((a,b)=>a.daysUntil-b.daysUntil||b.progress.missing-a.progress.missing||String(a.sellerName||"").localeCompare(String(b.sellerName||""),"ko-KR"));
}
export function prepDueLabel(days){
 if(days===0)return "오늘 오픈";
 if(days===1)return "D-1";
 if(days>1)return "D-"+days;
 return "오픈 "+Math.abs(days)+"일 경과";
}
