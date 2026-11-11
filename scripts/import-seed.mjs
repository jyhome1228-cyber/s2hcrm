/**
 * S2H CRM initial migration from private JSON (Firebase Admin SDK).
 *
 * This script is designed to run on an authorized operator's machine or Google Cloud Shell.
 * DO NOT commit JSON data, private service-account keys, or credentials to public GitHub.
 *
 * Setup (Google Cloud Shell):
 *   git clone https://github.com/jyhome1228-cyber/s2hcrm.git
 *   cd s2hcrm
 *   npm install --no-save firebase-admin
 *   # Upload PRIVATE zip to Cloud Shell, then: unzip -q S2H_CRM_초기데이터_비공개.zip -d private-data
 *
 * Dry run:
 *   node scripts/import-seed.mjs --dir private-data --project s2hcrm-2026
 * Real import (explicit opt-in):
 *   node scripts/import-seed.mjs --dir private-data --project s2hcrm-2026 --commit
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import process from 'node:process';

const args=process.argv.slice(2);
const val=key=>{const i=args.indexOf(key);return i<0?null:(args[i+1]||null);};
const directory=resolve(val('--dir')||'private-data');
const projectId=val('--project')||process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT;
const commit=args.includes('--commit');
if(!projectId){console.error('프로젝트 ID 필요: --project s2hcrm-2026');process.exit(1);}
if(projectId!=='s2hcrm-2026'){console.error('예상하지 않은 Firebase 프로젝트입니다:',projectId);process.exit(1);}
const load=async name=>JSON.parse(await readFile(resolve(directory,name),'utf8'));
const [sellers,products,groupbuys,manifest]=await Promise.all([
 load('sellers.json'),load('products.json'),load('groupbuys.json'),load('manifest.json')
]);

const specs=[['sellers',sellers,'sellerId'],['products',products,'productId'],['groupbuys',groupbuys,'groupbuyId']];
for(const [name,rows,idKey] of specs){
 const ids=rows.map(x=>x[idKey]);
 if(ids.some(x=>typeof x!=='string'||!x))throw Error(name+': 누락 ID');
 if(ids.length!==new Set(ids).size)throw Error(name+': 중복 ID');
 console.log(name.padEnd(12),rows.length,'records');
}
const sellerIds=new Set(sellers.map(x=>x.sellerId));
const productIds=new Set(products.map(x=>x.productId));
if(groupbuys.some(x=>!sellerIds.has(x.sellerId)))throw Error('공구-셀러 관계 오류');
if(groupbuys.some(x=>!productIds.has(x.productId)))throw Error('공구-상품 관계 오류');
if(groupbuys.length!==manifest.summary.sourceRowsWithSellerAndProduct)throw Error('공구 원본 행 수 불일치');
if(sellers.length!==manifest.summary.sellerProfiles)throw Error('셀러 수 불일치');
if(products.length!==manifest.summary.productLabelProfiles)throw Error('상품 수 불일치');
const uniqueRows=new Set(groupbuys.map(x=>x.sourceSheet+'#'+x.sourceRow));
if(uniqueRows.size!==groupbuys.length)throw Error('원본 행 위치 중복');
console.log('SOURCE:',manifest.summary.sourceSheets,'월별 시트');
console.log('ISSUES:',groupbuys.filter(x=>x.issues?.length).length,'기록 검토 필요');
console.log('TARGET:',projectId);
if(!commit){console.log('DRY RUN COMPLETE: 데이터베이스에 쓴 내용 없음. --commit 으로 업로드합니다.');process.exit(0);}

const {initializeApp,applicationDefault}=await import('firebase-admin/app');
const {getFirestore,FieldValue}=await import('firebase-admin/firestore');
initializeApp({credential:applicationDefault(),projectId});
const db=getFirestore();
const serverNow=()=>FieldValue.serverTimestamp();
const normalize=(name,row)=>{
 if(name==='sellers')return {
  ...row,
  channel:row.instagramId?('@'+row.instagramId):'',
  contact:'',
  note:row.notes||'',
  cycleDays:30,
  source:'excel-2026-11-11',
  createdAt:serverNow(),
  updatedAt:serverNow()
 };
 if(name==='products')return {...row,createdAt:serverNow(),updatedAt:serverNow(),source:'excel-2026-11-11'};
 return {
  ...row,
  product:row.productName,
  memo:row.note||'',
  status:row.startDate&&row.endDate?'기록':'확인 필요',
  source:'excel-2026-11-11',
  createdAt:serverNow(),
  updatedAt:serverNow()
 };
};
let total=0;
for(const [name,rows,idKey] of specs){
 for(let i=0;i<rows.length;i+=300){
  const batch=db.batch();
  rows.slice(i,i+300).forEach(row=>{
   batch.set(db.collection(name).doc(row[idKey]),normalize(name,row),{merge:true});
  });
  await batch.commit();
  total+=Math.min(300,rows.length-i);
  console.log(name,Math.min(i+300,rows.length)+'/'+rows.length);
 }
}
await db.collection('migration_logs').doc('s2h-seed-20261111').set({
 projectId,sourceFile:manifest.summary.sourceFile,
 sellerCount:sellers.length,productCount:products.length,groupbuyCount:groupbuys.length,
 reviewCount:groupbuys.filter(x=>x.issues?.length).length,
 uploadedAt:serverNow(),status:'uploaded_requires_validation'
},{merge:true});
console.log('UPLOAD COMPLETE:',total,'documents; check Firestore counts and UI before deleting any source.');
