import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { mountSeedImporter } from "./import-seed-ui.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const state = { user: null, staff: null, sellers: [], buys: [], products: [], activities: [], page: "dashboard", search: "", unsubs: [], modalSave: null, demo:false, selectedMonth:null, scheduleView:"list", monthSearch:"", selectedSellerId:null };
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
    f("name","셀러명","text",item?.name,true)+f("channel","인스타그램 계정","text",item?.channel)+f("contact","연락처","text",item?.contact)+f("cycleDays","리마인드 주기 (일)","number",item?.cycleDays??30,true)+textarea("note","셀러 메모",item?.note),
    async data=>{
      const record={name:data.name.trim(),channel:data.channel.trim(),contact:data.contact.trim(),note:data.note.trim(),cycleDays:Math.max(1,Number(data.cycleDays)||30),updatedAt:serverTimestamp()};
      if(!record.name)throw new Error("셀러명을 입력해주세요.");
      if(item)await updateDoc(doc(db,"sellers",item.id),record);
      else await addDoc(collection(db,"sellers"),{...record,createdAt:serverTimestamp()});
    });
}
function buyModal(item=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다.");return;}
 if(!state.sellers.length){notify("공구 등록 전에 셀러를 먼저 등록해주세요.");return;}
 const compare=(a,b)=>String(a||"").localeCompare(String(b||""),"ko-KR",{sensitivity:"base",numeric:true});
 const allSellers=[...state.sellers].sort((a,b)=>compare(a.name,b.name));
 const sellerOptions=allSellers.map(x=>[x.id,x.name]);
 const sellerId=item?.sellerId||sellerOptions[0][0];
 const defaultStart=item?.startDate||((state.selectedMonth||todayLocal().slice(0,7))===todayLocal().slice(0,7)?todayLocal():shownMonth()+"-01");
 const defaultEnd=item?.endDate||defaultStart;
 const categoryOptions=[["","선택 안 함"],["마이크로","마이크로"],["일반","일반"]];
 const historicalProductNames=[...new Set(state.buys.map(b=>(b.product||b.productName||"").trim()).filter(Boolean))];
 const productName=(p)=>String(p.standardName||p.name||p.productName||"").trim();
 const master=state.products.filter(p=>productName(p)).sort((a,b)=>compare(productName(a),productName(b)));
 const nameMap=new Map(master.map(p=>[productName(p),p]));
 const productOptions=master.map(p=>[p.id,productName(p)]);
 for(const name of historicalProductNames.sort(compare)){
  if(!nameMap.has(name)){const fallback="legacy:"+name;productOptions.push([fallback,name]);}
 }
 productOptions.sort((a,b)=>compare(a[1],b[1]));
 productOptions.push(["__new__","새 상품 직접 입력"]);
 const previousName=(item?.product||item?.productName||"").trim();
 const selectedProduct=item?.productId&&productOptions.some(p=>p[0]===item.productId)
  ?item.productId:(productOptions.find(p=>p[1]===previousName)?.[0]||productOptions[0]?.[0]||"__new__");
 const detail=(item?.note??item?.memo)??"";

 function sellerProfile(id){
  const seller=state.sellers.find(x=>x.id===id);
  const history=state.buys.filter(b=>b.sellerId===id).sort((a,b)=>(b.endDate||"").localeCompare(a.endDate||""));
  const recentWithFollowers=history.find(b=>b.followers!==null&&b.followers!==undefined&&String(b.followers).trim()!=="");
  const follower=seller?.followerCountLatestRecorded??seller?.followers??recentWithFollowers?.followers??"";
  const url=seller?.instagramUrl||history.find(b=>b.instagramUrl)?.instagramUrl||"";
  const category=history.find(b=>categoryOptions.some(option=>option[0]&&option[0]===b.legacyCategory))?.legacyCategory||"";
  return {seller,history,follower,url,category};
 }
 const initialProfile=sellerProfile(sellerId);
 openModal(item?"공구 수정":"새 공구 등록",
   '<label class="full">셀러 검색<input id="seller-picker-search" type="search" placeholder="셀러명 또는 인스타그램 계정 검색" autocomplete="off"/></label>'
   +select("sellerId","셀러",sellerOptions,sellerId)
   +'<div class="full seller-linked-data" id="linked-seller-info" aria-live="polite"></div>'
   +'<label class="full">상품 검색<input id="product-picker-search" type="search" placeholder="상품명 검색" autocomplete="off"/></label>'
   +select("productId","상품명",productOptions,selectedProduct)
   +'<label class="full" id="new-product-wrap" hidden>새 상품명<input name="newProductName" type="text" placeholder="등록할 상품명 입력"/></label>'
   +f("startDate","시작일","date",defaultStart,true)+f("endDate","종료일","date",defaultEnd,true)
   +select("status","진행 상태",[["예정","예정"],["진행중","진행중"],["완료","완료"],["취소","취소"]],item?.status==="기록"?"완료":item?.status||"예정")
   +f("followers","팔로워 수","number",item?.followers??initialProfile.follower)
   +select("legacyCategory","마이크로 및 일반",categoryOptions,item?.legacyCategory||initialProfile.category)
   +f("paymentWindow","결제창","text",item?.paymentWindow||"")
   +f("settlementRequest","정산 요청","text",item?.settlementRequest||"")
   +f("instagramUrl","인스타그램 URL","url",item?.instagramUrl||initialProfile.url,false,true)
   +f("round","진행 회차","text",item?.round||"")
   +textarea("note","비고 및 특이사항",detail)
   +textarea("event","이벤트",item?.event||""),
   async data=>{
     if(data.endDate<data.startDate)throw new Error("종료일이 시작일보다 빠릅니다.");
     const seller=state.sellers.find(x=>x.id===data.sellerId);
     if(!seller)throw new Error("등록된 셀러를 선택해주세요.");
     const selected=productOptions.find(p=>p[0]===data.productId);
     if(!selected)throw new Error("등록된 상품을 선택해주세요.");
     let resolvedProductId=data.productId;
     let resolvedProductName=selected[1];
     if(data.productId==="__new__"){
       resolvedProductName=(data.newProductName||"").trim();
       if(!resolvedProductName)throw new Error("새 상품명을 입력해주세요.");
       const existing=state.products.find(p=>productName(p)===resolvedProductName);
       if(existing)resolvedProductId=existing.id;
       else {
         const result=await addDoc(collection(db,"products"),{
           standardName:resolvedProductName,aliases:[],source:"manual",createdByUid:state.user.uid,
           createdAt:serverTimestamp(),updatedAt:serverTimestamp()
         });
         resolvedProductId=result.id;
       }
     }
     if(resolvedProductId.startsWith("legacy:"))resolvedProductId="";
     const record={
       sellerId:seller.id,sellerName:seller.name,productId:resolvedProductId,
       product:resolvedProductName,productName:resolvedProductName,
       startDate:data.startDate,endDate:data.endDate,
       followers:data.followers?Number(data.followers):null,legacyCategory:data.legacyCategory,
       paymentWindow:data.paymentWindow.trim(),settlementRequest:data.settlementRequest.trim(),
       instagramUrl:data.instagramUrl.trim(),round:data.round.trim(),
       note:data.note.trim(),memo:data.note.trim(),event:data.event.trim(),status:data.status,
       updatedByUid:state.user.uid,updatedByName:state.staff?.name||state.user.email,
       updatedAt:serverTimestamp()
     };
     if(item)await updateDoc(doc(db,"groupbuys",item.id),record);
     else await addDoc(collection(db,"groupbuys"),{
       ...record,source:"manual",createdByUid:state.user.uid,
       createdByName:state.staff?.name||state.user.email,createdAt:serverTimestamp()
     });
   }
 );

 const sellerSearch=$("#seller-picker-search");
 const sellerSelect=$("#modal-form select[name=sellerId]");
 const productSearch=$("#product-picker-search");
 const productSelect=$("#modal-form select[name=productId]");
 const newProductWrap=$("#new-product-wrap");
 const profileInfo=$("#linked-seller-info");
 const form=$("#modal-form");
 const setter=(name,value)=>{const input=form.elements.namedItem(name);if(input)input.value=value??"";};
 const refreshProfile=(id,overwrite=true)=>{
   const profile=sellerProfile(id);
   if(!profile.seller)return;
   if(overwrite){
     setter("followers",profile.follower);
     setter("instagramUrl",profile.url);
     setter("legacyCategory",profile.category);
   }
   const latest=profile.history[0];
   const recentNames=[...new Set(profile.history.slice(0,5).map(b=>b.product||b.productName).filter(Boolean))].slice(0,3);
   profileInfo.textContent="등록된 공구 "+profile.history.length+"건"+(latest?.endDate?" · 최근 종료 "+latest.endDate:"")+(recentNames.length?" · 진행 상품 "+recentNames.join(", "):"");
 };
 const updateProductFields=()=>{
   newProductWrap.hidden=productSelect.value!=="__new__";
   const newName=form.elements.namedItem("newProductName");
   if(newName)newName.required=!newProductWrap.hidden;
 };
 const filterOptions=(selectElement,entries,keyword,previous)=>{
   const matches=entries.filter(([,name])=>String(name).toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
   selectElement.replaceChildren(...matches.map(([value,label])=>{
     const option=document.createElement("option");option.value=value;option.textContent=label;return option;
   }));
   if(matches.some(([v])=>v===previous))selectElement.value=previous;
   else if(matches.length)selectElement.value=matches[0][0];
   return matches.length;
 };
 sellerSearch.addEventListener("input",()=>{
   const last=sellerSelect.value;
   const word=sellerSearch.value.trim().toLowerCase();
   const matches=allSellers.filter(x=>x.name.toLowerCase().includes(word)||String(x.instagramId||x.channel||"").toLowerCase().includes(word));
   const entries=matches.map(x=>[x.id,x.name]);
   sellerSelect.replaceChildren(...entries.map(([id,name])=>{
     const option=document.createElement("option");option.value=id;option.textContent=name;return option;
   }));
   if(matches.some(x=>x.id===last))sellerSelect.value=last;
   if(!matches.length){profileInfo.textContent="일치하는 셀러가 없습니다.";return;}
   refreshProfile(sellerSelect.value);
 });
 sellerSelect.addEventListener("change",()=>refreshProfile(sellerSelect.value));
 productSearch.addEventListener("input",()=>{
   const prior=productSelect.value,word=productSearch.value.trim();
   const choices=productOptions.filter(p=>p[0]==="__new__"||p[1].toLocaleLowerCase().includes(word.toLocaleLowerCase()));
   productSelect.replaceChildren(...choices.map(([id,name])=>{
     const option=document.createElement("option");option.value=id;option.textContent=name;return option;
   }));
   if(choices.some(p=>p[0]===prior))productSelect.value=prior;
   updateProductFields();
 });
 productSelect.addEventListener("change",updateProductFields);
 updateProductFields();
 refreshProfile(sellerId,false);
}
function activityModal(sellerId=null){
 if(state.demo){notify("미리보기에서는 저장할 수 없습니다. Firebase 연결 후 이용해주세요.");return;}
 if(!state.sellers.length){notify("셀러를 먼저 등록해주세요.");return;}
 const choices=state.sellers.map(s=>[s.id,s.name]);
 openModal("연락·영업 활동 기록",
 select("sellerId","셀러",choices,sellerId||choices[0][0])+select("type","활동 유형",[["카카오톡","카카오톡"],["전화","전화"],["DM","DM"],["미팅","미팅"],["기타","기타"]],"카카오톡")+f("nextFollowUpAt","다음 연락 예정일","date")+textarea("memo","활동 내용 (필수)"),
 async data=>{
 const seller=state.sellers.find(s=>s.id===data.sellerId);
 if(!seller||!data.memo.trim())throw new Error("셀러와 활동 내용을 입력해주세요.");
 await addDoc(collection(db,"activities"),{sellerId:seller.id,sellerName:seller.name,type:data.type,memo:data.memo.trim(),nextFollowUpAt:data.nextFollowUpAt||null,actorUid:state.user.uid,actorName:state.staff.name||state.user.email,createdAt:serverTimestamp()});
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
  const manual=a?.nextFollowUpAt||s.nextFollowUpAt;
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
 const monthlyPanel=wrap("월별 공구 현황",monthPicker()+'<div class="monthly-tools"><span>'+h(shownMonth())+' · '+monthly.length+'건</span><div class="monthly-actions"><button type="button" class="primary" data-quick="buy">+ 공구 등록</button><button class="panel-link" data-nav="schedule">전체 보기</button></div></div>'+table(["셀러","상품","시작일","종료일","상태","수정"],monthlyRows(monthly.slice(0,10))));
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
 const quick='<div class="dashboard-actions"><div><strong>빠른 등록</strong></div><div class="quick-actions"><button data-quick="seller">+ 셀러 등록</button><button data-quick="buy">+ 공구 등록</button><button data-quick="activity">+ 연락 기록</button></div></div>';
 return (state.demo?'<div class="demo-alert">미리보기 전용 화면입니다. 아래 셀러와 상품은 모두 가상 예시이며 실제 S2H 데이터가 아닙니다.</div>':'')+quick+kpis+monthlyPanel+actionPanel+'<div class="layout-two">'+schedule+opportunities+'</div><div class="layout-two">'+products+distributionUI+'</div>'+activity+'<div class="dashboard-footer">S2H CORPORATION · INTERNAL SELLER OPERATIONS</div>';
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
 const logs=activities.map(a=>'<tr><td>'+h(dt(a.createdAt))+'</td><td>'+h(a.type)+'</td><td>'+h(a.memo)+'</td><td>'+h(a.actorName)+'</td></tr>');
 const ig=seller.instagramUrl;
 const link=ig?.startsWith("https://")?'<a target="_blank" rel="noopener noreferrer" href="'+h(ig)+'">인스타그램 열기</a>':h(seller.channel||seller.instagramId||"-");
 const summary='<div class="seller-summary"><div><span>셀러명</span><strong>'+h(seller.name)+'</strong></div><div><span>인스타그램</span>'+link+'</div><div><span>공구 진행 기록</span><strong>'+buys.length+'건</strong></div><div><span>마지막 공구 종료일</span><strong>'+h(buys[0]?.endDate||"-")+'</strong></div></div>';
 return '<div class="detail-nav"><button data-nav="sellers" class="mini-button">← 전체 셀러</button><button class="primary" data-act="contact" data-id="'+h(seller.id)+'">+ 연락 기록</button></div>'
 +wrap("셀러 정보",summary)
 +wrap("전체 공구 이력",'<p class="panel-description">2024년과 2025년 자료를 포함한 거래 이력입니다. 과거 기록은 자동 연락 알림을 생성하지 않습니다.</p>'+table(["상품","시작일","종료일","회차","결제창","정산","비고","수정"],history))
 +wrap("연락 기록",table(["일시","연락 방식","내용","기록자"],logs));
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
 const content=state.scheduleView==="calendar"?monthGrid(list):table(["셀러명","상품","팔로워 수","시작일","종료일","정산 요청","결제창","마이크로 및 일반","인스타그램","비고","상태","수정"],monthlyRows(list,true));
 return wrap("월별 공구 대장",monthPicker()+toolbar+content);
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
function importerPage(){
 if(state.demo||state.staff?.role!=="admin")return wrap("접근 제한","<p>관리자 계정만 초기 데이터 이전을 실행할 수 있습니다.</p>");
 return wrap("초기 데이터 백업 및 복원",'<p class="panel-description">로컬 ZIP 파일은 브라우저에서만 읽으며 GitHub에 업로드하지 않습니다. Firebase로 직접 저장됩니다. <strong>최초 데이터 이전용</strong>으로만 사용하세요.</p><div class="import-guide"><div>1. 비공개 ZIP 파일 선택</div><div>2. 셀러·상품·공구 관계 검사</div><div>3. Firebase 업로드 후 건수 검수</div></div><label class="import-label">S2H CRM 초기 데이터 ZIP<input type="file" id="seed-zip" accept=".zip,application/zip"/></label><div class="import-buttons"><button class="secondary" id="seed-check" type="button">데이터 검사</button><button class="primary" id="seed-run" type="button" disabled>Firebase로 이전</button></div><progress id="seed-progress" max="100" value="0"></progress><p id="seed-status" class="import-status">비공개 ZIP 파일을 선택해주세요.</p><p class="panel-note">관리자 전용 화면입니다. 같은 ID 재업로드 시 문서가 갱신될 수 있으므로, 운영 중인 데이터를 수정한 후에는 초기 ZIP을 재업로드하지 마세요.</p>');
}
function render(){
 if(!state.user)return;
 const views={dashboard:["대시보드","","",dashboard],sellers:["셀러 관리","SELLER DATABASE","전체 셀러와 공구·연락 이력",sellersPage],schedule:["공구 일정","GROUPBUY SCHEDULE","공구 일정과 운영 상태",schedulePage],reminders:["리마인드","FOLLOW UP","연락 기록이 남기 전까지 미처리 알림 유지",reminderPage],activity:["활동 기록","ACTIVITY LOG","팀원들의 연락과 영업 활동",activityPage],products:["상품 인사이트","PRODUCT INTELLIGENCE","상품별 공구 이력 및 진행 셀러",productsPage],opportunities:["영업 기회","OPPORTUNITIES","재접촉 및 휴면 셀러 후보",opportunitiesPage],proposals:["제안 현황","PROPOSAL PIPELINE","상품 제안 진행 현황",proposalsPage],import:["백업","","초기 데이터 보관 및 복원",importerPage],sellerDetail:["셀러 상세","","",sellerDetailPage]};
 const [title,kicker,caption,view]=views[state.page];
 $("#page-title").textContent=title;
 $("#today").textContent=todayLocal();
 $("#add-button").textContent=state.page==="schedule"?"+ 공구 등록":state.page==="activity"||state.page==="reminders"?"+ 활동 기록":state.page==="import"?"셀러 보기":state.page==="sellerDetail"?"셀러 목록":state.page==="products"||state.page==="opportunities"||state.page==="proposals"?"셀러 보기":"+ 셀러 등록";
 $("#add-button").onclick=state.page==="schedule"?()=>buyModal():state.page==="activity"||state.page==="reminders"?()=>activityModal():state.page==="import"||state.page==="sellerDetail"||state.page==="products"||state.page==="opportunities"||state.page==="proposals"?()=>{state.page="sellers";render();}:()=>sellerModal();
 document.querySelectorAll("[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page===state.page));
 $("#page-body").innerHTML=view();
 if(state.page==="import"&&!state.demo&&state.staff?.role==="admin")mountSeedImporter(db);
 $("#page-body").querySelectorAll("[data-nav]").forEach(el=>el.addEventListener("click",()=>{state.page=el.dataset.nav;render();}));

 $("#page-body").querySelectorAll("[data-move]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.move==="0"){state.selectedMonth=todayLocal().slice(0,7);render();}else changeMonth(Number(el.dataset.move));}));
 const monthInput=$("#selected-month");if(monthInput)monthInput.addEventListener("change",e=>{state.selectedMonth=e.target.value;render();});
 const monthSearch=$("#month-search");if(monthSearch)monthSearch.addEventListener("change",e=>{state.monthSearch=e.target.value;render();});
 $("#page-body").querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>{state.scheduleView=el.dataset.view;render();}));
 $("#page-body").querySelectorAll("[data-quick]").forEach(el=>el.addEventListener("click",()=>{if(el.dataset.quick==="seller")sellerModal();if(el.dataset.quick==="buy")buyModal();if(el.dataset.quick==="activity")activityModal();}));
 const search=$("#seller-search");
 if(search){search.addEventListener("input",e=>{const pos=e.target.selectionStart;state.search=e.target.value;$("#page-body").innerHTML=sellersPage();const input=$("#seller-search");input.focus();input.setSelectionRange(pos,pos);});}
 $("#page-body").querySelectorAll("[data-act]").forEach(el=>el.addEventListener("click",()=>{
 const action=el.dataset.act,id=el.dataset.id;
 if(action==="view-seller"){state.selectedSellerId=id;state.page="sellerDetail";render();}
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
