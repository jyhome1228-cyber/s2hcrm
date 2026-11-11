import {collection,doc,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/**
 * Private one-click seed uploader.
 * Local ZIP is processed in browser memory and uploaded directly to authorized Firestore.
 * The ZIP is NEVER published to GitHub Pages.
 */
export function mountSeedImporter(db) {
  const fileInput=document.getElementById("seed-zip");
  const checkButton=document.getElementById("seed-check");
  const runButton=document.getElementById("seed-run");
  const result=document.getElementById("seed-status");
  const progress=document.getElementById("seed-progress");
  if(!fileInput||!checkButton||!runButton||!result)return;
  let validated=null;
  const info=(msg,isError=false)=>{
    result.textContent=msg;
    result.classList.toggle("import-error",isError);
  };
  fileInput.addEventListener("change",()=>{
    validated=null;runButton.disabled=true;progress.value=0;
    info("선택한 파일은 아직 검증 전입니다. '데이터 검사'를 눌러주세요.");
  });
  checkButton.addEventListener("click",async()=>{
    if(!fileInput.files?.[0]){info("비공개 S2H 데이터 ZIP을 선택하세요.",true);return;}
    checkButton.disabled=true;runButton.disabled=true;
    try{
      info("압축 파일과 내부 ID 연결을 확인하고 있습니다.");
      const JSZip=(await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
      const zip=await JSZip.loadAsync(fileInput.files[0]);
      const read=async name=>{
        const entry=zip.file(name);
        if(!entry)throw new Error("ZIP에 "+name+" 파일이 없습니다.");
        return JSON.parse(await entry.async("string"));
      };
      const [sellers,products,groupbuys,manifest]=await Promise.all([
        read("sellers.json"),read("products.json"),read("groupbuys.json"),read("manifest.json")
      ]);
      if(!Array.isArray(sellers)||!Array.isArray(products)||!Array.isArray(groupbuys))throw new Error("데이터 배열 구조가 잘못됐습니다.");
      const summary=manifest?.summary||{};
      if(sellers.length!==summary.sellerProfiles||products.length!==summary.productLabelProfiles||groupbuys.length!==summary.sourceRowsWithSellerAndProduct)throw new Error("데이터 수가 원본 집계와 일치하지 않습니다.");
      const checkIds=(rows,key)=>{
        const ids=rows.map(r=>r[key]);
        if(ids.some(v=>typeof v!=="string"||!v)||new Set(ids).size!==ids.length)throw new Error("중복되거나 누락된 "+key+"가 있습니다.");
        return new Set(ids);
      };
      const sellerIds=checkIds(sellers,"sellerId"),productIds=checkIds(products,"productId");
      checkIds(groupbuys,"groupbuyId");
      if(groupbuys.some(r=>!sellerIds.has(r.sellerId)||!productIds.has(r.productId)))throw new Error("셀러·상품 연결 관계가 누락됐습니다.");
      const rowIds=new Set(groupbuys.map(r=>r.sourceSheet+"#"+r.sourceRow));
      if(rowIds.size!==groupbuys.length)throw new Error("원본 시트/행 중복이 있습니다.");
      if(sellers.length!==871||products.length!==338||groupbuys.length!==3614)throw new Error("이번에 검증한 S2H 초기 파일과 수량이 다릅니다.");
      validated={sellers,products,groupbuys};
      const flagged=groupbuys.filter(r=>r.issues?.length).length;
      info("검증 완료 · 셀러 "+sellers.length+"개 · 상품 "+products.length+"개 · 공구 "+groupbuys.length+"건 · 검토 필요 "+flagged+"건. 업로드를 실행할 수 있습니다.");
      runButton.disabled=false;
    }catch(err){validated=null;info("검증 실패: "+err.message,true);}
    finally{checkButton.disabled=false;}
  });
  runButton.addEventListener("click",async()=>{
    if(!validated)return;
    if(!window.confirm("S2H Firebase(s2hcrm-2026)에 셀러 871개·상품 338개·공구 3,614건을 업로드할까요? 동일 ID는 갱신됩니다."))return;
    runButton.disabled=true;checkButton.disabled=true;fileInput.disabled=true;
    let completed=0;
    const total=validated.sellers.length+validated.products.length+validated.groupbuys.length;
    const writeRows=[
      ["sellers",validated.sellers,"sellerId"],
      ["products",validated.products,"productId"],
      ["groupbuys",validated.groupbuys,"groupbuyId"]
    ];
    const normalize=(type,row)=>{
      if(type==="sellers")return {
        ...row,channel:row.instagramId?"@"+row.instagramId:"",contact:"",
        note:row.notes||"",cycleDays:30,source:"excel-2026-11-11",
        createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      };
      if(type==="products")return {...row,source:"excel-2026-11-11",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      return {...row,product:row.productName,memo:row.note||"",
        status:row.startDate&&row.endDate?"기록":"확인 필요",
        source:"excel-2026-11-11",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
    };
    try{
      for(const [type,rows,idKey] of writeRows){
        for(let i=0;i<rows.length;i+=180){
          const batch=writeBatch(db);
          for(const row of rows.slice(i,i+180)){
            batch.set(doc(db,type,row[idKey]),normalize(type,row),{merge:true});
          }
          await batch.commit();
          completed+=Math.min(180,rows.length-i);
          progress.value=Math.round(completed/total*100);
          info(type+" 업로드 중 · "+completed.toLocaleString("ko-KR")+"/"+total.toLocaleString("ko-KR")+"건 ("+progress.value+"%)");
        }
      }
      info("업로드 완료 · 총 "+total.toLocaleString("ko-KR")+"개 문서. 페이지를 새로고침하고 셀러·상품·월별 공구 일정을 확인하세요. 검토 필요 110건은 원본 표시를 유지했습니다.");
    }catch(err){
      info("업로드 중 중단: "+err.message+" · "+completed+"개 기록까지 처리됐을 수 있습니다. 원인을 해결한 뒤 같은 ZIP으로 다시 실행할 수 있습니다.",true);
      runButton.disabled=false;
    }finally{checkButton.disabled=false;fileInput.disabled=false;}
  });
}
