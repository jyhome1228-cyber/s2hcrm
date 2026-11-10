import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const state = { user: null, staff: null, sellers: [], buys: [], activities: [], page: "dashboard", search: "", unsubs: [], modalSave: null };
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
    $("#login-error").textContent="Firebase 연결 전입니다. firebase-config.js에 프로젝트 웹 앱 설정값을 입력해주세요.";
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
$("#logout").onclick=()=>signOut(auth);
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
function dashboard(){
 const today=todayLocal(),rem=reminders();
 const running=state.buys.filter(b=>b.status!=="취소"&&b.startDate<=today&&b.endDate>=today);
 const upcoming=state.buys.filter(b=>b.status!=="취소"&&b.startDate>today);
 const cards='<div class="metrics">'+metric("전체 셀러",state.sellers.length,"통합 셀러 DB")+metric("연락 필요",rem.length,"완료 기록이 필요한 알림")+metric("진행 중 공구",running.length,"오늘 날짜 기준")+metric("예정 공구",upcoming.length,"시작일 도래 전")+'</div>';
 const remRows=rem.slice(0,8).map(x=>'<tr><td><strong>'+h(x.seller.name)+'</strong></td><td>'+h(x.buy.product)+'</td><td>'+h(x.due)+'</td><td><span class="status alert">'+x.overdue+'일 경과</span></td><td><button class="mini-button" data-act="contact" data-id="'+h(x.seller.id)+'">연락 기록</button></td></tr>');
 const buyRows=[...state.buys].filter(b=>b.status!=="취소").sort((a,b)=>a.startDate.localeCompare(b.startDate)).filter(b=>b.endDate>=today).slice(0,8).map(b=>'<tr><td><strong>'+h(b.sellerName)+'</strong></td><td>'+h(b.product)+'</td><td>'+h(b.startDate)+' ~ '+h(b.endDate)+'</td><td><span class="status '+(b.startDate<=today?'good':'')+'">'+(b.startDate<=today?'진행 중':'예정')+'</span></td></tr>');
 return cards+'<div class="layout-two">'+wrap("연락이 필요한 셀러",table(["셀러","최근 상품","연락 기준일","지연","실행"],remRows),'<span class="badge-count">'+rem.length+'건</span>')+wrap("다가오는 공구",table(["셀러","상품","일정","상태"],buyRows))+'</div>';
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
 const rows=[...state.buys].sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||"")).map(b=>'<tr><td><strong>'+h(b.sellerName)+'</strong></td><td>'+h(b.product)+'</td><td>'+h(b.startDate)+'</td><td>'+h(b.endDate)+'</td><td><span class="status">'+h(b.status)+'</span></td><td>'+h(b.memo||"-")+'</td><td><button class="mini-button" data-act="edit-buy" data-id="'+h(b.id)+'">수정</button></td></tr>');
 return wrap("공구 일정 · "+state.buys.length,table(["셀러","상품","시작일","종료일","진행상태","특이사항","관리"],rows));
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
 const views={dashboard:["Dashboard","OVERVIEW","오늘 필요한 업무부터 확인하세요.",dashboard],sellers:["Seller Management","DATABASE","전체 셀러와 영업 이력을 한곳에서 관리하세요.",sellersPage],schedule:["Groupbuy Schedule","OPERATIONS","공구 일정을 등록하고 조회하세요.",schedulePage],reminders:["Reminders","FOLLOW UP","연락 기록이 남기 전까지 미처리 알림을 유지합니다.",reminderPage],activity:["Activity Log","HISTORY","모든 팀원의 연락과 영업 활동을 공유합니다.",activityPage]};
 const [title,kicker,caption,view]=views[state.page];
 $("#page-title").textContent=title;$("#section-kicker").textContent=kicker;$("#page-caption").textContent=caption;
 $("#breadcrumb").textContent="Workspace / "+title;$("#today").textContent=todayLocal();
 $("#add-button").textContent=state.page==="schedule"?"+ 공구 등록":state.page==="activity"||state.page==="reminders"?"+ 활동 기록":"+ 셀러 등록";
 $("#add-button").onclick=state.page==="schedule"?()=>buyModal():state.page==="activity"||state.page==="reminders"?()=>activityModal():()=>sellerModal();
 document.querySelectorAll("[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page===state.page));
 $("#page-body").innerHTML=view();
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
