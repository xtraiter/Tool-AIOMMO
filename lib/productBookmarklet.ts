// Bookmarklet that runs inside the user's own browser tab on a product page
// (so the shop's anti-bot never sees a server), collects what the page shows,
// and opens this tool with the data in the URL hash.
const SOURCE = String.raw`(function(){
var d=document,o={platform:location.hostname.replace(/^www\./,""),title:"",price:"",description:"",images:[],videos:[]};
function add(a,u){if(u&&typeof u==="string"){if(u.indexOf("//")===0)u="https:"+u;if(/^https?:/.test(u)&&a.indexOf(u)<0)a.push(u);}}
function full(u){return u.replace(/_tn(\.\w+)?$/,"").replace(/@resize_w\d+_nl(\.\w+)?$/,"");}
function meta(n){var m=d.querySelector('meta[property="'+n+'"],meta[name="'+n+'"]');return m?m.content:"";}
function walk(x){if(!x||typeof x!=="object")return;if(Array.isArray(x)){x.forEach(walk);return;}
var t=x["@type"];if(t==="Product"||(Array.isArray(t)&&t.indexOf("Product")>=0)){
if(x.name&&!o.title)o.title=x.name;if(x.description&&!o.description)o.description=String(x.description);
[].concat(x.image||[]).forEach(function(i){add(o.images,typeof i==="string"?i:i&&i.url);});
var f=[].concat(x.offers||[])[0];if(f&&!o.price){var p=f.price||f.lowPrice;if(p){o.price=p+(f.highPrice&&f.highPrice!==p?" - "+f.highPrice:"")+" "+(f.priceCurrency||"");}}}
if(x["@graph"])walk(x["@graph"]);}
[].forEach.call(d.querySelectorAll('script[type="application/ld+json"]'),function(s){try{walk(JSON.parse(s.textContent));}catch(e){}});
if(!o.title)o.title=meta("og:title")||(d.querySelector("h1")||{}).textContent||d.title;
o.title=(o.title||"").trim();
if(/security check|captcha|verify|xác minh|just a moment|access denied/i.test(o.title+" "+d.title)&&!(o.images.length>3)){alert("Trang đang yêu cầu xác minh (ví dụ kéo mảnh ghép). Hãy hoàn tất xác minh, đợi trang sản phẩm hiện ra rồi bấm lại dấu trang.");return;}
if(!o.description)o.description=meta("og:description")||meta("description");
add(o.images,meta("og:image"));
[].forEach.call(d.querySelectorAll("img"),function(i){var s=i.currentSrc||i.src||"";
if(/susercontent|shopeemobile|tiktokcdn|ibyteimg|byteimg|alicdn|lazcdn/.test(s)&&(i.naturalWidth>=120||i.width>=120||/_tn|resize/.test(s)))add(o.images,full(s));});
[].forEach.call(d.querySelectorAll("video,video source"),function(v){add(o.videos,v.currentSrc||v.src);});
var hs=[].slice.call(d.querySelectorAll("h1,h2,h3,h4,div,span")).filter(function(e){return /^(mô tả sản phẩm|product description)$/i.test((e.textContent||"").trim())&&e.children.length===0;});
if(hs.length){var box=hs[0].parentElement,txt="";while(box&&txt.length<40&&box!==d.body){txt=box.innerText||"";box=box.parentElement;}
if(txt.length>o.description.length)o.description=txt.replace(/^(mô tả sản phẩm|product description)\s*/i,"").trim();}
if(!o.price){var m=(d.body.innerText||"").match(/₫\s?[\d.,]+(\s?-\s?₫?\s?[\d.,]+)?|[\d.,]+\s?₫/);if(m)o.price=m[0].trim();}
o.images=o.images.slice(0,40);o.videos=o.videos.slice(0,10);o.source=location.href;
var j=JSON.stringify(o),b=btoa(unescape(encodeURIComponent(j)));
window.open("__ORIGIN__/app?tool=premium.product.info#data="+b,"_blank");
})();`;

export function buildBookmarklet(origin: string): string {
  return "javascript:" + encodeURIComponent(SOURCE.replace("__ORIGIN__", origin));
}
