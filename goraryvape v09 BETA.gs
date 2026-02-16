/* ==========================================================
   GORARY VAPE - BACKEND (V20.0: FINAL STABLE)
   ========================================================== */

const props = PropertiesService.getScriptProperties();
const SECURE_ADMIN_PW = props.getProperty("SECURE_ADMIN_PW") || "AP123456";
const SECURE_ROOT_PW = props.getProperty("SECURE_ROOT_PW") || "RP123456";
const SPREADSHEET_ID = props.getProperty("SPREADSHEET_ID") || "18LvTBWXkoYSCWeyD3ga5EYuFYZx-En3m-DE6ld0FIw8";
const ERROR_CODES = {AUTH:"AUTH_001", EXPIRED:"AUTH_003", SRV:"SRV_001"};

const sanitize = i => !i ? "" : String(i).replace(/[<>]/g,"").trim();
const responseJSON = (o) => ContentService.createTextOutput(JSON.stringify({status:o.status||"success",...o})).setMimeType(ContentService.MimeType.JSON);
const getSheet = n => { const ss=SpreadsheetApp.openById(SPREADSHEET_ID); let s=ss.getSheetByName(n); if(!s) s=ss.insertSheet(n); return s; };
const getIndices = h => { const m={}; if(h) h.forEach((x,i)=>m[String(x).trim().toLowerCase()]=i); return m; };
const getIdx = (m,k) => { for(let x of k) if(m.hasOwnProperty(x.toLowerCase())) return m[x.toLowerCase()]; return -1; };
const safeSetValue = (s,r,c,v) => { if(c>=0) s.getRange(r,c+1).setValue(v); };

// ⚠️ EXACT CSV MAPPING ⚠️
const DEFAULTS = {
  USERS: { ID:0, NAME:1, PHONE:2, PASS:3, TOKEN:8, POINTS:9, ROLE:10 },
  CARTS: { TOKEN:0, DATA:1, DATE:3 },
  WISHLISTS: { TOKEN:0, DATA:1, DATE:3 },
  CATALOG: { ID:0, CAT:1, TITLE_FR:3, TITLE_EN:2, PRICE:8, STOCK:14, IMG:15, VAR:18 }
};

// ⚠️ SMART TAB NAMES ⚠️
const TABS = {
  ORDERS: "Orders",
  CATALOG: "Catalog",
  REVIEWS: "Reviews",
  USERS: "Users",
  CONFIG: "Config"
};

/* --- SMART SHEET FINDER --- */
function getSmartSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. Try Exact Match
  let s = ss.getSheetByName(name);
  if (s && s.getLastRow() > 1) return s;
  
  // 2. Try Fuzzy Match (e.g. "Gorary...Orders.csv")
  const sheets = ss.getSheets();
  for (let sheet of sheets) {
    if (sheet.getName().toLowerCase().includes(name.toLowerCase()) && sheet.getLastRow() > 1) {
      return sheet;
    }
  }
  
  // 3. Fallback: Create
  if (!s) s = ss.insertSheet(name);
  return s;
}

function doGet(e) {
  try {
    const p=e.parameter, a=p.action;
    if(a==="getCatalogJson") return getCatalogJson(p.refresh);
    if(a==="getUserData") return getUserData(p.token);
    if(a==="getUserOrders") return getUserOrders(p.token);
    if(a==="checkStoreStatus") return checkStoreStatus();
    if(a==="getTranslations") return getTranslations();
    if(a==="getReviews") return getReviews(p.productId);
    if(a==="getAdminDashboard") return getAdminDashboard(p.pw);
    if(a==="getAdminReviews") return getAdminReviews(p.pw);
    if(a==="getCPanelData") return getCPanelData(p.pw);
    if(a==="repairDatabase") return repairDatabase(p.pw);
    return responseJSON({status:"error", message:"Invalid Action"});
  } catch(err) { return responseJSON({status:"error", message:err.toString()}); }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return responseJSON({status: "error", message: "Empty Request"});
    const json=JSON.parse(e.postData.contents), a=json.action, d=json.data||{};
    
    if(a==="login") return loginUser(d.phone, d.password);
    if(a==="register") return registerUser(d);
    if(a==="checkCoupon") return checkCoupon(json.code, json.total);

    const rawToken = d.authToken || d.token || json.token || json.authToken;
    const token = rawToken ? String(rawToken).trim() : null;
    
    if(a.match(/^(placeOrder|syncUserData|addReview|cancelOrder|updateAddress|logView)$/)) {
      if(!token || token.length < 5) return responseJSON({status:"error", error_code:ERROR_CODES.AUTH, message:"Invalid Token"});
      const u = getUserByToken(token);
      if(!u && token !== "Guest" && !["placeOrder","logView"].includes(a)) return responseJSON({status:"error", error_code:ERROR_CODES.EXPIRED, message:"Session expirée"});
      
      if(a==="placeOrder") return placeOrderSecure(d,u,token);
      if(a==="logView") return logProductView(d,u,token);
      if(a==="syncUserData" && u) return syncUserData(d,u);
      if(a==="addReview" && u) return addReview(d,u);
      if(a==="cancelOrder" && u) return cancelOrder(d,u);
      if(a==="updateAddress" && u) return updateAddress(d,u);
    }
    
    const pw=json.password||d.password||d.pw;
    if(String(pw)===SECURE_ADMIN_PW || String(pw)===SECURE_ROOT_PW) {
      if(a==="updateOrderStatus") return updateOrderStatus(d);
      if(a==="updateProductStatus") return updateProductStatus(d);
      if(a==="updatePrice") return updatePrice(d);
      if(a==="updateReviewStatus") return updateReviewStatus(d);
      if(a==="saveSystemConfig") return saveSystemConfig(d);
      if(a==="updateUserRole") return updateUserRole(d);
    }
    return responseJSON({status:"error", message:"Unauthorized"});
  } catch(e) { return responseJSON({status:"error", message:e.toString()}); }
}

/* --- CPANEL DATA (SMART LINK) --- */
function getCPanelData(pw) {
  if (String(pw) !== SECURE_ROOT_PW) return responseJSON({status: "error", message: "Invalid PW"});
  
  const c = {};
  const configSheet = getSmartSheet("Config");
  if (configSheet.getLastRow() > 0) {
    configSheet.getDataRange().getValues().forEach(r => { if(r[0]) c[String(r[0]).trim()] = r[1]; });
  }

  const uS = getSmartSheet("Users");
  const users = [];
  if (uS.getLastRow() > 1) {
    const uD = uS.getDataRange().getValues();
    uD.slice(1).forEach(r => users.push({
      id: r[DEFAULTS.USERS.ID], 
      name: r[DEFAULTS.USERS.NAME], 
      phone: r[DEFAULTS.USERS.PHONE], 
      role: r[DEFAULTS.USERS.ROLE]||'user', 
      points: r[DEFAULTS.USERS.POINTS]||0
    }));
  }

  const count = (n) => Math.max(0, getSmartSheet(n).getLastRow() - 1);
  
  return responseJSON({
    status: "success", 
    config: c, 
    users: users, 
    stats: {
      orders: count("Orders"), 
      products: count("Catalog"), 
      reviews: count("Reviews")
    }
  });
}

function getAdminDashboard(pw) {
  if(String(pw) !== SECURE_ADMIN_PW) return responseJSON({status:"error"});
  const s = getSmartSheet("Orders");
  const d = s.getDataRange().getValues();
  if (d.length < 2) return responseJSON({status: "success", orders: []});
  
  const m = getIndices(d[0]);
  const orders = d.slice(Math.max(1, d.length-100)).map(r => ({
    id: r[getIdx(m, ["Order_ID"])], 
    name: r[getIdx(m, ["Customer_Name"])], 
    phone: r[getIdx(m, ["Phone"])], 
    total: r[getIdx(m, ["Total"])], 
    status: r[getIdx(m, ["Status"])], 
    date: r[getIdx(m, ["Date"])], 
    items: r[getIdx(m, ["Items_JSON"])]
  })).reverse();
  
  return responseJSON({status: "success", orders: orders});
}

// ... CORE HELPERS ...
function getUserByToken(t) {
  if(!t) return null; const cleanT=String(t).trim(); const s=getSmartSheet("Users"), d=s.getDataRange().getValues();
  if(d.length<2) return null;
  const m=getIndices(d[0]);
  const idxTk=getIdx(m,["AuthToken"])>-1?getIdx(m,["AuthToken"]):DEFAULTS.USERS.TOKEN;
  for(let k=1; k<d.length; k++) {
    if(String(d[k][idxTk]).trim()===cleanT) {
      return { rowIndex:k, id:d[k][DEFAULTS.USERS.ID], name:d[k][DEFAULTS.USERS.NAME], token:cleanT, points:Number(d[k][DEFAULTS.USERS.POINTS])||0, role:String(d[k][DEFAULTS.USERS.ROLE]).trim()||"user" };
    }
  }
  return null;
}

function getCatalogJson(refresh) {
  const cache=CacheService.getScriptCache();
  if(refresh!=="true"){const c=cache.get("cat_v20"); if(c)return responseJSON({status:"success", data:JSON.parse(c), source:"cache"});}
  const s=getSmartSheet("Catalog"), data=s.getDataRange().getValues();
  if(data.length<2) return responseJSON({status:"success", data:[]});
  const m=getIndices(data.shift());
  const idx={
    id: getIdx(m,['ID'])>-1?getIdx(m,['ID']):DEFAULTS.CATALOG.ID, 
    fr: getIdx(m,['Title_FR','Title'])>-1?getIdx(m,['Title_FR','Title']):DEFAULTS.CATALOG.TITLE_FR, 
    en: getIdx(m,['Title_EN'])>-1?getIdx(m,['Title_EN']):DEFAULTS.CATALOG.TITLE_EN, 
    price: getIdx(m,['Price_MAD'])>-1?getIdx(m,['Price_MAD']):DEFAULTS.CATALOG.PRICE, 
    stock: getIdx(m,['Stock'])>-1?getIdx(m,['Stock']):DEFAULTS.CATALOG.STOCK, 
    cat: getIdx(m,['Category'])>-1?getIdx(m,['Category']):DEFAULTS.CATALOG.CAT, 
    img: getIdx(m,['Image_URL'])>-1?getIdx(m,['Image_URL']):DEFAULTS.CATALOG.IMG, 
    var: getIdx(m,['Variant_Name'])>-1?getIdx(m,['Variant_Name']):DEFAULTS.CATALOG.VAR
  };
  const products=data.map(r=>{
    const id=r[idx.id]; if(!id||String(id)==="undefined") return null;
    return {id:String(id), title:{fr:String(r[idx.fr]||""), en:String(r[idx.en]||"")}, price_MAD:parseFloat(r[idx.price])||0, stock:parseInt(r[idx.stock])||0, category:String(r[idx.cat]||"General"), image:String(r[idx.img]||""), variant_name:String(r[idx.var]||"")};
  }).filter(p=>p!==null);
  try{cache.put("cat_v20",JSON.stringify(products),21600);}catch(e){}
  return responseJSON({status:"success", data:products, source:"sheet"});
}

function getUserData(t) {
  const u=getUserByToken(t); if(!u) return responseJSON({status:"error", error_code:ERROR_CODES.AUTH});
  let cart="[]", wishlist="[]", addresses=[];
  // Cart
  const cS=getSmartSheet("Carts"), cD=cS.getDataRange().getValues();
  if(cD.length>1) {
    const cR=cD.find(r=>String(r[DEFAULTS.CARTS.TOKEN]).trim()===u.token);
    if(cR) cart=cR[DEFAULTS.CARTS.DATA];
  }
  // Wishlist
  const wS=getSmartSheet("Wishlists"), wD=wS.getDataRange().getValues();
  if(wD.length>1) {
    const wR=wD.find(r=>String(r[DEFAULTS.WISHLISTS.TOKEN]).trim()===u.token);
    if(wR) wishlist=wR[DEFAULTS.WISHLISTS.DATA];
  }
  // Addresses
  const aS=getSmartSheet("Addresses"), aD=aS.getDataRange().getValues();
  if(aD.length>1) {
    const aM=getIndices(aD[0]), idxTok=getIdx(aM,["User_Token","Token"]);
    for(let i=1; i<aD.length; i++) if(String(aD[i][idxTok])===u.token) {
      try{ if(aD[i][getIdx(aM,["Home_JSON"])]) addresses.push(JSON.parse(aD[i][getIdx(aM,["Home_JSON"])])); }catch(e){}
      try{ if(aD[i][getIdx(aM,["Office_JSON"])]) addresses.push(JSON.parse(aD[i][getIdx(aM,["Office_JSON"])])); }catch(e){}
      break;
    }
  }
  return responseJSON({status:"success", profile:u, cart:cart, wishlist:wishlist, addresses:addresses});
}

function syncUserData(d,u) {
  const lock=LockService.getScriptLock(); try { lock.waitLock(5000); 
    const sheetName=(d.type==='cart')?"Carts":"Wishlists"; const s=getSmartSheet(sheetName); const defaults=(d.type==='cart')?DEFAULTS.CARTS:DEFAULTS.WISHLISTS;
    const data=s.getDataRange().getValues(); let found=false; const cleanUserToken=String(u.token).trim();
    for(let i=1; i<data.length; i++) {
      if(String(data[i][defaults.TOKEN]).trim()===cleanUserToken) {
        safeSetValue(s, i+1, defaults.DATA, d.items); if(defaults.DATE>-1) safeSetValue(s, i+1, defaults.DATE, new Date()); found=true; break;
      }
    }
    if(!found) {
      const newRow=new Array(s.getLastColumn()||4).fill(""); newRow[defaults.TOKEN]=cleanUserToken; newRow[defaults.DATA]=d.items; if(defaults.DATE>-1) newRow[defaults.DATE]=new Date(); s.appendRow(newRow);
    }
    return responseJSON({status:"success", synced_points:u.points});
  } catch(e){return responseJSON({status:"error", message:e.toString()});} finally{lock.releaseLock();}
}

function loginUser(ph,pw){const s=getSmartSheet("Users"),d=s.getDataRange().getValues(),cl=String(ph).replace(/\D/g,""); for(let i=1;i<d.length;i++) if(String(d[i][DEFAULTS.USERS.PHONE]).replace(/\D/g,"")===cl){const dbPw=String(d[i][DEFAULTS.USERS.PASS]); if(dbPw===String(pw)||(dbPw.includes(":")&&dbPw.split(":")[0]===Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,pw+dbPw.split(":")[1])))){let t=d[i][DEFAULTS.USERS.TOKEN]; if(!t||t===""){t="TK-"+Utilities.getUuid(); safeSetValue(s,i+1,DEFAULTS.USERS.TOKEN,t);} return responseJSON({status:"success",user:{id:d[i][DEFAULTS.USERS.ID],name:d[i][DEFAULTS.USERS.NAME],phone:cl,points:Number(d[i][DEFAULTS.USERS.POINTS])||0,role:d[i][DEFAULTS.USERS.ROLE]||"user",authToken:t}});}} return responseJSON({status:"error",message:"Identifiants incorrects"});}
function registerUser(d){const s=getSmartSheet("Users"),dt=s.getDataRange().getValues(),clP=String(d.phone).replace(/\D/g,""); for(let i=1;i<dt.length;i++) if(String(dt[i][DEFAULTS.USERS.PHONE]).replace(/\D/g,"")===clP)return responseJSON({status:"error",message:"Déjà inscrit"}); const id="USR-"+Utilities.getUuid(),t="TK-"+Utilities.getUuid(),salt=Utilities.getUuid(),h=Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,d.password+salt))+":"+salt; const row=new Array(dt[0].length).fill(""); row[DEFAULTS.USERS.ID]=id; row[DEFAULTS.USERS.NAME]=sanitize(d.name); row[DEFAULTS.USERS.PHONE]="'"+clP; row[DEFAULTS.USERS.PASS]=h; row[DEFAULTS.USERS.TOKEN]=t; row[DEFAULTS.USERS.POINTS]=0; row[DEFAULTS.USERS.ROLE]="user"; s.appendRow(row); return responseJSON({status:"success",user:{id:id,name:d.name,phone:clP,authToken:t,role:"user",points:0}});}
function placeOrderSecure(d,u,t){const lock=LockService.getScriptLock(); try{lock.waitLock(10000); const s=getSmartSheet("Orders"), h=s.getDataRange().getValues()[0], m=getIndices(h), id="ORD-"+Math.floor(Date.now()/1000), date=Utilities.formatDate(new Date(),"GMT+1","yyyy-MM-dd HH:mm:ss"); const row=new Array(h.length).fill(""); const set=(k,v)=>{const i=getIdx(m,[k]);if(i>-1)row[i]=v;}; set("Order_ID",id); set("User_ID",u?u.token:(t||"Guest")); set("Customer_Name",sanitize(d.name)); set("Phone","'"+String(d.phone).replace(/\D/g,"")); set("Address",sanitize(d.address)); set("Total",d.total); set("Items_JSON",d.cart); set("Date",date); set("Status","Pending"); set("Coupon",d.coupon||""); set("Points_Used",d.pointsUsed||0); set("Payment_Method",d.paymentMethod||"COD"); s.appendRow(row); if(u&&d.pointsUsed>0){const uS=getSmartSheet("Users"),latestU=getUserByToken(u.token); if(latestU&&latestU.points>=d.pointsUsed) safeSetValue(uS,u.rowIndex+1,DEFAULTS.USERS.POINTS,latestU.points-d.pointsUsed);} return responseJSON({status:"success",orderId:id});}catch(e){return responseJSON({status:"error",message:e.toString()});}finally{lock.releaseLock();}}
function logProductView(d,u,t){const s=getSmartSheet("Viewed"); if(s.getLastRow()===0)s.appendRow(["Timestamp","User_Token","ProductID"]); s.appendRow([new Date(),(u?u.token:t),d.productId]); return responseJSON({status:"success"});}
function getUserOrders(t){const u=getUserByToken(t); if(!u)return responseJSON({status:"error"}); const d=getSmartSheet("Orders").getDataRange().getValues(), m=getIndices(d[0]), idxU=getIdx(m,["User_ID"]), idxId=getIdx(m,["Order_ID"]); return responseJSON({status:"success", orders:d.slice(1).filter(r=>String(r[idxU])===String(t)).map(r=>({id:r[idxId], date:r[getIdx(m,["Date"])], total:r[getIdx(m,["Total"])], status:r[getIdx(m,["Status"])], items:r[getIdx(m,["Items_JSON"])]})).reverse()});}
function cancelOrder(d,u){const s=getSmartSheet("Orders"), dt=s.getDataRange().getValues(), m=getIndices(dt[0]); const idxId=getIdx(m,["Order_ID"]), idxUser=getIdx(m,["User_ID"]); for(let i=1;i<dt.length;i++){if(String(dt[i][idxId])===String(d.orderId)&&String(dt[i][idxUser])===u.token){safeSetValue(s,i+1,getIdx(m,["Status"]),"Cancelled"); return responseJSON({status:"success"});}} return responseJSON({status:"error"});}
function updateAddress(d,u){const s=getSmartSheet("Addresses"), dt=s.getDataRange().getValues(), m=getIndices(dt[0]); const col=d.type==='Home'?"Home_JSON":"Office_JSON"; let idx=getIdx(m,[col]); if(idx===-1){idx=dt[0].length; s.getRange(1,idx+1).setValue(col);} const tIdx=getIdx(m,["User_Token","Token"]); let f=false; for(let i=1;i<dt.length;i++) if(String(dt[i][tIdx])===u.token){safeSetValue(s,i+1,idx,d.addressJson); f=true; break;} if(!f){const r=new Array(s.getLastColumn()).fill(""); r[tIdx]=u.token; r[idx]=d.addressJson; s.appendRow(r);} return responseJSON({status:"success"});}
function checkCoupon(c,t){const d=getSmartSheet("Coupons").getDataRange().getValues(); for(let i=1;i<d.length;i++) if(String(d[i][0]).toUpperCase().trim()===String(c).toUpperCase().trim()&&String(d[i][2]).toUpperCase()==="TRUE"&&parseFloat(t)>=(parseFloat(d[i][3])||0)) return responseJSON({status:"success", discount:parseFloat(d[i][1])}); return responseJSON({status:"error", message:"Invalide"});}
function getReviews(pid){const d=getSmartSheet("Reviews").getDataRange().getValues(), m=getIndices(d[0]); return responseJSON({status:"success", data:{reviews:d.slice(1).filter(r=>String(r[getIdx(m,["ProductId"])])===String(pid)&&String(r[getIdx(m,["Status"])])==="Active").map(r=>({name:r[getIdx(m,["UserName"])], rating:r[getIdx(m,["Rating"])], comment:r[getIdx(m,["Comment"])]})).reverse()}});}
function addReview(d,u){getSmartSheet("Reviews").appendRow(["REV-"+Utilities.getUuid().split('-')[0], new Date(), u.id, u.name, d.productId, d.rating, sanitize(d.comment), "Active"]); return responseJSON({status:"success"});}
function getAdminReviews(pw){if(String(pw)!==SECURE_ADMIN_PW)return responseJSON({status:"error"}); const d=getSmartSheet("Reviews").getDataRange().getValues(), m=getIndices(d[0]); return responseJSON({status:"success", reviews:d.slice(1).map(r=>({id:r[getIdx(m,["ID"])], user:r[getIdx(m,["UserName"])], product:r[getIdx(m,["ProductId"])], rating:r[getIdx(m,["Rating"])], comment:r[getIdx(m,["Comment"])], status:r[getIdx(m,["Status"])]})).reverse()});}
function updateOrderStatus(d){const s=getSmartSheet("Orders"), dt=s.getDataRange().getValues(), m=getIndices(dt[0]); for(let i=1;i<dt.length;i++) if(String(dt[i][getIdx(m,["Order_ID"])])===String(d.orderId)){safeSetValue(s,i+1,getIdx(m,["Status"]),d.status); return responseJSON({status:"success"});} return responseJSON({status:"error"});}
function updateProductStatus(d){const s=getSmartSheet("Catalog"), dt=s.getDataRange().getValues(), m=getIndices(dt[0]); for(let i=1;i<dt.length;i++) if(String(dt[i][getIdx(m,["ID"])])===String(d.productId)){const st=d.status; if(st==='available'){safeSetValue(s,i+1,getIdx(m,["Stock"]),100); safeSetValue(s,i+1,getIdx(m,["Label"]),'');} else if(st==='out'){safeSetValue(s,i+1,getIdx(m,["Stock"]),0); safeSetValue(s,i+1,getIdx(m,["Label"]),'');} else if(st==='sale'){safeSetValue(s,i+1,getIdx(m,["Stock"]),100); safeSetValue(s,i+1,getIdx(m,["Label"]),'Sale');} else if(st==='restock'){safeSetValue(s,i+1,getIdx(m,["Stock"]),0); safeSetValue(s,i+1,getIdx(m,["Label"]),'Restock');} return responseJSON({status:"success"});} return responseJSON({status:"error"});}
function updatePrice(d){const s=getSmartSheet("Catalog"), dt=s.getDataRange().getValues(), m=getIndices(dt[0]); for(let i=1;i<dt.length;i++) if(String(dt[i][getIdx(m,["ID"])])===String(d.productId)){safeSetValue(s,i+1,getIdx(m,["Price_MAD"]),parseFloat(d.price)); return responseJSON({status:"success"});} return responseJSON({status:"error"});}
function updateReviewStatus(d){const s=getSmartSheet("Reviews"), dt=s.getDataRange().getValues(), m=getIndices(dt[0]); for(let i=1;i<dt.length;i++) if(String(dt[i][getIdx(m,["ID"])])===String(d.reviewId)){safeSetValue(s,i+1,getIdx(m,["Status"]),d.status); return responseJSON({status:"success"});} return responseJSON({status:"error"});}
function saveSystemConfig(d){const s=getSmartSheet("Config"), dt=s.getDataRange().getValues(); for(const k in d.updates){let r=-1; for(let i=1;i<dt.length;i++) if(String(dt[i][0])===k){r=i+1; break;} if(r>-1) s.getRange(r,2).setValue(d.updates[k]); else s.appendRow([k, d.updates[k], "Set via CPanel"]);} return responseJSON({status:"success"});}
function updateUserRole(d){const s=getSmartSheet("Users"), dt=s.getDataRange().getValues(); for(let i=1;i<dt.length;i++) if(String(dt[i][DEFAULTS.USERS.ID])===String(d.userId)){safeSetValue(s,i+1,DEFAULTS.USERS.ROLE,d.role); return responseJSON({status:"success"});} return responseJSON({status:"error"});}
function getTranslations(){const t={}, c={}; getSmartSheet("Translator").getDataRange().getValues().slice(1).forEach(r=>{if(r[0])t[String(r[0]).trim()]={en:r[1],fr:r[2],ar:r[3]};}); getSmartSheet("Config").getDataRange().getValues().forEach(r=>{if(r[0])c[String(r[0]).trim()]=r[1];}); return responseJSON({status:"success", translations:t, config:c});}
function checkStoreStatus(){const c={}; getSmartSheet("Config").getDataRange().getValues().forEach(r=>{if(r[0])c[String(r[0]).trim()]=r[1];}); return responseJSON({status:"success", isOpen:c['store_open']!=="FALSE", config:c});}
function repairDatabase(pw){if(String(pw)!==SECURE_ROOT_PW && String(pw)!==SECURE_ADMIN_PW) return responseJSON({status:"error"}); return responseJSON({status:"success"});}
