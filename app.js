import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const state = { user: null, staff: null, sellers: [], buys: [], activities: [], page: "dashboard", search: "", unsubs: [], modalSave: null, demo:false, selectedMonth:null, scheduleView:"list" };
const todayLocal = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const datePlus = (value, days) => { const [y,m,d]=value.split("-").map(Number); const x=new Date(Date.UTC(y,m-1,d+days));return x.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
const h = (value) => String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dt = (ts) => ts?.toDate?.()?.toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}) || "-";
const notify = (msg) => { $("#toast").textContent=msg;$("#toast").classList.remove("hidden");setTimeout(()=>$("#toast").classList.add("hidden"),2800); };
const f = (name,label,type="text",val="",required=false,full=false) => '<label class="'+(full?'full':'')+'">'+h(label)+'<input name="'+h(name)+'" type="'+type+'" value="'+h(val)+'" '+(required?'required':'')+' /></label>';
const textarea = (name,label,val="") => '<label class="full">'+h(label)+'<textarea name="'+h(name)+'">'+h(val)+'</textarea></label>';
const select = (name,label,options,val="") => '<label>'+h(label)+'<select name="'+h(name)+'">'+options.map(([v,t])=>'<option value="'+h(v)+'" '+(v===val?'selected':'')+'>'+h(t)+'</option>').join("")+'</select></label>';

let db,auth;
function start() {
  if (!firebaseConfigured) {
    $("#login-error").textContent="Firebase 연결 전입니다. 현재는 미리보기로 화면 구성을 확인할 수 있어요."; $("#preview-button").classList.remove("hidden"); $("#preview-hint").classList.remove("hidden");
    $("#login-form").querySelector("button").disabled=true;
    return;
  }
  const app=initializeApp(firebaseConfig);
  auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth, async user => {
    clearListeners();
    if (!user){state.user=null;state.staff=null;$("#login").classList.remove("hidden");$("#app").classList.add("hidden");return;}
    try {
      const userDoc=await getDoc(doc(db,"users",user.uid));
      if (!userDoc.exists() || userDoc.data().active!==true) {
        $("#login-error").textContent="사용 권한이 없습니다. 관리자에게 Firebase users 권한 등록을 요청하세요.";
        await signOut(auth);return;
      }
      state.user=user;state.staff=userDoc.data();
      $("#whoami").textContent=state.staff.name || user.email;
      $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
      ["sellers","groupbuys","activities"].forEach(kind=>{
        const ref=query(collection(db,kind),orderBy("createdAt","desc"));
        const off=onSnapshot(ref,snapshot=>{
          const records=snapshot.docs.map(d=>({id:d.id,...d.data()}));
          if(kind==="sellers")state.sellers=records;
          if(kind==="groupbuys")state.buys=records;
          if(kind==="activities")state.activities=records;
          render();
        },err=>notify("데이터 조회 실패: "+err.message));
        state.unsubs.push(off);
      });
      render();
    } catch(err){$("#login-error").textContent=err.message;await signOut(auth);}
  });
}
function clearListeners(){state.unsubs.forEach(fn=>fn());state.unsubs=[];state.sellers=[];state.buys=[];state.activities=[];}
$("#login-form").addEventListener("submit",async e=>{
  e.preventDefault();$("#login-error").textContent="";
  try{await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value);}
  catch(err){$("#login-error").textContent="로그인 실패: 이메일 또는 비밀번호를 확인해주세요.";}
});
$("#logout").onclick=()=>{if(state.demo){location.reload();return;}signOut(auth);};
$("#preview-button").onclick=()=>enterPreview();
$("#close-modal").onclick=closeModal;$("#cancel-modal").onclick=closeModal;
$("#modal").addEventListener("click",e=>{if(e.target===$("#modal"))closeModal();});
document.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>{state.page=btn.dataset.page;state.search="";render();}));
$("#add-button").onclick=()=>state.page==="schedule"?buyModal():sellerModal();
$("#modal-form").addEventListener("submit",async e=>{
 e.preventDefault();const btn=e.target.querySelector("[type=submit]");btn.disabled=true;
 const data=Object.fromEntries(new FormData(e.target).entries());
 try {await state.modalSave?.(data);closeModal();notify("저장되었습니다.");}
 catch(err){notify("저장 실패: "+err.message);}
 finally{btn.disabled=false;}
});
function openModal(title,fields,save){$("#modal-title").textContent=title;$("#modal-fields").innerHTML='<div class="modal-fields">'+fields+'</div>';state.modalSave=save;$("#modal").classList.remove("hidden");}
function closeModal(){$("#modal").classList.add("hidden");state.modalSave=null;$("#modal-form").reset();}
function sellerModal(item=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다. Firebase 연결 후 이용해주세요.");return;}
  openModal(item?"셀러 정보 수정":"새 셀러 등록",
    f("name","셀러명","text",item?.name,true)+f("channel","인스타그램 / 채널","text",item?.channel)+f("contact","연락처","text",item?.contact)+f("cycleDays","리마인드 주기 (일)","number",item?.cycleDays??30,true)+textarea("note","셀러 메모",item?.note),
    async data=>{
      const record={name:data.name.trim(),channel:data.channel.trim(),contact:data.contact.trim(),note:data.note.trim(),cycleDays:Math.max(1,Number(data.cycleDays)||30),updatedAt:serverTimestamp()};
      if(!record.name)throw new Error("셀러명을 입력해주세요.");
      if(item)await updateDoc(doc(db,"sellers",item.id),record);
      else await addDoc(collection(db,"sellers"),{...record,createdAt:serverTimestamp()});
    });
}
function buyModal(item=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다. Firebase 연결 후 이용해주세요.");return;}
 if(!state.sellers.length){notify("공구 등록 전에 셀러를 먼저 등록해주세요.");return;}
 const choices=state.sellers.map(s=>[s.id,s.name]);
 const sellerId=item?.sellerId || choices[0][0];
 openModal(item?"공구 수정":"새 공구 등록",
   select("sellerId","셀러",choices,sellerId)+f("product","상품명","text",item?.product,true)+f("startDate","시작일","date",item?.startDate,true)+f("endDate","종료일","date",item?.endDate,true)+select("status","진행상태",[["예정","예정"],["진행중","진행중"],["완료","완료"],["취소","취소"]],item?.status||"예정")+textarea("memo","구성 / 특이사항",item?.memo),
 async data=>{
   if(data.endDate<data.startDate)throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
   const seller=state.sellers.find(s=>s.id===data.sellerId);
   if(!seller)throw new Error("셀러를 선택해주세요.");
   const record={sellerId:seller.id,sellerName:seller.name,product:data.product.trim(),startDate:data.startDate,endDate:data.endDate,status:data.status,memo:data.memo.trim(),updatedAt:serverTimestamp()};
   if(item)await updateDoc(doc(db,"groupbuys",item.id),record);
   else await addDoc(collection(db,"groupbuys"),{...record,createdAt:serverTimestamp()});
 });
}
function activityModal(sellerId=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다. Firebase 연결 후 이용해주세요.");return;}
 if(!state.sellers.length){notify("셀러를 먼저 등록해주세요.");return;}
 const choices=state.sellers.map(s=>[s.id,s.name]);
 openModal("연락·영업 활동 기록",
 select("sellerId","셀러",choices,sellerId||choices[0][0])+select("type","활동 유형",[["카카오톡","카카오톡"],["전화","전화"],["DM","DM"],["미팅","미팅"],["기타","기타"]],"카카오톡")+textarea("memo","활동 내용 (필수)"),
 async data=>{
 const seller=state.sellers.find(s=>s.id===data.sellerId);
 if(!seller||!data.memo.trim())throw new Error("셀러와 활동 내용을 입력해주세요.");
 await addDoc(collection(db,"activities"),{sellerId:seller.id,sellerName:seller.name,type:data.type,memo:data.memo.trim(),actorUid:state.user.uid,actorName:state.staff.name||state.user.email,createdAt:serverTimestamp()});
 });
}
function latestBuy(sellerId){
 return state.buys.filter(b=>b.sellerId===sellerId&&b.status!=="취소"&&b.endDate&&b.endDate<=todayLocal()).sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
}
function latestActivity(sellerId){
 return state.activities.filter(a=>a.sellerId===sellerId).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
}
function reminders(){
 const today=todayLocal();
 return state.sellers.map(s=>{
  const b=latestBuy(s.id);if(!b)return null;
  const due=datePlus(b.endDate,s.cycleDays||30);
  const a=latestActivity(s.id);
  // 마지막 공구 이후 기록된 영업 활동이 있다면 해당 시점부터 다시 주기를 계산
  const contactDate=a?.createdAt?.toDate?.()?.toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"});
  const nextDate=contactDate&&contactDate>b.endDate?datePlus(contactDate,s.cycleDays||30):due;
  if(nextDate>today)return null;
  return {seller:s,buy:b,due:nextDate,overdue:daysBetween(nextDate,today)};
 }).filter(Boolean).sort((a,b)=>b.overdue-a.overdue);
}
function metric(title,value,description){return '<div class="metric"><div class="label">'+title+'</div><div class="number">'+value+'</div><div class="sub">'+description+'</div></div>';}
function wrap(title,body,right=""){return '<div class="panel"><div class="panel-title"><h2>'+title+'</h2>'+right+'</div>'+body+'</div>';}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(v=>'<th>'+h(v)+'</th>').join("")+'</tr></thead><tbody>'+ (rows.length?rows.join(""):'<tr><td colspan="'+headers.length+'" class="empty">등록된 데이터가 없습니다.</td></tr>')+'</tbody></table></div>';}


function shownMonth(){return state.selectedMonth||todayLocal().slice(0,7);}
function changeMonth(amount){const [y,m]=shownMonth().split("-").map(Number);state.selectedMonth=new Date(Date.UTC(y,m-1+amount,1)).toISOString().slice(0,7);render();}
function monthlyBuys(){const m=shownMonth();return state.buys.filter(b=>b.startDate&&b.endDate&&b.startDate.slice(0,7)<=m&&b.endDate.slice(0,7)>=m).sort((a,b)=>a.startDate.localeCompare(b.startDate));}
function monthPicker(){
 return '<div class="month-controls"><div class="month-title"><span class="eyebrow">GROUPBUY / MONTHLY</span><strong>월별 공구 운영 대장</strong></div><div class="month-buttons"><button data-move="-1" aria-label="이전 달">‹</button><input id="selected-month" type="month" value="'+h(shownMonth())+'" min="2024-01" max="2030-12"/><button data-move="1" aria-label="다음 달">›</button><button data-move="0">이번 달</button></div></div>';
}
function monthlyRows(list,detail=false){
 return list.map(b=>{
 const now=todayLocal(),status=b.status==="취소"?"취소":b.startDate>now?"예정":b.endDate<now?"완료":"진행 중";
 return '<tr><td><strong>'+h(b.sellerName||"미확인")+'</strong></td><td>'+h(b.product||b.productName||"-")+'</td><td>'+h(b.startDate)+'</td><td>'+h(b.endDate)+'</td><td><span class="status '+(status==="진행 중"?"good":"")+'">'+status+'</span></td>'+(detail?'<td>'+h(b.paymentWindow||"-")+'</td><td>'+h(b.settlementRequest||"-")+'</td><td>'+h(b.memo||b.note||"-")+'</td><td><button class="mini-button" data-act="edit-buy" data-id="'+h(b.id)+'">수정</button></td>':"")+'</tr>';
 });
}
function monthGrid(list){
 const [y,m]=shownMonth().split("-").map(Number),start=new Date(Date.UTC(y,m-1,1)).getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate();
 let cells=Array(start).fill('<div class="cal-cell cal-blank"></div>');
 for(let d=1;d<=days;d++){const date=shownMonth()+"-"+String(d).padStart(2,"0"),events=list.filter(b=>b.startDate<=date&&b.endDate>=date);
 cells.push('<div class="cal-cell"><b>'+d+'</b>'+events.slice(0,3).map(b=>'<div class="cal-event" title="'+h((b.sellerName||"")+" / "+(b.product||b.productName||""))+'">'+h(b.sellerName||"")+'</div>').join("")+(events.length>3?'<small>+'+(events.length-3)+'건</small>':"")+'</div>');
 }
 return '<div class="cal-scroll"><div class="cal-grid">'+["일","월","화","수","목","금","토"].map(d=>'<div class="cal-week">'+d+'</div>').join("")+cells.join("")+'</div></div>';
}

function sampleDate(days){return datePlus(todayLocal(),days);}
function enterPreview(){
 state.demo=true;state.user={uid:"demo",email:"preview@s2h.local"};state.staff={name:"미리보기"};
 const sellers=[
 ["sample1","샘플 셀러 A",32],["sample2","샘플 셀러 B",30],["sample3","샘플 셀러 C",30],["sample4","샘플 셀러 D",45],["sample5","샘플 셀러 E",30],["sample6","샘플 셀러 F",30]
 ];
 state.sellers=sellers.map(([id,name,cycleDays])=>({id,name,cycleDays,channel:"@example_"+id,contact:"",note:"시연용 가상 셀러"}));
 const buys=[
 ["sample1","샘플 미역국",-36,-33,"완료"],["sample2","샘플 건강식품",-42,-39,"완료"],
 ["sample3","샘플 생활용품",-185,-182,"완료"],["sample4","샘플 뷰티제품",-372,-369,"완료"],
 ["sample5","샘플 식품",0,3,"진행중"],["sample6","샘플 리빙제품",5,8,"예정"],
 ["sample1","샘플 리빙제품",-240,-237,"완료"],["sample3","샘플 건강식품",-330,-327,"완료"]
 ];
 state.buys=buys.map((b,i)=>({id:"demo-buy-"+i,sellerId:b[0],sellerName:state.sellers.find(s=>s.id===b[0]).name,product:b[1],startDate:sampleDate(b[2]),endDate:sampleDate(b[3]),status:b[4],memo:"데모용 일정"}));
 state.activities=[];state.page="dashboard";
 $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
 $("#demo-banner").classList.remove("hidden");$("#whoami").textContent="미리보기";
 render();
}
function opportunitiesData(){
 const today=todayLocal();
 return state.sellers.map(s=>{
  const buys=state.buys.filter(b=>b.sellerId===s.id&&b.status!=="취소"&&b.endDate&&b.endDate<=today);
  if(!buys.length)return null;
  const last=[...buys].sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
  const gap=daysBetween(last.endDate,today);
  const hasUpcoming=state.buys.some(b=>b.sellerId===s.id&&b.status!=="취소"&&b.endDate>=today);
  const recent=latestActivity(s.id);
  const recentDate=recent?.createdAt?.toDate?.()?.toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"});
  const contactedRecently=recentDate&&daysBetween(recentDate,today)<30;
  if(hasUpcoming)return {seller:s,last,gap,count:buys.length,level:"공구 예정",rank:4};
  if(contactedRecently)return {seller:s,last,gap,count:buys.length,level:"최근 연락",rank:3};
  const level=gap>=365?"장기 공백":gap>=180&&buys.length>=3?"재접촉 우선":gap>=90?"관심 필요":"최근 활성";
  const rank=level==="재접촉 우선"?0:level==="장기 공백"?1:level==="관심 필요"?2:3;
  return {seller:s,last,gap,count:buys.length,level,rank};
 }).filter(Boolean).sort((a,b)=>a.rank-b.rank||b.gap-a.gap);
}
function dashboard(){
 const today=todayLocal(), rem=reminders(), opp=opportunitiesData(), active=opp.filter(x=>x.level==="최근 활성").length;
 const running=state.buys.filter(b=>b.status!=="취소"&&b.startDate<=today&&b.endDate>=today);
 const upcoming=state.buys.filter(b=>b.status!=="취소"&&b.startDate>today).sort((a,b)=>a.startDate.localeCompare(b.startDate));
 const month=state.buys.filter(b=>b.status!=="취소"&&b.startDate?.slice(0,7)===today.slice(0,7));
 const alertCount=rem.length, dormant=opp.filter(x=>["관심 필요","재접촉 우선","장기 공백"].includes(x.level)).length;
 const hero='<div class="dashboard-heading"><div><span class="eyebrow">SELLER INTELLIGENCE / OVERVIEW</span><h2>오늘의 영업 현황을 한눈에.</h2><p>셀러와 상품의 거래 이력을 연결하고, 놓치기 쉬운 다음 영업 기회를 확인하세요.</p></div><span class="date-pill">기준일 '+h(today)+'</span></div>';
 const kpis='<div class="metrics metrics-dashboard">'+metric("전체 셀러",state.sellers.length.toLocaleString("ko-KR"),"등록된 셀러 DB")+metric("오늘 연락 필요",alertCount,"후속 연락 예정일 도래")+metric("진행 중 공구",running.length,"현재 운영 중인 일정")+metric("재접촉 후보",dormant,"90일 이상 공백 후보")+'</div>';
 const actionRows=rem.slice(0,6).map(x=>'<tr><td><strong>'+h(x.seller.name)+'</strong><small class="table-sub">마지막 공구 '+h(x.buy.endDate)+'</small></td><td>'+h(x.buy.product)+'</td><td><span class="status alert">'+h(x.due)+'</span></td><td><button class="mini-button" data-act="contact" data-id="'+h(x.seller.id)+'">연락 기록 ↗</button></td></tr>');
 const monthly=monthlyBuys();
 const monthlyPanel=wrap("월별 공구 현황",monthPicker()+'<div class="monthly-tools"><span>'+h(shownMonth())+' · '+monthly.length+'건</span><button class="panel-link" data-nav="schedule">전체 월별 대장 →</button></div>'+table(["셀러","상품","시작일","종료일","진행 상태"],monthlyRows(monthly.slice(0,7))));
 const actionPanel=wrap("오늘의 우선 업무",'<p class="panel-description">연락 처리 기록이 필요한 재공구 대상입니다. 완료 기록 전까지 유지됩니다.</p>'+table(["셀러","최근 상품","재접촉 예정","실행"],actionRows),'<button data-nav="reminders" class="panel-link">전체 알림 보기 →</button>');
 const scheduleRows=[...running,...upcoming].slice(0,6).map(b=>'<tr><td><strong>'+h(b.sellerName)+'</strong></td><td>'+h(b.product)+'</td><td>'+h(b.startDate.slice(5))+' ~ '+h(b.endDate.slice(5))+'</td><td><span class="status '+(b.startDate<=today?"good":"")+'">'+(b.startDate<=today?"진행 중":"예정")+'</span></td></tr>');
 const schedule=wrap("공구 진행 및 예정 일정",table(["셀러","상품","일정","상태"],scheduleRows),'<button data-nav="schedule" class="panel-link">전체 일정 →</button>');
 const high=opp.filter(x=>x.rank<=2).slice(0,5);
 const opportunityRows=high.map(x=>'<div class="opportunity-row"><div><strong>'+h(x.seller.name)+'</strong><small>최근 공구 '+h(x.last.product)+' · '+x.count+'회 진행</small></div><div class="opportunity-right"><span class="status '+(x.rank===0?"alert":"")+'">'+h(x.level)+'</span><small>'+x.gap+'일 공백</small></div></div>').join("");
 const opportunities=wrap("재접촉 · 영업 기회",'<p class="panel-description">과거 진행 이력과 공구 공백을 기반으로 분류한 후보입니다.</p>'+(opportunityRows||'<div class="empty">해당되는 후보가 없습니다.</div>')+'<p class="panel-note">※ 제안·협의 데이터 연동 전의 참고 분류입니다.</p>','<button data-nav="opportunities" class="panel-link">전체 후보 →</button>');
 const recent=state.activities.slice(0,5).map(a=>'<div class="activity-row"><span class="activity-dot"></span><div><strong>'+h(a.sellerName)+'</strong><p>'+h(a.type)+' · '+h(a.memo)+'</p></div><small>'+h(dt(a.createdAt))+'</small></div>').join("");
 const activity=wrap("최근 팀 활동",recent||'<div class="empty">아직 기록된 활동이 없습니다.</div>','<button data-nav="activity" class="panel-link">전체 기록 →</button>');
 const productCounts={};state.buys.filter(b=>b.status!=="취소").forEach(b=>{productCounts[b.product]=(productCounts[b.product]||0)+1;});
 const topProducts=Object.entries(productCounts).sort((a,b)=>b[1]-a[1]).slice(0,5),max=Math.max(1,...topProducts.map(x=>x[1]));
 const products=wrap("상품별 공구 진행 이력",'<p class="panel-description">기록된 공구 건수 기준 · 매출 성과 아님</p>'+(topProducts.map(([name,count])=>'<div class="product-bar-row"><div><span>'+h(name)+'</span><strong>'+count+'건</strong></div><div class="product-track"><span style="width:'+(count/max*100)+'%"></span></div></div>').join("")||'<div class="empty">상품 이력이 없습니다.</div>'),'<button data-nav="products" class="panel-link">상품 인사이트 →</button>');
 const distribution=[["최근 활성",active],["재접촉 후보",dormant],["공구 예정 / 최근 연락",opp.filter(x=>["공구 예정","최근 연락"].includes(x.level)).length],["과거 공구 없음",Math.max(0,state.sellers.length-opp.length)]];
 const distributionUI=wrap("셀러 관계 현황",'<div class="distribution-chart"><div class="donut" style="--p:'+(state.sellers.length?(active/state.sellers.length*100):0)+'%"><div><strong>'+state.sellers.length+'</strong><small>전체 셀러</small></div></div><div class="distribution-legend">'+distribution.map((x,i)=>'<div><span class="legend-dot legend-'+i+'"></span><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join("")+'</div></div><p class="panel-note">※ 등록된 데이터 기준의 참고 집계입니다.</p>');
 const quick='<div class="dashboard-actions"><div><strong>Quick Actions</strong><span>주요 업무를 빠르게 등록하세요.</span></div><div class="quick-actions"><button data-quick="seller">+ 셀러 등록</button><button data-quick="buy">+ 공구 등록</button><button data-quick="activity">+ 연락 기록</button></div></div>';
 return (state.demo?'<div class="demo-alert">미리보기 전용 화면입니다. 아래 셀러와 상품은 모두 가상 예시이며 실제 S2H 데이터가 아닙니다.</div>':'')+hero+quick+kpis+monthlyPanel+actionPanel+'<div class="layout-two">'+schedule+opportunities+'</div><div class="layout-two">'+products+distributionUI+'</div>'+activity+'<div class="dashboard-footer">S2H CORPORATION · INTERNAL SELLER OPERATIONS</div>';
}
function productsPage(){
 const counts={};state.buys.filter(b=>b.status!=="취소").forEach(b=>{if(!counts[b.product])counts[b.product]={sellers:new Set(),count:0,last:""};counts[b.product].count++;counts[b.product].sellers.add(b.sellerId);if((b.endDate||"")>counts[b.product].last)counts[b.product].last=b.endDate;});
 const rows=Object.entries(counts).sort((a,b)=>b[1].count-a[1].count).map(([name,x])=>'<tr><td><strong>'+h(name)+'</strong></td><td>'+x.sellers.size+'명</td><td>'+x.count+'건</td><td>'+h(x.last)+'</td></tr>');
 return wrap("상품별 공구 이력 · "+rows.length, '<p class="panel-description">현재 공구 기록에서 집계합니다. 상품 마스터·표준명 매핑은 다음 개발 단계입니다.</p>'+table(["상품명","진행 셀러","공구 건수","최근 종료일"],rows));
}
function opportunitiesPage(){
 const rows=opportunitiesData().map(x=>'<tr><td><strong>'+h(x.seller.name)+'</strong></td><td>'+h(x.last.product)+'</td><td>'+x.count+'회</td><td>'+h(x.last.endDate)+'</td><td>'+x.gap+'일</td><td><span class="status '+(x.rank<=1?"alert":"")+'">'+h(x.level)+'</span></td><td><button class="mini-button" data-act="contact" data-id="'+h(x.seller.id)+'">연락 기록</button></td></tr>');
 return wrap("재접촉 · 영업 기회",'<p class="panel-description">90일 이상 공백, 180일 이상+3회 진행, 365일 장기 공백 등 기획서 초기 규칙 기반의 참고 분류입니다.</p>'+table(["셀러","최근 상품","공구 횟수","최근 종료","공백","분류","액션"],rows));
}
function proposalsPage(){
 return wrap("제안 파이프라인 · 준비 중",'<div class="pipeline-preview">'+["제안 준비","제안 완료","답변 대기","협의 중","일정 확정"].map((v,i)=>'<div><span class="pipeline-step">'+(i+1)+'</span><strong>'+v+'</strong><small>데이터 연동 예정</small></div>').join("")+'</div><p class="panel-note">현재 제안 DB는 아직 연결되지 않았습니다. 건수와 성과를 임의로 표시하지 않습니다.</p>');
}
function sellersPage(){
 const term=state.search.toLowerCase();
 const rows=state.sellers.filter(s=>(s.name+" "+s.channel+" "+s.contact).toLowerCase().includes(term)).map(s=>{
 const b=latestBuy(s.id);const a=latestActivity(s.id);
 return '<tr><td><strong>'+h(s.name)+'</strong></td><td>'+h(s.channel||"-")+'</td><td>'+h(s.contact||"-")+'</td><td>'+h(b?.product||"-")+'</td><td>'+h(b?.endDate||"-")+'</td><td>'+h(a?dt(a.createdAt):"-")+'</td><td><button class="mini-button" data-act="edit-seller" data-id="'+h(s.id)+'">상세·수정</button> <button class="mini-button" data-act="contact" data-id="'+h(s.id)+'">연락 기록</button></td></tr>';
 });
 return wrap("전체 셀러 · "+state.sellers.length, '<div class="toolbar"><input id="seller-search" placeholder="셀러명, 채널, 연락처로 검색" value="'+h(state.search)+'"/></div>'+table(["셀러명","채널","연락처","최근 공구","종료일","최근 활동","관리"],rows));
}

function schedulePage(){
 const list=monthlyBuys();
 const chooser='<div class="schedule-switch"><button data-view="list" class="'+(state.scheduleView==="list"?"selected":"")+'">목록형</button><button data-view="calendar" class="'+(state.scheduleView==="calendar"?"selected":"")+'">캘린더형</button></div>';
 const content=state.scheduleView==="calendar"?monthGrid(list):table(["셀러명","상품","시작일","종료일","상태","결제창","정산 요청","비고","관리"],monthlyRows(list,true));
 return wrap("공구 일정 · "+shownMonth(),'<p class="panel-description">월별로 공구를 조회하고 관리합니다. 월을 넘기는 공구는 양쪽 월에 표시됩니다.</p>'+monthPicker()+'<div class="monthly-tools"><span>조회 결과 '+list.length+'건</span>'+chooser+'</div>'+content);
}
function reminderPage(){
 const data=reminders();
 const cards=data.map(x=>'<div class="reminder-item"><div class="row"><div><strong>'+h(x.seller.name)+'</strong> <span class="status alert">연락 필요</span><p>최근 공구: '+h(x.buy.product)+' · 종료 '+h(x.buy.endDate)+' · 연락 기준 '+h(x.due)+' · '+x.overdue+'일 경과</p></div><div class="actions"><button class="mini-button" data-act="copy" data-id="'+h(x.seller.id)+'">문구 복사</button><button class="primary" data-act="contact" data-id="'+h(x.seller.id)+'">연락 기록</button></div></div></div>').join("");
 return wrap("미처리 알림 · "+data.length,'<p class="detail-note">알림은 임의로 닫을 수 없습니다. 실제 연락 후 활동 내용을 저장하면 해당 셀러의 다음 연락 시점이 갱신됩니다.</p>'+(cards||'<div class="empty">현재 연락이 필요한 셀러가 없습니다.</div>'));
}
function activityPage(){
 const rows=state.activities.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td><strong>'+h(a.sellerName)+'</strong></td><td>'+h(a.type)+'</td><td>'+h(a.memo)+'</td><td>'+h(a.actorName)+'</td></tr>');
 return wrap("전체 활동기록 · "+state.activities.length,table(["일시","셀러","유형","활동 내용","기록자"],rows));
}
function render(){
 if(!state.user)return;
 const views={dashboard:["메인 대시보드","WORKSPACE OVERVIEW","셀러 중심의 S2H 통합 영업 현황",dashboard],sellers:["셀러 관리","SELLER DATABASE","전체 셀러와 공구·연락 이력",sellersPage],schedule:["공구 일정","GROUPBUY SCHEDULE","공구 일정과 운영 상태",schedulePage],reminders:["리마인드","FOLLOW UP","연락 기록이 남기 전까지 미처리 알림 유지",reminderPage],activity:["활동 기록","ACTIVITY LOG","팀원들의 연락과 영업 활동",activityPage],products:["상품 인사이트","PRODUCT INTELLIGENCE","상품별 공구 이력 및 진행 셀러",productsPage],opportunities:["영업 기회","OPPORTUNITIES","재접촉 및 휴면 셀러 후보",opportunitiesPage],proposals:["제안 현황","PROPOSAL PIPELINE","상품 제안 진행 현황",proposalsPage]};
 const [title,kicker,caption,view]=views[state.page];
 $("#page-title").textContent=title;$("#section-kicker").textContent=kicker;$("#page-caption").textContent=caption;
 $("#breadcrumb").textContent="Workspace / "+title;$("#today").textContent=todayLocal();
 $("#add-button").textContent=state.page==="schedule"?"+ 공구 등록":state.page==="activity"||state.page==="reminders"?"+ 활동 기록":state.page==="products"||state.page==="opportunities"||state.page==="proposals"?"셀러 보기":"+ 셀러 등록";
 $("#add-button").onclick=state.page==="schedule"?()=>buyModal():state.page==="activity"||state.page==="reminders"?()=>activityModal():state.page==="products"||state.page==="opportunities"||state.page==="proposals"?()=>{state.page="sellers";render();}:()=>sellerModal();
 document.querySelectorAll("[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page===state.page));
 $("#page-body").innerHTML=view();
 $("#page-body").querySelectorAll("[data-nav]").forEach(el=>el.addEventListener("click",()=>{state.page=el.dataset.nav;render();}));

 $("#page-body").querySelectorAll("[data-move]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.move==="0"){state.selectedMonth=todayLocal().slice(0,7);render();}else changeMonth(Number(el.dataset.move));}));
 const monthInput=$("#selected-month");if(monthInput)monthInput.addEventListener("change",e=>{state.selectedMonth=e.target.value;render();});
 $("#page-body").querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>{state.scheduleView=el.dataset.view;render();}));
 $("#page-body").querySelectorAll("[data-quick]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.quick==="seller")sellerModal();if(el.dataset.quick==="buy")buyModal();if(el.dataset.quick==="activity")activityModal();}));
 const search=$("#seller-search");
 if(search){search.addEventListener("input",e=>{const pos=e.target.selectionStart;state.search=e.target.value;$("#page-body").innerHTML=sellersPage();const input=$("#seller-search");input.focus();input.setSelectionRange(pos,pos);});}
 $("#page-body").querySelectorAll("[data-act]").forEach(el=>el.addEventListener("click",()=>{
 const action=el.dataset.act,id=el.dataset.id;
 if(action==="edit-seller")sellerModal(state.sellers.find(x=>x.id===id));
 if(action==="edit-buy")buyModal(state.buys.find(x=>x.id===id));
 if(action==="contact")activityModal(id);
 if(action==="copy"){
  const seller=state.sellers.find(s=>s.id===id);
  const buy=latestBuy(id);
  const msg='대표님 안녕하세요 :) 지난번 '+(buy?.product||"공구")+' 진행 이후 연락드립니다. 새로운 공구 진행을 제안드리고 싶어 연락드렸습니다. 편하실 때 검토 부탁드립니다!';
  navigator.clipboard?.writeText(msg).then(()=>notify("문구를 복사했습니다.")).catch(()=>notify("클립보드 복사가 허용되지 않았습니다."));
 }
 }));
}
start();
