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
export const normalizeName=value=>String(value??"").trim().replace(/\\s+/g," ");
// Explicitly approved family: preserve the individual sets/flavours in the source rows.
function confirmedFamily(name){
 const spaced=normalizeName(name);
 if(CONFIRMED_PRODUCT_ALIASES.has(spaced))return CONFIRMED_PRODUCT_ALIASES.get(spaced);
 const compact=spaced.replace(/\\s+/g,"");
 if(/^강금옥쭈꾸미(?:$|[+&/,(\\s0-9]|마라|대창)/u.test(compact)||/^강금옥(?:2종|4종)$/u.test(compact))
  return "강금옥 쭈꾸미";
 if(compact==="900도피자")return "900도 피자";
 return spaced;
}
// Resolve 300+ product names in O(1) per historical buy instead of repeatedly scanning products.
const productLookupCache=new WeakMap();
function productLookup(products){
 let map=productLookupCache.get(products);
 if(map)return map;
 map=new Map();
 for(const product of products){
  const original=normalizeName(product.standardName||product.name||product.productName);
  if(!original)continue;
  const overridden=product.groupOverride===true;
  const target=overridden?(normalizeName(product.groupName)||original):
   (normalizeName(product.groupName)||confirmedFamily(original));
  map.set(original,target);
  for(const alias of product.aliases||[]){
   const name=normalizeName(alias);
   if(name&&!map.has(name))map.set(name,target);
  }
 }
 productLookupCache.set(products,map);
 return map;
}
export function productCanonicalName(value,products=[]){
 const name=normalizeName(value);
 if(!name)return "";
 return productLookup(products).get(name)||confirmedFamily(name);
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
