import {collection,getDocs} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const TABLES=[
 ["sellers","셀러"],["products","상품"],["groupbuys","공구이력"],["activities","활동기록"]
];

const normalize=(value)=>{
 if(value==null)return "";
 if(typeof value?.toDate==="function")return value.toDate().toISOString();
 if(value instanceof Date)return value.toISOString();
 if(typeof value==="object")return JSON.stringify(value);
 return value;
};
const fileDownload=(blob,name)=>{
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement("a");
 anchor.href=url;anchor.download=name;
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
};
const csvCell=(v)=>{
 let text=String(normalize(v));
 // Prevent spreadsheet software from evaluating exported user content as formulas.
 if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
};
function tabular(records){
 const preferred=["id","name","standardName","sellerName","productName","startDate","endDate","status","instagramUrl","channel","createdAt","updatedAt"];
 const keys=[...new Set(records.flatMap(row=>Object.keys(row)))];
 keys.sort((a,b)=>{
  const ai=preferred.indexOf(a),bi=preferred.indexOf(b);
  if(ai<0&&bi<0)return a.localeCompare(b);
  if(ai<0)return 1;if(bi<0)return -1;return ai-bi;
 });
 return {keys,rows:records.map(r=>keys.map(k=>normalize(r[k])))};
}
async function fetchSnapshot(onStatus){
 const snapshots={};
 for(const [key] of TABLES){
  onStatus(key+" 데이터를 읽고 있습니다.");
  const result=await getDocs(collection(window.__s2hBackupDb,key));
  snapshots[key]=result.docs.map(d=>({id:d.id,...d.data()}));
 }
 return snapshots;
}
export function mountBackupExport(db){
 const csvButton=document.getElementById("backup-csv");
 const xlsxButton=document.getElementById("backup-xlsx");
 const status=document.getElementById("backup-export-status");
 if(!csvButton||!xlsxButton||!status)return;
 window.__s2hBackupDb=db;
 const setStatus=(s,error=false)=>{status.textContent=s;status.classList.toggle("import-error",error);};
 const run=async format=>{
  csvButton.disabled=xlsxButton.disabled=true;
  try{
   setStatus("Firebase에서 전체 데이터를 조회하고 있습니다.");
   const records=await fetchSnapshot(message=>setStatus(message));
   const total=Object.values(records).reduce((acc,x)=>acc+x.length,0);
   const date=new Date().toISOString().slice(0,10);
   if(format==="csv"){
    const JSZip=(await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
    const zip=new JSZip();
    for(const [key,name] of TABLES){
     const {keys,rows}=tabular(records[key]);
     const csv=[keys.map(csvCell).join(","),...rows.map(row=>row.map(csvCell).join(","))].join("\r\n");
     zip.file(name+".csv","\uFEFF"+csv);
     // JSON allows preserving object fields, aliases and IDs exactly for later migration.
     zip.file(key+".json",JSON.stringify(records[key].map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v?.toDate==="function"?v.toDate().toISOString():v]))),null,2));
    }
    zip.file("README.txt","S2H CRM private backup\nCreated: "+date+"\nCollections: sellers, products, groupbuys, activities\nAll records are private. Do not upload to a public GitHub repository.\nThese files are exports, not a one-click restore package.\n");
    const blob=await zip.generateAsync({type:"blob"});
    fileDownload(blob,"S2H_CRM_전체백업_"+date+".zip");
   }else{
    const XLSX=await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
    const book=XLSX.utils.book_new();
    for(const [key,name] of TABLES){
     const {keys,rows}=tabular(records[key]);
     const sheet=XLSX.utils.aoa_to_sheet([keys,...rows]);
     XLSX.utils.book_append_sheet(book,sheet,name);
    }
    const bytes=XLSX.write(book,{bookType:"xlsx",type:"array"});
    fileDownload(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),"S2H_CRM_전체백업_"+date+".xlsx");
   }
   setStatus("완료 · 총 "+total.toLocaleString("ko-KR")+"건을 내려받았습니다. 이 파일은 비공개로 보관하세요.");
  }catch(error){
   setStatus("백업 실패: "+String(error.message||error)+". 다운로드가 안 되면 ZIP 백업을 이용해주세요.",true);
  }finally{
   csvButton.disabled=xlsxButton.disabled=false;
  }
 };
 csvButton.addEventListener("click",()=>run("csv"));
 xlsxButton.addEventListener("click",()=>run("xlsx"));
}
