import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { mountSeedImporter } from "./import-seed-ui.js";
import { mountBackupExport } from "./backup-export.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const state = { user: null, staff: null, sellers: [], buys: [], products: [], activities: [], page: "dashboard", search: "", unsubs: [], modalSave: null, demo:false, selectedMonth:null, scheduleView:"list", monthSearch:"", selectedSellerId:null, expandedReminderId:null, reminderCopied:{}, expandedCalendarWeeks:{}, calendarMode:"month", weekStart:null };
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
      const importNav=document.querySelector("[data-page=import]");
      if(importNav)importNav.classList.toggle("hidden",state.staff.role!=="admin");
      $("#whoami").textContent=state.staff.name || user.email;
      $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
      ["sellers","groupbuys","products","activities"].forEach(kind=>{
        const ref=kind==="products"?collection(db,kind):query(collection(db,kind),orderBy("createdAt","desc"));
        const off=onSnapshot(ref,snapshot=>{
          const records=snapshot.docs.map(d=>({id:d.id,...d.data()}));
          if(kind==="sellers")state.sellers=records;
          if(kind==="groupbuys")state.buys=records;
          if(kind==="products")state.products=records;
          if(kind==="activities")state.activities=records;
          render();
        },err=>notify("데이터 조회 실패: "+err.message));
        state.unsubs.push(off);
      });
      render();
    } catch(err){$("#login-error").textContent=err.message;await signOut(auth);}
  });
}
function clearListeners(){state.unsubs.forEach(fn=>fn());state.unsubs=[];state.sellers=[];state.buys=[];state.products=[];state.activities=[];}
$("#login-form").addEventListener("submit",async e=>{
  e.preventDefault();$("#login-error").textContent="";
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
  }
});
$("#logout").onclick=()=>{if(state.demo){location.reload();return;}signOut(auth);};
$("#preview-button").onclick=()=>enterPreview();
$("#close-modal").onclick=closeModal;$("#cancel-modal").onclick=closeModal;
$("#modal").addEventListener("click",e=>{if(e.target===$("#modal"))closeModal();});
document.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>{state.page=btn.dataset.page;state.search="";render();}));
$("#home-logo").addEventListener("click",()=>{state.page="dashboard";state.selectedMonth=todayLocal().slice(0,7);state.weekStart=null;state.search="";render();window.scrollTo?.({top:0,behavior:"smooth"});});
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
    f("name","셀러명","text",item?.name,true)+f("channel","인스타그램 계정","text",item?.channel||item?.instagramId)+f("instagramUrl","인스타그램 URL","url",item?.instagramUrl||"",false,true)+f("followerCountLatestRecorded","최근 기록된 팔로워 수","number",item?.followerCountLatestRecorded??"")+f("contact","연락처","text",item?.contact)+f("cycleDays","리마인드 주기 (일)","number",item?.cycleDays??30,true)+textarea("note","셀러 메모",item?.note||item?.notes),
    async data=>{
      const record={name:data.name.trim(),channel:data.channel.trim(),instagramUrl:data.instagramUrl.trim(),followerCountLatestRecorded:data.followerCountLatestRecorded?Number(data.followerCountLatestRecorded):null,contact:data.contact.trim(),note:data.note.trim(),cycleDays:Math.max(1,Number(data.cycleDays)||30),updatedAt:serverTimestamp()};
      if(!record.name)throw new Error("셀러명을 입력해주세요.");
      if(item)await updateDoc(doc(db,"sellers",item.id),record);
      else await addDoc(collection(db,"sellers"),{...record,createdAt:serverTimestamp()});
    });
}
function buyModal(item=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다.");return;}
 const cmp=(a,b)=>String(a||"").localeCompare(String(b||""),"ko-KR",{sensitivity:"base",numeric:true});
 const productLabel=p=>String(p.standardName||p.productName||p.name||"").trim();
 const sellerMap=new Map(state.sellers.map(s=>[s.id,s]));
 const products=new Map();
 for(const p of state.products){
  const label=productLabel(p);if(label)products.set(label,{id:p.id,name:label});
 }
 for(const b of state.buys){
  const label=String(b.product||b.productName||"").trim();
  if(label&&!products.has(label))products.set(label,{id:"legacy:"+label,name:label});
 }
 const sellerChoices=[...sellerMap.values()].sort((a,b)=>cmp(a.name,b.name));
 const productChoices=[...products.values()].sort((a,b)=>cmp(a.name,b.name));
 const originalSeller=sellerMap.get(item?.sellerId);
 const initialProduct=(item?.product||item?.productName||"").trim();
 const initialProductChoice=productChoices.find(p=>p.id===item?.productId||p.name===initialProduct);
 let selectedSellerId=originalSeller?.id||"";
 let selectedProduct=initialProductChoice||null;
 const defaultDate=(state.selectedMonth&&state.selectedMonth!==todayLocal().slice(0,7))?shownMonth()+"-01":todayLocal();
 const defaultStart=item?.startDate||defaultDate;
 const categoryOptions=[["","선택 안 함"],["마이크로","마이크로"],["일반","일반"]];
 const fields=
  '<div class="full combo-wrap"><label for="seller-combo">셀러</label><input id="seller-combo" type="text" autocomplete="off" placeholder="셀러명 또는 인스타그램 계정 검색" value="'+h(originalSeller?.name||"")+'" aria-autocomplete="list" aria-expanded="false"/><input id="seller-id" name="sellerId" type="hidden" value="'+h(selectedSellerId)+'"/><div id="seller-suggestions" class="combo-options hidden" role="listbox"></div></div>'
 +'<div class="full inline-create hidden" id="create-seller"><strong>신규 셀러 등록</strong><div class="inline-create-grid"><label>셀러명<input id="new-seller-name" type="text"/></label><label>인스타그램 계정<input id="new-seller-handle" type="text" placeholder="@계정"/></label><label>팔로워 수<input id="new-seller-followers" type="number" min="0"/></label><label>연락처<input id="new-seller-contact" type="text"/></label></div><div class="inline-create-buttons"><button type="button" class="secondary" id="cancel-new-seller">취소</button><button type="button" class="primary" id="save-new-seller">셀러 등록</button></div></div>'
 +'<div class="full seller-linked-data hidden" id="linked-seller-info" aria-live="polite"></div>'
 +'<div class="full combo-wrap"><label for="product-combo">상품명</label><input id="product-combo" type="text" autocomplete="off" placeholder="상품명 검색" value="'+h(selectedProduct?.name||initialProduct)+'" aria-autocomplete="list" aria-expanded="false"/><input id="product-id" name="productId" type="hidden" value="'+h(selectedProduct?.id||"")+'"/><div id="product-suggestions" class="combo-options hidden" role="listbox"></div></div>'
 +'<div class="full inline-create hidden" id="create-product"><strong>신규 상품 등록</strong><label>상품명<input id="new-product-name" type="text"/></label><div class="inline-create-buttons"><button type="button" class="secondary" id="cancel-new-product">취소</button><button type="button" class="primary" id="save-new-product">상품 등록</button></div></div>'
 +f("startDate","시작일","date",defaultStart,true)+f("endDate","종료일","date",item?.endDate||defaultStart,true)
 +select("status","진행 상태",[["예정","예정"],["진행중","진행중"],["완료","완료"],["취소","취소"]],item?.status==="기록"?"완료":item?.status||"예정")
 +f("followers","팔로워 수","number",item?.followers??"")
 +select("legacyCategory","마이크로 및 일반",categoryOptions,item?.legacyCategory||"")
 +f("paymentWindow","결제창","text",item?.paymentWindow||"")
 +f("settlementRequest","정산 요청","text",item?.settlementRequest||"")
 +f("instagramUrl","인스타그램 URL","url",item?.instagramUrl||"",false,true)
 +f("round","진행 회차","text",item?.round||"")
 +textarea("note","비고 및 특이사항",item?.note??item?.memo??"")
 +textarea("event","이벤트",item?.event||"");
 openModal(item?"공구 수정":"새 공구 등록",fields,async data=>{
  const seller=sellerMap.get(data.sellerId);
  if(!seller)throw new Error("셀러를 검색한 뒤 아래 목록에서 선택하거나 신규 등록해주세요.");
  const prod=[...products.values()].find(p=>p.id===data.productId);
  if(!prod)throw new Error("상품을 검색한 뒤 아래 목록에서 선택하거나 신규 등록해주세요.");
  if(data.endDate<data.startDate)throw new Error("종료일이 시작일보다 빠릅니다.");
  const record={
   sellerId:seller.id,sellerName:seller.name,
   productId:prod.id.startsWith("legacy:")?"":prod.id,
   product:prod.name,productName:prod.name,
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
  const product=[...products.values()].find(p=>p.id===id);if(!product)return;
  selectedProduct=product;$m("product-id").value=id;productInput.value=product.name;
  $m("product-suggestions").classList.add("hidden");productInput.setAttribute("aria-expanded","false");
 };
 const setupCombo=(input,dropdown,listFn,selectFn,onCreate,clearFn)=>{
  let currentItems=[];
  const show=()=>{
   const word=input.value.trim().toLocaleLowerCase();
   currentItems=listFn().filter(x=>x.name.toLocaleLowerCase().includes(word)||x.search?.toLocaleLowerCase().includes(word)).slice(0,30);
   const matches=currentItems.map((x,i)=>'<button type="button" class="combo-option" role="option" data-combo-index="'+i+'">'+h(x.name)+'</button>').join("");
   const heading=currentItems.length?matches:'<p class="combo-empty">검색 결과가 없습니다.</p>';
   dropdown.innerHTML=heading+'<button type="button" class="combo-create" data-combo-create>+ 새 '+(input===sellerInput?"셀러":"상품")+' 등록</button>';
   dropdown.classList.remove("hidden");input.setAttribute("aria-expanded","true");
   dropdown.querySelectorAll("[data-combo-index]").forEach(el=>el.addEventListener("click",()=>selectFn(currentItems[Number(el.dataset.comboIndex)].id)));
   dropdown.querySelector("[data-combo-create]").onclick=()=>{dropdown.classList.add("hidden");onCreate(input.value.trim());};
  };
  input.addEventListener("input",()=>{clearFn();show();});
  input.addEventListener("focus",show);
  input.addEventListener("keydown",event=>{
   if(event.key==="Escape"){dropdown.classList.add("hidden");return;}
   if(event.key==="Enter"&&currentItems.length&& !dropdown.classList.contains("hidden")){event.preventDefault();selectFn(currentItems[0].id);}
  });
  input.addEventListener("blur",()=>setTimeout(()=>{dropdown.classList.add("hidden");input.setAttribute("aria-expanded","false");},160));
 };
 setupCombo(sellerInput,$m("seller-suggestions"),
  ()=>[...sellerMap.values()].sort((a,b)=>cmp(a.name,b.name)).map(x=>({id:x.id,name:x.name,search:[x.instagramId,x.channel].filter(Boolean).join(" ")})),
  chooseSeller,name=>{$m("create-seller").classList.remove("hidden");$m("new-seller-name").value=name;$m("new-seller-name").focus();},
  ()=>{selectedSellerId="";$m("seller-id").value="";$m("linked-seller-info").classList.add("hidden");}
 );
 setupCombo(productInput,$m("product-suggestions"),
  ()=>[...products.values()].sort((a,b)=>cmp(a.name,b.name)),
  chooseProduct,name=>{$m("create-product").classList.remove("hidden");$m("new-product-name").value=name;$m("new-product-name").focus();},
  ()=>{selectedProduct=null;$m("product-id").value="";}
 );
 $m("cancel-new-seller").onclick=()=>$m("create-seller").classList.add("hidden");
 $m("cancel-new-product").onclick=()=>$m("create-product").classList.add("hidden");
 $m("save-new-seller").onclick=async()=>{
  const button=$m("save-new-seller"),name=$m("new-seller-name").value.trim();
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
   chooseSeller(ref.id);$m("create-seller").classList.add("hidden");
   notify("셀러가 등록되었습니다. 공구 입력을 이어서 진행하세요.");
  }catch(error){notify("셀러 등록 실패: "+error.message);}finally{button.disabled=false;}
 };
 $m("save-new-product").onclick=async()=>{
  const button=$m("save-new-product"),name=$m("new-product-name").value.trim();
  if(!name)return notify("상품명을 입력해주세요.");
  const dup=products.get(name);if(dup){chooseProduct(dup.id);$m("create-product").classList.add("hidden");return;}
  button.disabled=true;
  try{
   const result=await addDoc(collection(db,"products"),{standardName:name,aliases:[],source:"manual",createdByUid:state.user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   const choice={id:result.id,name};products.set(name,choice);chooseProduct(choice.id);
   $m("create-product").classList.add("hidden");
   notify("상품이 등록되었습니다. 공구 입력을 이어서 진행하세요.");
  }catch(error){notify("상품 등록 실패: "+error.message);}finally{button.disabled=false;}
 };
 if(selectedSellerId)sellerProfile(selectedSellerId,false);
}
function activityModal(sellerId=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다. Firebase 연결 후 이용해주세요.");return;}
 if(!state.sellers.length){notify("셀러를 먼저 등록해주세요.");return;}
 const choices=state.sellers.map(s=>[s.id,s.name]);
 openModal("연락·영업 활동 기록",
 select("sellerId","셀러",choices,sellerId||choices[0][0])+select("type","활동 유형",[["카카오톡","카카오톡"],["전화","전화"],["DM","DM"],["미팅","미팅"],["기타","기타"]],"카카오톡")+f("contactOwner","담당자 이름","text",state.staff?.name||"",true)+f("nextFollowUpAt","다음 연락 예정일","date")+textarea("memo","활동 내용 (필수)"),
 async data=>{
 const seller=state.sellers.find(s=>s.id===data.sellerId);
 if(!seller||!data.memo.trim())throw new Error("셀러와 활동 내용을 입력해주세요.");
 if(!data.contactOwner?.trim())throw new Error("담당자 이름을 입력해주세요.");
 await addDoc(collection(db,"activities"),{sellerId:seller.id,sellerName:seller.name,type:data.type,contactOwner:data.contactOwner.trim(),memo:data.memo.trim(),nextFollowUpAt:data.nextFollowUpAt||null,actorUid:state.user.uid,actorName:state.staff.name||state.user.email,createdAt:serverTimestamp()});
 });
}
function latestBuy(sellerId){
 return state.buys.filter(b=>b.sellerId===sellerId&&b.status!=="취소"&&b.endDate&&b.endDate<=todayLocal()).sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
}
function latestActivity(sellerId){
 return state.activities.filter(a=>a.sellerId===sellerId).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
}
function reminders(){
 const today=todayLocal(), yearStart=today.slice(0,4)+"-01-01";
 return state.sellers.map(s=>{
  const b=latestBuy(s.id),a=latestActivity(s.id);
  // A completed reminder remains closed unless a new follow-up date was deliberately set.
  if(a?.type==="리마인드 완료"&&!a.nextFollowUpAt)return null;
  const manual=a?.type==="리마인드 완료"?a.nextFollowUpAt:(a?.nextFollowUpAt||s.nextFollowUpAt);
  const activityDate=a?.createdAt?.toDate?.()?.toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"});
  const completedAfterBuy=activityDate&&b&&activityDate>b.endDate;
  if(!manual&&(!b||b.endDate<yearStart))return null;
  if(!manual&&completedAfterBuy)return null;
  const due=manual||(b?datePlus(b.endDate,s.cycleDays||30):null);
  if(!due||due>today)return null;
  if(!manual&&daysBetween(due,today)>30)return null;
  return {seller:s,buy:b||{product:"-",endDate:"-"},due,overdue:daysBetween(due,today)};
 }).filter(Boolean).sort((a,b)=>b.overdue-a.overdue);
}
function metric(title,value,description){return '<div class="metric"><div class="label">'+title+'</div><div class="number">'+value+'</div><div class="sub">'+description+'</div></div>';}
function wrap(title,body,right=""){return '<div class="panel"><div class="panel-title"><h2>'+title+'</h2>'+right+'</div>'+body+'</div>';}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(v=>'<th>'+h(v)+'</th>').join("")+'</tr></thead><tbody>'+ (rows.length?rows.join(""):'<tr><td colspan="'+headers.length+'" class="empty">등록된 데이터가 없습니다.</td></tr>')+'</tbody></table></div>';}


function shownMonth(){return state.selectedMonth||todayLocal().slice(0,7);}
function changeMonth(amount){const [y,m]=shownMonth().split("-").map(Number);const next=new Date(Date.UTC(y,m-1+amount,1)).toISOString().slice(0,7);if(next<todayLocal().slice(0,4)+"-01")return;state.selectedMonth=next;render();}
function weekStartFor(date){return datePlus(date,-new Date(date+"T00:00:00Z").getUTCDay());}
function activeWeekStart(){const month=shownMonth(),today=todayLocal();return state.weekStart||weekStartFor(month===today.slice(0,7)?today:month+"-01");}
function weekNavigation(delta){state.weekStart=datePlus(activeWeekStart(),7*delta);state.selectedMonth=datePlus(state.weekStart,3).slice(0,7);render();}
function calendarModeControls(){
 const weekly=state.calendarMode==="week",start=activeWeekStart();
 return '<div class="cal-display-controls"><div class="cal-mode-switch"><button type="button" data-calendar-mode="month" class="'+(!weekly?"selected":"")+'">월간</button><button type="button" data-calendar-mode="week" class="'+(weekly?"selected":"")+'">주간</button></div>'
 +(weekly?'<div class="cal-week-navigator"><button data-week-move="-1" type="button">‹</button><strong>'+h(start.slice(5))+' ~ '+h(datePlus(start,6).slice(5))+'</strong><button data-week-move="1" type="button">›</button></div>':"")+'</div>';
}
function monthlyBuys(){const m=shownMonth();return state.buys.filter(b=>b.startDate&&b.endDate&&b.startDate.slice(0,7)<=m&&b.endDate.slice(0,7)>=m).sort((a,b)=>a.startDate.localeCompare(b.startDate));}
function monthPicker(){
 return '<div class="month-controls"><div class="month-title"><strong>월별 공구 운영 대장</strong></div><div class="month-buttons"><button data-move="-1" aria-label="이전 달">‹</button><input id="selected-month" type="month" value="'+h(shownMonth())+'" min="'+todayLocal().slice(0,4)+'-01" max="2030-12"/><button data-move="1" aria-label="다음 달">›</button><button data-move="0">이번 달</button></div></div>';
}
function scheduleStatus(b){
 if(b.status==="취소")return "취소";
 const today=todayLocal();
 return b.startDate>today?"예정":b.endDate<today?"완료":"진행 중";
}
function monthlyRows(list,detail=false){
 return list.map(b=>{
  const status=scheduleStatus(b);
  const common='<tr><td><button type="button" class="seller-cell" data-act="view-seller" data-id="'+h(b.sellerId)+'">'+h(b.sellerName||"미확인")+'</button></td><td>'+h(b.product||b.productName||"-")+'</td>';
  if(!detail)return common+'<td>'+h(b.startDate||"-")+'</td><td>'+h(b.endDate||"-")+'</td><td><span class="status '+(status==="진행 중"?"good":"")+'">'+status+'</span></td><td><button type="button" class="mini-button" data-act="edit-buy" data-id="'+h(b.id)+'">수정</button></td></tr>';
  const seller=state.sellers.find(x=>x.id===b.sellerId);
  const ig=b.instagramUrl||seller?.instagramUrl||"";
  const insta=ig.startsWith("https://")?'<a href="'+h(ig)+'" target="_blank" rel="noopener noreferrer">열기</a>':h(ig||"-");
  return common+'<td>'+h(b.followers??seller?.followerCountLatestRecorded??"-")+'</td><td>'+h(b.startDate||"-")+'</td><td>'+h(b.endDate||"-")+'</td><td>'+h(b.settlementRequest||"-")+'</td><td>'+h(b.paymentWindow||"-")+'</td><td>'+h(b.legacyCategory||"-")+'</td><td>'+insta+'</td><td class="ledger-notes" title="'+h([b.round,b.note||b.memo,b.event].filter(Boolean).join(" · ")) +'">'+h([b.round,b.note||b.memo,b.event].filter(Boolean).join(" · ")||"-")+'</td><td><span class="status '+(status==="진행 중"?"good":"")+'">'+status+'</span></td><td><button data-act="edit-buy" data-id="'+h(b.id)+'" class="mini-button">수정</button></td></tr>';
 });
}
function monthGrid(list,options={}){
 const [y,m]=shownMonth().split("-").map(Number);
 const monthStart=shownMonth()+"-01";
 const monthEnd=datePlus(new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),0);
 const firstWeekStart=options.weekOnly?activeWeekStart():datePlus(monthStart,-new Date(Date.UTC(y,m-1,1)).getUTCDay());
 const lastWeekEnd=options.weekOnly?datePlus(firstWeekStart,6):datePlus(monthEnd,6-new Date(Date.UTC(y,m-1,new Date(Date.UTC(y,m,0)).getUTCDate())).getUTCDay());
 const allowed=list.filter(b=>b.id&&b.startDate&&b.endDate&&b.startDate<=lastWeekEnd&&b.endDate>=firstWeekStart&&b.status!=="취소");
 const maxVisible=options.weekOnly?6:(options.compact?3:4);
 const weekCount=Math.round(daysBetween(firstWeekStart,lastWeekEnd)+1)/7;
 const weeks=[];
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
  for(const e of events){
   let lane=laneEnds.findIndex(last=>last<e.from);
   if(lane<0)lane=laneEnds.length;
   laneEnds[lane]=e.to;e.lane=lane;
  }
  const weekId=weekStart;
  const expanded=!!state.expandedCalendarWeeks[weekId],visible=expanded?laneEnds.length:Math.min(maxVisible,laneEnds.length);
  const height=38+Math.max(visible,1)*28+27;
  const dayCells=Array.from({length:7},(_,day)=>{
   const date=datePlus(weekStart,day),inMonth=date.slice(0,7)===shownMonth();
   const count=allowed.filter(b=>b.startDate<=date&&b.endDate>=date).length;
   return '<div class="cal-bg-day '+(!inMonth?'cal-outside ':'')+(date===todayLocal()?'cal-today':'')+'" style="grid-column:'+(day+1)+';grid-row:1 / -1"><div class="cal-date-head"><b>'+Number(date.slice(-2))+'</b>'+(count?'<small>'+count+'건</small>':'')+'</div></div>';
  }).join("");
  const bars=events.filter(e=>e.lane<visible).map(e=>{
   const startCol=daysBetween(weekStart,e.from)+1,span=daysBetween(e.from,e.to)+1;
   const startOfEvent=e.from===e.startDate,endOfEvent=e.to===e.endDate;
   const tip=(e.sellerName||"미확인")+" · "+(e.product||e.productName||"상품 미확인")+" ("+e.startDate+" ~ "+e.endDate+")";
   const textLabel=(e.sellerName||"미확인")+" · "+(e.product||e.productName||"상품 미확인");
   return '<button type="button" class="cal-range '+(startOfEvent?'cal-range-start ':'cal-range-continue ')+(endOfEvent?'cal-range-end':'')+'" data-act="edit-buy" data-id="'+h(e.id)+'" style="grid-column:'+startCol+' / span '+span+';grid-row:'+(e.lane+2)+'" title="'+h(tip)+'">'+h(textLabel)+'</button>';
  }).join("");
  const hiddenCount=events.filter(e=>e.lane>=maxVisible).length;
  const more=laneEnds.length>maxVisible?'<button type="button" class="cal-expand" style="grid-column:1 / -1;grid-row:'+(visible+2)+'" data-expand-week="'+weekId+'" aria-expanded="'+expanded+'">'+(expanded?'접기 −':'+'+hiddenCount+'건 더보기')+'</button>':'';
  weeks.push('<section class="cal-week-row" style="--cal-row-height:'+height+'px;--cal-visible-rows:'+Math.max(visible,1)+'" aria-label="'+fmt(weekStart)+'부터 '+fmt(weekEnd)+'까지">'+dayCells+bars+more+'</section>');
 }
 return '<div class="cal-scroll"><div class="cal-weekdays">'+["일","월","화","수","목","금","토"].map(d=>'<div class="cal-week">'+d+'</div>').join("")+'</div><div class="cal-weeks">'+weeks.join("")+'</div></div>';
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
 const today=todayLocal(), rem=reminders(), opp=opportunitiesData(), active=opp.filter(x=>x.level==="최근 활성").length;
 const running=state.buys.filter(b=>b.status!=="취소"&&b.startDate<=today&&b.endDate>=today);
 const upcoming=state.buys.filter(b=>b.status!=="취소"&&b.startDate>today).sort((a,b)=>a.startDate.localeCompare(b.startDate));
 const month=state.buys.filter(b=>b.status!=="취소"&&b.startDate?.slice(0,7)===today.slice(0,7));
 const alertCount=rem.length, dormant=opp.filter(x=>["관심 필요","재접촉 우선","장기 공백"].includes(x.level)).length;

 const kpis='<div class="metrics metrics-dashboard">'+metric("전체 셀러",state.sellers.length.toLocaleString("ko-KR"),"등록된 셀러")+metric("오늘 연락 필요",alertCount,"연락 예정일 경과")+metric("진행 중 공구",running.length,"현재 진행 중")+metric("선택한 달 공구",monthlyBuys().length,"월별 등록된 일정")+'</div>';
 const actionRows=rem.slice(0,6).map(x=>'<tr><td><strong>'+h(x.seller.name)+'</strong><small class="table-sub">마지막 공구 '+h(x.buy.endDate)+'</small></td><td>'+h(x.buy.product)+'</td><td><span class="status alert">'+h(x.due)+'</span></td><td><button class="mini-button" data-act="contact" data-id="'+h(x.seller.id)+'">연락 기록 ↗</button></td></tr>');
 const monthly=monthlyBuys();
 const monthlyPanel=wrap("월별 공구 현황",'<div class="monthly-tools"><span>'+h(shownMonth())+' · '+monthly.length+'건</span><div class="monthly-actions"><button type="button" class="primary" data-quick="buy">+ 공구 등록</button><button class="panel-link" data-nav="schedule">전체 보기</button></div></div>'+table(["셀러","상품","시작일","종료일","상태","수정"],monthlyRows(monthly.slice(0,10))));
 const actionPanel=wrap("오늘 할 일",'<p class="panel-description">최근 공구와 직접 등록한 후속 연락 일정만 표시합니다.</p>'+table(["셀러","최근 상품","재접촉 예정","실행"],actionRows),'<button data-nav="reminders" class="panel-link">전체 보기</button>');
 const scheduleRows=[...running,...upcoming].slice(0,6).map(b=>'<tr><td><strong>'+h(b.sellerName)+'</strong></td><td>'+h(b.product)+'</td><td>'+h(b.startDate.slice(5))+' ~ '+h(b.endDate.slice(5))+'</td><td><span class="status '+(b.startDate<=today?"good":"")+'">'+(b.startDate<=today?"진행 중":"예정")+'</span></td></tr>');
 const schedule=wrap("예정 공구",table(["셀러","상품","일정","상태"],scheduleRows),'<button data-nav="schedule" class="panel-link">전체 보기</button>');
 const high=opp.filter(x=>x.rank<=2).slice(0,5);
 const opportunityRows=high.map(x=>'<div class="opportunity-row"><div><strong>'+h(x.seller.name)+'</strong><small>최근 공구 '+h(x.last.product)+' · '+x.count+'회 진행</small></div><div class="opportunity-right"><span class="status '+(x.rank===0?"alert":"")+'">'+h(x.level)+'</span><small>'+x.gap+'일 공백</small></div></div>').join("");
 const opportunities=wrap("재접촉 대상",'<p class="panel-description">과거 진행 이력과 공구 공백을 기반으로 분류한 후보입니다.</p>'+(opportunityRows||'<div class="empty">해당되는 후보가 없습니다.</div>')+'<p class="panel-note">※ 현재 거래 이력을 기준으로 분류했습니다.</p>','<button data-nav="opportunities" class="panel-link">전체 보기</button>');
 const recent=state.activities.slice(0,5).map(a=>'<div class="activity-row"><span class="activity-dot"></span><div><strong>'+h(a.sellerName)+'</strong><p>'+h(a.type)+' · '+h(a.memo)+'</p></div><small>'+h(dt(a.createdAt))+'</small></div>').join("");
 const activity=wrap("최근 팀 활동",recent||'<div class="empty">아직 기록된 활동이 없습니다.</div>','<button data-nav="activity" class="panel-link">전체 보기</button>');
 const productCounts={};state.buys.filter(b=>b.status!=="취소").forEach(b=>{productCounts[b.product]=(productCounts[b.product]||0)+1;});
 const topProducts=Object.entries(productCounts).sort((a,b)=>b[1]-a[1]).slice(0,5),max=Math.max(1,...topProducts.map(x=>x[1]));
 const products=wrap("상품별 공구 진행 이력",'<p class="panel-description">공구 진행 횟수 기준</p>'+(topProducts.map(([name,count])=>'<div class="product-bar-row"><div><span>'+h(name)+'</span><strong>'+count+'건</strong></div><div class="product-track"><span style="width:'+(count/max*100)+'%"></span></div></div>').join("")||'<div class="empty">상품 이력이 없습니다.</div>'),'<button data-nav="products" class="panel-link">상품 보기</button>');
 const distribution=[["최근 활성",active],["재접촉 후보",dormant],["공구 예정 및 최근 연락",opp.filter(x=>["공구 예정","최근 연락"].includes(x.level)).length],["과거 공구 없음",Math.max(0,state.sellers.length-opp.length)]];
 const distributionUI=wrap("셀러 현황",'<div class="distribution-chart"><div class="donut" style="--p:'+(state.sellers.length?(active/state.sellers.length*100):0)+'%"><div><strong>'+state.sellers.length+'</strong><small>전체 셀러</small></div></div><div class="distribution-legend">'+distribution.map((x,i)=>'<div><span class="legend-dot legend-'+i+'"></span><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join("")+'</div></div><p class="panel-note">※ 등록된 데이터 기준의 참고 집계입니다.</p>');
 const mainCalendar=wrap("공구 캘린더",monthPicker()+calendarModeControls()+'<div class="home-calendar-sub"><span>등록된 일정 '+monthly.length+'건</span><span>오늘은 '+h(today)+'</span><button type="button" class="panel-link" data-nav="schedule">월별 대장 보기</button><button type="button" class="primary home-calendar-add" data-quick="buy">+ 공구 등록</button></div>'+monthGrid(state.calendarMode==='week'?state.buys:monthly,{compact:true,weekOnly:state.calendarMode==='week'}));
 const quick='<div class="dashboard-actions"><div><strong>빠른 등록</strong></div><div class="quick-actions"><button data-quick="seller">+ 셀러 등록</button><button data-quick="buy">+ 공구 등록</button><button data-quick="activity">+ 연락 기록</button></div></div>';
 return (state.demo?'<div class="demo-alert">미리보기 전용 화면입니다. 아래 셀러와 상품은 모두 가상 예시이며 실제 S2H 데이터가 아닙니다.</div>':'')+mainCalendar+kpis+monthlyPanel+actionPanel+'<div class="layout-two">'+schedule+'</div><div class="layout-two">'+products+distributionUI+'</div>'+activity+'<div class="dashboard-footer">S2H CORPORATION · INTERNAL SELLER OPERATIONS</div>';
}
function productsPage(){
 const counts={};state.buys.filter(b=>b.status!=="취소").forEach(b=>{if(!counts[b.product])counts[b.product]={sellers:new Set(),count:0,last:""};counts[b.product].count++;counts[b.product].sellers.add(b.sellerId);if((b.endDate||"")>counts[b.product].last)counts[b.product].last=b.endDate;});
 const rows=Object.entries(counts).sort((a,b)=>b[1].count-a[1].count).map(([name,x])=>'<tr><td><strong>'+h(name)+'</strong></td><td>'+x.sellers.size+'명</td><td>'+x.count+'건</td><td>'+h(x.last)+'</td></tr>');
 return wrap("상품별 공구 이력 · "+rows.length, '<p class="panel-description">현재 공구 기록에서 집계합니다. 상품 마스터·표준명 매핑은 다음 개발 단계입니다.</p>'+table(["상품명","진행 셀러","공구 건수","최근 종료일"],rows));
}
function opportunitiesPage(){
 const rows=opportunitiesData().map(x=>'<tr><td><strong>'+h(x.seller.name)+'</strong></td><td>'+h(x.last.product)+'</td><td>'+x.count+'회</td><td>'+h(x.last.endDate)+'</td><td>'+x.gap+'일</td><td><span class="status '+(x.rank<=1?"alert":"")+'">'+h(x.level)+'</span></td><td><button class="mini-button" data-act="contact" data-id="'+h(x.seller.id)+'">연락 기록</button></td></tr>');
 return wrap("재접촉 대상",'<p class="panel-description">90일 이상 공백, 180일 이상+3회 진행, 365일 장기 공백 등 기획서 초기 규칙 기반의 참고 분류입니다.</p>'+table(["셀러","최근 상품","공구 횟수","최근 종료","공백","분류","액션"],rows));
}
function proposalsPage(){
 return wrap("제안 파이프라인 · 준비 중",'<div class="pipeline-preview">'+["제안 준비","제안 완료","답변 대기","협의 중","일정 확정"].map((v,i)=>'<div><span class="pipeline-step">'+(i+1)+'</span><strong>'+v+'</strong><small>데이터 연동 예정</small></div>').join("")+'</div><p class="panel-note">현재 제안 DB는 아직 연결되지 않았습니다. 건수와 성과를 임의로 표시하지 않습니다.</p>');
}
function sellerDetailPage(){
 const seller=state.sellers.find(x=>x.id===state.selectedSellerId);
 if(!seller)return wrap("셀러 상세","<p>셀러를 선택해주세요.</p>");
 const buys=state.buys.filter(b=>b.sellerId===seller.id).sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));
 const activities=state.activities.filter(a=>a.sellerId===seller.id);
 const history=buys.map(b=>'<tr><td>'+h(b.product||b.productName||"-")+'</td><td>'+h(b.startDate||"-")+'</td><td>'+h(b.endDate||"-")+'</td><td>'+h(b.round||"-")+'</td><td>'+h(b.paymentWindow||"-")+'</td><td>'+h(b.settlementRequest||"-")+'</td><td>'+h(b.note||b.memo||"-")+'</td><td><button class="mini-button" data-act="edit-buy" data-id="'+h(b.id)+'">수정</button></td></tr>');
 const logs=activities.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td>'+h(a.type)+'</td><td>'+h(a.memo)+'</td><td>'+h(a.contactOwner||a.actorName||"-")+'</td><td>'+h(a.actorName)+'</td></tr>');
 const ig=seller.instagramUrl;
 const link=ig?.startsWith("https://")?'<a target="_blank" rel="noopener noreferrer" href="'+h(ig)+'">인스타그램 열기</a>':h(seller.channel||seller.instagramId||"-");
 const summary='<div class="seller-summary"><div><span>셀러명</span><strong>'+h(seller.name)+'</strong></div><div><span>인스타그램</span>'+link+'</div><div><span>공구 진행 기록</span><strong>'+buys.length+'건</strong></div><div><span>마지막 공구 종료일</span><strong>'+h(buys[0]?.endDate||"-")+'</strong></div></div>';
 return '<div class="detail-nav"><button data-nav="sellers" class="mini-button">← 전체 셀러</button><button class="primary" data-act="contact" data-id="'+h(seller.id)+'">+ 연락 기록</button></div>'
 +wrap("셀러 정보",summary)
 +wrap("전체 공구 이력",'<p class="panel-description">2024년과 2025년 자료를 포함한 거래 이력입니다. 과거 기록은 자동 연락 알림을 생성하지 않습니다.</p>'+table(["상품","시작일","종료일","회차","결제창","정산","비고","수정"],history))
 +wrap("연락 기록",table(["일시","연락 방식","내용","담당자","기록자"],logs));
}
function sellersPage(){
 const term=state.search.toLowerCase();
 const rows=state.sellers.filter(s=>(s.name+" "+s.channel+" "+s.contact).toLowerCase().includes(term)).map(s=>{
 const b=latestBuy(s.id);const a=latestActivity(s.id);
 return '<tr><td><strong>'+h(s.name)+'</strong></td><td>'+h(s.channel||"-")+'</td><td>'+h(s.contact||"-")+'</td><td>'+h(b?.product||"-")+'</td><td>'+h(b?.endDate||"-")+'</td><td>'+h(a?dt(a.createdAt):"-")+'</td><td><button class="mini-button" data-act="view-seller" data-id="'+h(s.id)+'">상세</button> <button class="mini-button" data-act="edit-seller" data-id="'+h(s.id)+'">수정</button> <button class="mini-button" data-act="contact" data-id="'+h(s.id)+'">연락 기록</button></td></tr>';
 });
 return wrap("전체 셀러 · "+state.sellers.length, '<div class="toolbar"><input id="seller-search" placeholder="셀러명, 채널, 연락처로 검색" value="'+h(state.search)+'"/></div>'+table(["셀러명","채널","연락처","최근 공구","종료일","최근 활동","관리"],rows));
}

function schedulePage(){
 const list=monthlyBuys().filter(b=>[b.sellerName,b.product,b.productName,b.note,b.memo].join(" ").toLowerCase().includes(state.monthSearch.toLowerCase()));
 const chooser='<div class="schedule-switch"><button data-view="list" class="'+(state.scheduleView==="list"?"selected":"")+'">목록</button><button data-view="calendar" class="'+(state.scheduleView==="calendar"?"selected":"")+'">달력</button></div>';
 const toolbar='<div class="ledger-toolbar"><input type="search" id="month-search" placeholder="셀러명, 상품명 검색" value="'+h(state.monthSearch)+'"/><span>총 '+list.length+'건</span>'+chooser+'<button type="button" class="primary" data-quick="buy">+ 공구 등록</button></div>';
 const weekList=state.buys.filter(b=>[b.sellerName,b.product,b.productName,b.note,b.memo].join(" ").toLowerCase().includes(state.monthSearch.toLowerCase()));
 const content=state.scheduleView==="calendar"?monthGrid(state.calendarMode==="week"?weekList:list,{weekOnly:state.calendarMode==="week"}):table(["셀러명","상품","팔로워 수","시작일","종료일","정산 요청","결제창","마이크로 및 일반","인스타그램","비고","상태","수정"],monthlyRows(list,true));
 return wrap("월별 공구 대장",monthPicker()+toolbar+(state.scheduleView==="calendar"?calendarModeControls():"")+content);
}
function reminderTemplates(seller,buy){
 const name=(seller?.name||"셀러").trim();
 const product=(buy?.product||buy?.productName||"이전 상품").trim();
 return [
  {title:"재공구 제안",message:"안녕하세요, "+name+"님. 지난번 "+product+" 공구 관련해서 연락드립니다. 재진행 일정 검토가 가능하실지 여쭤보고 싶습니다. 편하실 때 의견 부탁드립니다."},
  {title:"새 상품 제안",message:"안녕하세요, "+name+"님. 이전 공구 진행 이력을 참고해 새로운 상품을 제안드리고 싶어 연락드렸습니다. 관심 있으신 상품군이나 희망하시는 일정이 있다면 알려주세요. 그에 맞춰 자료 준비하겠습니다."},
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
 const data=reminders();
 const cards=data.map(x=>{
  const expanded=state.expandedReminderId===x.seller.id;
  const list=reminderTemplates(x.seller,x.buy);
  const templates=expanded?'<div class="reminder-templates">'+list.map((t,index)=>
    '<div class="reminder-template"><div><strong>'+h(t.title)+'</strong><p>'+h(t.message)+'</p></div><button class="mini-button" type="button" data-act="copy-template" data-template="'+index+'" data-id="'+h(x.seller.id)+'">복사</button></div>'
   ).join("")+'</div>':"";
  return '<div class="reminder-item"><div class="row"><div><strong>'+h(x.seller.name)+'</strong> <span class="status alert">연락 필요</span><p>최근 공구: '+h(x.buy.product||"-")+' · 종료 '+h(x.buy.endDate||"-")+' · 연락 예정 '+h(x.due)+' · '+x.overdue+'일 경과</p></div><div class="actions"><button class="mini-button" type="button" data-act="templates" data-id="'+h(x.seller.id)+'">'+(expanded?"문구 접기":"제안 문구 3종")+'</button><button class="primary" type="button" data-act="complete-reminder" data-id="'+h(x.seller.id)+'">연락 완료</button></div></div>'+templates+'</div>';
 }).join("");
 const completed=state.activities.filter(a=>a.type==="리마인드 완료").slice(0,15);
 const completedRows=completed.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td><strong>'+h(a.sellerName)+'</strong></td><td>'+h(a.channel||"-")+'</td><td>'+h(a.memo||"-")+'</td><td>'+h(a.actorName||"-")+'</td><td>'+h(a.nextFollowUpAt||"없음")+'</td></tr>');
 return wrap("미처리 알림 · "+data.length,
  '<p class="detail-note">문구를 복사해 카카오톡이나 DM으로 직접 전달한 뒤, 연락 방법과 내용을 기록하면 완료 처리됩니다. 미처리 알림은 계속 표시됩니다.</p>'
  +(cards||'<div class="empty">현재 연락이 필요한 셀러가 없습니다.</div>'))
  +wrap("최근 완료 기록",'<p class="panel-description">연락 완료로 기록한 셀러와 처리 직원, 다음 연락 예정일을 확인할 수 있습니다.</p>'+table(["처리일시","셀러","연락방법","연락내용","처리직원","다음 연락일"],completedRows));
}
function activityPage(){
 const rows=state.activities.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td><strong>'+h(a.sellerName)+'</strong></td><td>'+h(a.type)+'</td><td>'+h(a.memo)+'</td><td>'+h(a.contactOwner||a.actorName||"-")+'</td><td>'+h(a.actorName)+'</td></tr>');
 return wrap("전체 활동기록 · "+state.activities.length,table(["일시","셀러","유형","활동 내용","담당자","기록자"],rows));
}
function importerPage(){
 if(state.demo||state.staff?.role!=="admin")return wrap("접근 제한","<p>관리자 계정만 초기 데이터 이전을 실행할 수 있습니다.</p>");
 return wrap("전체 데이터 백업",'<div class="backup-export-panel"><h3>전체 데이터 다운로드</h3><p>현재 Firebase에 저장된 셀러, 상품, 공구 이력, 활동 기록을 내려받습니다. 파일은 공개 GitHub에 저장되지 않습니다.</p><div class="import-buttons"><button type="button" class="primary" id="backup-xlsx">엑셀 전체 다운로드</button><button type="button" class="secondary" id="backup-csv">CSV · JSON ZIP 다운로드</button></div><p id="backup-export-status" role="status">관리자 전용입니다. 다운로드한 파일은 비공개로 보관하세요.</p></div><div class="backup-import-separator"><h3>초기 데이터 복원</h3><p>이 기능은 처음 이전할 때만 사용하세요. 운영 중 재업로드하면 데이터를 덮어쓸 수 있습니다.</p></div><p class="panel-description">로컬 ZIP 파일은 브라우저에서만 읽으며 GitHub에 업로드하지 않습니다. Firebase로 직접 저장됩니다. <strong>최초 데이터 이전용</strong>으로만 사용하세요.</p><div class="import-guide"><div>1. 비공개 ZIP 파일 선택</div><div>2. 셀러·상품·공구 관계 검사</div><div>3. Firebase 업로드 후 건수 검수</div></div><label class="import-label">S2H CRM 초기 데이터 ZIP<input type="file" id="seed-zip" accept=".zip,application/zip"/></label><div class="import-buttons"><button class="secondary" id="seed-check" type="button">데이터 검사</button><button class="primary" id="seed-run" type="button" disabled>Firebase로 이전</button></div><progress id="seed-progress" max="100" value="0"></progress><p id="seed-status" class="import-status">비공개 ZIP 파일을 선택해주세요.</p><p class="panel-note">관리자 전용 화면입니다. 같은 ID 재업로드 시 문서가 갱신될 수 있으므로, 운영 중인 데이터를 수정한 후에는 초기 ZIP을 재업로드하지 마세요.</p>');
}
function render(){
 if(!state.user)return;
 const views={dashboard:["대시보드","","",dashboard],sellers:["셀러 관리","SELLER DATABASE","전체 셀러와 공구·연락 이력",sellersPage],schedule:["공구 일정","GROUPBUY SCHEDULE","공구 일정과 운영 상태",schedulePage],reminders:["리마인드","FOLLOW UP","연락 기록이 남기 전까지 미처리 알림 유지",reminderPage],activity:["활동 기록","ACTIVITY LOG","팀원들의 연락과 영업 활동",activityPage],products:["상품 인사이트","PRODUCT INTELLIGENCE","상품별 공구 이력 및 진행 셀러",productsPage],proposals:["제안 현황","PROPOSAL PIPELINE","상품 제안 진행 현황",proposalsPage],import:["백업","","초기 데이터 보관 및 복원",importerPage],sellerDetail:["셀러 상세","","",sellerDetailPage]};
 const [title,kicker,caption,view]=views[state.page];
 $("#page-title").textContent=title;
 $("#today").textContent=todayLocal();
 $("#add-button").textContent=state.page==="schedule"?"+ 공구 등록":state.page==="activity"||state.page==="reminders"?"+ 활동 기록":state.page==="import"?"셀러 보기":state.page==="sellerDetail"?"셀러 목록":state.page==="products"||state.page==="opportunities"||state.page==="proposals"?"셀러 보기":"+ 셀러 등록";
 $("#add-button").onclick=state.page==="schedule"?()=>buyModal():state.page==="activity"||state.page==="reminders"?()=>activityModal():state.page==="import"||state.page==="sellerDetail"||state.page==="products"||state.page==="opportunities"||state.page==="proposals"?()=>{state.page="sellers";render();}:()=>sellerModal();
 document.querySelectorAll("[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page===state.page));
 $("#page-body").innerHTML=view();
 if(state.page==="import"&&!state.demo&&state.staff?.role==="admin"){mountSeedImporter(db);mountBackupExport(db);}
 $("#page-body").querySelectorAll("[data-nav]").forEach(el=>el.addEventListener("click",()=>{state.page=el.dataset.nav;render();}));

 $("#page-body").querySelectorAll("[data-move]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.move==="0"){state.selectedMonth=todayLocal().slice(0,7);state.weekStart=null;render();}else{state.weekStart=null;changeMonth(Number(el.dataset.move));}}));
 const monthInput=$("#selected-month");if(monthInput)monthInput.addEventListener("change",e=>{state.selectedMonth=e.target.value;state.weekStart=null;render();});
 const monthSearch=$("#month-search");if(monthSearch)monthSearch.addEventListener("change",e=>{state.monthSearch=e.target.value;render();});
 $("#page-body").querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>{state.scheduleView=el.dataset.view;render();}));
 $("#page-body").querySelectorAll("[data-calendar-mode]").forEach(el=>el.addEventListener("click",()=>{
  const next=el.dataset.calendarMode;
  if(next==="week"&&state.calendarMode!=="week")state.weekStart=weekStartFor(shownMonth()===todayLocal().slice(0,7)?todayLocal():shownMonth()+"-01");
  state.calendarMode=next;render();
 }));
 $("#page-body").querySelectorAll("[data-week-move]").forEach(el=>el.addEventListener("click",()=>weekNavigation(Number(el.dataset.weekMove))));

 $("#page-body").querySelectorAll("[data-expand-week]").forEach(el=>el.addEventListener("click",()=>{const key=el.dataset.expandWeek;state.expandedCalendarWeeks[key]=!state.expandedCalendarWeeks[key];render();}));
 $("#page-body").querySelectorAll("[data-quick]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.quick==="seller")sellerModal();if(el.dataset.quick==="buy")buyModal();if(el.dataset.quick==="activity")activityModal();}));
 const search=$("#seller-search");
 if(search){search.addEventListener("input",e=>{const pos=e.target.selectionStart;state.search=e.target.value;$("#page-body").innerHTML=sellersPage();const input=$("#seller-search");input.focus();input.setSelectionRange(pos,pos);});}
 $("#page-body").querySelectorAll("[data-act]").forEach(el=>el.addEventListener("click",()=>{
 const action=el.dataset.act,id=el.dataset.id;
 if(action==="view-seller"){state.selectedSellerId=id;state.page="sellerDetail";render();}
 if(action==="edit-seller")sellerModal(state.sellers.find(x=>x.id===id));
 if(action==="edit-buy")buyModal(state.buys.find(x=>x.id===id));
 if(action==="contact")activityModal(id);
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
