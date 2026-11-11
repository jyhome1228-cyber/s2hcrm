/**
 * S2H private seed import (Admin SDK; NEVER put service-account credentials in a public repo)
 * Usage:
 *   npm install firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json node scripts/import-seed.mjs --dir private-data
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/import-seed.mjs --dir private-data --commit
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const directory = resolve(dirIndex >= 0 ? (args[dirIndex + 1] || 'private-data') : 'private-data');
const commit = args.includes('--commit');
if (commit && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS 환경변수가 필요합니다.');
  process.exit(1);
}
const load = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const [sellers, products, groupbuys, manifest] = await Promise.all([
  load('sellers.json'),load('products.json'),load('groupbuys.json'),load('manifest.json')
]);
const collections = [
  ['sellers', sellers, 'sellerId'],
  ['products', products, 'productId'],
  ['groupbuys', groupbuys, 'groupbuyId'],
];
for (const [name, rows, idKey] of collections) {
  const ids = rows.map(r=>r[idKey]);
  if (ids.some(x=>typeof x!=='string'||!x)) throw new Error(name+' 빈 ID');
  if (ids.length!==new Set(ids).size) throw new Error(name+' 중복 ID');
  console.log(name, rows.length);
}
if (groupbuys.some(g => !sellers.some(s=>s.sellerId===g.sellerId))) throw new Error('셀러 외래키 오류');
if (groupbuys.some(g => !products.some(p=>p.productId===g.productId))) throw new Error('상품 외래키 오류');
if (groupbuys.length!==manifest.summary.sourceRowsWithSellerAndProduct) throw new Error('원본 행 수 불일치');
console.log('검증 완료:', manifest.summary.sourceSheets, '시트 /', groupbuys.length, '건');
if(!commit){console.log('DRY RUN: Firestore에는 아무것도 쓰지 않았습니다. 실제 반영은 --commit');process.exit(0);}
const {initializeApp,applicationDefault}=await import('firebase-admin/app');
const {getFirestore}=await import('firebase-admin/firestore');
initializeApp({credential:applicationDefault()});
const db=getFirestore();
const batchSize=350;
for (const [name, rows, idKey] of collections) {
 for(let i=0;i<rows.length;i+=batchSize) {
  const batch=db.batch();
  for(const row of rows.slice(i,i+batchSize))batch.set(db.collection(name).doc(row[idKey]),row,{merge:true});
  await batch.commit();
  console.log(name, Math.min(i+batchSize,rows.length),'/',rows.length);
 }
}
console.log('완료. Firestore 권한/보안규칙/운영 DB 건수 검수 필수.');
