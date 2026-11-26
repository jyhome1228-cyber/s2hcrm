import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { productCanonicalName, productDisplayAliases, sellerIdentity, instagramIdentity } from "./normalization.js?v=20261117-auto-family-3";
import { mountSeedImporter } from "./import-seed-ui.js?v=20261125-phase1-1";
import { mountBackupExport } from "./backup-export.js?v=20261125-phase1-1";
import { PREP_STEPS,prepProgress,prepAlerts,prepDueLabel } from "./preflight-utils.js?v=20261124-p3-1";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
let screenBusyCount=0,loadingTimer=null,toastTimer=null;
let modalSaving=false,modalDirty=false,buyModalPending=false,navigationPending=false;
function showLoading(label="데이터를 불러오는 중입니다"){
 const layer=document.getElementById("app-loading");
 if(!layer)return;
 screenBusyCount++;layer.querySelector("[data-loading-message]").textContent=label;
 if(screenBusyCount===1){clearTimeout(loadingTimer);loadingTimer=setTimeout(()=>{
  if(screenBusyCount>0){layer.classList.remove("hidden");layer.setAttribute("aria-busy","true");}
 },120);}
}
function hideLoading(){
 const layer=document.getElementById("app-loading");
 if(!layer)return;
 screenBusyCount=Math.max(0,screenBusyCount-1);
 if(!screenBusyCount){clearTimeout(loadingTimer);loadingTimer=null;layer.classList.add("hidden");layer.setAttribute("aria-busy","false");}
}
function navigateTo(page){
 if(navigationPending||buyModalPending||modalSaving)return;
 navigationPending=true;
 showLoading("화면을 준비하고 있습니다");
 setTimeout(()=>{try{state.page=page;state.search=page==="sellers"?state.search:"";render();}finally{navigationPending=false;hideLoading();}},15);
}

const state = { user: null, staff: null, sellers: [], buys: [], products: [], activities: [], staffUsers: [], dataErrors:{}, page: "dashboard", search: "", activitySearch:"", activityType:"all", activityPage:1, sellerPage:1, sellerPageSize:50, sellerOperationFilter:"all", dashboardTaskFilter:"all", dashboardPanelMode:"tasks", unsubs: [], modalSave: null, demo:false, selectedMonth:null, scheduleView:"list", scheduleStatusFilter:"all", scheduleSort:"start", monthSearch:"", productSearch:"", productStatus:"active", productSort:"name", productView:"list", productPage:1, insightSearch:"", insightSort:"count", insightPage:1, selectedSellerId:null, expandedReminderId:null, reminderCopied:{}, expandedCalendarWeeks:{}, calendarMode:"month", weekStart:null, calendarSelectedDate:null };
const todayLocal = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const datePlus = (value, days) => { const [y,m,d]=value.split("-").map(Number); const x=new Date(Date.UTC(y,m-1,d+days));return x.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
const h = (value) => String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function instagramLink(rawValue){
 const raw=String(rawValue||"").trim();
 if(!raw||raw==="-")return "-";
 let handle="";
 try{
  if(/^https?:\/\//i.test(raw)){
   const url=new URL(raw);
   if(!["instagram.com","www.instagram.com","m.instagram.com"].includes(url.hostname.toLowerCase()))return h(raw);
   handle=decodeURIComponent(url.pathname.split("/").filter(Boolean)[0]||"");
  }else{
   handle=raw.replace(/^@/,"").replace(/^\/?/,"").split(/[/?#]/)[0];
  }
 }catch{return h(raw);}
 if(!/^[A-Za-z0-9._]{1,30}$/.test(handle))return h(raw);
 return '<a class="instagram-profile-link" href="https://www.instagram.com/'+encodeURIComponent(handle)+'/" target="_blank" rel="noopener noreferrer" title="인스타그램 프로필 새 탭에서 열기">@'+h(handle)+'</a>';
}
function openBuyModalSafely(item=null,presetSellerId=null,presetDate=null){
 if(buyModalPending||modalSaving||navigationPending)return;
 buyModalPending=true;
 showLoading(item?"공구 수정창을 준비하고 있습니다":"공구 등록창을 준비하고 있습니다");
 setTimeout(()=>{
  try{buyModal(item,presetSellerId,presetDate);}catch(error){console.error("공구 등록창 오류:",error);notify("공구 등록창을 열지 못했습니다: "+(error?.message||"알 수 없는 오류"));}
  finally{buyModalPending=false;hideLoading();}
 },25);
}
const dt = (ts) => ts?.toDate?.()?.toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}) || "-";
const notify = (msg) => {
 const toast=$("#toast");if(!toast)return;
 clearTimeout(toastTimer);toast.textContent=String(msg??"");
 toast.classList.remove("hidden");
 toastTimer=setTimeout(()=>toast.classList.add("hidden"),4200);
};
const f = (name,label,type="text",val="",required=false,full=false) => '<label class="'+(full?'full':'')+'">'+h(label)+'<input name="'+h(name)+'" type="'+type+'" value="'+h(val)+'" '+(required?'required':'')+' /></label>';
const textarea = (name,label,val="") => '<label class="full">'+h(label)+'<textarea name="'+h(name)+'">'+h(val)+'</textarea></label>';
const select = (name,label,options,val="") => '<label>'+h(label)+'<select name="'+h(name)+'">'+options.map(([v,t])=>'<option value="'+h(v)+'" '+(v===val?'selected':'')+'>'+h(t)+'</option>').join("")+'</select></label>';

const MAINTENANCE_MODE=true; // Temporary S2H CRM inspection mode
// Keep the maintenance overlay hidden when regular access is restored.
if(!MAINTENANCE_MODE)$("#maintenance")?.classList.add("hidden");
function showMaintenance(){
 if(!MAINTENANCE_MODE)return;
 const gate=$("#maintenance");
 if(gate)gate.classList.remove("hidden");
 $("#login").classList.add("hidden");
 $("#app").classList.add("hidden");
}
function showAdminLogin(){
 if(!MAINTENANCE_MODE)return;
 $("#maintenance")?.classList.add("hidden");
 $("#login").classList.remove("hidden");
}
$("#maintenance-admin-login")?.addEventListener("click",showAdminLogin);

let db,auth,authGeneration=0,loginPending=false;
function start() {
  if (!firebaseConfigured) {
    if(MAINTENANCE_MODE)showMaintenance();
    else $("#login").classList.remove("hidden");
    $("#login-error").textContent="Firebase 연결 전입니다. 현재는 미리보기로 화면 구성을 확인할 수 있어요."; $("#preview-button").classList.remove("hidden"); $("#preview-hint").classList.remove("hidden");
    $("#login-form").querySelector("button").disabled=true;
    return;
  }
  const app=initializeApp(firebaseConfig);
  auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth, async user => {
    const generation=++authGeneration;
    clearListeners();
    if (!user){state.user=null;state.staff=null;if(MAINTENANCE_MODE)showMaintenance();else{$("#login").classList.remove("hidden");$("#app").classList.add("hidden");}return;}
    try {
      const userDoc=await getDoc(doc(db,"users",user.uid));
      if(generation!==authGeneration||auth.currentUser?.uid!==user.uid)return;
      if (!userDoc.exists() || userDoc.data().active!==true) {
        $("#login-error").textContent="사용 권한이 없습니다. 관리자에게 Firebase users 권한 등록을 요청하세요.";
        await signOut(auth);return;
      }
      if(MAINTENANCE_MODE&&userDoc.data().role!=="admin"){
        state.user=null;state.staff=null;
        showMaintenance();
        await signOut(auth);
        return;
      }
      $("#maintenance")?.classList.add("hidden");
      state.user=user;state.staff=userDoc.data();
      const pendingInitial=new Set(["sellers","groupbuys","products","activities"]);
      let initialLoaded=false;
      showLoading("S2H 데이터를 불러오는 중입니다");
      const importNav=document.querySelector("[data-page=import]");
      if(importNav)importNav.classList.toggle("hidden",state.staff.role!=="admin");
      $("#whoami").textContent=state.staff.name || user.email;
      $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
      // Manager roster for assignment. The live Firebase rules must allow this query for the current account.
      const staffUnsub=onSnapshot(collection(db,"users"),snapshot=>{
        if(generation!==authGeneration)return;
        delete state.dataErrors.users;
        state.staffUsers=snapshot.docs.map(d=>({uid:d.id,...d.data()}))
          .filter(person=>person.active===true).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ko-KR"));
        if(state.page==="dashboard"||state.page==="schedule")render();
      },err=>{if(generation!==authGeneration)return;state.dataErrors.users=err?.code||"조회 실패";console.warn("담당자 목록을 불러오지 못했습니다:",err?.code||err);render();});
      state.unsubs.push(staffUnsub);
      ["sellers","groupbuys","products","activities"].forEach(kind=>{
        // Do not exclude historical documents missing createdAt. Sort client-side where needed.
        const ref=collection(db,kind);
        const off=onSnapshot(ref,snapshot=>{
          if(generation!==authGeneration)return;
          const records=snapshot.docs.map(d=>({...d.data(),id:d.id}));
          if(kind==="activities")records.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
          if(kind==="sellers"){state.sellers=records;restoreSellerLink();}
          if(kind==="groupbuys")state.buys=records;
          if(kind==="products")state.products=records;
          if(kind==="activities")state.activities=records;
          delete state.dataErrors[kind];
          if(!initialLoaded){
           pendingInitial.delete(kind);
           if(pendingInitial.size===0){initialLoaded=true;hideLoading();render();}
          }else render();
        },err=>{
          if(generation!==authGeneration)return;
          state.dataErrors[kind]=err?.code||"조회 실패";
          if(!initialLoaded){
           pendingInitial.delete(kind);
           if(pendingInitial.size===0){initialLoaded=true;hideLoading();}
          }
          render();
        });
        state.unsubs.push(off);
      });
      render();
    } catch(err){if(generation!==authGeneration)return;$("#login-error").textContent=err.message;await signOut(auth);}
  });
}
function clearListeners(){
 closeWorkAlerts();state.unsubs.forEach(fn=>fn());state.unsubs=[];
 state.user=null;state.staff=null;state.demo=false;state.page="dashboard";state.selectedSellerId=null;
 state.sellers=[];state.buys=[];state.products=[];state.activities=[];state.staffUsers=[];state.dataErrors={};
 reminderCache=null;workAlertsCache=null;workAlertEffectShown=false;
 clearTimeout(loadingTimer);loadingTimer=null;screenBusyCount=0;hideLoading();
 clearTimeout(toastTimer);$("#toast")?.classList.add("hidden");
 $("#modal")?.classList.add("hidden");$("#seller-detail-modal")?.classList.add("hidden");
 $("#modal-fields").innerHTML="";$("#seller-detail-modal-body").innerHTML="";
 state.modalSave=null;modalDirty=false;currentSellerPopupId=null;sellerPopupReturnFocus=null;lastModalFocus=null;
 document.body.classList.remove("s2h-modal-open","seller-popup-open");
}
$("#login-form").addEventListener("submit",async e=>{
  e.preventDefault();if(loginPending||!auth)return;
  const button=$("#login-form button[type=submit]"),label=button.textContent;
  loginPending=true;button.disabled=true;button.textContent="로그인 중...";
  $("#login-error").textContent="";
  try{await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value);}
  catch(err){
    const messages={
      "auth/invalid-credential":"이메일 또는 비밀번호가 일치하지 않습니다. Authentication에 등록한 계정인지 확인해주세요.",
      "auth/user-not-found":"Authentication에 등록된 사용자가 아닙니다.",
      "auth/wrong-password":"비밀번호가 일치하지 않습니다.",
      "auth/invalid-email":"이메일 주소 형식이 올바르지 않습니다.",
      "auth/operation-not-allowed":"Firebase Authentication에서 이메일/비밀번호 로그인을 활성화해주세요.",
      "auth/unauthorized-domain":"Firebase Authentication 승인된 도메인에 jyhome1228-cyber.github.io를 추가해주세요.",
      "auth/too-many-requests":"로그인 시도가 많아 일시적으로 제한되었습니다. 잠시 뒤 다시 시도해주세요.",
      "auth/network-request-failed":"네트워크 연결에 실패했습니다. 인터넷 연결과 브라우저 설정을 확인해주세요.",
      "auth/user-disabled":"비활성화된 계정입니다. 관리자에게 문의해주세요."
    };
    $("#login-error").textContent=(messages[err.code]||"로그인 오류가 발생했습니다.")+" ("+(err.code||"unknown")+")";
    console.error("S2H sign-in error code:",err.code);
  }finally{loginPending=false;button.disabled=false;button.textContent=label;}
});
$("#logout").onclick=()=>{if(state.demo){location.reload();return;}signOut(auth);};
$("#preview-button").onclick=()=>{if(MAINTENANCE_MODE)return showMaintenance();enterPreview();};
const togglePassword=$("#toggle-password");
togglePassword.addEventListener("click",()=>{
 const password=$("#password"),visible=password.type==="password";
 password.type=visible?"text":"password";
 togglePassword.setAttribute("aria-pressed",String(visible));
 togglePassword.setAttribute("aria-label",visible?"비밀번호 숨기기":"비밀번호 표시");
 togglePassword.setAttribute("title",visible?"비밀번호 숨기기":"비밀번호 표시");
 togglePassword.innerHTML=visible
 ?'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.8 6.1A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.6M6.1 6.9C3.7 8.4 2.5 12 2.5 12s3.5 6 9.5 6c1.1 0 2.2-.2 3.2-.6"/><path d="M10 10a3 3 0 0 0 4 4"/></svg>'
 :'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/></svg>';
});

// Keyboard access for dialogs: focus remains inside the active modal until closed.
document.addEventListener("keydown",event=>{
 const normal=$("#modal"),seller=$("#seller-detail-modal");
 const active=normal&&!normal.classList.contains("hidden")?normal:
  seller&&!seller.classList.contains("hidden")?seller:null;
 if(!active||event.defaultPrevented||event.isComposing)return;
 if(event.key==="Escape"){
  if(active===normal){
   requestCloseModal();
  }else closeSellerPopup();
  event.preventDefault();return;
 }
 if(event.key!=="Tab")return;
 const focusable=[...active.querySelectorAll('button:not([disabled]),a[href],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
   .filter(el=>el.getClientRects().length>0&&el.getAttribute("aria-hidden")!=="true");
 if(!focusable.length){event.preventDefault();active.focus();return;}
 const first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){event.preventDefault();first.focus();}
});
function requestCloseModal(){
 if(modalSaving)return;
 const submit=$("#modal-form button[type=submit]");
 if(modalDirty&&submit&&!submit.classList.contains("hidden")&&!window.confirm("입력 중인 내용은 저장되지 않습니다. 닫으시겠습니까?"))return;
 closeModal();
}
$("#close-modal").onclick=requestCloseModal;$("#cancel-modal").onclick=requestCloseModal;
$("#modal-form").addEventListener("input",()=>{modalDirty=true;});
$("#modal-form").addEventListener("change",()=>{modalDirty=true;});
$("#seller-detail-modal-close").addEventListener("click",()=>closeSellerPopup());
$("#seller-detail-modal").addEventListener("click",event=>{if(event.target===$("#seller-detail-modal"))closeSellerPopup();});

// Backdrop clicks must not dismiss a form while the operator is registering or editing data.
$("#modal").addEventListener("click",e=>{if(e.target===$("#modal"))e.preventDefault();});
document.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>{clearSellerLink();navigateTo(btn.dataset.page);}));
$("#home-logo").addEventListener("click",()=>{clearSellerLink();state.page="dashboard";state.selectedMonth=todayLocal().slice(0,7);state.weekStart=null;state.search="";render();window.scrollTo?.({top:0,behavior:"smooth"});});
$("#global-seller-search")?.addEventListener("click",()=>{clearSellerLink();state.page="sellers";state.search="";state.sellerPage=1;render();$("#seller-search")?.focus({preventScroll:true});});
$("#add-button").onclick=()=>state.page==="schedule"?openBuyModalSafely():sellerModal();
$("#modal-form").addEventListener("submit",async e=>{
 e.preventDefault();
 if(modalSaving||typeof state.modalSave!=="function")return;
 const btn=e.target.querySelector("[type=submit]"),form=e.target;
 if(!btn||btn.disabled||btn.classList.contains("hidden"))return;
 const data=Object.fromEntries(new FormData(form).entries());
 modalSaving=true;btn.disabled=true;form.setAttribute("aria-busy","true");
 $("#close-modal").disabled=true;$("#cancel-modal").disabled=true;
 const originalText=btn.textContent;
 btn.textContent="저장 중...";
 const feedback=$("#modal-save-feedback");
 if(feedback)feedback.textContent="";
 try{
  await state.modalSave(data);
  modalSaving=false;closeModal();notify("저장되었습니다.");
 }catch(err){
  const message="저장 실패: "+(err?.message||"다시 시도해주세요.");
  if(feedback){feedback.textContent=message;feedback.scrollIntoView({block:"nearest"});}
  notify(message);
 }finally{modalSaving=false;btn.disabled=false;btn.textContent=originalText;form.removeAttribute("aria-busy");$("#close-modal").disabled=false;$("#cancel-modal").disabled=false;}
});
let lastModalFocus=null;
function openModal(title,fields,save){
 if(modalSaving)return;
 modalDirty=false;
 if($("#modal").classList.contains("hidden"))lastModalFocus=document.activeElement;
 $("#modal").classList.remove("buy-editor-modal","prep-modal");
 $("#modal-title").textContent=title;
 $("#modal-fields").innerHTML='<div class="modal-fields">'+fields+'</div><div id="modal-save-feedback" class="modal-save-feedback" role="alert"></div>';
 const submit=$("#modal-form button[type=submit]");
 if(submit){submit.classList.remove("hidden");submit.disabled=false;submit.textContent="저장";}
 state.modalSave=save;$("#modal").classList.remove("hidden");
 document.body.classList.add("s2h-modal-open");
 $("#modal-fields").scrollTop=0;
 requestAnimationFrame(()=>{
  const dialog=$("#modal");
  if(dialog?.classList.contains("hidden"))return;
  const first=[...dialog.querySelectorAll("#modal-fields input:not([type=hidden]):not([disabled]),#modal-fields select:not([disabled]),#modal-fields textarea:not([disabled])")].find(el=>el.getClientRects().length>0)||$("#close-modal");
  first?.focus({preventScroll:true});
 });
}
function closeModal(){
 if(modalSaving)return;
 $("#modal").classList.add("hidden");$("#modal").classList.remove("buy-editor-modal","prep-modal");document.body.classList.remove("s2h-modal-open");
 state.modalSave=null;modalDirty=false;$("#modal-form").reset();
 const target=lastModalFocus;
 lastModalFocus=null;
 if(target?.isConnected)requestAnimationFrame(()=>target.focus({preventScroll:true}));
}
function preflightModal(buyId){
 if(state.demo)return notify("미리보기에서는 준비 상태를 저장할 수 없습니다.");
 const buy=state.buys.find(item=>item.id===buyId);
 if(!buy)return notify("해당 공구 기록을 찾지 못했습니다.");
 if(buy.status==="취소")return notify("취소된 공구는 준비 체크를 수정할 수 없습니다.");
 const pre=buy.readiness||{},oldChecks=pre.checks||{},today=todayLocal();
 const ownerPool=new Map((state.staffUsers||[]).map(user=>[user.uid,user.name||user.uid]));
 if(state.user?.uid&&!ownerPool.has(state.user.uid))ownerPool.set(state.user.uid,state.staff?.name||"현재 사용자");
 if(pre.ownerUid&&!ownerPool.has(pre.ownerUid))ownerPool.set(pre.ownerUid,pre.ownerName||"이전 담당자");
 const selectedOwner=pre.ownerUid||"";
 const ownerOptions='<option value="">담당자 미지정</option>'
  +[...ownerPool].map(([uid,name])=>'<option value="'+h(uid)+'" '+(uid===selectedOwner?'selected':'')+'>'+h(name)+'</option>').join("");
 const checked=PREP_STEPS.map(step=>{
  const record=oldChecks[step.key]||{};
  const disabled=step.key==="opening"&&today<buy.startDate;
  const detail=record.done?('마지막 확인: '+(record.actorName||"기록 없음")+(record.at?' · '+dt(record.at):"")):
   disabled?"오픈일 이후 확인 가능":"아직 확인되지 않았습니다";
  return '<label class="prep-check-row'+(record.done?' is-done':'')+(disabled?' is-disabled':'')+'">'
   +'<input type="checkbox" name="prep_'+h(step.key)+'" '+(record.done?'checked ':'')+(disabled?'disabled ':'')+'/>'
   +'<span class="prep-check-content"><strong>'+h(step.label)+'</strong><small>'+h(step.help)+'</small>'
   +'<em>'+h(detail)+'</em></span></label>';
 }).join("");
 const existingHistory=state.activities
  .filter(a=>a.groupbuyId===buy.id&&a.type==="공구 준비 확인")
  .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,8);
 const history=existingHistory.length?existingHistory.map(a=>
   '<div class="prep-history-row"><strong>'+h(a.actorName||"담당자")+'</strong><span>'+h(a.memo||"준비 상태 변경")+'</span><small>'+h(dt(a.createdAt))+'</small></div>').join(""):
   '<p class="prep-history-empty">아직 저장된 준비 확인 이력이 없습니다.</p>';
 const progress=prepProgress(buy,today);
 const fields='<div class="prep-modal-head full"><strong>'+h(buy.sellerName||"셀러 미확인")+'</strong>'
  +'<span>'+h(buy.product||buy.productName||"상품 미확인")+' · '+h(buy.startDate||"-")+' ~ '+h(buy.endDate||"-")+'</span>'
  +'<small>'+(!progress.recorded?'기존 기록의 준비 여부가 아직 확인되지 않았습니다.':('현재 '+progress.done+'/'+progress.total+'개 항목 확인'))+'</small></div>'
  +'<label class="prep-owner full">담당자<select name="prepOwner">'+ownerOptions+'</select></label>'
  +'<div class="prep-step-heading full"><strong>오픈 준비 체크</strong><span>실제 확인 후 완료로 표시하세요.</span></div>'
  +'<div class="prep-check-list full">'+checked+'</div>'
  +'<label class="prep-link full">결제 링크 (선택)<input name="prepPaymentUrl" type="url" placeholder="https://" value="'+h(pre.paymentUrl||"")+'"/></label>'
  +'<label class="prep-memo full">담당자 메모<textarea name="prepMemo" rows="3" placeholder="전달 방법, 확인 요청 사항 등을 기록하세요.">'+h(pre.memo||"")+'</textarea></label>'
  +'<div class="prep-history full"><strong>최근 확인 이력</strong>'+history+'</div>';
 openModal("공구 오픈 준비",fields,async formData=>{
  const latest=state.buys.find(item=>item.id===buyId);
  if(!latest)throw Error("공구 기록을 찾을 수 없습니다.");
  const previous=latest.readiness||{},previousChecks=previous.checks||{},nextChecks={...previousChecks};
  const ownerUid=String(formData.prepOwner||"");
  const ownerName=ownerUid?(ownerPool.get(ownerUid)||previous.ownerName||"담당자"):"";
  const changes=[];
  for(const step of PREP_STEPS){
   const old=previousChecks[step.key]||{},locked=step.key==="opening"&&today<latest.startDate;
   const done=locked?old.done===true:Boolean(formData["prep_"+step.key]);
   if(done!==Boolean(old.done)){
    nextChecks[step.key]=done?{done:true,actorUid:state.user.uid,actorName:state.staff?.name||state.user.email,at:serverTimestamp()}:
      {done:false,actorUid:state.user.uid,actorName:state.staff?.name||state.user.email,at:null};
    changes.push(step.short+(done?" 완료":" 미확인으로 변경"));
   } else if(Object.prototype.hasOwnProperty.call(previousChecks,step.key)){
    nextChecks[step.key]=old;
   }
  }
  const paymentUrl=String(formData.prepPaymentUrl||"").trim();
  const memo=String(formData.prepMemo||"").trim();
  if(ownerUid!==String(previous.ownerUid||""))changes.push("담당자 "+(ownerName||"미지정"));
  if(paymentUrl!==String(previous.paymentUrl||""))changes.push("결제 링크 기록 변경");
  if(memo!==String(previous.memo||""))changes.push("메모 변경");
  if(!changes.length)return;
  const actor=state.staff?.name||state.user.email;
  const update={
   ...previous,ownerUid,ownerName,checks:nextChecks,paymentUrl,memo,
   updatedAt:serverTimestamp(),updatedByUid:state.user.uid,updatedByName:actor
  };
  const batch=writeBatch(db);
  batch.update(doc(db,"groupbuys",buyId),{readiness:update});
  batch.set(doc(collection(db,"activities")),{
   sellerId:latest.sellerId||"",sellerName:latest.sellerName||"",groupbuyId:buyId,
   type:"공구 준비 확인",memo:changes.join(" · "),
   actorUid:state.user.uid,actorName:actor,contactOwner:ownerName||actor,createdAt:serverTimestamp()
  });
  await batch.commit();
 });
 $("#modal").classList.add("prep-modal");
}
function sellerModal(item=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다. Firebase 연결 후 이용해주세요.");return;}
 const statusOptions=[["","미설정"],["활성","활성"],["협의 중","협의 중"],["재접촉 필요","재접촉 필요"],["보류","보류"],["거래 종료","거래 종료"]];
 const proposalOptions=[["","미설정"],["제안 준비","제안 준비"],["답변 대기","답변 대기"],["수락","수락"],["거절","거절"],["협의 중","협의 중"]];
 openModal(item?"셀러 정보 수정":"새 셀러 등록",
   f("name","셀러명","text",item?.name,true)+f("channel","인스타그램 계정","text",item?.channel||item?.instagramId)+
   f("instagramUrl","인스타그램 URL","url",item?.instagramUrl||"",false,true)+
   f("followerCountLatestRecorded","최근 기록된 팔로워 수","number",item?.followerCountLatestRecorded??"")+
   f("contact","연락처","text",item?.contact)+
   select("collaborationStatus","협업 상태",statusOptions,item?.collaborationStatus||"")+
   f("primaryCategory","주력 카테고리","text",item?.primaryCategory||"")+
   f("contactChannel","선호 연락 채널","text",item?.contactChannel||"")+
   select("proposalResult","최근 제안 결과",proposalOptions,item?.proposalResult||"")+
   f("nextContactDate","다음 연락 예정일","date",item?.nextContactDate||"")+
   f("cycleDays","리마인드 주기 (일)","number",item?.cycleDays??30,true)+
   textarea("preferredConditions","선호 상품·협업 조건",item?.preferredConditions||"")+
   textarea("note","셀러 메모",item?.note||item?.notes),
   async data=>{
    const record={
     name:data.name.trim(),channel:data.channel.trim(),instagramUrl:data.instagramUrl.trim(),
     followerCountLatestRecorded:data.followerCountLatestRecorded?Number(data.followerCountLatestRecorded):null,
     contact:data.contact.trim(),collaborationStatus:data.collaborationStatus,
     primaryCategory:data.primaryCategory.trim(),contactChannel:data.contactChannel.trim(),
     proposalResult:data.proposalResult,nextContactDate:data.nextContactDate,
     preferredConditions:data.preferredConditions.trim(),note:data.note.trim(),
     cycleDays:Math.max(1,Number(data.cycleDays)||30),updatedAt:serverTimestamp()
    };
    if(!record.name)throw new Error("셀러명을 입력해주세요.");
    if(item)await updateDoc(doc(db,"sellers",item.id),record);
    else await addDoc(collection(db,"sellers"),{...record,createdAt:serverTimestamp()});
   });
}
function buyModal(item=null,presetSellerId=null,presetDate=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다.");return;}
 const cmp=(a,b)=>String(a||"").localeCompare(String(b||""),"ko-KR",{sensitivity:"base",numeric:true});
 const productLabel=p=>String(p.standardName||p.productName||p.name||"").trim();
 const sellerMap=new Map(state.sellers.map(s=>[s.id,s]));
 const products=new Map();
 const archivedNames=new Set(state.products.filter(p=>p.active===false).map(productLabel));
 for(const p of [...state.products].sort((a,b)=>Number(productLabel(b)===productCanonicalName(productLabel(b),state.products))-Number(productLabel(a)===productCanonicalName(productLabel(a),state.products)))){
  const raw=productLabel(p),label=productCanonicalName(raw,state.products);
  if(label&&(p.active!==false||p.id===item?.productId)&&!products.has(label))
    products.set(label,{id:p.id,name:label,search:[label,raw,...(Array.isArray(p.aliases)?p.aliases:[])].join(" ")});
 }
 for(const b of state.buys){
  const raw=String(b.product||b.productName||"").trim();
  const label=productCanonicalName(raw,state.products);
  if(label&&!products.has(label)&&(!archivedNames.has(raw)||raw===(item?.product||item?.productName)))
    products.set(label,{id:"legacy:"+label,name:label,search:[label,raw].join(" ")});
 }
 const sellerChoices=[...sellerMap.values()].sort((a,b)=>cmp(a.name,b.name));
 const productChoices=[...products.values()].sort((a,b)=>cmp(a.name,b.name));
 const sellerSearchChoices=sellerChoices.map(x=>({id:x.id,name:x.name,search:[x.instagramId,x.channel,x.instagramUrl].filter(Boolean).join(" ")}));
 const productSearchChoices=[...productChoices];
 const productById=new Map(productChoices.map(p=>[p.id,p]));
 const originalSeller=sellerMap.get(item?.sellerId||presetSellerId);
 const initialProduct=productCanonicalName(item?.product||item?.productName||"",state.products);
 const initialProductChoice=productChoices.find(p=>p.id===item?.productId||p.name===initialProduct);
 let selectedSellerId=originalSeller?.id||"";
 let selectedProduct=initialProductChoice||null;
 const defaultDate=(state.selectedMonth&&state.selectedMonth!==todayLocal().slice(0,7))?shownMonth()+"-01":todayLocal();
 const defaultStart=item?.startDate||presetDate||defaultDate;
 const categoryOptions=[["","선택 안 함"],["마이크로","마이크로"],["일반","일반"]];
 const fields=
  '<div class="buy-editor-meta full"><span>'+(item?"공구 정보를 수정하고 변경사항을 저장하세요.":"셀러와 상품, 진행 일정을 입력하세요.")+'</span>'
  +(item?.id?'<button type="button" class="buy-editor-prep-open" data-prep-from-editor="'+h(item.id)+'">오픈 준비 체크</button>':"")+'</div>'
 +'<section class="buy-editor-section full" aria-label="기본 정보"><div class="buy-editor-section-title"><h3>기본 정보</h3><p>셀러 · 상품 · 일정</p></div><div class="buy-editor-fields">'
 +'<div class="combo-wrap"><label for="seller-combo">셀러</label><input id="seller-combo" type="text" autocomplete="off" placeholder="셀러명 또는 인스타그램 계정 검색" value="'+h(originalSeller?.name||"")+'" aria-autocomplete="list" aria-expanded="false"/><input id="seller-id" name="sellerId" type="hidden" value="'+h(selectedSellerId)+'"/><div id="seller-suggestions" class="combo-options hidden" role="listbox"></div></div>'
 +'<div class="inline-create hidden buy-span-full" id="create-seller"><strong>신규 셀러 등록</strong><div class="inline-create-grid"><label>셀러명<input id="new-seller-name" type="text"/></label><label>인스타그램 계정<input id="new-seller-handle" type="text" placeholder="@계정"/></label><label>팔로워 수<input id="new-seller-followers" type="number" min="0"/></label><label>연락처<input id="new-seller-contact" type="text"/></label></div><div class="inline-create-buttons"><button type="button" class="secondary" id="cancel-new-seller">취소</button><button type="button" class="primary" id="save-new-seller">셀러 등록</button></div></div>'

 +'<div class="combo-wrap"><label for="product-combo">상품명</label><input id="product-combo" type="text" autocomplete="off" placeholder="상품명 검색" value="'+h(selectedProduct?.name||initialProduct)+'" aria-autocomplete="list" aria-expanded="false"/><input id="product-id" name="productId" type="hidden" value="'+h(selectedProduct?.id||"")+'"/><div id="product-suggestions" class="combo-options hidden" role="listbox"></div></div>'
 +'<div class="inline-create hidden buy-span-full" id="create-product"><strong>신규 상품 등록</strong><label>상품명<input id="new-product-name" type="text"/></label><div class="inline-create-buttons"><button type="button" class="secondary" id="cancel-new-product">취소</button><button type="button" class="primary" id="save-new-product">상품 등록</button></div></div>'
 +'<div class="seller-linked-data hidden buy-span-full" id="linked-seller-info" aria-live="polite"></div>'
 +f("startDate","공구 시작일","date",defaultStart,true)
 +f("endDate","공구 종료일","date",item?.endDate||defaultStart,true)
 +select("status","진행 상태",[["예정","예정"],["진행중","진행 중"],["진행 중","진행 중 (기존 기록)"],["완료","완료"],["취소","취소"],["기록","기록 (기존 자료)"]],item?.status||"예정")
 +f("round","진행 회차","text",item?.round||"")
 +'</div></section>'
 +'<section class="buy-editor-section full" aria-label="운영 정보"><div class="buy-editor-section-title"><h3>운영 정보</h3><p>결제 · 정산 · 셀러 정보</p></div><div class="buy-editor-fields">'
 +f("followers","팔로워 수","number",item?.followers??"")
 +select("legacyCategory","셀러 구분",categoryOptions,item?.legacyCategory||"")
 +f("paymentWindow","결제창 기록","text",item?.paymentWindow||"")
 +f("settlementRequest","정산 요청 기록","text",item?.settlementRequest||"")
 +'</div></section>'
 +'<details class="buy-editor-extra full"><summary><span>추가 정보</span><small>인스타그램, 이벤트 및 비고</small></summary><div class="buy-editor-fields">'
 +f("instagramUrl","인스타그램 URL","url",item?.instagramUrl||"",false,true)
 +textarea("event","이벤트 및 혜택",item?.event||"")
 +textarea("note","비고 및 특이사항",item?.note??item?.memo??"")
 +'</div></details>';
 openModal(item?"공구 수정":"새 공구 등록",fields,async data=>{
  const seller=sellerMap.get(data.sellerId);
  if(!seller)throw new Error("셀러를 검색한 뒤 아래 목록에서 선택하거나 신규 등록해주세요.");
  const prod=productById.get(data.productId);
  if(!prod)throw new Error("상품을 검색한 뒤 아래 목록에서 선택하거나 신규 등록해주세요.");
  if(!data.startDate||!data.endDate)throw new Error("공구 시작일과 종료일을 입력해주세요.");
  if(data.endDate<data.startDate)throw new Error("종료일이 시작일보다 빠릅니다.");
  if(data.followers&&(!Number.isFinite(Number(data.followers))||Number(data.followers)<0))throw new Error("팔로워 수는 0 이상의 숫자로 입력해주세요.");
  const oldProductLabel=String(item?.product||item?.productName||"").trim();
  const originalProductUnchanged=Boolean(item&&productCanonicalName(oldProductLabel,state.products)===prod.name);
  const savedProductLabel=originalProductUnchanged?oldProductLabel:prod.name;
  const record={
   sellerId:seller.id,sellerName:seller.name,
   productId:prod.id.startsWith("legacy:")?"":prod.id,
   product:savedProductLabel,productName:savedProductLabel,
   startDate:data.startDate,endDate:data.endDate,status:data.status,
   followers:data.followers?Number(data.followers):null,legacyCategory:data.legacyCategory,
   paymentWindow:data.paymentWindow.trim(),settlementRequest:data.settlementRequest.trim(),
   instagramUrl:data.instagramUrl.trim(),round:data.round.trim(),
   note:data.note.trim(),memo:data.note.trim(),event:data.event.trim(),
   updatedByUid:state.user.uid,updatedByName:state.staff?.name||state.user.email,updatedAt:serverTimestamp()
  };
  if(item)await updateDoc(doc(db,"groupbuys",item.id),record);
  else await addDoc(collection(db,"groupbuys"),{...record,source:"manual",createdByUid:state.user.uid,createdByName:state.staff?.name||state.user.email,createdAt:serverTimestamp()});
 });
 $("#modal").classList.add("buy-editor-modal");
 const readinessButton=$("#modal-fields [data-prep-from-editor]");
 if(readinessButton)readinessButton.addEventListener("click",()=>{
  if(!window.confirm("현재 수정 중 저장하지 않은 내용은 사라집니다. 오픈 준비 체크로 이동할까요?"))return;
  closeModal();preflightModal(item.id);
 });
 const form=$("#modal-form");
 const $m=id=>document.getElementById(id);
 const sellerInput=$m("seller-combo"),productInput=$m("product-combo");
 const fieldsValue=(name,value)=>{const el=form.elements.namedItem(name);if(el)el.value=value??"";};
 const sellerProfile=(sellerId,overwrite)=>{
  const seller=sellerMap.get(sellerId);
  if(!seller)return;
  const history=state.buys.filter(b=>b.sellerId===sellerId).sort((a,b)=>(b.endDate||"").localeCompare(a.endDate||""));
  const recent=history.find(b=>b.followers!=null&&b.followers!=="");
  const followers=seller.followerCountLatestRecorded??recent?.followers??"";
  const url=seller.instagramUrl||history.find(b=>b.instagramUrl)?.instagramUrl||"";
  if(overwrite){
   fieldsValue("followers",followers);
   fieldsValue("instagramUrl",url);
   const category=history.find(b=>b.legacyCategory)?.legacyCategory||"";
   fieldsValue("legacyCategory",category);
  }
  const info=$m("linked-seller-info");
  info.classList.remove("hidden");
  info.textContent="기존 공구 "+history.length+"건"+(history[0]?.endDate?" · 최근 종료 "+history[0].endDate:"");
 };
 const chooseSeller=id=>{
  const seller=sellerMap.get(id);if(!seller)return;
  selectedSellerId=id;$m("seller-id").value=id;sellerInput.value=seller.name;
  $m("seller-suggestions").classList.add("hidden");sellerInput.setAttribute("aria-expanded","false");
  sellerProfile(id,true);
 };
 const chooseProduct=id=>{
  const product=productById.get(id);if(!product)return;
  selectedProduct=product;$m("product-id").value=id;productInput.value=product.name;
  $m("product-suggestions").classList.add("hidden");productInput.setAttribute("aria-expanded","false");
 };
 const setupCombo=(input,dropdown,listFn,selectFn,onCreate,clearFn)=>{
  let currentItems=[],activeIndex=-1,composing=false;
  input.setAttribute("role","combobox");
  input.setAttribute("aria-controls",dropdown.id);
  input.setAttribute("aria-haspopup","listbox");
  const close=()=>{dropdown.classList.add("hidden");input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant");activeIndex=-1;};
  const highlight=(index)=>{
   if(!currentItems.length)return;
   activeIndex=Math.max(0,Math.min(currentItems.length-1,index));
   const buttons=[...dropdown.querySelectorAll("[data-combo-index]")];
   buttons.forEach((el,i)=>{el.classList.toggle("is-highlighted",i===activeIndex);el.setAttribute("aria-selected",String(i===activeIndex));});
   const selected=buttons[activeIndex];
   if(selected){input.setAttribute("aria-activedescendant",selected.id);selected.scrollIntoView({block:"nearest"});}
  };
  const choose=(index)=>{if(!currentItems[index])return;selectFn(currentItems[index].id);modalDirty=true;close();};
  const show=()=>{
   if(composing)return;
   const word=input.value.trim().toLocaleLowerCase();
   currentItems=listFn().filter(x=>x.name.toLocaleLowerCase().includes(word)||x.search?.toLocaleLowerCase().includes(word)).slice(0,30);
   activeIndex=-1;input.removeAttribute("aria-activedescendant");
   const matches=currentItems.map((x,i)=>'<button type="button" class="combo-option" role="option" aria-selected="false" tabindex="-1" id="'+dropdown.id+'-option-'+i+'" data-combo-index="'+i+'">'+h(x.name)+'</button>').join("");
   const heading=currentItems.length?matches:'<p class="combo-empty">검색 결과가 없습니다.</p>';
   dropdown.innerHTML=heading+'<button type="button" class="combo-create" data-combo-create>+ 새 '+(input===sellerInput?"셀러":"상품")+' 등록</button>';
   dropdown.classList.remove("hidden");input.setAttribute("aria-expanded","true");
   dropdown.querySelectorAll("[data-combo-index]").forEach(el=>{
    el.addEventListener("mousedown",e=>e.preventDefault());
    el.addEventListener("click",()=>choose(Number(el.dataset.comboIndex)));
   });
   dropdown.querySelector("[data-combo-create]").onclick=()=>{close();onCreate(input.value.trim());};
  };
  input.addEventListener("compositionstart",()=>{composing=true;});
  input.addEventListener("compositionend",()=>{composing=false;clearFn();show();});
  input.addEventListener("input",()=>{if(!composing){clearFn();show();}});
  input.addEventListener("focus",show);
  input.addEventListener("keydown",event=>{
   if(composing||event.isComposing)return;
   if(event.key==="Escape"&&!dropdown.classList.contains("hidden")){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key==="ArrowDown"||event.key==="ArrowUp"){
    event.preventDefault();if(dropdown.classList.contains("hidden"))show();
    highlight(activeIndex<0?(event.key==="ArrowDown"?0:currentItems.length-1):activeIndex+(event.key==="ArrowDown"?1:-1));return;
   }
   if(event.key==="Enter"&&!dropdown.classList.contains("hidden")){
    event.preventDefault();if(currentItems.length)choose(activeIndex<0?0:activeIndex);
   }
  });
  input.addEventListener("blur",()=>setTimeout(()=>{if(!dropdown.contains(document.activeElement))close();},150));
  dropdown.addEventListener("focusout",()=>setTimeout(()=>{if(document.activeElement!==input&&!dropdown.contains(document.activeElement))close();},0));
 };
 setupCombo(sellerInput,$m("seller-suggestions"),
  ()=>sellerSearchChoices,
  chooseSeller,name=>{$m("create-seller").classList.remove("hidden");$m("new-seller-name").value=name;$m("new-seller-name").focus();},
  ()=>{selectedSellerId="";$m("seller-id").value="";$m("linked-seller-info").classList.add("hidden");}
 );
 setupCombo(productInput,$m("product-suggestions"),
  ()=>productSearchChoices,
  chooseProduct,name=>{$m("create-product").classList.remove("hidden");$m("new-product-name").value=name;$m("new-product-name").focus();},
  ()=>{selectedProduct=null;$m("product-id").value="";}
 );
 $m("cancel-new-seller").onclick=()=>$m("create-seller").classList.add("hidden");
 $m("cancel-new-product").onclick=()=>$m("create-product").classList.add("hidden");
 $m("save-new-seller").onclick=async()=>{
  const button=$m("save-new-seller"),name=$m("new-seller-name").value.trim();
  if(button.disabled)return;
  if(!name)return notify("셀러명을 입력해주세요.");
  const handle=$m("new-seller-handle").value.trim();
  const dup=[...sellerMap.values()].find(x=>x.name===name||handle&&(x.instagramId===handle.replace(/^@/,"")||x.channel===handle));
  if(dup)return notify("이미 등록된 셀러입니다. 검색 목록에서 선택해주세요.");
  button.disabled=true;
  try{
   const record={name,channel:handle,instagramId:handle.replace(/^@/,""),instagramUrl:handle?"https://www.instagram.com/"+encodeURIComponent(handle.replace(/^@/,""))+"/":"",
     followerCountLatestRecorded:$m("new-seller-followers").value?Number($m("new-seller-followers").value):null,
     contact:$m("new-seller-contact").value.trim(),cycleDays:30,note:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
   const ref=await addDoc(collection(db,"sellers"),record);
   sellerMap.set(ref.id,{id:ref.id,...record});
   sellerSearchChoices.push({id:ref.id,name,search:[record.instagramId,record.channel,record.instagramUrl].filter(Boolean).join(" ")});
   sellerSearchChoices.sort((a,b)=>cmp(a.name,b.name));
   chooseSeller(ref.id);$m("create-seller").classList.add("hidden");
   notify("셀러가 등록되었습니다. 공구 입력을 이어서 진행하세요.");
  }catch(error){notify("셀러 등록 실패: "+error.message);}finally{button.disabled=false;}
 };
 $m("save-new-product").onclick=async()=>{
  const button=$m("save-new-product"),name=$m("new-product-name").value.trim();
  if(button.disabled)return;
  if(!name)return notify("상품명을 입력해주세요.");
  const archived=state.products.find(p=>p.active===false&&productCanonicalName(productLabel(p),state.products)===productCanonicalName(name,state.products));
  if(archived){notify("보관 중인 상품입니다. 상품 관리에서 먼저 복원해주세요.");return;}
  const canonical=productCanonicalName(name,state.products);
  const dup=products.get(canonical);if(dup){chooseProduct(dup.id);$m("create-product").classList.add("hidden");notify("기존 상품에 연결했습니다.");return;}
  button.disabled=true;
  try{
   const result=await addDoc(collection(db,"products"),{standardName:name,aliases:[],source:"manual",createdByUid:state.user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   const choice={id:result.id,name,search:""};products.set(name,choice);productById.set(choice.id,choice);productSearchChoices.push(choice);productSearchChoices.sort((a,b)=>cmp(a.name,b.name));chooseProduct(choice.id);
   $m("create-product").classList.add("hidden");
   notify("상품이 등록되었습니다. 공구 입력을 이어서 진행하세요.");
  }catch(error){notify("상품 등록 실패: "+error.message);}finally{button.disabled=false;}
 };
 if(selectedSellerId)sellerProfile(selectedSellerId,false);
}
function activityModal(sellerId=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다. Firebase 연결 후 이용해주세요.");return;}
 if(!state.sellers.length){notify("셀러를 먼저 등록해주세요.");return;}
 if(sellerId&&!state.sellers.some(s=>s.id===sellerId))return notify("연락할 셀러를 찾지 못했습니다.");
 const choices=state.sellers.map(s=>[s.id,String(s.name||"셀러 미확인")]).sort((a,b)=>a[1].localeCompare(b[1],"ko-KR",{numeric:true}));
 openModal("연락·영업 활동 기록",
 select("sellerId","셀러",choices,sellerId||choices[0][0])+select("type","활동 유형",[["카카오톡","카카오톡"],["전화","전화"],["DM","DM"],["미팅","미팅"],["이메일","이메일"],["기타","기타"]],"카카오톡")+f("contactOwner","담당자 이름","text",state.staff?.name||"",true)+f("nextFollowUpAt","다음 연락 예정일","date")+textarea("memo","활동 내용 (필수)"),
 async data=>{
 const seller=state.sellers.find(s=>s.id===data.sellerId);
 if(!seller||!data.memo.trim())throw new Error("셀러와 활동 내용을 입력해주세요.");
 if(!data.contactOwner?.trim())throw new Error("담당자 이름을 입력해주세요.");
 await addDoc(collection(db,"activities"),{sellerId:seller.id,sellerName:seller.name,type:data.type,contactOwner:data.contactOwner.trim(),memo:data.memo.trim(),nextFollowUpAt:data.nextFollowUpAt||null,actorUid:state.user.uid,actorName:state.staff?.name||state.user.email,createdAt:serverTimestamp()});
 });
}
function latestBuy(sellerId){
 return state.buys.filter(b=>b.sellerId===sellerId&&b.status!=="취소"&&b.endDate&&b.endDate<=todayLocal()).sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
}
function latestActivity(sellerId){
 return state.activities.filter(a=>a.sellerId===sellerId).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
}
const CONTACT_ACTIVITY_TYPES=new Set(["리마인드 완료","카카오톡","전화","DM","미팅","이메일"]);
function isSellerContactActivity(activity){
 return CONTACT_ACTIVITY_TYPES.has(String(activity?.type||"").trim());
}
let reminderCache=null;
function reminders(){
 const today=todayLocal();
 if(reminderCache&&reminderCache.sellers===state.sellers&&reminderCache.buys===state.buys&&
  reminderCache.activities===state.activities&&reminderCache.today===today)return reminderCache.result;
 const contactBySeller=new Map();
 for(const activity of state.activities){
  if(!activity.sellerId||!isSellerContactActivity(activity))continue;
  const prev=contactBySeller.get(activity.sellerId);
  if(!prev||(activity.createdAt?.seconds||0)>(prev.createdAt?.seconds||0))
   contactBySeller.set(activity.sellerId,activity);
 }
 const dueList=sellerGroups().map(group=>{
  const seller=group.selected;
  const buy=group.histories.filter(b=>b.status!=="취소"&&b.endDate&&b.endDate<=today)
   .sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
  const contact=[...group.ids].map(id=>contactBySeller.get(id)).filter(Boolean)
   .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
  const activityDate=contact?.createdAt?.toDate?.()?.toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"})||
   (contact?.createdAt?.seconds?new Date(contact.createdAt.seconds*1000).toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"}):"");
  const profileDue=String(group.members.map(member=>member.nextFollowUpAt||member.nextContactDate).find(Boolean)||"").trim();
  // Completed contact supersedes an already-due profile reminder, but not a later scheduled date.
  const nextDate=String(contact?.nextFollowUpAt||(!activityDate||profileDue>activityDate?profileDue:"")).trim();
  const manual=/^\d{4}-\d{2}-\d{2}$/.test(nextDate);
  const completedAfterBuy=Boolean(activityDate&&buy&&activityDate>=buy.endDate);
  if(!manual&&(!buy||completedAfterBuy))return null;
  const cycle=group.members.map(member=>Number(member.cycleDays)).find(n=>Number.isFinite(n)&&n>0)||30;
  const due=manual?nextDate:datePlus(buy.endDate,cycle);
  if(due>today)return null;
  return {seller,buy:buy||{product:"-",endDate:"-"},due,overdue:daysBetween(due,today)};
 }).filter(Boolean).sort((a,b)=>b.overdue-a.overdue||
  String(a.seller.name||"").localeCompare(String(b.seller.name||""),"ko-KR"));
 reminderCache={sellers:state.sellers,buys:state.buys,activities:state.activities,today,result:dueList};
 return dueList;
}
// In-app work alerts are actionable summaries, not push notifications or unread messages.
let workAlertsCache=null;
function currentWorkAlerts(){
 const today=todayLocal();
 if(workAlertsCache&&workAlertsCache.sellers===state.sellers&&workAlertsCache.buys===state.buys&&workAlertsCache.activities===state.activities&&workAlertsCache.today===today)return workAlertsCache.data;
 const opening=state.buys.filter(b=>b.id&&b.startDate===today&&b.status!=="취소");
 const preparation=prepAlerts(state.buys,today);
 const contact=reminders();
 const data={opening,preparation,contact,total:opening.length+preparation.length+contact.length};
 workAlertsCache={sellers:state.sellers,buys:state.buys,activities:state.activities,today,data};
 return data;
}
let workAlertEffectShown=false;
function updateWorkAlerts(){
 const button=$("#work-alert-button"),countEl=$("#work-alert-count"),list=$("#work-alert-list");
 if(!button||!countEl||!list||!state.user)return;
 const alerts=currentWorkAlerts(),count=alerts.total;
 countEl.textContent=count>99?"99+":String(count);
 countEl.classList.toggle("hidden",count===0);
 button.classList.toggle("has-alerts",count>0);
 button.setAttribute("aria-label",count?("업무 알림 "+count+"건 보기"):"업무 알림 없음");
 button.title=count?("오늘 오픈 "+alerts.opening.length+"건 · 준비 확인 "+alerts.preparation.length+"건 · 연락 필요 "+alerts.contact.length+"건"):"현재 확인할 업무 알림이 없습니다";
 if(count>0&&!workAlertEffectShown){
  workAlertEffectShown=true;
  button.classList.add("is-first-alert");
 }
 const section=(name,n,rows,view)=>{
  if(!n)return "";
  return '<section class="work-alert-group"><div class="work-alert-group-head"><strong>'+name+' <span>'+n+'</span></strong>'
   +'<button type="button" data-alert-view="'+view+'">전체 보기</button></div>'
   +'<div class="work-alert-group-rows">'+rows+'</div></section>';
 };
 const opening=alerts.opening.slice(0,3).map(b=>
  '<button type="button" class="work-alert-item" data-alert-edit="'+h(b.id)+'"><span class="work-alert-item-mark is-opening"></span>'
  +'<span><strong>'+h(b.sellerName||"셀러 미확인")+'</strong><small>'+h(b.product||b.productName||"상품 미확인")+' · 오늘 오픈</small></span></button>').join("");
 const preparation=alerts.preparation.slice(0,4).map(b=>
  '<button type="button" class="work-alert-item" data-alert-prep="'+h(b.id)+'"><span class="work-alert-item-mark is-preparation"></span>'
  +'<span><strong>'+h(b.sellerName||"셀러 미확인")+'</strong><small>'+h(prepDueLabel(b.daysUntil))+' · '+h(b.progress.recorded?"준비 "+b.progress.done+"/"+b.progress.total+"개 확인":"준비 확인 기록 없음")+'</small></span></button>').join("");
 const contact=alerts.contact.slice(0,3).map(x=>
  '<button type="button" class="work-alert-item" data-alert-contact="'+h(x.seller.id)+'"><span class="work-alert-item-mark is-contact"></span>'
  +'<span><strong>'+h(x.seller.name||"셀러 미확인")+'</strong><small>'+h(x.overdue>0?"연락 지연 "+x.overdue+"일":"오늘 연락 필요")+' · '+h(x.buy?.product||"후속 연락")+'</small></span></button>').join("");
 list.innerHTML=count?
  section("오늘 오픈",alerts.opening.length,opening,"schedule")
  +section("오픈 준비 확인",alerts.preparation.length,preparation,"dashboard-prep")
  +section("연락 필요",alerts.contact.length,contact,"reminders")
  :'<p class="work-alert-empty">현재 확인할 업무가 없습니다.</p>';
}
function closeWorkAlerts(){
 $("#work-alert-popover")?.classList.add("hidden");
 $("#work-alert-button")?.setAttribute("aria-expanded","false");
}
$("#work-alert-button")?.addEventListener("click",()=>{
 const pop=$("#work-alert-popover");
 if(!pop)return;
 const opening=pop.classList.contains("hidden");
 pop.classList.toggle("hidden",!opening);
 $("#work-alert-button").setAttribute("aria-expanded",String(opening));
});
$("#work-alert-close")?.addEventListener("click",closeWorkAlerts);
$("#work-alert-list")?.addEventListener("click",event=>{
 const button=event.target.closest("button");
 if(!button)return;
 const prepId=button.dataset.alertPrep,editId=button.dataset.alertEdit,contactId=button.dataset.alertContact,view=button.dataset.alertView;
 closeWorkAlerts();
 if(prepId)return preflightModal(prepId);
 if(editId){const buy=state.buys.find(b=>b.id===editId);if(buy)openBuyModalSafely(buy);return;}
 if(contactId)return activityModal(contactId);
 if(view==="dashboard-prep"){
  state.page="dashboard";state.dashboardPanelMode="tasks";render();
  $("#page-body .ops-major-prep")?.scrollIntoView({behavior:"smooth",block:"start"});
  return;
 }
 if(view==="schedule"||view==="reminders"){
  state.page=view;render();
 }
});
document.addEventListener("click",event=>{
 if(!event.target.closest(".work-alert-wrap"))closeWorkAlerts();
});
document.addEventListener("keydown",event=>{
 if(event.key==="Escape")closeWorkAlerts();
});
function metric(title,value,description){return '<div class="metric"><div class="label">'+title+'</div><div class="number">'+value+'</div><div class="sub">'+description+'</div></div>';}
function wrap(title,body,right=""){return '<div class="panel"><div class="panel-title"><h2>'+title+'</h2>'+right+'</div>'+body+'</div>';}
function table(headers,rows){return '<div class="table-wrap" tabindex="0" role="region" aria-label="데이터 목록, 필요한 경우 좌우 스크롤"><table><thead><tr>'+headers.map(v=>'<th scope="col">'+h(v)+'</th>').join("")+'</tr></thead><tbody>'+ (rows.length?rows.join(""):'<tr><td colspan="'+headers.length+'" class="empty">등록된 데이터가 없습니다.</td></tr>')+'</tbody></table></div>';}


function validCalendarMonth(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||""))&&value>="2010-01"&&value<="2035-12";}
function shownMonth(){return validCalendarMonth(state.selectedMonth)?state.selectedMonth:todayLocal().slice(0,7);}
function changeMonth(amount){const [y,m]=shownMonth().split("-").map(Number);const next=new Date(Date.UTC(y,m-1+amount,1)).toISOString().slice(0,7);if(next<"2010-01"||next>"2035-12")return;state.selectedMonth=next;state.calendarSelectedDate=null;state.weekStart=null;render();}
function weekStartFor(date){return datePlus(date,-new Date(date+"T00:00:00Z").getUTCDay());}
function activeWeekStart(){const month=shownMonth(),today=todayLocal();return state.weekStart||weekStartFor(month===today.slice(0,7)?today:month+"-01");}
function weekNavigation(delta){const next=datePlus(activeWeekStart(),7*delta),month=datePlus(next,3).slice(0,7);if(!validCalendarMonth(month))return;state.weekStart=next;state.selectedMonth=month;state.calendarSelectedDate=null;render();}
function calendarModeControls(){
 const weekly=state.calendarMode==="week",start=activeWeekStart();
 return '<div class="cal-display-controls"><div class="cal-mode-switch"><button type="button" data-calendar-mode="month" class="'+(!weekly?"selected":"")+'">월간</button><button type="button" data-calendar-mode="week" class="'+(weekly?"selected":"")+'">주간</button></div>'
 +(weekly?'<div class="cal-week-navigator"><button data-week-move="-1" type="button">‹</button><strong>'+h(start.slice(5))+' ~ '+h(datePlus(start,6).slice(5))+'</strong><button data-week-move="1" type="button">›</button></div>':"")+'</div>';
}
function monthlyBuys(){const m=shownMonth();return state.buys.filter(b=>b.startDate&&b.endDate&&b.startDate.slice(0,7)<=m&&b.endDate.slice(0,7)>=m).sort((a,b)=>a.startDate.localeCompare(b.startDate));}
function monthPicker(){
 return '<div class="month-controls"><div class="month-buttons"><button data-move="-1" aria-label="이전 달">‹</button><input id="selected-month" type="month" value="'+h(shownMonth())+'" min="2010-01" max="2035-12"/><button data-move="1" aria-label="다음 달">›</button><button data-move="0">이번 달</button></div></div>';
}
function scheduleStatus(b){
 // The manual lifecycle state is authoritative. Imported "기록" entries use dates.
 const stored=String(b.status||"").trim();
 if(stored==="취소")return "취소";
 if(stored==="완료")return "완료";
 if(stored==="예정")return "예정";
 if(stored==="진행중"||stored==="진행 중")return "진행 중";
 const today=todayLocal();
 return b.startDate>today?"예정":b.endDate<today?"완료":"진행 중";
}
function scheduleStatusChip(status){
 const key={"진행 중":"active","예정":"upcoming","완료":"completed","취소":"canceled"}[status]||"unknown";
 return '<span class="status schedule-status is-'+key+'">'+h(status)+'</span>';
}
function monthlyRows(list,detail=false){
 return list.map(b=>{
  const status=scheduleStatus(b);
  const common='<tr><td><button type="button" class="seller-cell" data-act="view-seller" data-id="'+h(b.sellerId)+'">'+h(b.sellerName||"미확인")+'</button></td><td>'+h(b.product||b.productName||"-")+'</td>';
  if(!detail)return common+'<td>'+h(b.startDate||"-")+'</td><td>'+h(b.endDate||"-")+'</td><td><span class="status '+(status==="진행 중"?"good":"")+'">'+status+'</span></td><td><button type="button" class="mini-button" data-act="edit-buy" data-id="'+h(b.id)+'">수정</button></td></tr>';
  const seller=state.sellers.find(x=>x.id===b.sellerId);
  const ig=b.instagramUrl||seller?.instagramUrl||"";
  const insta=ig.startsWith("https://")?'<a href="'+h(ig)+'" target="_blank" rel="noopener noreferrer">열기</a>':h(ig||"-");
  return common+'<td>'+h(b.followers??seller?.followerCountLatestRecorded??"-")+'</td><td>'+h(b.startDate||"-")+'</td><td>'+h(b.endDate||"-")+'</td><td>'+h(b.settlementRequest||"-")+'</td><td>'+h(b.paymentWindow||"-")+'</td><td>'+h(b.legacyCategory||"-")+'</td><td>'+insta+'</td><td>'+h(b.round||"-")+'</td><td class="ledger-notes">'+h(b.note||b.memo||"-")+'</td><td class="ledger-notes">'+h(b.event||"-")+'</td><td>'+scheduleStatusChip(status)+'</td><td><button data-act="edit-buy" data-id="'+h(b.id)+'" class="mini-button">수정</button></td></tr>';
 });
}

function calendarDateLabel(value){
 const [year,month,day]=value.split("-").map(Number);
 const week=["일","월","화","수","목","금","토"][new Date(Date.UTC(year,month-1,day)).getUTCDay()];
 return month+"월 "+day+"일 ("+week+")";
}
function monthGrid(list,options={}){
 const [y,m]=shownMonth().split("-").map(Number);
 const monthStart=shownMonth()+"-01";
 const monthEnd=datePlus(new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),0);
 const firstWeekStart=options.weekOnly?activeWeekStart():datePlus(monthStart,-new Date(Date.UTC(y,m-1,1)).getUTCDay());
 const lastWeekEnd=options.weekOnly?datePlus(firstWeekStart,6):datePlus(monthEnd,6-new Date(Date.UTC(y,m-1,new Date(Date.UTC(y,m,0)).getUTCDate())).getUTCDay());
 const allowed=list.filter(b=>b.id&&/^\d{4}-\d{2}-\d{2}$/.test(b.startDate||"")&&/^\d{4}-\d{2}-\d{2}$/.test(b.endDate||"")&&b.startDate<=b.endDate&&b.startDate<=lastWeekEnd&&b.endDate>=firstWeekStart&&(options.showCanceled||b.status!=="취소"));
 const maxVisible=options.connected?(options.weekOnly?7:4):(options.compact?3:(options.weekOnly?7:5));
 const today=todayLocal();
 const fallback=options.weekOnly?(today>=firstWeekStart&&today<=lastWeekEnd?today:firstWeekStart):(today.slice(0,7)===shownMonth()?today:monthStart);
 const requested=state.calendarSelectedDate||fallback;
 const selectedDate=options.selectDates&&state.dashboardPanelMode==="date"?
 (options.weekOnly?(requested>=firstWeekStart&&requested<=lastWeekEnd?requested:fallback):(requested.slice(0,7)===shownMonth()?requested:fallback)):null;
 let previousLocalLanes=new Map();
 const weekCount=Math.round(daysBetween(firstWeekStart,lastWeekEnd)+1)/7;
 const weeks=[];
 // Keep a stable lane throughout the month so a multi-day groupbuy stays visually connected.
 const connectedLanes=new Map();
 if(options.connected){
  const chronological=[...allowed].sort((a,b)=>a.startDate.localeCompare(b.startDate)||
   daysBetween(b.startDate,b.endDate)-daysBetween(a.startDate,a.endDate)||
   String(a.id).localeCompare(String(b.id)));
  const occupiedUntil=[];
  for(const entry of chronological){
   let lane=occupiedUntil.findIndex(end=>end<entry.startDate);
   if(lane<0)lane=occupiedUntil.length;
   occupiedUntil[lane]=entry.endDate;
   connectedLanes.set(entry.id,lane);
  }
 }
 const fmt=date=>date.slice(5).replace("-",".");
 for(let w=0;w<weekCount;w++){
  const weekStart=datePlus(firstWeekStart,w*7),weekEnd=datePlus(weekStart,6);
  // Each groupbuy is one horizontal bar for the intersecting portion of this week.
  const events=allowed.filter(b=>b.startDate<=weekEnd&&b.endDate>=weekStart).map(b=>({
    ...b,
    from:b.startDate>weekStart?b.startDate:weekStart,
    to:b.endDate<weekEnd?b.endDate:weekEnd
  })).sort((a,b)=>a.from.localeCompare(b.from)||daysBetween(b.from,b.to)-daysBetween(a.from,a.to)||String(a.sellerName).localeCompare(String(b.sellerName),"ko-KR"));
  const laneEnds=[];
  // Keep the preceding weekly lane for continuing bars wherever compact grid permits.
  const occupiedGlobalLanes=options.connected?[...new Set(events.map(e=>connectedLanes.get(e.id)))].sort((a,b)=>a-b):[];
  const localLaneByGlobal=new Map(),usedLocal=new Set();
  if(options.connected){
   for(const e of events.filter(e=>e.startDate<weekStart)){
    const global=connectedLanes.get(e.id),prior=previousLocalLanes.get(e.id);
    if(prior!=null&&prior<occupiedGlobalLanes.length&&!usedLocal.has(prior)&&!localLaneByGlobal.has(global)){
     localLaneByGlobal.set(global,prior);usedLocal.add(prior);
    }
   }
   for(const global of occupiedGlobalLanes){
    if(localLaneByGlobal.has(global))continue;
    let lane=0;while(usedLocal.has(lane))lane++;
    localLaneByGlobal.set(global,lane);usedLocal.add(lane);
   }
  }
  for(const e of events){
   let lane=options.connected?localLaneByGlobal.get(connectedLanes.get(e.id)):laneEnds.findIndex(last=>last<e.from);
   if(lane==null||lane<0)lane=laneEnds.length;
   laneEnds[lane]=e.to;e.lane=lane;
  }
  previousLocalLanes=new Map(events.filter(e=>e.endDate>weekEnd).map(e=>[e.id,e.lane]));
  const weekId=weekStart;
  const expanded=!!state.expandedCalendarWeeks[weekId],visible=expanded?laneEnds.length:Math.min(maxVisible,laneEnds.length);
  const hasMore=laneEnds.length>maxVisible,footer=hasMore?28:8;
  const height=options.connected?(36+Math.max(visible,1)*36+footer):(options.compact?38:44)+Math.max(visible,1)*(options.compact?34:42)+(options.compact?27:34);
  const dayCells=Array.from({length:7},(_,day)=>{
   const date=datePlus(weekStart,day),inMonth=date.slice(0,7)===shownMonth();
   const count=allowed.filter(b=>b.startDate<=date&&b.endDate>=date).length;
   const selectDate=options.selectDates===true;
   return '<button type="button" class="cal-bg-day cal-day-add '+(!inMonth?'cal-outside ':'')+(date===today?'cal-today ':'')+(date===selectedDate?'cal-selected':'')+'" '+(selectDate?'aria-pressed="'+(date===selectedDate)+'" ':'')+(date===today?'aria-current="date" ':'')+'style="grid-column:'+(day+1)+';grid-row:1 / -1" '+(selectDate?'data-calendar-date':'data-calendar-add')+'="'+h(date)+'" title="'+h(date)+(selectDate?' 공구 보기':' 공구 등록')+'" aria-label="'+h(date)+(selectDate?' 날짜 공구 보기':' 날짜에 공구 등록')+'"><span class="cal-date-head"><b>'+Number(date.slice(-2))+'</b>'+(count?'<small>'+count+'건</small>':'')+'</span></button>';
  }).join("");
  const bars=events.filter(e=>e.lane<visible).map(e=>{
   const startCol=daysBetween(weekStart,e.from)+1,span=daysBetween(e.from,e.to)+1;
   const startOfEvent=e.from===e.startDate,endOfEvent=e.to===e.endDate;
   const tip=(e.sellerName||"미확인")+" · "+(e.product||e.productName||"상품 미확인")+" ("+e.startDate+" ~ "+e.endDate+")";
   const sellerLabel=e.sellerName||"셀러 미확인",productLabel=e.product||e.productName||"상품 미확인";
   const progress=scheduleStatus(e);
   const progressClass=progress==="진행 중"?"cal-range-active":progress==="예정"?"cal-range-upcoming":progress==="취소"?"cal-range-canceled":"cal-range-completed";
   return '<button type="button" class="cal-range '+progressClass+' '+(startOfEvent?'cal-range-start ':'cal-range-continue ')+(endOfEvent?'cal-range-end':'')+'" data-act="edit-buy" data-id="'+h(e.id)+'" style="grid-column:'+startCol+' / span '+span+';grid-row:'+(e.lane+2)+'" title="'+h(tip)+'" aria-label="'+h(tip+" · "+progress)+'"><span class="cal-range-copy"><strong>'+h(sellerLabel)+'</strong><span>'+h(productLabel)+'</span></span></button>';
  }).join("");
  const hiddenCount=events.filter(e=>e.lane>=maxVisible).length;
  const more=hasMore?'<button type="button" class="cal-expand" style="grid-column:1 / -1;grid-row:'+(visible+2)+'" data-expand-week="'+weekId+'" aria-expanded="'+expanded+'">'+(expanded?'접기':'+'+hiddenCount+'건 더보기')+'</button>':'';
  weeks.push('<section class="cal-week-row'+(options.compact?' cal-week-compact':'')+(options.connected?' cal-week-connected':'')+'" style="--cal-row-height:'+height+'px;--cal-visible-rows:'+Math.max(visible,1)+';--cal-footer:'+footer+'px" aria-label="'+fmt(weekStart)+'부터 '+fmt(weekEnd)+'까지">'+dayCells+bars+more+'</section>');
 }
 return '<div class="cal-scroll" data-calendar-key="'+h(state.page+"-"+firstWeekStart+"-"+lastWeekEnd)+'" role="region" aria-label="공구 캘린더" tabindex="0"><div class="cal-weekdays">'+["일","월","화","수","목","금","토"].map(d=>'<div class="cal-week">'+d+'</div>').join("")+'</div><div class="cal-weeks">'+weeks.join("")+'</div></div>';
}

function sampleDate(days){return datePlus(todayLocal(),days);}
function enterPreview(){
 if(MAINTENANCE_MODE){showMaintenance();return;}
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
 const today=todayLocal(),yearStart=today.slice(0,4)+'-01-01';
 return state.sellers.map(s=>{
  const buys=state.buys.filter(b=>b.sellerId===s.id&&b.status!=="취소"&&b.endDate&&b.endDate<=today);
  if(!buys.length)return null;
  const last=[...buys].sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
  const gap=daysBetween(last.endDate,today);
  if(last.endDate<yearStart)return null;
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
 const today=todayLocal(),rem=reminders();
 const valid=state.buys.filter(b=>b.status!=="취소"&&b.startDate&&b.endDate);
 const running=valid.filter(b=>b.startDate<=today&&b.endDate>=today);
 const opening=valid.filter(b=>b.startDate===today);
 const upcoming=valid.filter(b=>b.startDate>today).sort((a,b)=>a.startDate.localeCompare(b.startDate));
 const comingWeek=valid.filter(b=>b.startDate>=today&&b.startDate<=datePlus(today,6));
 const kpis='<div class="metrics metrics-dashboard">'
  +metric("오늘 오픈",opening.length,"오늘 시작하는 공구")
  +metric("진행 중",running.length,"현재 판매 중인 공구")
  +metric("7일 내 오픈",comingWeek.length,"오늘 포함, 일주일")
  +metric("연락 필요",rem.length,"후속 연락 확인 대상")
  +'</div>';
 const itemRow=item=>'<div class="ops-work-row">'
  +'<div class="ops-work-label">'+h(item.category)+'</div>'
  +'<div class="ops-work-description"><strong>'+h(item.seller)+'</strong><span>'+h(item.product)+'</span><small>'+h(item.meta)+'</small></div>'
  +'<button type="button" class="ops-work-action" data-act="'+h(item.action)+'" data-id="'+h(item.id)+'">'+h(item.label)+'</button>'
  +'</div>';
 const tasks=[
  ...opening.map(b=>({category:"오늘 오픈",seller:b.sellerName||"미확인",product:b.product||b.productName||"상품 미확인",meta:"종료 "+b.endDate.slice(5).replace("-","."),action:"edit-buy",id:b.id,label:"공구 확인"})),
  ...rem.map(x=>({category:x.overdue>0?"연락 지연":"연락 필요",seller:x.seller.name,product:x.buy?.product||"후속 연락",meta:"연락 기준일 "+(x.due||"-"),action:"contact",id:x.seller.id,label:"연락 기록"}))
 ];
 const activeTasks=state.dashboardTaskFilter==="opening"?tasks.filter(t=>t.action==="edit-buy"):
  state.dashboardTaskFilter==="contact"?tasks.filter(t=>t.action==="contact"):tasks;
 const taskFilters='<div class="ops-task-filters" role="group" aria-label="오늘 업무 필터">'
  +[["all","전체",tasks.length],["opening","오늘 오픈",opening.length],["contact","연락 필요",rem.length]]
   .map(([key,label,count])=>'<button type="button" data-dashboard-task="'+key+'" aria-pressed="'+(state.dashboardTaskFilter===key)+'" class="'+(state.dashboardTaskFilter===key?"selected":"")+'">'+label+' <span>'+count+'</span></button>').join("")
  +'</div>';
 const taskPanel=wrap("오늘 처리할 업무",
  '<p class="ops-panel-summary">오늘 오픈 '+opening.length+'건 · 연락 확인 '+rem.length+'건</p>'
  +taskFilters+'<div class="ops-work-list">'
  +(activeTasks.slice(0,6).map(itemRow).join("")||'<div class="dash-empty">해당 조건의 업무가 없습니다.</div>')+'</div>'
  +(activeTasks.length>6?'<p class="ops-more-note">우선 확인할 6건을 표시하고 있습니다.</p>':""),
  '<button type="button" class="panel-link" data-nav="reminders">연락 대상 보기</button>');
 const futureItems=upcoming.slice(0,3).map(b=>({
  category:b.startDate.slice(5).replace("-",".")+" 오픈",
  seller:b.sellerName||"미확인",product:b.product||b.productName||"상품 미확인",
  meta:"종료 "+b.endDate.slice(5).replace("-","."),
  action:"edit-buy",id:b.id,label:"공구 확인"
 }));
 const nextPanel=wrap("다가오는 공구",
  '<p class="ops-panel-summary">가까운 오픈 일정부터 표시합니다.</p><div class="ops-work-list">'
  +(futureItems.map(itemRow).join("")||'<div class="dash-empty">예정된 공구가 없습니다.</div>')+'</div>',
  '<button type="button" class="panel-link" data-nav="schedule">전체 일정 보기</button>');

 const preparation=prepAlerts(state.buys,today);
 const prepRows=preparation.slice(0,8).map(b=>{
  const prep=b.readiness||{};
  return '<div class="prep-dashboard-row">'
   +'<span class="prep-dashboard-due">'+h(prepDueLabel(b.daysUntil))+'</span>'
   +'<div class="prep-dashboard-description"><strong>'+h(b.sellerName||"셀러 미확인")+'</strong>'
   +'<span>'+h(b.product||b.productName||"상품 미확인")+'</span>'
   +'<small>담당자 '+h(prep.ownerName||"미지정")+' · '+h(b.progress.recorded?'준비 '+b.progress.done+'/'+b.progress.total+'개 확인':'준비 확인 기록 없음')+'</small></div>'
   +'<button type="button" class="prep-dashboard-open" data-prep-open="'+h(b.id)+'">준비 확인</button></div>';
 }).join("");
 const prepPanel='<section class="ops-major-section ops-major-prep">'
  +'<div class="ops-major-head"><div><h2>오픈 준비 확인</h2><p>오픈 3일 전부터 구성표·홍보물·결제 링크 등의 준비 여부를 확인합니다.</p></div>'
  +'<span class="prep-dashboard-count">확인 필요 '+preparation.length+'건</span></div>'
  +(preparation.length?'<div class="prep-dashboard-list">'+prepRows+'</div>'
  +(preparation.length>8?'<p class="prep-dashboard-more">우선 확인할 8건을 표시합니다. 전체 일정은 공구 일정에서 확인할 수 있습니다.</p>':""):
    '<p class="prep-dashboard-empty">현재 오픈 3일 이내에 준비 확인이 필요한 공구가 없습니다.</p>')
  +'</section>';
 const calendar='<section class="ops-major-section ops-major-calendar">'
  +'<div class="ops-major-head"><div><h2>공구 캘린더</h2><p>공구 일정은 시작일부터 종료일까지 이어집니다.</p></div>'
  +'<button type="button" class="panel-link" data-nav="schedule">전체 공구 일정</button></div>'
  +'<div class="ops-calendar-controls">'+monthPicker()+calendarModeControls()+'</div>'
  +'<div class="ops-calendar-legend"><span>선택한 달 '+monthlyBuys().filter(b=>b.status!=="취소").length+'건</span>'
  +'<span class="ops-legend-item"><i class="is-active"></i>진행 중</span>'
  +'<span class="ops-legend-item"><i class="is-upcoming"></i>예정</span>'
  +'<span class="ops-legend-item"><i class="is-past"></i>완료</span>'
  +'<span class="ops-calendar-hint">날짜 선택 후 오른쪽에서 확인</span></div>'
  +monthGrid(valid,{connected:true,weekOnly:state.calendarMode==="week",selectDates:true})
  +'</section>';
 const month=shownMonth(),week=activeWeekStart();
 const fallbackDate=state.calendarMode==="week"
  ?(today>=week&&today<=datePlus(week,6)?today:week):
    (month===today.slice(0,7)?today:month+"-01");
 const requestedDate=state.calendarSelectedDate||fallbackDate;
 const selectedDate=state.calendarMode==="week" && (requestedDate<week||requestedDate>datePlus(week,6)) ? fallbackDate :
  state.calendarMode==="month" && requestedDate.slice(0,7)!==month ? fallbackDate : requestedDate;
 const selectedBuys=valid.filter(b=>b.startDate<=selectedDate&&b.endDate>=selectedDate)
  .sort((a,b)=>Number(b.startDate===selectedDate)-Number(a.startDate===selectedDate)||a.startDate.localeCompare(b.startDate)||String(a.sellerName||"").localeCompare(String(b.sellerName||""),"ko-KR"));
 const selectedRows=selectedBuys.map(b=>{
  const label=b.startDate===selectedDate?(selectedDate===today?"오늘 오픈":"오픈"):b.endDate===selectedDate?"종료":scheduleStatus(b);
  return '<div class="flow-date-event">'
   +'<div class="flow-date-event-copy"><strong>'+h(b.sellerName||"셀러 미확인")+'</strong>'
   +'<span>'+h(b.product||b.productName||"상품 미확인")+'</span>'
   +'<small>'+h(b.startDate.slice(5).replace("-","."))+' ~ '+h(b.endDate.slice(5).replace("-","."))+' · '+h(label)+'</small></div>'
   +'<button type="button" class="flow-date-event-action" data-act="edit-buy" data-id="'+h(b.id)+'">수정</button></div>';
 }).join("");
 const datePanel='<div class="flow-date-panel">'
  +'<div class="flow-date-header"><div><strong>'+h(calendarDateLabel(selectedDate))+'</strong>'
  +'<span>해당 날짜 공구 '+selectedBuys.length+'건</span></div>'
  +'<button type="button" class="flow-date-add" data-calendar-add="'+h(selectedDate)+'">공구 등록</button></div>'
  +'<div class="flow-date-list">'+(selectedRows||'<p class="flow-date-empty">선택한 날짜에 등록된 공구가 없습니다.</p>')+'</div>'
  +""
  +'</div>';
 const showDate=state.dashboardPanelMode==="date";
 const sideTabs='<div class="flow-side-tabs" role="group" aria-label="대시보드 오른쪽 보기">'
  +'<button type="button" data-dashboard-side="tasks" aria-pressed="'+(!showDate)+'" class="'+(!showDate?'selected':'')+'">오늘 업무 <span>'+tasks.length+'</span></button>'
  +'<button type="button" data-dashboard-side="date" aria-pressed="'+showDate+'" class="'+(showDate?'selected':'')+'">선택 날짜 <span>'+selectedBuys.length+'</span></button>'
  +'</div>';
 const recent=state.activities.slice(0,3).map(a=>'<div class="activity-row"><div><strong>'+h(a.sellerName||"셀러 미확인")+'</strong><p>'+h(a.type||"활동")+' · '+h(a.memo||"")+'</p></div><small>'+h(dt(a.createdAt))+'</small></div>').join("");
 const activity='<section class="ops-major-section ops-major-activity">'
  +'<div class="ops-major-head"><div><h2>최근 업무 기록</h2><p>팀원들이 등록한 활동 내역입니다.</p></div>'
  +'<button type="button" class="panel-link" data-nav="activity">전체 기록 보기</button></div>'
  +'<div class="ops-activity-list">'+(recent||'<div class="dash-empty">기록된 활동이 없습니다.</div>')+'</div></section>';
 return (state.demo?'<div class="demo-alert">미리보기 데이터이며 실제 업무 정보가 아닙니다.</div>':"")
  +'<div class="dashboard-v4 dashboard-v5"><div class="dashboard-intro">'
  +'<div><strong>'+h(calendarDateLabel(today))+'</strong><span>오늘 처리할 공구와 연락 업무를 확인하세요.</span></div>'
  +'<div class="dashboard-intro-actions"><button type="button" data-quick="seller">셀러 등록</button><button type="button" data-quick="activity">연락 기록</button></div>'
  +'</div><section class="dashboard-overview" aria-label="오늘의 주요 지표">'
  +kpis+'</section>'
  +'<div class="dashboard-primary-grid">'
  +'<div class="dashboard-primary-calendar">'+calendar+'</div>'
  +'<aside class="dashboard-primary-aside" aria-label="오늘 업무와 선택 날짜 공구">'
  +'<div class="flow-side-main">'+sideTabs+(showDate?datePanel:taskPanel)+'</div>'
  +nextPanel+'</aside></div>'
  + '<div class="dashboard-secondary-grid">'+prepPanel+activity+'</div></div>';
}

function masterProductName(product){
 return String(product?.standardName||product?.productName||product?.name||"").trim();
}
// Build the product summary once for each Firestore snapshot, not once per row or search keystroke.
let productIndexCache=null;
function productIndex(){
 const today=todayLocal();
 if(productIndexCache&&productIndexCache.day===today&&productIndexCache.products===state.products&&
    productIndexCache.buys===state.buys&&productIndexCache.sellers===state.sellers)
    return productIndexCache;
 const canonicalCache=new Map();
 const canonical=value=>{
   const raw=String(value??"").trim();
   if(!canonicalCache.has(raw))canonicalCache.set(raw,productCanonicalName(raw,state.products));
   return canonicalCache.get(raw);
 };
 const groups=new Map(),stats=new Map(),sellerById=new Map(state.sellers.map(x=>[x.id,x]));
 const monthly=new Map(),monthlyStarted=new Map(),uniqueSellerIds=new Set();
 let totalBuys=0,lastYearBuys=0;
 const lastYearDate=datePlus(today,-365);
 const getStats=name=>{
   if(!stats.has(name))stats.set(name,{count:0,sellers:new Set(),last:"-",aliases:new Set()});
   return stats.get(name);
 };
 for(const product of state.products){
  const original=masterProductName(product),name=canonical(original);
  if(!name)continue;
  if(!groups.has(name))groups.set(name,{name,members:[],aliases:new Set()});
  const g=groups.get(name);
  g.members.push(product);
  if(original!==name)g.aliases.add(original);
  for(const alias of product.aliases||[]){
    const label=String(alias||"").trim();
    if(label&&label!==name)g.aliases.add(label);
  }
 }
 for(const b of state.buys){
  const raw=String(b.product||b.productName||"").trim(),name=canonical(raw);
  if(!name)continue;
  if(groups.has(name)&&raw!==name)groups.get(name).aliases.add(raw);
  if(b.status==="취소")continue;
  totalBuys++;
  const sellerKey=sellerIdentity(sellerById.get(b.sellerId),b);
  uniqueSellerIds.add(sellerKey);
  if(b.startDate){const month=b.startDate.slice(0,7);monthly.set(month,(monthly.get(month)||0)+1);if(/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)&&b.startDate<=today){monthlyStarted.set(month,(monthlyStarted.get(month)||0)+1);if(b.startDate>=lastYearDate)lastYearBuys++;}}
  const stat=getStats(name);
  stat.count++;
  stat.sellers.add(sellerKey);
  if(b.endDate&&b.endDate>stat.last)stat.last=b.endDate;
 }
 const computed=[...groups.values()].map(g=>{
  const primary=g.members.find(p=>masterProductName(p)===g.name)||g.members[0];
  const active=g.members.some(p=>p.active!==false);
  return {...g,primary,active,aliases:[...g.aliases].sort((a,b)=>a.localeCompare(b,"ko-KR")),
   searchText:[g.name,...g.aliases,...g.members.flatMap(p=>[p.brand,p.category,p.supplier])].filter(Boolean).join(" ").toLocaleLowerCase()};
 });
 productIndexCache={day:today,products:state.products,buys:state.buys,sellers:state.sellers,groups:computed,stats,monthly,monthlyStarted,totalBuys,lastYearBuys,uniqueSellerCount:uniqueSellerIds.size};
 return productIndexCache;
}
function productStats(product){
 const name=productCanonicalName(masterProductName(product),state.products);
 const result=productIndex().stats.get(name);
 return {count:result?.count||0,sellers:result?.sellers.size||0,last:result?.last||"-"};
}
function productModal(product=null){
 if(state.demo){notify("미리보기에서 상품을 저장할 수 없습니다.");return;}
 const title=product?"상품 정보 수정":"새 상품 등록";
 const fields=f("standardName","상품명","text",masterProductName(product),true,true)
  +f("brand","브랜드","text",product?.brand||"")
  +f("category","카테고리","text",product?.category||"")
  +f("supplier","공급사","text",product?.supplier||"")
  +f("productUrl","상품 링크","url",product?.productUrl||"",false,true)
  +textarea("aliases","기존 상품 표기 (줄바꿈으로 구분)",(product?.aliases||[]).join("\n"))
  +textarea("notes","상품 메모",product?.notes||"");
 openModal(title,fields,async data=>{
  const name=data.standardName.trim();
  if(!name)throw Error("상품명을 입력해주세요.");
  const dup=state.products.find(p=>p.id!==product?.id&&masterProductName(p).toLocaleLowerCase()===name.toLocaleLowerCase());
  if(dup)throw Error("동일한 이름의 상품이 이미 등록되어 있습니다.");
  const aliases=[...new Set((data.aliases||"").split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&x!==name))];
  const record={standardName:name,brand:data.brand.trim(),category:data.category.trim(),aliases,
   supplier:data.supplier.trim(),productUrl:data.productUrl.trim(),notes:data.notes.trim(),
   updatedAt:serverTimestamp(),updatedByUid:state.user.uid,
   updatedByName:state.staff?.name||state.user.email};
  if(product)await updateDoc(doc(db,"products",product.id),record);
  else await addDoc(collection(db,"products"),{...record,source:"manual",active:true,
    createdAt:serverTimestamp(),createdByUid:state.user.uid});
 });
}
function setProductActive(id,active){
 if(state.demo){notify("미리보기에서는 변경할 수 없습니다.");return;}
 const product=state.products.find(p=>p.id===id);
 if(!product)return notify("상품을 찾을 수 없습니다.");
 const label=masterProductName(product);
 const message=active?
  "‘"+label+"’ 상품을 다시 목록에 표시할까요?":
  "‘"+label+"’ 상품을 보관 처리할까요? 기존 공구 거래 이력은 그대로 유지됩니다.";
 if(!confirm(message))return;
 updateDoc(doc(db,"products",id),{
  active,updatedAt:serverTimestamp(),updatedByUid:state.user.uid,
  updatedByName:state.staff?.name||state.user.email
 }).then(()=>notify(active?"상품이 복원되었습니다.":"상품이 보관되었습니다."))
 .catch(e=>notify("변경 실패: "+e.message));
}
function productMasterGroups(){
 return productIndex().groups;
}
function productGroupToggle(canonical,active){
 if(state.demo)return notify("미리보기에서는 변경할 수 없습니다.");
 const group=productMasterGroups().find(g=>g.name===canonical);
 if(!group)return notify("상품을 찾을 수 없습니다.");
 const message=active?("휴지통의 ‘"+canonical+"’ 상품을 복원할까요?"):("‘"+canonical+"’ 상품을 휴지통으로 이동할까요? 상품 정보와 기존 공구 이력은 삭제되지 않으며 언제든 복원할 수 있습니다.");
 if(!confirm(message))return;
 Promise.all(group.members.map(p=>updateDoc(doc(db,"products",p.id),{
  active,deletedAt:active?null:serverTimestamp(),deletedByUid:active?null:state.user.uid,
  updatedAt:serverTimestamp(),updatedByUid:state.user.uid,
  updatedByName:state.staff?.name||state.user.email
 }))).then(()=>notify(active?"상품이 복원되었습니다.":"상품을 휴지통으로 이동했습니다."))
  .catch(e=>notify("상품 상태 변경 중 오류: "+e.message));
}
// The display family is separate from original products and groupbuy history.
// A reviewer can merge a family into another representative, or split a single source product.
function productFamilyModal(canonical){
 const group=productMasterGroups().find(g=>g.name===canonical);
 if(!group)return notify("상품 정보를 찾지 못했습니다.");
 const sourceMap=new Map(group.members.map(p=>[masterProductName(p),p]));
 const counts=new Map();
 for(const buy of state.buys){
  if(buy.status==="취소")continue;
  const raw=String(buy.product||buy.productName||"").trim();
  if(productCanonicalName(raw,state.products)!==canonical)continue;
  counts.set(raw,(counts.get(raw)||0)+1);
 }
 const variations=[...new Set([canonical,...group.aliases,...sourceMap.keys(),...counts.keys()])]
  .filter(Boolean).sort((a,b)=>a.localeCompare(b,"ko-KR",{numeric:true}));
 const rows=variations.map(name=>{
  const source=sourceMap.get(name);
  const available=Boolean(source)&&group.members.length>1&&name!==canonical;
  return '<tr><td><strong>'+h(name)+'</strong></td><td>'+(counts.get(name)||0)+'건</td><td>'+
   (available?'<button type="button" class="mini-button" data-split-product="'+h(source.id)+'">분리</button>':
   '<span class="muted">'+(source?"대표":"기존 표기")+'</span>')+'</td></tr>';
 });
 const choices=productMasterGroups().filter(g=>g.name!==canonical&&g.active)
  .sort((a,b)=>a.name.localeCompare(b.name,"ko-KR",{numeric:true}))
  .map(g=>'<option value="'+h(g.name)+'">'+h(g.name)+'</option>').join("");
 const fields='<div class="full insight-summary"><span>대표 상품</span><strong>'+h(canonical)+'</strong>'+
  '<p>등록 상품 '+group.members.length+'개 · 기존 판매 구성 '+variations.length+'개 · 공구 이력 '+[...counts.values()].reduce((a,b)=>a+b,0)+'건</p></div>'+
  '<div class="full product-family-detail"><strong>판매 구성 및 기존 표기</strong>'+
  table(["상품명 · 판매 구성","공구 이력","관리"],rows)+
  '<p class="panel-note">판매 구성이 달라도 대표 상품 아래에서 함께 조회합니다. 원래 상품명과 공구 기록은 수정되지 않습니다. 분리는 등록 상품에만 적용됩니다.</p></div>'+
  '<label class="full">다른 대표 상품으로 통합<select name="targetFamily"><option value="">대표 상품 선택</option>'+choices+'</select></label>'+
  '<p class="full panel-note">대표 상품을 선택하고 통합하면 이 묶음의 등록 상품이 대상 대표 상품 아래로 이동합니다. 원본 데이터는 유지됩니다.</p>';
 openModal("대표 상품 및 판매 구성",fields,async data=>{
  if(state.demo)throw Error("미리보기에서는 변경할 수 없습니다.");
  const target=String(data.targetFamily||"");
  if(!target||target===canonical)throw Error("통합할 다른 대표 상품을 선택해주세요.");
  if(!productMasterGroups().some(g=>g.name===target&&g.active))throw Error("통합 대상 상품을 다시 확인해주세요.");
  if(!confirm("‘"+canonical+"’ 묶음을 ‘"+target+"’ 대표 상품 아래로 통합할까요? 기존 공구 기록은 유지됩니다."))throw Error("통합이 취소되었습니다.");
  // Keep historical-only labels connected even if an old groupbuy has no product record.
  const primaryId=group.primary.id;
  await Promise.all(group.members.map(p=>{
   const record={groupName:target,groupOverride:true,updatedAt:serverTimestamp(),
    updatedByUid:state.user.uid,updatedByName:state.staff?.name||state.user.email};
   if(p.id===primaryId)record.aliases=[...new Set([...(p.aliases||[]),...group.aliases]
    .map(x=>String(x||"").trim()).filter(x=>x&&x!==masterProductName(p)))];
   return updateDoc(doc(db,"products",p.id),record);
  }));
 });
 const submit=$("#modal-form button[type=submit]");
 if(submit)submit.textContent="선택한 대표 상품에 통합";
 $("#modal-fields").querySelectorAll("[data-split-product]").forEach(button=>button.addEventListener("click",async()=>{
  if(state.demo)return notify("미리보기에서는 변경할 수 없습니다.");
  const product=group.members.find(p=>p.id===button.dataset.splitProduct);
  if(!product)return notify("원본 상품을 찾지 못했습니다.");
  const original=masterProductName(product);
  if(!confirm("‘"+original+"’ 상품을 ‘"+canonical+"’ 묶음에서 분리할까요? 과거 공구 기록은 그대로 유지됩니다."))return;
  button.disabled=true;
  try{
   await updateDoc(doc(db,"products",product.id),{
    groupName:original,groupOverride:true,updatedAt:serverTimestamp(),
    updatedByUid:state.user.uid,updatedByName:state.staff?.name||state.user.email
   });
   closeModal();notify("상품 구성을 분리했습니다.");
  }catch(err){notify("분리 실패: "+(err?.message||"다시 시도해주세요."));button.disabled=false;}
 }));
}
// Non-destructive audit of the names currently loaded from Firestore.
// Review suggestions only: no automatic merge of unlike SKUs.
let productAuditCache=null;
function productAuditCandidates(){
 const index=productIndex();
 if(productAuditCache?.index===index)return productAuditCache.groups;
 const groups=index.groups.filter(g=>g.active);
 const compact=name=>String(name||"").toLocaleLowerCase().replace(/[\s._·-]/g,"");
 const stripped=name=>compact(name)
  .replace(/\([^)]*\)/g,"")
  .replace(/[+&\/].*$/,"")
  .replace(/(?:\d+종|\d+개|\d+팩|\d+세트|세트|구성|묶음|추가)$/,"");
 const matches=[];
 for(let i=0;i<groups.length;i++){
  const a=groups[i],ca=compact(a.name),sa=stripped(a.name);
  for(let j=i+1;j<groups.length;j++){
   const b=groups[j],cb=compact(b.name),sb=stripped(b.name);
   if(!ca||!cb)continue;
   let reason="",level=0;
   if(ca===cb){reason="표기·띄어쓰기 차이";level=3;}
   else if(sa===sb&&sa.length>=3){reason="세트·구성 차이";level=2;}
   else{
    const [short,long]=ca.length<=cb.length?[ca,cb]:[cb,ca];
    const remainder=long.slice(short.length);
    if(short.length>=3&&long.startsWith(short)&&
      /^(?:\d+종|\d+개|\d+팩|\d+세트|세트|구성|[+&\/(]|맛|추가)/.test(remainder)){
      reason="동일 계열 가능성";level=1;
    }
   }
   if(level)matches.push({a:i,b:j,reason,level});
  }
 }
 const parent=groups.map((_,i)=>i);
 const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 for(const m of matches){const a=find(m.a),b=find(m.b);if(a!==b)parent[b]=a;}
 const clusters=new Map();
 for(const m of matches){
  const root=find(m.a);
  if(!clusters.has(root))clusters.set(root,{ids:new Set(),level:0,reasons:new Set()});
  const c=clusters.get(root);
  c.ids.add(m.a);c.ids.add(m.b);
  c.level=Math.max(c.level,m.level);c.reasons.add(m.reason);
 }
 const result=[...clusters.values()].map(c=>{
  const members=[...c.ids].map(i=>groups[i]).sort((a,b)=>a.name.localeCompare(b.name,"ko-KR",{numeric:true}));
  return {members,level:c.level,reasons:[...c.reasons],primary:members[0].name};
 }).sort((a,b)=>b.members.length-a.members.length||b.level-a.level||a.primary.localeCompare(b.primary,"ko-KR"));
 productAuditCache={index,groups:result};
 return result;
}
function productAuditPage(){
 const candidates=productAuditCandidates();
 const rows=candidates.map(c=>{
  const detail=c.members.map(g=>'<button type="button" class="product-audit-link" data-audit-family="'+h(g.name)+'">'+h(g.name)+'</button>').join(" · ");
  return '<tr><td><strong>'+h(c.primary)+'</strong><small class="product-alias">'+c.members.length+'개 상품명</small></td>'+
    '<td>'+detail+'</td><td>'+h(c.reasons.join(" / "))+'</td></tr>';
 });
 return wrap("유사 상품 검토 · "+candidates.length+"개 그룹",
  '<p class="panel-description">현재 등록된 상품명 전체를 비교한 검토 후보입니다. 띄어쓰기와 판매 구성 차이를 표시하며, 다른 상품일 가능성이 있어 자동 통합하지 않습니다. 각 상품명을 누르면 구성 관리에서 대표 상품으로 통합할 수 있습니다.</p>'+
  (candidates.length?table(["대표 검토명","중복 의심 상품명","판단 근거"],rows):
  '<div class="empty">현재 기준으로 발견된 유사 상품 후보가 없습니다.</div>'));
}
function productWorkspaceTabs(){
 return '<div class="product-view-tabs" role="group" aria-label="상품 관리 보기">'+
  [["list","상품 목록"],["audit","유사 상품 검토"],["insights","상품 인사이트"]].map(([key,label])=>
   '<button type="button" data-product-view="'+key+'" aria-pressed="'+(state.productView===key)+'" class="'+(state.productView===key?"selected":"")+'">'+label+'</button>').join("")+'</div>';
}
function productWorkspacePage(){
 return '<div class="product-workspace">'+productWorkspaceTabs()+(state.productView==="insights"?productInsightsPage():state.productView==="audit"?productAuditPage():productsPage())+'</div>';
}
// Brand-level list groups multiple distinct products without changing historical records.
// Apply the same brand-first view to EVERY registered product. Explicit brand data
// takes precedence; where it is blank, use only repeated, distinctive name roots.
// One-off names remain their own product family instead of being assigned a false brand.
let brandGroupCache=null;
const PRESET_BRAND_ROOTS=["김미떡","강금옥","가쉬"];
const GENERIC_NAME_ROOTS=new Set(["수제","프리미엄","국내산","고급","특가","한정","정품","세트","선물","공구","신상","대용량","소용량","리뉴얼","NEW","더","THE","오늘","우리","맛있는","건강한","유기농","오리지널"]);
function brandRootCandidates(groups){
 const rootMap=new Map();
 const add=(root,original,priority=1)=>{
  const key=String(root||"").trim();
  if(key.length<2||GENERIC_NAME_ROOTS.has(key.toUpperCase())||GENERIC_NAME_ROOTS.has(key))return;
  const set=rootMap.get(key)||new Set();set.add(original);rootMap.set(key,set);
 };
 for(const group of groups){
  const name=String(group.name||"").trim();
  if(!name)continue;
  // Ignore optional product descriptors and use a recurring leading token as a family hint.
  const token=name.split(/[\s(+/&·,_]/u)[0].trim();
  if(token.length>=2&&token!==name)add(token,name);
  for(const product of group.members){
   const brand=String(product.brand||"").trim();
   if(brand)add(brand,name,3);
  }
 }
 const validated=[...rootMap].filter(([root,names])=>names.size>=2)
  .map(([root])=>root).sort((a,b)=>b.length-a.length||a.localeCompare(b,"ko-KR"));
 return [...new Set([...PRESET_BRAND_ROOTS,...validated])];
}
function productBrandName(group,roots){
 const configured=group.members.map(p=>String(p.brand||"").trim()).find(Boolean);
 if(configured)return configured;
 const name=String(group.name||"").trim(),compact=name.replace(/\s+/g,"");
 for(const root of roots){
  if(name===root||compact===root)return root;
  if(name.startsWith(root+" ")||name.startsWith(root+"(")||name.startsWith(root+"+")||name.startsWith(root+"/")||name.startsWith(root+"&"))return root;
  if(compact.startsWith(root)&&PRESET_BRAND_ROOTS.includes(root))return root;
 }
 // An unclassified product is still presented in the same clickable master/detail flow.
 return name;
}
function brandProductGroups(){
 const index=productIndex();
 if(brandGroupCache?.index===index)return brandGroupCache.groups;
 const originals=index.groups;
 const roots=brandRootCandidates(originals);
 const byName=new Map();
 for(const group of originals){
  const name=productBrandName(group,roots);
  if(!byName.has(name))byName.set(name,{name,products:[],members:[],aliases:new Set(),sellers:new Set(),count:0,last:"-",active:false,inferred:false});
  const item=byName.get(name);
  item.products.push(group);
  item.members.push(...group.members);
  item.active=item.active||group.active;
  item.aliases.add(group.name);
  if(name!==group.name)item.inferred=true;
  for(const alias of group.aliases)item.aliases.add(alias);
  const stats=index.stats.get(group.name);
  if(stats){
   item.count+=stats.count;
   for(const seller of stats.sellers)item.sellers.add(seller);
   if(stats.last>item.last)item.last=stats.last;
  }
 }
 const computed=[...byName.values()].map(item=>({
  ...item,aliases:[...item.aliases],
  searchText:[item.name,...item.aliases,...item.members.flatMap(p=>[p.brand,p.category,p.supplier])].filter(Boolean).join(" ").toLocaleLowerCase()
 }));
 brandGroupCache={index,groups:computed};
 return computed;
}
function brandProductModal(name){
 const brand=brandProductGroups().find(b=>b.name===name);
 if(!brand)return notify("브랜드 정보를 찾지 못했습니다.");
 const rows=brand.products.sort((a,b)=>a.name.localeCompare(b.name,"ko-KR",{numeric:true})).map(group=>{
  const st=productIndex().stats.get(group.name),count=st?.count||0;
  return '<tr><td><strong>'+h(group.name)+'</strong>'+(group.aliases.length?'<small class="product-alias">판매 구성 '+group.aliases.length+'개</small>':"")+'</td>'+
  '<td><button type="button" class="insight-seller-count" data-family-sellers="'+h(group.name)+'" aria-label="'+h(group.name)+' 진행 셀러 보기">'+(st?.sellers.size||0)+'명</button></td><td>'+count+'건</td><td>'+
  '<button type="button" class="mini-button" data-brand-family="'+h(group.name)+'">구성 보기</button> '+
  '<button type="button" class="mini-button" data-brand-edit="'+h(group.primary.id)+'">수정</button> '+
  '<button type="button" class="mini-button" data-brand-toggle="'+h(group.name)+'">'+(group.active?'보관':'복원')+'</button></td></tr>';
 });
 const fields='<div class="full insight-summary"><span>브랜드 / 대표 상품군</span><strong>'+h(brand.name)+'</strong>'+
  '<p>상품 '+brand.products.length+'종 · 진행 셀러 '+brand.sellers.size+'명 · 공구 이력 '+brand.count+'건</p></div>'+
  '<div class="full product-family-detail"><strong>상품별 구성 및 이력</strong>'+
  '<p class="panel-description">상품을 선택하면 기존 상품명과 판매 구성을 상세히 확인할 수 있습니다.</p>'+
  table(["상품명","진행 셀러","공구 이력","상세"],rows)+
  '<p class="panel-note">브랜드별 집계이며 과거 판매 구성과 원본 공구 데이터는 변경되지 않습니다.</p></div>';
 openModal("브랜드 상세",fields,async()=>{});
 const save=$("#modal-form button[type=submit]");if(save)save.classList.add("hidden");
 $("#modal-fields").querySelectorAll("[data-brand-family]").forEach(btn=>btn.addEventListener("click",()=>productFamilyModal(btn.dataset.brandFamily)));
 $("#modal-fields").querySelectorAll("[data-family-sellers]").forEach(btn=>btn.addEventListener("click",()=>showProductInsightSellers(btn.dataset.familySellers)));
 $("#modal-fields").querySelectorAll("[data-brand-edit]").forEach(btn=>btn.addEventListener("click",()=>{
  const product=state.products.find(p=>p.id===btn.dataset.brandEdit);
  if(product)productModal(product);
 }));
 $("#modal-fields").querySelectorAll("[data-brand-toggle]").forEach(btn=>btn.addEventListener("click",()=>{
  const group=productMasterGroups().find(g=>g.name===btn.dataset.brandToggle);
  if(group){closeModal();productGroupToggle(group.name,!group.active);}
 }));
}
function productsPage(){
 const groups=brandProductGroups();
 const q=state.productSearch.trim().toLocaleLowerCase();
 const filtered=groups.filter(g=>{
  if(state.productStatus==="active"&&!g.active)return false;
  if(state.productStatus==="archived"&&g.active)return false;
  return !q||g.searchText.includes(q);
 }).sort((a,b)=>{
  if(state.productSort==="frequency")return b.count-a.count||a.name.localeCompare(b.name,"ko-KR",{numeric:true});
  if(state.productSort==="sellers")return b.sellers.size-a.sellers.size||a.name.localeCompare(b.name,"ko-KR",{numeric:true});
  if(state.productSort==="recent")return String(b.last||"").localeCompare(String(a.last||""))||a.name.localeCompare(b.name,"ko-KR",{numeric:true});
  return a.name.localeCompare(b.name,"ko-KR",{numeric:true});
 });
 const countActive=groups.filter(g=>g.active).length;
 const countArchived=groups.length-countActive;
 const controls='<div class="product-toolbar"><input id="product-search" type="search" aria-label="상품명, 기존 표기, 브랜드 검색" placeholder="상품명, 기존 표기, 브랜드 검색" value="'+h(state.productSearch)+'"/>'+
 '<div class="product-filters">'+[["active","운영 상품 ("+countActive+")"],["archived","휴지통 ("+countArchived+")"],["all","전체 ("+groups.length+")"]]
 .map(([key,label])=>'<button type="button" data-product-status="'+key+'" aria-pressed="'+(state.productStatus===key)+'" class="'+(state.productStatus===key?"selected":"")+'">'+label+'</button>').join("")+'</div></div>';
 const sortUi='<label class="ops-product-sort">정렬<select id="product-sort" aria-label="브랜드 목록 정렬">'
  +[["name","브랜드 이름순"],["frequency","공구 이력 많은순"],["sellers","진행 셀러 많은순"],["recent","최근 공구순"]]
   .map(([key,label])=>'<option value="'+key+'" '+(state.productSort===key?"selected":"")+'>'+label+'</option>').join("")
  +'</select></label>';
 const pageSize=60,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
 state.productPage=Math.min(pageCount,Math.max(1,state.productPage));
 const from=(state.productPage-1)*pageSize;
 const rows=filtered.slice(from,from+pageSize).map(g=>{
  const stats={sellers:g.sellers.size,count:g.count,last:g.last},inactive=!g.active;
  return '<tr><td><button type="button" class="product-brand-name" data-brand-detail="'+h(g.name)+'">'+h(g.name)+'</button>'+(inactive?'<span class="product-archive-label">휴지통</span>':'')+
   '<small class="product-alias">'+g.products.length+'개 상품 · '+g.aliases.length+'개 구성·기존 표기</small>'+'</td>'+
   '<td>'+h(g.products.length+'종')+'</td><td><button type="button" class="insight-seller-count" data-brand-sellers="'+h(g.name)+'" aria-label="'+h(g.name)+' 진행 셀러 '+stats.sellers+'명 보기">'+stats.sellers+'명</button></td>'+
   '<td>'+stats.count+'건</td><td>'+h(stats.last)+'</td><td>'+
   '<button type="button" class="mini-button" data-brand-detail="'+h(g.name)+'">상세 보기</button></td></tr>';
 });
 return wrap("브랜드 목록 · "+filtered.length+"건",
  '<p class="panel-description">전 상품을 브랜드·대표 상품군 기준으로 표시합니다. 명확한 브랜드 정보가 없는 상품도 상세 보기에서 개별 구성과 이력을 확인할 수 있습니다. 브랜드명 추정은 원본 데이터를 변경하지 않습니다.</p>'+
  controls+'<div class="ops-product-results"><span>조회 결과 '+filtered.length+'개 브랜드</span>'+sortUi+'</div>'+table(["브랜드 / 대표 상품군","상품 수","진행 셀러","공구 이력","최근 종료일","관리"],rows)+
  (pageCount>1?'<div class="product-pagination"><span>'+(from+1)+'–'+Math.min(filtered.length,from+pageSize)+' / '+filtered.length+'건</span><div><button type="button" data-product-page="-1" '+(state.productPage===1?"disabled":"")+'>이전</button><strong>'+state.productPage+' / '+pageCount+'</strong><button type="button" data-product-page="1" '+(state.productPage===pageCount?"disabled":"")+'>다음</button></div></div>':""));
}
function productInsightSellers(productName,asBrand=false){
 const sellersById=new Map(state.sellers.map(s=>[s.id,s]));
 const brand=asBrand?brandProductGroups().find(g=>g.name===productName):null;
 const names=brand?new Set(brand.products.map(g=>g.name)):null;
 const records=state.buys.filter(b=>b.status!=="취소"&&(names?names.has(productCanonicalName(b.product||b.productName,state.products)):productCanonicalName(b.product||b.productName,state.products)===productName));
 const grouped=new Map();
 for(const b of records){
  const seller=sellersById.get(b.sellerId);
  const key=sellerIdentity(seller,b);
  if(!grouped.has(key))grouped.set(key,{
   sellerId:b.sellerId||null,name:seller?.name||b.sellerName||"미확인",
   names:new Set(),instagram:seller?.instagramUrl||seller?.instagramId||seller?.channel||b.instagramUrl||"",
   count:0,last:"",latestStart:"",history:[]
  });
  const row=grouped.get(key);
  row.names.add(b.sellerName||row.name);
  row.count++;row.history.push(b);
  if((b.endDate||"")>row.last){row.last=b.endDate;row.latestStart=b.startDate||"";}
 }
 const list=[...grouped.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"ko-KR"));
 return {list,records:records.length};
}
function showProductInsightSellers(productName,asBrand=false){
 // Query the in-memory Firestore snapshot once. Search and export reuse the result.
 const data=productInsightSellers(productName,asBrand);
 const brand=asBrand?brandProductGroups().find(g=>g.name===productName):null;
 const aliases=brand?brand.aliases.filter(n=>n!==productName):productDisplayAliases(productName,state.products,state.buys);
 const fields='<div class="full insight-summary"><span>'+(asBrand?'브랜드 / 대표 상품군':'상품명')+'</span><strong>'+h(productName)+'</strong>'+
   '<p>진행 셀러 '+data.list.length+'명 · 공구 이력 '+data.records+'건</p>'+
   (aliases.length?'<p>통합 표기: '+h(aliases.join(" · "))+'</p>':"")+'</div>'+
   '<div class="full insight-list-toolbar"><input id="insight-seller-search" type="search" placeholder="셀러명, 예전 셀러명, 인스타그램 검색" autocomplete="off" aria-label="상품 진행 셀러 검색"/>'+
   '<span id="insight-seller-count">'+data.list.length+'명</span>'+
   '<button id="insight-seller-export" class="secondary" type="button">CSV 내보내기</button></div>'+
   '<div class="full insight-seller-table" id="insight-seller-results"></div>'+
   '<p class="full panel-note">셀러명을 누르면 해당 셀러의 전체 공구 이력을 볼 수 있습니다. CSV는 현재 검색된 목록 기준입니다.</p>';
 openModal(asBrand?"브랜드 전체 진행 셀러":"상품 전체 진행 셀러",fields,async()=>{});
 const form=$("#modal-form"),save=form.querySelector('[type="submit"]');
 if(save)save.classList.add("hidden");
 const input=$("#insight-seller-search"),count=$("#insight-seller-count"),out=$("#insight-seller-results");
 let filtered=data.list;
 const bindRows=()=>{
  out.querySelectorAll('[data-act="view-seller"]').forEach(button=>button.addEventListener("click",()=>{
   const id=button.dataset.id;
   if(!state.sellers.some(x=>x.id===id)){notify("셀러 정보를 찾을 수 없습니다.");return;}
   closeModal();openSellerPopup(id);
  }));
 };
 const draw=()=>{
  const q=input.value.trim().toLocaleLowerCase();
  filtered=data.list.filter(x=>!q||[x.name,...x.names,x.instagram].join(" ").toLocaleLowerCase().includes(q));
  count.textContent=filtered.length+'명';
  const rows=filtered.map(x=>'<tr><td>'+(x.sellerId?'<button class="insight-product-link" type="button" data-act="view-seller" data-id="'+h(x.sellerId)+'">'+h(x.name)+'</button>':'<strong>'+h(x.name)+'</strong>')+
   (x.names.size>1?'<small class="seller-alias">'+h([...x.names].filter(n=>n!==x.name).join(" · "))+'</small>':"")+
   '</td><td>'+x.count+'건</td><td>'+h(x.last||"-")+'</td><td>'+h(x.latestStart||"-")+'</td></tr>');
  out.innerHTML=table(["셀러명","진행 횟수","최근 종료일","최근 시작일"],rows);
  bindRows();
 };
 input.addEventListener("input",draw);
 $("#insight-seller-export").addEventListener("click",()=>{
  if(state.demo)return notify("미리보기 데이터는 내보낼 수 없습니다.");
  if(!filtered.length){notify("내보낼 셀러가 없습니다.");return;}
  const headings=["상품명","셀러명","기존 셀러명","인스타그램","공구 횟수","최근 시작일","최근 종료일","셀러 ID"];
  const records=filtered.map(x=>[productName,x.name,[...x.names].join(" / "),x.instagram,x.count,x.latestStart,x.last,x.sellerId||""]);
  const csvCell=value=>{
   let text=String(value??"");
   if(/^\s*[=+\-@\t\r]/.test(text))text="'"+text;
   return '"'+text.replace(/"/g,'""')+'"';
  };
  const csv="\uFEFF"+[headings,...records].map(row=>row.map(csvCell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;
  a.download="S2H_"+productName.replace(/[\\/:*?"<>|]/g,"_")+"_진행셀러_"+todayLocal()+".csv";
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  notify(filtered.length+"명의 셀러 목록을 내려받았습니다.");
 });
 draw();
}
function insightMonthSeries(index,today){
 const [year,month]=today.slice(0,7).split("-").map(Number);
 return Array.from({length:12},(_,i)=>{
  const key=new Date(Date.UTC(year,month-1-11+i,1)).toISOString().slice(0,7);
  return {key,count:index.monthlyStarted.get(key)||0};
 });
}
function productInsightsPage(){
 const index=productIndex(),today=todayLocal();
 const all=[...index.stats.entries()].map(([name,p])=>({name,...p}));
 const aliasesByName=new Map(index.groups.map(g=>[g.name,g.aliases]));
 const query=state.insightSearch.trim().toLocaleLowerCase();
 const filtered=all.filter(p=>!query||[p.name,...(aliasesByName.get(p.name)||[])].join(" ").toLocaleLowerCase().includes(query))
  .sort((a,b)=>(state.insightSort==="sellers"?b.sellers.size-a.sellers.size:state.insightSort==="recent"?String(b.last).localeCompare(String(a.last)):b.count-a.count)||b.count-a.count||a.name.localeCompare(b.name,"ko-KR"));
 const pageSize=15,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
 state.insightPage=Math.min(pageCount,Math.max(1,state.insightPage));
 const offset=(state.insightPage-1)*pageSize;
 const maxCount=Math.max(1,...filtered.map(p=>p.count));
 const rows=filtered.slice(offset,offset+pageSize).map((p,i)=>{
  const aliasCount=(aliasesByName.get(p.name)||[]).length;
  return '<tr><td class="insight-rank">'+(offset+i+1)+'</td><td><button type="button" class="insight-product-link" data-insight-product="'+h(p.name)+'">'+h(p.name)+'</button>'+
   (aliasCount?'<small class="insight-alias-count">기존 표기 '+aliasCount+'종 통합</small>':'')+
   '</td><td><div class="insight-volume"><strong>'+p.count+'건</strong><span class="insight-volume-track" aria-hidden="true"><i style="width:'+(p.count/maxCount*100).toFixed(2)+'%"></i></span></div></td><td><button type="button" class="insight-seller-count" data-insight-product="'+h(p.name)+'">'+p.sellers.size+'명 보기</button></td><td>'+h(p.last||"-")+'</td></tr>';
 });
 const controls='<div class="insight-ranking-toolbar"><input type="search" id="insight-search" aria-label="상품 인사이트 검색" placeholder="상품명 또는 기존 표기 검색" value="'+h(state.insightSearch)+'"/><label>정렬<select id="insight-sort" aria-label="상품 성과 정렬">'+
  [["count","공구 횟수순"],["sellers","참여 셀러순"],["recent","최근 종료일순"]].map(([key,label])=>'<option value="'+key+'" '+(state.insightSort===key?"selected":"")+'>'+label+'</option>').join("")+'</select></label></div>';
 const ranking=controls+'<div class="insight-result-count">조회 결과 '+filtered.length+'개 상품</div>'+table(["순위","상품명","공구 횟수","참여 셀러","최근 종료일"],rows)+
  (pageCount>1?'<div class="seller-pagination insight-pagination"><span>'+(offset+1)+'–'+Math.min(filtered.length,offset+pageSize)+' / '+filtered.length+'개</span><div><button type="button" class="secondary" data-insight-page="-1" '+(state.insightPage===1?"disabled":"")+'>이전</button><span>'+state.insightPage+' / '+pageCount+'</span><button type="button" class="secondary" data-insight-page="1" '+(state.insightPage===pageCount?"disabled":"")+'>다음</button></div></div>':"");
 const series=insightMonthSeries(index,today),peak=Math.max(1,...series.map(x=>x.count));
 const sum=series.reduce((a,b)=>a+b.count,0);
 const trend='<p class="panel-description">'+h(series[0].key)+' ~ '+h(series[11].key)+' · 시작일이 오늘까지 도래한 공구 '+sum+'건</p>'+
  '<div class="insight-chart-scroll" role="region" aria-label="월별 공구 건수" tabindex="0"><div class="insight-chart">'+series.map((m,i)=>
   '<div class="insight-chart-column'+(i===11?' is-current':'')+'" aria-label="'+h(m.key)+' '+m.count+'건"><strong>'+m.count+'</strong><div class="insight-chart-track"><i style="height:'+(m.count/peak*100).toFixed(2)+'%"></i></div><span>'+h(m.key.slice(2).replace("-","."))+'</span></div>').join("")+'</div></div>'+
  (!sum?'<p class="insight-no-data">해당 기간에 집계된 공구 기록이 없습니다.</p>':'');
 return '<div class="insight-workspace"><div class="metrics insight-metrics">'+metric("공구 기록 상품",all.length,"공구 이력이 있는 상품")+
  metric("전체 공구 이력",index.totalBuys,"상품명 확인 · 취소 제외")+
  metric("참여 셀러",index.uniqueSellerCount,"중복 제외")+
  metric("최근 365일",index.lastYearBuys,"시작일 기준 · 오늘까지")+'</div>'+
  wrap("월별 공구 추이",trend)+wrap("상품별 공구 현황",ranking)+
  '<p class="panel-note">상품명이 있는 취소 제외 공구 기록 기준이며 매출 실적이 아닙니다. 월별 추이는 최근 12개 달의 시작일이 도래한 기록을 집계합니다. 최근 365일 지표와 집계 기간이 다를 수 있습니다. 미래 일정은 전체 이력과 상품별 순위에 포함됩니다.</p></div>';
}
function opportunitiesPage(){
 const rows=opportunitiesData().map(x=>'<tr><td><strong>'+h(x.seller.name)+'</strong></td><td>'+h(x.last.product)+'</td><td>'+x.count+'회</td><td>'+h(x.last.endDate)+'</td><td>'+x.gap+'일</td><td><span class="status '+(x.rank<=1?"alert":"")+'">'+h(x.level)+'</span></td><td><button class="mini-button" data-act="contact" data-id="'+h(x.seller.id)+'">연락 기록</button></td></tr>');
 return wrap("재접촉 대상",'<p class="panel-description">90일 이상 공백, 180일 이상+3회 진행, 365일 장기 공백 등 기획서 초기 규칙 기반의 참고 분류입니다.</p>'+table(["셀러","최근 상품","공구 횟수","최근 종료","공백","분류","액션"],rows));
}
function proposalsPage(){
 return wrap("제안 파이프라인 · 준비 중",'<div class="pipeline-preview">'+["제안 준비","제안 완료","답변 대기","협의 중","일정 확정"].map((v,i)=>'<div><span class="pipeline-step">'+(i+1)+'</span><strong>'+v+'</strong><small>데이터 연동 예정</small></div>').join("")+'</div><p class="panel-note">현재 제안 DB는 아직 연결되지 않았습니다. 건수와 성과를 임의로 표시하지 않습니다.</p>');
}
let sellerGroupCache=null;
let filteredSellerCache=null;
function sellerLastActivityIndex(){
 const map=new Map();
 for(const activity of state.activities){
  if(!activity.sellerId)continue;
  const current=map.get(activity.sellerId);
  if(!current||(activity.createdAt?.seconds||0)>(current.createdAt?.seconds||0))map.set(activity.sellerId,activity);
 }
 return map;
}
function sellerGroups(){
 if(sellerGroupCache&&sellerGroupCache.sellers===state.sellers&&sellerGroupCache.buys===state.buys)
   return sellerGroupCache.groups;
 const groups=new Map(),histories=new Map();
 for(const seller of state.sellers){
  const key=sellerIdentity(seller);
  if(!groups.has(key))groups.set(key,{id:key,members:[],histories:[]});
  groups.get(key).members.push(seller);
  histories.set(seller.id,key);
 }
 for(const b of state.buys){
  const key=histories.get(b.sellerId);
  if(key)groups.get(key).histories.push(b);
 }
 const result=[...groups.values()].map(group=>{
  const members=group.members.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const selected=members[0],ids=new Set(members.map(x=>x.id));
  const recent=[...group.histories].sort((a,b)=>(b.endDate||"").localeCompare(a.endDate||""))[0]||null;
  const names=[...new Set(members.map(m=>m.name).filter(Boolean))];
  const sortedByUpdated=[...members].sort((x,y)=>(y.updatedAt?.seconds||0)-(x.updatedAt?.seconds||0));
  const valueFrom=(key)=>sortedByUpdated.map(member=>String(member[key]||"").trim()).find(Boolean)||"";
  const contact=valueFrom("contact");
  const channel=valueFrom("instagramUrl")||valueFrom("instagramId")||valueFrom("channel");
  return {...group,selected,ids,names,recent,contact,channel};
 });
 sellerGroupCache={sellers:state.sellers,buys:state.buys,groups:result};
 return result;
}
function matchingSellerGroup(sellerId){
 return sellerGroups().find(g=>g.ids.has(sellerId))||null;
}
// Internal seller sharing: the URL contains only an ID. Data is still protected by
// Firebase Authentication and the existing active-staff Firestore rules.
function sellerProfileUrl(id){
 const url=new URL(window.location.href);
 url.hash="seller="+encodeURIComponent(id);
 return url.href;
}
// KakaoTalk proposal composer: draft first, copy explicitly, save a CRM activity only on request.
function proposalMessage(sellerName,product,start,end){
 const recipient=String(sellerName||"").trim();
 const productName=String(product||"").trim();
 const dateLabel=start&&end?
  start.replace(/-/g,".")+" ~ "+end.replace(/-/g,".") :
  start?start.replace(/-/g,".")+"부터 (종료일 협의)":
  end?"~ "+end.replace(/-/g,".")+" (시작일 협의)":"상호 협의";
 return "안녕하세요, "+recipient+"님.\nS2H입니다.\n\n"+
  "이번에 ["+productName+"] 상품의 공동구매 진행을 제안드리고자 연락드립니다.\n\n"+
  "희망 진행 기간은 "+dateLabel+"이며, 상세 일정과 운영 조건은 협의를 통해 조율하고자 합니다.\n\n"+
  "상품에 관심 있으시거나 진행 가능 여부를 검토해 보실 수 있다면 편하게 회신 부탁드립니다.\n감사합니다.\nS2H 드림";
}
function sellerProposalModal(sellerId){
 const group=matchingSellerGroup(sellerId);
 if(!group)return notify("셀러 정보를 찾지 못했습니다.");
 const options=productMasterGroups().filter(g=>g.active).sort((a,b)=>a.name.localeCompare(b.name,"ko-KR",{numeric:true}));
 if(!options.length)return notify("제안할 운영 상품이 없습니다. 상품관리에서 먼저 상품을 등록해주세요.");
 const seller=group.selected;
 const fields='<div class="full proposal-intro"><strong>'+h(seller.name)+'님께 보낼 공구 제안</strong>'+
  '<p>제안 상품과 희망 기간을 선택하면 카카오톡에 보낼 문구가 자동으로 작성됩니다. 복사만으로는 실제 발송되거나 CRM에 저장되지 않습니다.</p></div>'+
  '<label class="full">상품 검색<input id="proposal-product-search" type="search" placeholder="상품명 검색" autocomplete="off"/></label>'+
  '<label class="full">제안 상품<select id="proposal-product" name="proposalProduct" required>'+
  '<option value="">상품을 선택해주세요</option>'+
  options.map(g=>'<option value="'+h(g.name)+'">'+h(g.name)+'</option>').join("")+'</select></label>'+
  '<label>희망 시작일<input type="date" id="proposal-start" name="proposalStart"/></label>'+
  '<label>희망 종료일<input type="date" id="proposal-end" name="proposalEnd"/></label>'+
  '<label class="full">카카오톡 제안 문구<textarea id="proposal-message" name="proposalMessage" rows="10" placeholder="상품을 선택하면 제안 문구가 생성됩니다. 직접 수정할 수 있습니다." required></textarea></label>'+
  '<div class="full proposal-actions"><button type="button" class="secondary" id="proposal-copy">카톡 문구 복사</button><button type="button" class="secondary" id="proposal-regenerate">문구 다시 생성</button>'+
  '<span class="proposal-status" id="proposal-status" aria-live="polite">제안 상품을 먼저 선택해주세요.</span></div>'+
  '<label class="full proposal-confirm"><input type="checkbox" name="proposalConfirmed" value="yes" required/><span>셀러에게 실제로 제안 문구를 전달했습니다.</span></label>'+
  '<p class="full panel-note">희망 기간은 확정된 공구 일정이 아닙니다. 복사만으로 제안 기록이 저장되지 않습니다.</p>';
 openModal("공구 제안하기",fields,async data=>{
  if(state.demo)throw Error("미리보기에서는 기록을 저장할 수 없습니다.");
  const product=String(data.proposalProduct||"").trim();
  const message=String(data.proposalMessage||"").trim();
  if(!product||!options.some(g=>g.name===product))throw Error("제안 상품을 선택해주세요.");
  if(data.proposalStart&&data.proposalEnd&&data.proposalEnd<data.proposalStart)throw Error("종료일이 시작일보다 빠릅니다.");
  if(!message)throw Error("제안 문구를 입력해주세요.");
  if(data.proposalConfirmed!=="yes")throw Error("실제 제안 전달 여부를 확인해주세요.");
  if(draftStale)throw Error("상품 또는 기간 변경 후 문구를 다시 생성하거나 수정해주세요.");
  await addDoc(collection(db,"activities"),{
   sellerId:seller.id,sellerName:seller.name,type:"공구 제안",
   product,proposedStartDate:data.proposalStart||null,proposedEndDate:data.proposalEnd||null,
   proposalStatus:"제안 기록",contactOwner:state.staff?.name||state.user.email,
   memo:message,actorUid:state.user.uid,actorName:state.staff?.name||state.user.email,
   createdAt:serverTimestamp()
  });
 });
 const submit=$("#modal-form button[type=submit]");
 if(submit)submit.textContent="제안 기록 저장";
 const product=$("#proposal-product"),start=$("#proposal-start"),end=$("#proposal-end"),
  message=$("#proposal-message"),copy=$("#proposal-copy"),status=$("#proposal-status");
 let manualDraft=false,draftStale=false;
 const confirmField=$("#modal-fields input[name=proposalConfirmed]");
 const resetConfirm=()=>{if(confirmField)confirmField.checked=false;};
 const regenerate=()=>{
  resetConfirm();manualDraft=false;draftStale=false;
  if(!product.value){message.value="";status.textContent="제안 상품을 먼저 선택해주세요.";return;}
  message.value=proposalMessage(seller.name,product.value,start.value,end.value);
  status.textContent="문구가 생성되었습니다. 필요하면 직접 수정하세요.";
 };
 const update=()=>{
  resetConfirm();
  if(manualDraft){draftStale=true;status.textContent="상품 또는 기간이 변경되었습니다. 기존 문구를 보존했습니다. 다시 생성하거나 직접 수정해주세요.";return;}
  regenerate();
 };
 $("#proposal-product-search").addEventListener("input",e=>{
  const selected=product.value,q=e.target.value.trim().toLocaleLowerCase();
  const matching=options.filter(g=>g.name===selected||[g.name,...(g.aliases||[])].join(" ").toLocaleLowerCase().includes(q));
  product.innerHTML='<option value="">상품을 선택해주세요</option>'+matching.map(g=>'<option value="'+h(g.name)+'">'+h(g.name)+'</option>').join("");
  product.value=selected;
 });
 $("#proposal-regenerate").addEventListener("click",regenerate);
 message.addEventListener("input",()=>{manualDraft=true;draftStale=false;resetConfirm();status.textContent="직접 수정한 문구입니다. 상품명과 기간을 확인해주세요.";});
 product.addEventListener("change",update);
 start.addEventListener("change",update);
 end.addEventListener("change",update);
 copy.addEventListener("click",async()=>{
  if(!product.value)return notify("제안 상품을 선택해주세요.");
  if(draftStale)return notify("상품 또는 기간 변경 후 문구를 다시 생성하거나 수정해주세요.");
  if(start.value&&end.value&&end.value<start.value)return notify("종료일이 시작일보다 빠릅니다.");
  if(!message.value.trim())return notify("복사할 제안 문구가 없습니다.");
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard");
   await navigator.clipboard.writeText(message.value);
   status.textContent="복사되었습니다. 카카오톡 대화창에 붙여넣으세요.";
   notify("공구 제안 문구를 복사했습니다.");
  }catch{
   message.focus();message.select();
   status.textContent="문구를 선택했습니다. 직접 복사해주세요.";
   notify("문구를 선택했습니다. 복사한 후 카카오톡에 붙여넣으세요.");
  }
 });
}
function sellerKakaoSummary(id){
 const group=matchingSellerGroup(id);
 if(!group)return "";
 const seller=group.selected;
 const today=todayLocal();
 const all=[...group.histories].filter(b=>b.status!=="취소").sort((a,b)=>(b.endDate||b.startDate||"").localeCompare(a.endDate||a.startDate||""));
 const completed=all.filter(b=>b.endDate&&b.endDate<today);
 const running=all.filter(b=>b.startDate<=today&&b.endDate>=today);
 const planned=all.filter(b=>b.startDate>today);
 const activities=state.activities.filter(a=>group.ids.has(a.sellerId))
  .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
 const mostRecent=all[0];
 const handle=group.channel||seller.instagramUrl||seller.instagramId||seller.channel||"";
 const instagram=handle?String(handle).startsWith("http")?handle:
  "https://www.instagram.com/"+String(handle).replace(/^@/,"").replace(/^.*instagram\.com\//,"").replace(/\/.*$/,"")+"/":"미등록";
 const contacts=group.members.map(x=>String(x.contact||"").trim()).filter(Boolean);
 const followers=[
  ...group.members.map(x=>({value:x.followerCountLatestRecorded,at:x.updatedAt?.seconds||0})),
  ...all.map(b=>({value:b.followers,at:Date.parse((b.endDate||b.startDate||"1970-01-01")+"T00:00:00Z")/1000||0}))
 ].filter(x=>x.value!==null&&x.value!==undefined&&x.value!==""&&Number.isFinite(Number(x.value)))
 .sort((a,b)=>b.at-a.at);
 const mostRecentEvent=all.find(b=>String(b.event||"").trim());
 const contactDate=activities[0]?dt(activities[0].createdAt):"기록 없음";
 const count=group.histories.length;
 const lines=[
  "［S2H 셀러 정보］",
  "셀러명: "+seller.name,
  "인스타그램: "+instagram,
  "팔로워(최근 기록): "+(followers.length?Number(followers[0].value).toLocaleString("ko-KR")+"명":"미등록"),
  "연락처: "+(contacts[0]||"미등록"),
  "협업 상태: "+(seller.collaborationStatus||"미설정"),
  "주력 카테고리: "+(seller.primaryCategory||"미등록"),
  "",
  "［공구 현황］",
  "전체 "+count+"건 / 완료 "+completed.length+"건 / 진행 중 "+running.length+"건 / 예정 "+planned.length+"건",
  "최근 공구: "+(mostRecent?(mostRecent.product||mostRecent.productName||"상품 미확인")+" ("+(mostRecent.startDate||"-")+" ~ "+(mostRecent.endDate||"-")+")":"기록 없음"),
  "최근 공구 이력:"
 ];
 const recent=all.slice(0,5);
 if(recent.length)recent.forEach((b,i)=>lines.push(
  (i+1)+". "+(b.product||b.productName||"상품 미확인")+" / "+(b.startDate||"-")+" ~ "+(b.endDate||"-")
  +(b.round?" / "+b.round+"회차":"")
 ));
 else lines.push("- 기록 없음");
 if(all.length>5)lines.push("외 "+(all.length-5)+"건");
 lines.push("","［영업 정보］",
  "마지막 연락: "+contactDate,
  "다음 연락 예정: "+(seller.nextContactDate||"미설정"),
  "최근 제안 결과: "+(seller.proposalResult||"미설정"),
  "선호 연락 채널: "+(seller.contactChannel||"미등록")
 );
 if(seller.preferredConditions)lines.push("협업 조건: "+seller.preferredConditions);
 const notes=group.members.map(x=>x.note||x.notes).filter(Boolean);
 if(notes.length)lines.push("특이사항: "+[...new Set(notes)].join(" / "));
 if(mostRecentEvent)lines.push("","［최근 이벤트 기록］",
  (mostRecentEvent.product||mostRecentEvent.productName||"상품 미확인")+": "+mostRecentEvent.event);
 lines.push("","※ 내부 업무 공유용 · 팔로워 수는 실시간 수치가 아닌 저장된 기록입니다.");
 return lines.join("\n");
}
async function copySellerKakaoInfo(id){
 const message=sellerKakaoSummary(id);
 if(!message)return notify("셀러 정보를 찾지 못했습니다.");
 try{
  if(!navigator.clipboard?.writeText)throw new Error("clipboard unavailable");
  await navigator.clipboard.writeText(message);
  notify("카카오톡에 붙여넣을 셀러 정보를 복사했습니다.");
 }catch{
  window.prompt("내용을 전체 선택해 복사한 뒤 카카오톡에 붙여넣으세요.",message);
 }
}
let currentSellerPopupId=null;
let sellerPopupReturnFocus=null;
function closeSellerPopup(clearHash=true){
 const modal=$("#seller-detail-modal");
 if(modal)modal.classList.add("hidden");
 currentSellerPopupId=null;
 document.body.classList.remove("seller-popup-open");
 if(clearHash)clearSellerLink();
 const origin=sellerPopupReturnFocus;
 sellerPopupReturnFocus=null;
 if(clearHash&&origin?.isConnected)requestAnimationFrame(()=>origin.focus({preventScroll:true}));
}
function openSellerPopup(id){
 const group=matchingSellerGroup(id);
 if(!group)return notify("셀러 정보를 찾을 수 없습니다.");
 state.selectedSellerId=group.selected.id;
 currentSellerPopupId=group.selected.id;
 if($("#seller-detail-modal")?.classList.contains("hidden"))sellerPopupReturnFocus=document.activeElement;
 const modal=$("#seller-detail-modal"),body=$("#seller-detail-modal-body");
 $("#seller-detail-modal-title").textContent=group.selected.name+" · 셀러 정보";
 body.innerHTML=sellerDetailPage();
 modal.classList.remove("hidden");
 document.body.classList.add("seller-popup-open");
 body.scrollTop=0;
 requestAnimationFrame(()=>{
  if(!modal.classList.contains("hidden"))$("#seller-detail-modal-close")?.focus({preventScroll:true});
 });
 // All actions work in place without navigating away from the seller list.
 body.querySelectorAll("[data-seller-share]").forEach(btn=>btn.addEventListener("click",()=>copySellerKakaoInfo(btn.dataset.sellerShare)));
 body.querySelectorAll("[data-seller-excel]").forEach(btn=>btn.addEventListener("click",()=>exportSellerTrades(btn.dataset.sellerExcel)));
 body.querySelectorAll("[data-seller-proposal]").forEach(btn=>btn.addEventListener("click",()=>{
  const id=btn.dataset.sellerProposal;closeSellerPopup(false);sellerProposalModal(id);
 }));
 body.querySelectorAll("[data-seller-new-buy]").forEach(btn=>btn.addEventListener("click",()=>{
  const sellerId=btn.dataset.sellerNewBuy;
  closeSellerPopup(false);openBuyModalSafely(null,sellerId);
 }));
 body.querySelectorAll("[data-act]").forEach(btn=>btn.addEventListener("click",()=>{
  const id=btn.dataset.id;
  if(btn.dataset.act==="edit-seller"){
   const seller=state.sellers.find(x=>x.id===id);
   closeSellerPopup(false);if(seller)sellerModal(seller);
  }else if(btn.dataset.act==="contact"){
   closeSellerPopup(false);activityModal(id);
  }else if(btn.dataset.act==="edit-buy"){
   const buy=state.buys.find(x=>x.id===id);
   closeSellerPopup(false);if(buy)openBuyModalSafely(buy);
  }
 }));
 body.querySelectorAll("[data-nav]").forEach(btn=>btn.addEventListener("click",()=>closeSellerPopup()));
}
function restoreSellerLink(){
 if(!state.user)return false;
 const hash=window.location.hash;
 if(!hash.startsWith("#seller="))return false;
 let id="";
 try{id=decodeURIComponent(hash.slice(8));}catch{return false;}
 if(!id||!matchingSellerGroup(id))return false;
 // Do not replace the underlying view with sellerDetail.
 if(currentSellerPopupId!==matchingSellerGroup(id).selected.id)openSellerPopup(id);
 return true;
}
function clearSellerLink(){
 if(window.location.hash.startsWith("#seller="))history.replaceState(null,"",window.location.pathname+window.location.search);
}
let excelWriterPromise=null;
function loadExcelWriter(){
 if(window.XLSX?.utils?.aoa_to_sheet)return Promise.resolve(window.XLSX);
 if(excelWriterPromise)return excelWriterPromise;
 excelWriterPromise=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  script.async=true;
  script.onload=()=>window.XLSX?.utils?.aoa_to_sheet?resolve(window.XLSX):reject(new Error("엑셀 라이브러리 초기화에 실패했습니다."));
  script.onerror=()=>reject(new Error("엑셀 생성 모듈을 불러오지 못했습니다. 네트워크 연결을 확인해주세요."));
  document.head.appendChild(script);
 }).catch(error=>{excelWriterPromise=null;throw error;});
 return excelWriterPromise;
}
function excelSafe(value){
 const text=String(value??"");
 // Treat user-entered fields as literal text to prevent spreadsheet formula execution.
 return /^[\s]*[=+\-@\t\r]/u.test(text)?"'"+text:text;
}
async function exportSellerTrades(id){
 if(state.demo)return notify("미리보기에서는 실제 거래 기록을 내보낼 수 없습니다.");
 const group=matchingSellerGroup(id);
 if(!group)return notify("셀러 정보를 찾지 못했습니다.");
 const buys=[...group.histories].sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));
 if(!buys.length)return notify("내보낼 거래 이력이 없습니다.");
 showLoading("거래 이력 엑셀 파일을 준비하고 있습니다");
 try{
  const XLSX=await loadExcelWriter();
  const headers=["셀러명","기존 기록 셀러명","상품명","시작일","종료일","진행 상태","진행 회차","팔로워 수(기록)","마이크로/일반","결제창","정산 요청","인스타그램 URL","비고 및 특이사항","이벤트","공구 ID"];
  const rows=buys.map(b=>[
   group.selected.name,b.sellerName||group.selected.name,b.product||b.productName||"",
   b.startDate||"",b.endDate||"",b.status||"",
   b.round||"",b.followers??"",b.legacyCategory||"",b.paymentWindow||"",
   b.settlementRequest||"",b.instagramUrl||group.channel||"",
   b.note??b.memo??"",b.event||"",b.id||""
  ].map(excelSafe));
  const workbook=XLSX.utils.book_new();
  const worksheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
  worksheet["!cols"]=[{wch:20},{wch:20},{wch:32},{wch:15},{wch:15},{wch:14},{wch:13},{wch:18},{wch:17},{wch:32},{wch:22},{wch:34},{wch:48},{wch:38},{wch:28}];
  worksheet["!autofilter"]={ref:worksheet["!ref"]};
  XLSX.utils.book_append_sheet(workbook,worksheet,"거래 이력");
  const summary=[
   ["S2H 셀러 거래 이력"],
   ["셀러명",group.selected.name],
   ["인스타그램",group.channel||""],
   ["전체 거래 건수",buys.length],
   ["첫 거래 시작일",[...buys].map(b=>b.startDate).filter(Boolean).sort()[0]||""],
   ["최근 거래 종료일",[...buys].map(b=>b.endDate).filter(Boolean).sort().at(-1)||""],
   ["다운로드 기준일",todayLocal()],
   ["안내","기존 공구 원본 기록을 기준으로 생성했습니다. 수익·매출 금액은 포함되지 않습니다."]
  ];
  const wsSummary=XLSX.utils.aoa_to_sheet(summary.map(row=>row.map(excelSafe)));
  wsSummary["!cols"]=[{wch:23},{wch:75}];
  XLSX.utils.book_append_sheet(workbook,wsSummary,"셀러 요약");
  const safeName=String(group.selected.name||"셀러").replace(/[\\/:*?"<>|]/g,"_").slice(0,55);
  XLSX.writeFile(workbook,"S2H_"+safeName+"_거래이력_"+todayLocal()+".xlsx",{bookType:"xlsx",compression:true});
  notify("총 "+buys.length+"건의 거래 이력을 엑셀로 내보냈습니다.");
 }catch(error){notify("엑셀 내보내기 실패: "+(error?.message||"다시 시도해주세요."));}
 finally{hideLoading();}
}
function sellerDetailPage(){
 const group=matchingSellerGroup(state.selectedSellerId);
 if(!group)return wrap("셀러 상세","<p>셀러를 선택해주세요.</p>");
 const seller=group.selected;
 const buys=[...group.histories].sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));
 const activities=state.activities.filter(a=>group.ids.has(a.sellerId)).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
 const completed=buys.filter(b=>b.status!=="취소"&&b.endDate&&b.endDate<todayLocal());
 const active=buys.filter(b=>b.status!=="취소"&&b.startDate<=todayLocal()&&b.endDate>=todayLocal());
 const upcoming=buys.filter(b=>b.status!=="취소"&&b.startDate>todayLocal());
 const latestEnd=buys.filter(b=>b.endDate&&b.endDate<todayLocal()&&b.status!=="취소").reduce((last,b)=>b.endDate>last?b.endDate:last,"");
 const recentBuy=buys.filter(b=>b.status!=="취소").sort((a,b)=>(b.endDate||"").localeCompare(a.endDate||""))[0];
 const followerCandidates=[
  ...group.members.map(x=>({value:x.followerCountLatestRecorded,date:x.updatedAt?.seconds||0})),
  ...buys.map(b=>({value:b.followers,date:Date.parse((b.endDate||b.startDate||"1970-01-01")+"T00:00:00Z")/1000||0}))
 ].filter(x=>x.value!==null&&x.value!==undefined&&x.value!==""&&Number.isFinite(Number(x.value)));
 followerCandidates.sort((a,b)=>b.date-a.date);
 const follower=followerCandidates.length?Number(followerCandidates[0].value).toLocaleString("ko-KR")+"명":"미등록";
 const instagram=instagramLink(group.channel||seller.instagramUrl||seller.instagramId||seller.channel);
 const contact=group.contact||"미등록";
 const note=group.members.map(x=>x.note||x.notes).filter(Boolean).join("\n");
 const latestActivity=activities[0];
 const cycle=group.members.map(x=>Number(x.cycleDays)).find(n=>Number.isFinite(n)&&n>0);
 const nextContact=seller.nextContactDate||(latestActivity?.createdAt?.toDate&&cycle?
  datePlus(latestActivity.createdAt.toDate().toISOString().slice(0,10),cycle):"");
 const history=buys.map(b=>'<tr><td>'+h(b.product||b.productName||"-")+'</td><td>'+h(b.startDate||"-")+'</td><td>'+h(b.endDate||"-")+'</td><td>'+h(b.round||"-")+'</td><td>'+h(b.paymentWindow||"-")+'</td><td>'+h(b.settlementRequest||"-")+'</td><td>'+h(b.note||b.memo||"-")+'</td><td>'+h(b.event||"-")+'</td><td><button class="mini-button" data-act="edit-buy" data-id="'+h(b.id)+'">수정</button></td></tr>');
 const events=buys.filter(b=>String(b.event||"").trim()).map(b=>
  '<div class="seller-event-item"><div><strong>'+h(b.product||b.productName||"상품 미확인")+'</strong><span>'+h(b.startDate||"-")+' ~ '+h(b.endDate||"-")+'</span></div>'+
  '<p>'+h(b.event)+'</p><small>기존 공구 대장 이벤트 원문 · 계획 조건이며 실제 지급 결과는 별도 확인 필요</small></div>').join("");
 const logs=activities.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td>'+h(a.type||"-")+'</td><td>'+h(a.memo||"-")+'</td><td>'+h(a.contactOwner||a.actorName||"-")+'</td><td>'+h(a.actorName||"-")+'</td></tr>');
 const info=(label,value)=>'<div class="seller-profile-item"><span>'+label+'</span><strong>'+value+'</strong></div>';
 const summary='<div class="seller-profile-header"><div> <h2>'+h(seller.name)+'</h2>'+
  '<div class="seller-profile-channel">'+instagram+'</div>'+
  (group.names.length>1?'<p>기존 기록명: '+h(group.names.filter(n=>n!==seller.name).join(", "))+'</p>':"")+'</div>'+
  '<button type="button" class="secondary" data-act="edit-seller" data-id="'+h(seller.id)+'">정보 수정</button></div>'+
  '<div class="seller-profile-stats">'+
  info("전체 공구",buys.length+'건')+info("완료 공구",completed.length+'건')+
  info("진행 중",active.length+'건')+info("예정",upcoming.length+'건')+
  info("최근 종료일",h(latestEnd||"-"))+'</div>';
 const details='<div class="seller-profile-grid">'+
  info("인스타그램",instagram)+info("최근 기록된 팔로워",h(follower))+
  info("연락처",h(contact))+info("최근 진행 상품",h(recentBuy?.product||recentBuy?.productName||"-"))+
  info("마지막 연락·활동",h(latestActivity?dt(latestActivity.createdAt):"기록 없음"))+
  info("리마인드 주기",cycle?cycle+"일":"미설정")+
  info("다음 연락 참고일",h(nextContact||"미설정"))+
  info("총 연락 기록",activities.length+'건')+
  info("협업 상태",h(seller.collaborationStatus||"미설정"))+
  info("주력 카테고리",h(seller.primaryCategory||"미등록"))+
  info("선호 연락 채널",h(seller.contactChannel||"미등록"))+
  info("최근 제안 결과",h(seller.proposalResult||"미설정"))+'</div>'+
  '<div class="seller-profile-note"><span>선호 상품·협업 조건</span><p>'+h(seller.preferredConditions||"등록된 조건이 없습니다.")+'</p></div>'+
  '<div class="seller-profile-note"><span>셀러 메모 및 특이사항</span><p>'+h(note||"등록된 메모가 없습니다.")+'</p></div>';
 return '<div class="detail-nav"><button data-nav="sellers" class="mini-button">셀러 목록</button>'+
  '<div class="seller-detail-actions">'+
  '<button type="button" class="secondary" data-seller-share="'+h(seller.id)+'">카톡용 정보 복사</button>'+
  '<button type="button" class="secondary" data-seller-excel="'+h(seller.id)+'">거래 이력 엑셀</button>'+
  '<button type="button" class="primary" data-seller-proposal="'+h(seller.id)+'">제안하기</button>'+
  '<button type="button" class="secondary" data-seller-new-buy="'+h(seller.id)+'">공구 등록</button>'+
  '<button class="secondary" data-act="contact" data-id="'+h(seller.id)+'">+ 연락 기록</button></div></div>'+
  wrap("셀러 기본정보",summary+details)+
  wrap("전체 공구 이력 · "+buys.length+"건",'<p class="panel-description">기존 공구 기록을 날짜순으로 조회합니다. 원본 거래 내용은 유지됩니다.</p>'+
   table(["상품","시작일","종료일","회차","결제창","정산","비고","이벤트","수정"],history))+
  wrap("이벤트 이력 · "+buys.filter(b=>String(b.event||"").trim()).length+"건",
   events||'<p class="panel-description">기록된 공구 이벤트가 없습니다.</p>')+
  wrap("연락 및 활동 이력 · "+activities.length+"건",table(["일시","연락 방식","내용","담당자","기록자"],logs));
}
function filteredSellerGroups(){
 const groups=sellerGroups(),search=state.search.trim().toLocaleLowerCase();
 if(filteredSellerCache?.groups===groups&&filteredSellerCache.search===search)return filteredSellerCache.result;
 const result=groups.filter(g=>{
  if(!search)return true;
  const s=g.selected;
  return [g.names.join(" "),g.channel,g.contact,s.contact||"",...g.members.flatMap(x=>[x.instagramId,x.instagramUrl,x.channel,x.contact])].filter(Boolean).join(" ").toLocaleLowerCase().includes(search);
 }).sort((a,b)=>a.selected.name.localeCompare(b.selected.name,"ko-KR",{numeric:true}));
 filteredSellerCache={groups,search,result};
 return result;
}
function sellerOperationalGroups(key=state.sellerOperationFilter){
 const groups=filteredSellerGroups();
 if(key==="all")return groups;
 const today=todayLocal(),followUp=new Set(key==="contact"?reminders().map(r=>r.seller.id):[]);
 return groups.filter(g=>{
  const histories=g.histories.filter(b=>b.status!=="취소"&&b.startDate&&b.endDate);
  if(key==="running")return histories.some(b=>b.startDate<=today&&b.endDate>=today);
  if(key==="upcoming")return histories.some(b=>b.startDate>today);
  if(key==="contact")return [...g.ids].some(id=>followUp.has(id));
  if(key==="none")return histories.length===0;
  return true;
 });
}
function sellerCSV(){
 if(state.demo)return notify("미리보기 데이터는 내보낼 수 없습니다.");
 const lastActivities=sellerLastActivityIndex();
 const rows=sellerOperationalGroups().map(g=>{
  const s=g.selected,b=g.recent;
  const count=g.histories.length;
  const lastActivity=[...g.ids].map(id=>lastActivities.get(id)).filter(Boolean).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
  return [s.name,g.names.join(" / "),g.channel,
    s.followerCountLatestRecorded??"",g.contact||"",
    count,b?.product||b?.productName||"",b?.endDate||"",
    lastActivity?dt(lastActivity.createdAt):"",
    [...g.ids].join(" / ")];
 });
 const head=["셀러명","기존 셀러명","인스타그램","팔로워 수","연락처","공구 횟수","최근 상품","최근 종료일","최근 활동일","셀러 ID"];
 const cell=value=>{
  let str=String(value??"");
  if(/^[\s]*[=+\-@\t\r]/.test(str))str="'"+str;
  return '"'+str.replace(/"/g,'""')+'"';
 };
 const csv="\uFEFF"+[head,...rows].map(row=>row.map(cell).join(",")).join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;
 a.download="S2H_셀러목록_"+todayLocal()+(state.search?"_검색결과":"")+".csv";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
 notify(rows.length+"명의 셀러 목록을 CSV로 내려받았습니다.");
}
function sellersPage(){
 const groups=sellerOperationalGroups(),pageSize=state.sellerPageSize;
 const pageCount=Math.max(1,Math.ceil(groups.length/pageSize));
 state.sellerPage=Math.max(1,Math.min(pageCount,state.sellerPage));
 const from=(state.sellerPage-1)*pageSize;
 const visibleGroups=groups.slice(from,from+pageSize);
 const lastActivities=sellerLastActivityIndex();
 const rows=visibleGroups.map(g=>{
  const s=g.selected,b=g.recent;
  const activities=g.members.map(x=>lastActivities.get(x.id)).filter(Boolean);
  const a=activities.sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0))[0];
  return '<tr><td><button type="button" class="seller-name-link" data-act="view-seller" data-id="'+h(s.id)+'" aria-label="'+h(s.name)+' 셀러 상세 보기">'+h(s.name)+'</button>'+(g.names.length>1?'<small class="seller-alias">다른 기록명: '+h(g.names.filter(n=>n!==s.name).join(", "))+'</small>':"")+'</td>'+
  '<td>'+instagramLink(g.channel||s.instagramUrl||s.instagramId||s.channel)+'</td><td>'+h(g.contact||"미등록")+'</td><td class="seller-trade-cell"><strong>'+h(b?.product||b?.productName||"-")+'</strong><small>전체 '+g.histories.length+'건</small></td><td>'+h(b?.endDate||"-")+'</td><td>'+h(a?dt(a.createdAt):"-")+'</td>'+
  '<td><div class="seller-row-actions"><button type="button" class="mini-button" data-act="view-seller" data-id="'+h(s.id)+'">상세</button><button type="button" class="mini-button" data-act="edit-seller" data-id="'+h(s.id)+'">수정</button><button type="button" class="mini-button" data-act="contact" data-id="'+h(s.id)+'">연락 기록</button></div></td></tr>';
 });
 const tabOptions=[["all","전체"],["running","진행 중"],["upcoming","오픈 예정"],["contact","연락 필요"],["none","공구 이력 없음"]];
 const tabs='<div class="ops-seller-filter" role="group" aria-label="셀러 운영 상태">'
  +tabOptions.map(([key,title])=>'<button type="button" data-seller-filter="'+key+'" aria-pressed="'+(state.sellerOperationFilter===key)+'" class="'+(state.sellerOperationFilter===key?"selected":"")+'">'+title+' <span>'+sellerOperationalGroups(key).length+'</span></button>').join("")
  +'</div>';
 const tools='<div class="seller-tools"><div class="seller-search"><input id="seller-search" type="search" aria-label="셀러명, 인스타그램, 연락처 검색" placeholder="셀러명, 인스타그램, 연락처 검색" value="'+h(state.search)+'"/></div>'
  +'<span class="seller-results">'+groups.length+'명 조회</span><button class="secondary" type="button" data-export-sellers>현재 목록 CSV</button></div>';
 const pagination='<div class="seller-pagination"><span>'+(!groups.length?'검색 결과 없음':(from+1)+'–'+Math.min(from+pageSize,groups.length)+' / '+groups.length+'명')+'</span><div><button type="button" class="secondary" data-seller-page="-1" '+(state.sellerPage===1?'disabled':'')+'>이전</button><span class="seller-page-current">'+state.sellerPage+' / '+pageCount+'</span><button type="button" class="secondary" data-seller-page="1" '+(state.sellerPage>=pageCount?'disabled':'')+'>다음</button></div></div>';
 return '<div class="seller-workspace">'+wrap("셀러 목록 · "+sellerGroups().length+"명",
  '<p class="panel-description">동일 인스타그램 계정은 하나로 표시하고 과거 이름과 이력은 보존합니다.</p>'+
  tools+tabs+table(["셀러명","채널","연락처","최근 공구","종료일","최근 활동","관리"],rows)+pagination)+'</div>';
}

function schedulePage(){
 const statusKeys=[["all","전체"],["active","진행 중"],["upcoming","예정"],["completed","완료"],["canceled","취소"]];
 const search=state.monthSearch.trim().toLocaleLowerCase();
 const weekScoped=state.scheduleView==="calendar"&&state.calendarMode==="week";
 const weekFrom=activeWeekStart(),weekTo=datePlus(weekFrom,6);
 const base=weekScoped
  ?state.buys.filter(b=>b.startDate&&b.endDate&&b.startDate<=weekTo&&b.endDate>=weekFrom)
  :monthlyBuys();
 const searchMatch=b=>!search||[b.sellerName,b.product,b.productName,b.note,b.memo,b.event,b.round,b.settlementRequest,b.paymentWindow].join(" ").toLocaleLowerCase().includes(search);
 const searchable=base.filter(searchMatch);
 const matchesStatus=(b,key)=>key==="all"||(
  key==="active"?scheduleStatus(b)==="진행 중":
  key==="upcoming"?scheduleStatus(b)==="예정":
  key==="completed"?scheduleStatus(b)==="완료":scheduleStatus(b)==="취소"
 );
 const counts={all:searchable.length,active:0,upcoming:0,completed:0,canceled:0};
 const statusToKey={"진행 중":"active","예정":"upcoming","완료":"completed","취소":"canceled"};
 for(const b of searchable){const key=statusToKey[scheduleStatus(b)];if(key)counts[key]++;}
 const filterCount=key=>counts[key]||0;
 const list=searchable.filter(b=>matchesStatus(b,state.scheduleStatusFilter));
 const sorted=[...list].sort((a,b)=>state.scheduleSort==="latest"?
  (b.startDate||"").localeCompare(a.startDate||"") :
  state.scheduleSort==="seller"?
  String(a.sellerName||"").localeCompare(String(b.sellerName||""),"ko-KR") :
  (a.startDate||"").localeCompare(b.startDate||"")||String(a.sellerName||"").localeCompare(String(b.sellerName||""),"ko-KR"));
 const tabs='<div class="ops-schedule-view" role="group" aria-label="공구 일정 표시 방식">'
  +[["list","간편 목록"],["detail","상세 대장"],["calendar","캘린더"]]
   .map(([key,label])=>'<button type="button" data-view="'+key+'" class="'+(state.scheduleView===key?"selected":"")+'" aria-pressed="'+(state.scheduleView===key)+'">'+label+'</button>').join("")
  +'</div>';
 const toolbar='<div class="ops-schedule-toolbar"><div class="ops-schedule-toolbar-main">'
  +'<input id="month-search" type="search" aria-label="셀러, 상품 및 공구 기록 검색" placeholder="셀러명, 상품명, 비고, 이벤트 검색" value="'+h(state.monthSearch)+'"/>'
  +tabs+'</div><div class="ops-schedule-filters" role="group" aria-label="공구 진행 상태 필터">'
  +statusKeys.map(([key,label])=>'<button type="button" data-schedule-status="'+key+'" class="'+(state.scheduleStatusFilter===key?"selected":"")+'" aria-pressed="'+(state.scheduleStatusFilter===key)+'"><span class="ops-status-label">'+label+'</span><strong class="ops-status-number">'+filterCount(key)+'</strong></button>').join("")
  +'</div></div>';
 const viewRows=sorted.map(b=>{
  const status=scheduleStatus(b),prep=prepProgress(b,todayLocal());
  return '<tr><td><button type="button" class="seller-cell" data-act="view-seller" data-id="'+h(b.sellerId)+'">'+h(b.sellerName||"미확인")+'</button></td>'
   +'<td><strong>'+h(b.product||b.productName||"상품 미확인")+'</strong></td>'
   +'<td class="ops-schedule-date"><span class="ops-date-start">'+h(b.startDate||"-")+'</span><span class="ops-date-end">~ '+h(b.endDate||"-")+'</span></td>'
   +'<td>'+scheduleStatusChip(status)+'</td>'
   +'<td><button type="button" class="ops-prep-button '+(prep.complete?"is-ready":prep.recorded?"is-partial":"is-unrecorded")+'" data-prep-open="'+h(b.id)+'" '+(status==="취소"?"disabled":"")+'>'+h(status==="취소"?"해당 없음":prep.complete?"확인 완료":prep.recorded?("확인 "+prep.done+"/"+prep.total):"확인 전")+'</button></td>'
   +'<td><button class="mini-button" type="button" data-act="edit-buy" data-id="'+h(b.id)+'">상세·수정</button></td></tr>';
 });
 const sorting='<div class="ops-schedule-results"><span>조회 결과 <strong>'+sorted.length+'</strong>건</span>'
  +(state.scheduleView!=="calendar"?'<label>정렬<select id="schedule-sort" aria-label="공구 목록 정렬">'
   +[["start","오픈일 빠른순"],["latest","오픈일 늦은순"],["seller","셀러 이름순"]]
    .map(([v,label])=>'<option value="'+v+'" '+(state.scheduleSort===v?"selected":"")+'>'+label+'</option>').join("")
   +'</select></label>':"")
  +'</div>';
 const calendarItems=state.buys.filter(b=>b.id&&b.startDate&&b.endDate&&
  searchMatch(b)&&
  matchesStatus(b,state.scheduleStatusFilter));
 const content=state.scheduleView==="calendar"?
  calendarModeControls()+
  '<p class="ops-schedule-note">'+(state.calendarMode==="month"?
   '공구 막대는 시작일부터 종료일까지 이어집니다. 막대는 수정, 날짜는 공구 등록입니다.':
   '기간 막대를 눌러 공구를 수정하고, 날짜를 눌러 공구를 등록할 수 있습니다.')+'</p>'+
  monthGrid(calendarItems,{connected:true,weekOnly:state.calendarMode==="week",showCanceled:state.scheduleStatusFilter==="canceled"||state.scheduleStatusFilter==="all"}) :
  state.scheduleView==="detail"?
  table(["셀러명","상품","팔로워 수","시작일","종료일","정산 요청","결제창","셀러 구분","인스타그램","회차","비고","이벤트","상태","수정"],monthlyRows(sorted,true)):
  table(["셀러명","상품","공구 기간","진행 상태","오픈 준비","관리"],viewRows);
 return '<div class="ops-schedule-page">'
  +'<div class="ops-schedule-heading"><div><strong>'+h(weekScoped?weekFrom+" ~ "+weekTo:shownMonth().replace("-","년 ")+"월")+'</strong><p>선택 기간 전체 공구 '+base.length+'건</p></div>'
  +'<div class="ops-schedule-month">'+monthPicker()+'</div></div>'
  +toolbar+sorting+'<div class="ops-schedule-main '+(state.scheduleView==="calendar"?"is-calendar":state.scheduleView==="detail"?"is-detail":"")+'">'+content+'</div>'
  +'</div>';
}

function reminderTemplates(seller,buy){
 const name=(seller?.name||"셀러").trim();
 const rawProduct=String(buy?.product||buy?.productName||"").trim();
 const product=rawProduct&&rawProduct!=="-"?rawProduct:"이전 상품";
 const prior=Boolean(rawProduct&&rawProduct!=="-");
 return [
  {title:"재공구 제안",message:prior?"안녕하세요, "+name+"님. 지난번 "+product+" 공구 관련해서 연락드립니다. 재진행 일정 검토가 가능하실지 여쭤보고 싶습니다. 편하실 때 의견 부탁드립니다.":"안녕하세요, "+name+"님. S2H입니다. 공동구매 진행을 검토하고 계신지 여쭤보고자 연락드립니다. 편하실 때 의견 부탁드립니다."},
  {title:"새 상품 제안",message:"안녕하세요, "+name+"님. S2H입니다. "+(prior?"이전 공구 진행 이력을 참고해 ":"")+"새로운 상품을 제안드리고 싶어 연락드렸습니다. 관심 있으신 상품군이나 희망하시는 일정이 있다면 알려주세요. 그에 맞춰 자료 준비하겠습니다."},
  {title:"안부 및 일정 확인",message:"안녕하세요, "+name+"님. 잘 지내셨나요? 다음 공동구매 계획이나 검토 중인 일정이 있으실지 여쭤보려고 연락드렸습니다. 편하실 때 회신 주시면 맞춰서 제안드리겠습니다."}
 ];
}
function reminderCompleteModal(sellerId){
 if(state.demo){notify("미리보기에서는 기록을 저장할 수 없습니다.");return;}
 const reminder=reminders().find(x=>x.seller.id===sellerId);
 if(!reminder){notify("해당 리마인드가 이미 처리되었거나 대상이 아닙니다.");return;}
 const picked=state.reminderCopied[sellerId];
 const textInfo=picked===undefined?"":("복사한 문구: "+reminderTemplates(reminder.seller,reminder.buy)[picked]?.title);
 openModal("리마인드 완료 기록",
  '<div class="full reminder-complete-intro"><strong>'+h(reminder.seller.name)+'</strong><span>'+h(reminder.buy.product||"-")+' · 연락 예정일 '+h(reminder.due)+'</span></div>'
  +select("channel","연락 방법",[["카카오톡","카카오톡"],["DM","인스타그램 DM"],["전화","전화"],["이메일","이메일"],["기타","기타"]],"카카오톡")
  +f("nextFollowUpAt","다음 연락일 (선택)","date","",false)
  +textarea("memo","연락 내용 및 결과",textInfo)
  +'<label class="full reminder-ack"><input id="reminder-confirmed" name="confirmed" type="checkbox" value="yes" required/> <span>셀러에게 실제 연락한 후 완료를 기록합니다.</span></label>',
  async data=>{
   if(data.confirmed!=="yes")throw new Error("실제 연락 후 완료 여부를 확인해주세요.");
   const memo=data.memo?.trim();
   if(!memo)throw new Error("연락 내용이나 결과를 입력해주세요.");
   // Re-check the pending reminder before recording; do not dismiss by merely viewing or copying.
   const current=reminders().find(x=>x.seller.id===sellerId);
   if(!current)throw new Error("다른 직원이 먼저 처리한 알림입니다. 목록을 새로 확인해주세요.");
   await addDoc(collection(db,"activities"),{
    sellerId:reminder.seller.id,
    sellerName:reminder.seller.name,
    type:"리마인드 완료",
    channel:data.channel,
    memo,
    completedReminderDue:reminder.due,
    completedGroupbuyId:reminder.buy.id||null,
    nextFollowUpAt:data.nextFollowUpAt||null,
    copiedTemplate:picked===undefined?null:reminderTemplates(reminder.seller,reminder.buy)[picked]?.title,
    actorUid:state.user.uid,
    actorName:state.staff?.name||state.user.email,
    createdAt:serverTimestamp()
   });
   delete state.reminderCopied[sellerId];
   state.expandedReminderId=null;
  });
 const submit=$("#modal-form button[type=submit]");
 if(submit)submit.textContent="연락 완료 저장";
}
function reminderPage(){
 const data=reminders(),today=todayLocal();
 const dueToday=data.filter(x=>x.due===today).length;
 const delayed=data.filter(x=>x.overdue>0).length;
 const cards=data.map(x=>{
  const expanded=state.expandedReminderId===x.seller.id;
  const list=reminderTemplates(x.seller,x.buy);
  const templates=expanded?'<div class="reminder-templates">'+list.map((t,index)=>
    '<div class="reminder-template"><div><strong>'+h(t.title)+'</strong><p>'+h(t.message)+'</p></div><button class="mini-button" type="button" data-act="copy-template" data-template="'+index+'" data-id="'+h(x.seller.id)+'">복사</button></div>'
   ).join("")+'</div>':"";
  return '<div class="reminder-item"><div class="row"><div class="reminder-copy"><div class="reminder-name-row"><button type="button" class="seller-name-link" data-act="view-seller" data-id="'+h(x.seller.id)+'">'+h(x.seller.name)+'</button><span class="status reminder-due '+(x.overdue>0?'is-overdue':'is-today')+'">'+(x.overdue>0?'지연 '+x.overdue+'일':'오늘 연락')+'</span></div><p>최근 공구 '+h(x.buy.product||x.buy.productName||"-")+' · 종료 '+h(x.buy.endDate||"-")+'</p><p class="reminder-date">연락 예정일 <strong>'+h(x.due)+'</strong></p></div><div class="actions"><button class="mini-button" type="button" data-act="templates" aria-expanded="'+expanded+'" data-id="'+h(x.seller.id)+'">'+(expanded?"문구 접기":"연락 문구")+'</button><button class="secondary" type="button" data-act="seller-proposal" data-id="'+h(x.seller.id)+'">공구 제안</button><button class="primary" type="button" data-act="complete-reminder" data-id="'+h(x.seller.id)+'">연락 완료</button></div></div>'+templates+'</div>';
 }).join("");
 const completed=state.activities.filter(a=>a.type==="리마인드 완료").slice(0,15);
 const completedRows=completed.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td><strong>'+h(a.sellerName)+'</strong></td><td>'+h(a.channel||"-")+'</td><td>'+h(a.memo||"-")+'</td><td>'+h(a.actorName||"-")+'</td><td>'+h(a.nextFollowUpAt||"없음")+'</td></tr>');
 return '<div class="reminder-workspace"><div class="metrics reminder-metrics">'+metric("연락 필요",data.length,"미처리 알림")+metric("오늘 연락",dueToday,"오늘 예정")+metric("연락 지연",delayed,"예정일 경과")+'</div>'+wrap("미처리 알림 · "+data.length,
  '<p class="detail-note">문구를 복사해 카카오톡이나 DM으로 직접 전달한 뒤, 연락 방법과 내용을 기록하면 완료 처리됩니다. 미처리 알림은 계속 표시됩니다.</p>'
  +(cards||'<div class="empty">현재 연락이 필요한 셀러가 없습니다.</div>'))
  +wrap("최근 완료 기록",'<p class="panel-description">연락 완료로 기록한 셀러와 처리 직원, 다음 연락 예정일을 확인할 수 있습니다.</p>'+table(["처리일시","셀러","연락방법","연락내용","처리직원","다음 연락일"],completedRows))+'</div>';
}
function activityPage(){
 const all=state.activities;
 const types=[...new Set(all.map(a=>String(a.type||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko-KR"));
 const search=state.activitySearch.trim().toLocaleLowerCase();
 const matched=all.filter(a=>{
  if(state.activityType!=="all"&&String(a.type||"")!==state.activityType)return false;
  return !search||[a.sellerName,a.type,a.memo,a.actorName,a.contactOwner,a.channel,a.product,a.proposedStartDate,a.proposedEndDate,a.nextFollowUpAt].join(" ").toLocaleLowerCase().includes(search);
 }).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
 const pageSize=35,pageCount=Math.max(1,Math.ceil(matched.length/pageSize));
 state.activityPage=Math.min(pageCount,Math.max(1,state.activityPage));
 const from=(state.activityPage-1)*pageSize;
 const shown=matched.slice(from,from+pageSize);
 const rows=shown.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td><strong>'+h(a.sellerName||"-")+'</strong></td><td><span class="status">'+h(a.type||"-")+'</span></td><td class="ops-activity-memo">'+(a.product?'<strong class="activity-product">'+h(a.product)+'</strong>':'')+(a.proposedStartDate||a.proposedEndDate?'<small class="activity-date">희망 기간 '+h(a.proposedStartDate||"협의")+' ~ '+h(a.proposedEndDate||"협의")+'</small>':'')+'<div>'+h(a.memo||"-")+'</div></td><td>'+h(a.contactOwner||a.actorName||"-")+'</td><td>'+h(a.nextFollowUpAt||"-")+'</td></tr>');
 const toolbar='<div class="ops-activity-toolbar">'
  +'<input id="activity-search" type="search" aria-label="활동 기록 검색" placeholder="셀러명, 담당자 또는 활동 내용 검색" value="'+h(state.activitySearch)+'"/>'
  +'<label>유형<select id="activity-type" aria-label="활동 유형 필터">'
   +'<option value="all">전체 유형</option>'
   +types.map(type=>'<option value="'+h(type)+'" '+(type===state.activityType?"selected":"")+'>'+h(type)+'</option>').join("")
  +'</select></label>'
  +'<span>전체 '+all.length+'건 · 검색 '+matched.length+'건</span></div>';
 const pagination='<div class="ops-activity-pagination"><span>'+(matched.length?(from+1)+'–'+Math.min(from+pageSize,matched.length)+' / '+matched.length:'조회 결과 없음')+'</span>'
  +'<div><button type="button" class="secondary" data-activity-page="-1" '+(state.activityPage===1?"disabled":"")+'>이전</button>'
  +'<strong>'+state.activityPage+' / '+pageCount+'</strong>'
  +'<button type="button" class="secondary" data-activity-page="1" '+(state.activityPage===pageCount?"disabled":"")+'>다음</button></div></div>';
 return '<div class="activity-workspace">'+wrap("활동 기록 · "+matched.length+"건",
  '<p class="panel-description">누가 어떤 셀러에게 연락하거나 업무를 처리했는지 확인할 수 있습니다.</p>'
  +toolbar+table(["일시","셀러","활동 유형","기록 내용","담당자","다음 연락일"],rows)+pagination)+'</div>';
}
function importerPage(){
 if(state.demo||state.staff?.role!=="admin")return wrap("접근 제한","<p>관리자 계정만 백업과 데이터 복원을 사용할 수 있습니다.</p>");
 return wrap("백업 및 안전 복원",
  '<div class="backup-export-panel"><h3>전체 데이터 백업</h3>'
  +'<p>현재 Firebase의 셀러·상품·공구·활동 기록을 내려받습니다. 복구 목적이라면 <strong>CSV · JSON ZIP</strong> 파일을 보관하세요. Excel은 검토용입니다.</p>'
  +'<div class="import-buttons"><button type="button" class="primary" id="backup-xlsx">전체 엑셀 다운로드</button>'
  +'<button type="button" class="secondary" id="backup-csv">복원용 JSON · CSV ZIP</button></div>'
  +'<p id="backup-export-status" role="status">백업 파일은 민감한 내부 운영 데이터이므로 비공개로 보관하세요.</p></div>'
  +'<div class="backup-import-separator"><h3>비어 있는 데이터베이스에 복원</h3>'
  +'<p>CRM 전체 백업 ZIP 또는 검증된 최초 이전 ZIP을 검사할 수 있습니다. <strong>기존 데이터가 있는 경우에는 복원을 허용하지 않습니다.</strong></p></div>'
  +'<p class="panel-description">복원 과정은 기존 문서를 덮어쓰지 않으며, 중간에 오류가 발생하면 일부 문서만 생성됐을 수 있습니다. 운영 중인 데이터베이스에는 ZIP을 재업로드하지 마세요.</p>'
  +'<div class="import-guide"><div>1. 비공개 ZIP 파일 선택</div><div>2. 데이터 구조·건수·중복 ID 검사</div><div>3. 빈 컬렉션 확인 후 신규 문서 복원</div></div>'
  +'<label class="import-label">백업 또는 초기 이전 ZIP 선택<input type="file" id="seed-zip" accept=".zip,application/zip"/></label>'
  +'<div class="import-buttons"><button class="secondary" id="seed-check" type="button">데이터 검사</button>'
  +'<button class="primary" id="seed-run" type="button" disabled>빈 DB에 복원</button></div>'
  +'<progress id="seed-progress" max="100" value="0"></progress><p id="seed-status" class="import-status" role="status">검사할 ZIP 파일을 선택해주세요.</p>'
  +'<p class="panel-note">복원 전 Firestore 접근 권한과 백업 파일의 출처를 확인하세요. 대량 복원 실패 후에는 자동 재시도하지 않습니다.</p>');
}
// Preserve Korean IME composition. Replacing a focused input on every keystroke
// interrupts syllable assembly and causes decomposed Hangul (ㅅ ㅔ ㄹ ...).
let searchRenderTimer=null;
function bindSearchInput(selector,stateKey){
 const input=$(selector);
 if(!input)return;
 let composing=false;
 const sync=()=>{
  if(!input.isConnected)return;
  state[stateKey]=input.value;
  if(stateKey==="search")state.sellerPage=1;
  if(stateKey==="productSearch")state.productPage=1;
  if(stateKey==="insightSearch")state.insightPage=1;
   if(stateKey==="activitySearch")state.activityPage=1;
 };
 const schedule=()=>{
  clearTimeout(searchRenderTimer);
  searchRenderTimer=setTimeout(()=>{
   if(composing||!input.isConnected)return;
   sync();
   const selectionStart=input.selectionStart,selectionEnd=input.selectionEnd;
   const focused=document.activeElement===input;
   render();
   if(focused){
    const next=$(selector);
    if(next){next.focus({preventScroll:true});try{next.setSelectionRange(selectionStart,selectionEnd);}catch{}}
   }
  },450);
 };
 input.addEventListener("compositionstart",()=>{composing=true;clearTimeout(searchRenderTimer);});
 input.addEventListener("compositionend",()=>{composing=false;sync();schedule();});
 input.addEventListener("input",event=>{sync();if(!composing&&!event.isComposing)schedule();});
 input.addEventListener("change",()=>{sync();schedule();});
 input.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!composing){event.preventDefault();clearTimeout(searchRenderTimer);sync();render();}
 });
 input.addEventListener("blur",()=>{if(!composing&&input.isConnected){clearTimeout(searchRenderTimer);sync();schedule();}});
}
// Date-based reminders and opening priorities refresh when the app stays open overnight.
let lastRenderedLocalDate=todayLocal();
function refreshForNewWorkday(){
 if(!state.user)return;
 const next=todayLocal();
 if(next===lastRenderedLocalDate)return;
 workAlertsCache=null;reminderCache=null;lastRenderedLocalDate=next;
 render();
}
setInterval(refreshForNewWorkday,60000);
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="visible")refreshForNewWorkday();
});
function render(){
 if(!state.user)return;
 lastRenderedLocalDate=todayLocal();
 if(state.page==="productInsights"){state.page="products";state.productView="insights";}
 const views={dashboard:["대시보드","","",dashboard],sellers:["셀러 관리","SELLER DATABASE","전체 셀러와 공구·연락 이력",sellersPage],schedule:["공구 일정","GROUPBUY SCHEDULE","공구 일정과 운영 상태",schedulePage],reminders:["리마인드","FOLLOW UP","연락 기록이 남기 전까지 미처리 알림 유지",reminderPage],activity:["활동 기록","ACTIVITY LOG","팀원들의 연락과 영업 활동",activityPage],products:["상품 관리","","상품 등록·수정·복원",productWorkspacePage],productInsights:["상품 관리","","상품 등록·수정·복원",productWorkspacePage],import:["백업","","초기 데이터 보관 및 복원",importerPage],opportunities:["재접촉 대상","","최근 공구 이력을 기반으로 검토할 셀러",opportunitiesPage],sellerDetail:["셀러 상세","","",sellerDetailPage]};
 if(!Object.prototype.hasOwnProperty.call(views,state.page))state.page="dashboard";
 const [title,kicker,caption,view]=views[state.page];
 $("#page-title").textContent=title;
 const crumb=$("#breadcrumb-page");if(crumb)crumb.textContent=title;
 $("#today").textContent=todayLocal();
 $("#add-button").textContent=state.page==="dashboard"||state.page==="schedule"?"+ 공구 등록":state.page==="activity"||state.page==="reminders"?"+ 활동 기록":state.page==="import"?"대시보드":state.page==="sellerDetail"?"셀러 목록":state.page==="products"?"+ 상품 등록":state.page==="productInsights"?"상품 관리":state.page==="opportunities"||state.page==="proposals"?"셀러 보기":"+ 셀러 등록";
 $("#add-button").onclick=state.page==="dashboard"||state.page==="schedule"?()=>openBuyModalSafely():state.page==="activity"||state.page==="reminders"?()=>activityModal():state.page==="products"?()=>productModal():state.page==="productInsights"?()=>{state.page="products";render();}:state.page==="import"?()=>{state.page="dashboard";render();}:state.page==="sellerDetail"||state.page==="opportunities"||state.page==="proposals"?()=>{state.page="sellers";render();}:()=>sellerModal();
 document.querySelectorAll("[data-page]").forEach(el=>{const active=el.dataset.page===state.page;el.classList.toggle("active",active);if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");});
 const failedSources=Object.entries(state.dataErrors||{});
 const errorBanner=failedSources.length?
  '<div class="crm-load-error" role="alert"><div><strong>일부 데이터를 불러오지 못했습니다.</strong>'
  +'<p>'+failedSources.map(([key])=>({users:"담당자",sellers:"셀러",products:"상품",groupbuys:"공구 일정",activities:"활동 기록"}[key]||key)).join(" · ")
  +' 정보를 확인할 수 없습니다. 네트워크와 접근 권한을 점검해주세요.</p></div>'
  +'<button type="button" id="data-retry-button" class="secondary">다시 시도</button></div>':"";
 const oldCalendar=$("#page-body .cal-scroll[data-calendar-key]");
 const calendarKey=oldCalendar?.dataset.calendarKey,calendarLeft=oldCalendar?.scrollLeft||0;
 $("#page-body").innerHTML=errorBanner+view();
 const newCalendar=$("#page-body .cal-scroll[data-calendar-key]");
 if(newCalendar&&newCalendar.dataset.calendarKey===calendarKey)newCalendar.scrollLeft=calendarLeft;
 const retry=$("#data-retry-button");
 if(retry)retry.addEventListener("click",()=>{retry.disabled=true;retry.textContent="새로 연결하는 중";window.location.reload();});
 updateWorkAlerts();
 if(currentSellerPopupId&&!$("#seller-detail-modal").classList.contains("hidden")){
  const group=matchingSellerGroup(currentSellerPopupId);
  if(!group)closeSellerPopup();
 }

 if(state.page==="import"&&!state.demo&&state.staff?.role==="admin"){mountSeedImporter(db);mountBackupExport(db);}
 $("#page-body").querySelectorAll("[data-nav]").forEach(el=>el.addEventListener("click",()=>{clearSellerLink();state.page=el.dataset.nav;render();}));

 $("#page-body").querySelectorAll("[data-move]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.move==="0"){state.selectedMonth=todayLocal().slice(0,7);state.calendarSelectedDate=null;state.weekStart=null;render();}else{state.weekStart=null;changeMonth(Number(el.dataset.move));}}));
 const monthInput=$("#selected-month");if(monthInput)monthInput.addEventListener("change",e=>{if(!validCalendarMonth(e.target.value)){e.target.value=shownMonth();return;}state.selectedMonth=e.target.value;state.calendarSelectedDate=null;state.weekStart=null;render();});
 bindSearchInput("#month-search","monthSearch");
 bindSearchInput("#product-search","productSearch");
 bindSearchInput("#activity-search","activitySearch");
 $("#page-body").querySelectorAll("[data-seller-share]").forEach(btn=>btn.addEventListener("click",()=>copySellerKakaoInfo(btn.dataset.sellerShare)));
 $("#page-body").querySelectorAll("[data-seller-excel]").forEach(btn=>btn.addEventListener("click",()=>exportSellerTrades(btn.dataset.sellerExcel)));
 $("#page-body").querySelectorAll("[data-seller-proposal]").forEach(btn=>btn.addEventListener("click",()=>sellerProposalModal(btn.dataset.sellerProposal)));
 $("#page-body").querySelectorAll("[data-seller-new-buy]").forEach(btn=>btn.addEventListener("click",()=>openBuyModalSafely(null,btn.dataset.sellerNewBuy)));
 $("#page-body").querySelectorAll("[data-brand-sellers]").forEach(btn=>btn.addEventListener("click",()=>showProductInsightSellers(btn.dataset.brandSellers,true)));
 $("#page-body").querySelectorAll("[data-brand-detail]").forEach(btn=>btn.addEventListener("click",()=>brandProductModal(btn.dataset.brandDetail)));
 $("#page-body").querySelectorAll("[data-audit-family]").forEach(btn=>btn.addEventListener("click",()=>productFamilyModal(btn.dataset.auditFamily)));
 $("#page-body").querySelectorAll("[data-product-page]").forEach(btn=>btn.addEventListener("click",()=>{state.productPage+=Number(btn.dataset.productPage);render();}));
 $("#page-body").querySelectorAll("[data-product-view]").forEach(el=>el.addEventListener("click",()=>{state.productView=el.dataset.productView;render();}));
 $("#page-body").querySelectorAll("[data-product-status]").forEach(el=>el.addEventListener("click",()=>{state.productStatus=el.dataset.productStatus;state.productPage=1;render();}));
 const productSort=$("#product-sort");
 if(productSort)productSort.addEventListener("change",()=>{state.productSort=productSort.value;state.productPage=1;render();});

 bindSearchInput("#insight-search","insightSearch");
 const insightSort=$("#insight-sort");
 if(insightSort)insightSort.addEventListener("change",()=>{state.insightSort=insightSort.value;state.insightPage=1;render();});
 $("#page-body").querySelectorAll("[data-insight-page]").forEach(el=>el.addEventListener("click",()=>{state.insightPage+=Number(el.dataset.insightPage);render();}));
 $("#page-body").querySelectorAll("[data-insight-product]").forEach(el=>el.addEventListener("click",()=>showProductInsightSellers(el.dataset.insightProduct)));

 $("#page-body").querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>{state.scheduleView=el.dataset.view;render();}));
 $("#page-body").querySelectorAll("[data-schedule-status]").forEach(el=>el.addEventListener("click",()=>{
  state.scheduleStatusFilter=el.dataset.scheduleStatus;render();
 }));
 const scheduleSort=$("#schedule-sort");
 if(scheduleSort)scheduleSort.addEventListener("change",()=>{state.scheduleSort=scheduleSort.value;render();});

 $("#page-body").querySelectorAll("[data-calendar-mode]").forEach(el=>el.addEventListener("click",()=>{
  const next=el.dataset.calendarMode;
  if(next==="week"&&state.calendarMode!=="week")state.weekStart=weekStartFor(shownMonth()===todayLocal().slice(0,7)?todayLocal():shownMonth()+"-01");
  state.calendarMode=next;
  if(state.page==="dashboard")state.calendarSelectedDate=null;
  render();
 }));
 $("#page-body").querySelectorAll("[data-week-move]").forEach(el=>el.addEventListener("click",()=>weekNavigation(Number(el.dataset.weekMove))));

 $("#page-body").querySelectorAll("[data-calendar-date]").forEach(el=>el.addEventListener("click",()=>{
  const date=el.dataset.calendarDate;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  if(state.calendarMode!=="week"&&date.slice(0,7)!==shownMonth())state.selectedMonth=date.slice(0,7);
  state.calendarSelectedDate=date;
  if(state.page==="dashboard")state.dashboardPanelMode="date";
  render();
 }));
 $("#page-body").querySelectorAll("[data-calendar-add]").forEach(el=>el.addEventListener("click",()=>{
  const date=el.dataset.calendarAdd;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  openBuyModalSafely(null,null,date);
 }));


 $("#page-body").querySelectorAll("[data-expand-week]").forEach(el=>el.addEventListener("click",()=>{const key=el.dataset.expandWeek;state.expandedCalendarWeeks[key]=!state.expandedCalendarWeeks[key];render();}));
 $("#page-body").querySelectorAll("[data-quick]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.quick==="seller")sellerModal();if(el.dataset.quick==="buy")openBuyModalSafely();if(el.dataset.quick==="activity")activityModal();}));
 $("#page-body").querySelectorAll("[data-prep-open]").forEach(button=>button.addEventListener("click",()=>{
  preflightModal(button.dataset.prepOpen);
 }));
 $("#page-body").querySelectorAll("[data-dashboard-side]").forEach(button=>button.addEventListener("click",()=>{
  state.dashboardPanelMode=button.dataset.dashboardSide;render();
 }));
 $("#page-body").querySelectorAll("[data-dashboard-task]").forEach(button=>button.addEventListener("click",()=>{
  state.dashboardTaskFilter=button.dataset.dashboardTask;render();
 }));

 bindSearchInput("#seller-search","search");
 $("#page-body").querySelectorAll("[data-seller-filter]").forEach(button=>button.addEventListener("click",()=>{
  state.sellerOperationFilter=button.dataset.sellerFilter;state.sellerPage=1;render();
 }));
 const activityType=$("#activity-type");
 if(activityType)activityType.addEventListener("change",()=>{state.activityType=activityType.value;state.activityPage=1;render();});
 $("#page-body").querySelectorAll("[data-activity-page]").forEach(button=>button.addEventListener("click",()=>{
  state.activityPage+=Number(button.dataset.activityPage);render();
 }));

 $("#page-body").querySelectorAll("[data-seller-page]").forEach(btn=>btn.addEventListener("click",()=>{state.sellerPage+=Number(btn.dataset.sellerPage);render();}));
 const exportSellers=$("#page-body [data-export-sellers]");
 if(exportSellers)exportSellers.addEventListener("click",sellerCSV);
 $("#page-body").querySelectorAll("[data-act]").forEach(el=>el.addEventListener("click",()=>{
 const action=el.dataset.act,id=el.dataset.id;
 if(action==="view-seller")openSellerPopup(id);
 if(action==="edit-seller"){const item=state.sellers.find(x=>x.id===id);if(item)sellerModal(item);else notify("수정할 셀러를 찾지 못했습니다.");}
 if(action==="edit-product"){const item=state.products.find(x=>x.id===id);if(item)productModal(item);else notify("수정할 상품을 찾지 못했습니다.");}
 if(action==="view-product-family")productFamilyModal(el.dataset.canonical);
 if(action==="toggle-product"){const product=state.products.find(x=>x.id===id);if(product)setProductActive(id,product.active===false);}
 if(action==="toggle-product-group"){const group=productMasterGroups().find(g=>g.name===el.dataset.canonical);if(group)productGroupToggle(group.name,!group.active);}
 if(action==="edit-buy"){const buy=state.buys.find(x=>x.id===id);if(buy)openBuyModalSafely(buy);else notify("수정할 공구 기록을 찾지 못했습니다. 목록을 새로 확인해주세요.");}
 if(action==="contact")activityModal(id);
 if(action==="seller-proposal")sellerProposalModal(id);
 if(action==="templates"){state.expandedReminderId=state.expandedReminderId===id?null:id;render();}
 if(action==="complete-reminder")reminderCompleteModal(id);
 if(action==="copy-template"){
  const reminder=reminders().find(x=>x.seller.id===id);
  const index=Number(el.dataset.template);
  const template=reminder&&reminderTemplates(reminder.seller,reminder.buy)[index];
  if(!template)return notify("복사할 문구를 찾을 수 없습니다.");
  if(!navigator.clipboard?.writeText)return notify("브라우저에서 클립보드 복사를 사용할 수 없습니다.");
  navigator.clipboard.writeText(template.message).then(()=>{
    state.reminderCopied[id]=index;
    notify(template.title+" 문구를 복사했습니다. 실제 전송 후 연락 완료를 기록해주세요.");
  }).catch(()=>notify("문구 복사에 실패했습니다."));
 }
 }));
}
start();
