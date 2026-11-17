/**
 * S2H non-destructive canonicalization.
 * Original seller/product names remain unchanged in Firestore's groupbuy documents.
 * Only explicitly confirmed product aliases are combined.
 */
const CONFIRMED_PRODUCT_ALIASES=new Map([
  ["김미떡","김미떡"],
  ["김미떡 4종","김미떡"],
  ["김미떡 5종","김미떡"],
  ["김미떡 4종 + 송편","김미떡"],
  ["김미떡 4종+송편","김미떡"]
]);
export const normalizeName=value=>String(value??"").trim().replace(/\s+/g," ");
// Explicitly approved representative groups; spelling and set sizes remain in historical records.
function confirmedFamily(name){
 const spaced=normalizeName(name);
 if(CONFIRMED_PRODUCT_ALIASES.has(spaced))return CONFIRMED_PRODUCT_ALIASES.get(spaced);
 const compact=spaced.replace(/\s+/g,"");
 // Confirmed by the operator: every Ganggeumok octopus set/flavour belongs to one parent.
 if(/^강금옥쭈꾸미(?:.*)$/u.test(compact)||/^강금옥(?:2종|3종|4종)$/u.test(compact))
  return "강금옥 쭈꾸미";
 if(compact==="900도피자")return "900도 피자";
 return spaced;
}
// Deterministic display grouping. No Firestore document or original buy name changes.
// Merge typography differences and trailing quantity/set variants only.
const productLookupCache=new WeakMap();
function compactName(value){
 return normalizeName(value).toLocaleLowerCase().replace(/[\s._·-]/g,"");
}
function variationBase(value){
 const compact=compactName(value);
 const match=compact.match(/^(.*?)(?:\(?\d{1,3}(?:종|개|팩|세트|박스|입|봉|병|묶음)\)?)$/u);
 return match?.[1]||"";
}
function productLookup(products){
 let map=productLookupCache.get(products);
 if(map)return map;
 map=new Map();
 const originals=products.map(p=>normalizeName(p.standardName||p.name||p.productName));
 const candidates=new Map();
 // A user-confirmed parent always takes priority over heuristic grouping.
 for(let i=0;i<products.length;i++){
  const name=originals[i],product=products[i];
  if(!name||product.groupOverride===true||product.groupName)continue;
  const key=compactName(name),array=candidates.get(key)||[];
  array.push(name);candidates.set(key,array);
 }
 const preferred=new Map();
 const displayScore=name=>{
  const n=normalizeName(name);
  return (/\s/.test(n)?2:0)+(/^\d/.test(n)?1:0);
 };
 for(const [key,names] of candidates){
  preferred.set(key,[...names].sort((a,b)=>displayScore(b)-displayScore(a)||a.length-b.length||a.localeCompare(b,"ko-KR"))[0]);
 }
 const bases=new Map();
 for(let i=0;i<products.length;i++){
  const product=products[i],name=originals[i];
  if(!name||product.groupOverride===true||product.groupName)continue;
  const base=variationBase(name);
  if(!base||base.length<2)continue;
  const array=bases.get(base)||new Set();
  array.add(compactName(name));bases.set(base,array);
 }
 for(let i=0;i<products.length;i++){
  const product=products[i],original=originals[i];
  if(!original)continue;
  const explicit=product.groupOverride===true;
  const confirmed=confirmedFamily(original);
  let target=explicit?(normalizeName(product.groupName)||original):
   (normalizeName(product.groupName)||confirmed);
  if(!explicit&&!product.groupName&&confirmed===original){
   const key=compactName(original),base=variationBase(original);
   if(base&&(preferred.has(base)||(bases.get(base)?.size||0)>=2)){
    target=preferred.get(base)||[...bases.get(base)].length&&
      originals.find(n=>compactName(n).startsWith(base)&&variationBase(n)===base)||original;
    if(!preferred.has(base))target=normalizeName(target).replace(/\s*\(?\d{1,3}(?:종|개|팩|세트|박스|입|봉|병|묶음)\)?\s*$/u,"");
   }else if(preferred.has(key))target=preferred.get(key);
  }
  map.set(original,target);
  for(const alias of product.aliases||[]){
   const aliasName=normalizeName(alias);
   if(aliasName&&!map.has(aliasName))map.set(aliasName,target);
  }
 }
 // Historical-only variations can follow a registered parent, but never create
 // novel merged products from unrelated fuzzy or brand-only similarities.
 for(const [raw,target] of [...map]){
  const key=compactName(raw);
  if(!map.has(key))map.set(key,target);
 }
 productLookupCache.set(products,map);
 return map;
}
export function productCanonicalName(value,products=[]){
 const name=normalizeName(value);
 if(!name)return "";
 const lookup=productLookup(products);
 if(lookup.has(name))return lookup.get(name);
 const compact=compactName(name);
 if(lookup.has(compact))return lookup.get(compact);
 const confirmed=confirmedFamily(name);
 if(confirmed!==name)return confirmed;
 const base=variationBase(name);
 if(base&&lookup.has(base))return lookup.get(base);
 return name;
}
export function productDisplayAliases(canonical,products=[],buys=[]){
 const found=new Set();
 for(const [label,canon] of CONFIRMED_PRODUCT_ALIASES)if(canon===canonical&&label!==canonical)found.add(label);
 for(const p of products){
  const original=normalizeName(p.standardName||p.name||p.productName);
  if(productCanonicalName(original,products)!==canonical)continue;
  if(original&&original!==canonical)found.add(original);
  for(const alias of p.aliases||[]){
   const value=normalizeName(alias);
   if(value&&value!==canonical)found.add(value);
  }
 }
 for(const b of buys){
  const label=normalizeName(b.product||b.productName);
  if(label&&label!==canonical&&productCanonicalName(label,products)===canonical)found.add(label);
 }
 return [...found].sort((a,b)=>a.localeCompare(b,"ko-KR"));
}
export function instagramIdentity(value){
 let text=String(value??"").trim();
 if(!text)return "";
 text=text.replace(/^@/,"");
 const profile=text.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
 if(profile)text=profile[1];
 else if(text.includes("/")||text.includes(":"))return "";
 if(["p","reel","reels","stories","explore","direct"].includes(text.toLowerCase()))return "";
 return /^[A-Za-z0-9._]{1,30}$/.test(text)?text.toLowerCase():"";
}
export function sellerIdentity(seller,buy=null){
 const handle=[seller?.instagramId,seller?.instagramUrl,seller?.channel,buy?.instagramUrl]
   .map(instagramIdentity).find(Boolean);
 return handle?"ig:"+handle:"seller:"+(seller?.id||buy?.sellerId||normalizeName(buy?.sellerName));
}
