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
export function productCanonicalName(value,products=[]){
 const name=normalizeName(value);
 if(!name)return "";
 const confirmed=CONFIRMED_PRODUCT_ALIASES.get(name);
 if(confirmed)return confirmed;
 for(const product of products){
  const canonical=normalizeName(product.standardName||product.name||product.productName);
  if(!canonical)continue;
  if(canonical===name)return CONFIRMED_PRODUCT_ALIASES.get(canonical)||canonical;
  if(Array.isArray(product.aliases)&&product.aliases.some(a=>normalizeName(a)===name))
    return CONFIRMED_PRODUCT_ALIASES.get(canonical)||canonical;
 }
 return name;
}
export function productDisplayAliases(canonical,products=[],buys=[]){
 const found=new Set();
 for(const [label,canon] of CONFIRMED_PRODUCT_ALIASES)if(canon===canonical&&label!==canonical)found.add(label);
 for(const p of products)if(productCanonicalName(p.standardName||p.name||p.productName,products)===canonical)
   for(const alias of p.aliases||[])if(normalizeName(alias)!==canonical)found.add(normalizeName(alias));
 for(const b of buys){
   const label=normalizeName(b.product||b.productName);
   if(label!==canonical&&productCanonicalName(label,products)===canonical)found.add(label);
 }
 return [...found].filter(Boolean).sort((a,b)=>a.localeCompare(b,"ko-KR"));
}
export function instagramIdentity(value){
 let text=String(value??"").trim();
 if(!text)return "";
 text=text.replace(/^@/,"");
 try{
  if(/^(https?:\/\/)?(www\.)?instagram\.com\//i.test(text)){
   const url=new URL(/^https?:\/\//.test(text)?text:"https://"+text);
   if(!/^(www\.)?instagram\.com$/i.test(url.hostname))return "";
   text=url.pathname.split("/").filter(Boolean)[0]||"";
  }
 }catch{return "";}
 if(["p","reel","reels","stories","explore","direct"].includes(text.toLowerCase()))return "";
 return /^[A-Za-z0-9._]{1,30}$/.test(text)?text.toLowerCase():"";
}
export function sellerIdentity(seller,buy=null){
 const handle=[seller?.instagramId,seller?.instagramUrl,seller?.channel,buy?.instagramUrl]
   .map(instagramIdentity).find(Boolean);
 return handle?"ig:"+handle:"seller:"+(seller?.id||buy?.sellerId||normalizeName(buy?.sellerName));
}
