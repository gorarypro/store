/* ==========================================================
   GORARY VAPE - BACKEND (V14.0: ULTIMATE & FIXED)
   ========================================================== */

const props = PropertiesService.getScriptProperties();
const SECURE_ADMIN_PW = props.getProperty("SECURE_ADMIN_PW") || "AP123456";
const SECURE_ROOT_PW = props.getProperty("SECURE_ROOT_PW") || "RP123456";
// ⚠️ IMPORTANT: REPLACE THIS ID WITH YOUR ACTUAL GOOGLE SHEET ID ⚠️
const SPREADSHEET_ID = props.getProperty("SPREADSHEET_ID") || "18LvTBWXkoYSCWeyD3ga5EYuFYZx-En3m-DE6ld0FIw8"; 

const ERROR_CODES = {AUTH:"AUTH_001", EXPIRED:"AUTH_003", SRV:"SRV_001"};

/* --- HELPERS --- */
const sanitize = i => !i ? "" : String(i).replace(/[<>]/g,"").trim();
const responseJSON = (o) => ContentService.createTextOutput(JSON.stringify({status:o.status||"success",...o})).setMimeType(ContentService.MimeType.JSON);
const getSheet = n => { const ss=SpreadsheetApp.openById(SPREADSHEET_ID); let s=ss.getSheetByName(n); if(!s) s=ss.insertSheet(n); return s; };
const getIndices = h => { const m={}; if(h) h.forEach((x,i)=>m[String(x).trim().toLowerCase()]=i); return m; };
const getIdx = (m,k) => { for(let x of k) if(m.hasOwnProperty(x.toLowerCase())) return m[x.toLowerCase()]; return -1; };
const safeSetValue = (s,r,c,v) => { if(c>=0) s.getRange(r,c+1).setValue(v); };

/* --- ROUTER --- */
function doGet(e) {
  try {
    const p=e.parameter, a=p.action;
    if(a==="getCatalogJson") return getCatalogJson(p.refresh);
    if(a==="checkStoreStatus") return checkStoreStatus();
    if(a==="getReviews") return getReviews(p.productId);
    if(a==="getTranslations") return getTranslations();
    
    // User Data
    if(a==="getUserData") return getUserData(p.token);
    if(a==="getUserOrders") return getUserOrders(p.token);
    
    // Admin & CPanel
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
    
    // Auth
    if(a==="login") return loginUser(d.phone, d.password);
    if(a==="register") return registerUser(d);
    if(a==="checkCoupon") return checkCoupon(json.code, json.total);

    // User Actions
    // FIXED: Accept 'token' or 'authToken' from frontend
    const token = d.authToken || d.token || json.token || json.authToken;
    
    if(a.match(/^(placeOrder|syncUserData|addReview|cancelOrder|updateAddress|logView)$/)) {
      if(!token || token.length < 5) return responseJSON({status:"error", error_code:ERROR_CODES.AUTH, message:"Invalid Token"});
      const u = getUserByToken(token);
      
      // Guest logic: Allow logging view and placing order, but block strict user actions
      if(!u && token !== "Guest" && !["placeOrder","logView"].includes(a)) {
         return responseJSON({status:"error", error_code:ERROR_CODES.EXPIRED, message:"Session expirée"});
      }
      
      if(a==="placeOrder") return placeOrderSecure(d,u,token);
      if(a==="logView") return logProductView(d,u,token);
      if(a==="syncUserData" && u) return syncUserData(d,u);
      if(a==="addReview" && u) return addReview(d,u);
      if(a==="cancelOrder" && u) return cancelOrder(d,u);
      if(a==="updateAddress" && u) return updateAddress(d,u);
    }

    // Admin Actions
    const pw=json.password||d.password||d.pw;
    if(String(pw)===SECURE_ADMIN_PW) {
      if(a==="updateOrderStatus") return updateOrderStatus(d);
      if(a==="updateProductStatus") return updateProductStatus(d);
      if(a==="updatePrice") return updatePrice(d);
      if(a==="updateReviewStatus") return updateReviewStatus(d);
    }
    // Root Actions
    if(String(pw)===SECURE_ROOT_PW) {
      if(a==="saveSystemConfig") return saveSystemConfig(d);
      if(a==="updateUserRole") return updateUserRole(d);
    }
    return responseJSON({status:"error", message:"Unauthorized"});
  } catch(e) { return responseJSON({status:"error", message:e.toString()}); }
}

/* --- ANALYTICS (NEW) --- */
function logProductView(d, u, t) {
  const s = getSheet("Viewed");
  // Appends: Timestamp, User_Token, ProductID
  s.appendRow([new Date(), (u ? u.token : t), d.productId]);
  return responseJSON({status: "success"});
}

/* --- DATA SYNC (FIXED) --- */
function syncUserData(d, u) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); 
    const sheetName = d.type === 'cart' ? "Carts" : "Wishlists";
    const s = getSheet(sheetName);
    
    // Dynamic Column Mapping
    const headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    const m = getIndices(headers);
    const colUser = getIdx(m, ["User_Token", "User_ID", "Token"]);
    const colData = getIdx(m, ["Cart_JSON", "Product_IDs", "Items"]); // Supports both schemas
    const colDate = getIdx(m, ["Last_Updated", "Date"]);
    
    if (colUser === -1 || colData === -1) return responseJSON({status: "error", message: "Schema mismatch"});

    const data = s.getDataRange().getValues();
    let found = false;
    
    // Update existing row
    for(let i=1; i<data.length; i++) {
      if(String(data[i][colUser]) === u.token) {
        safeSetValue(s, i+1, colData, d.items);
        if(colDate > -1) safeSetValue(s, i+1, colDate, new Date());
        found = true; break;
      }
    }
    
    // Create new row
    if(!found) {
      const newRow = new Array(headers.length).fill("");
      newRow[colUser] = u.token;
      newRow[colData] = d.items;
      if(colDate > -1) newRow[colDate] = new Date();
      s.appendRow(newRow);
    }
    return responseJSON({status: "success"});
  } catch(e) {
    return responseJSON({status: "error", message: "Sync failed: " + e.toString()});
  } finally {
    lock.releaseLock();
  }
}

// ... (Standard Auth Functions: loginUser, registerUser, getUserByToken) ...
function loginUser(ph, pw) {
  const s = getSheet("Users"), d = s.getDataRange().getValues(), m = getIndices(d[0]);
  const cl = String(ph).replace(/\D/g,"");
  const idxPh = getIdx(m, ["Phone"]), idxPw = getIdx(m, ["Password"]), idxTk = getIdx(m, ["AuthToken"]);
  for(let i=1; i<d.length; i++) {
    const dbP = String(d[i][idxPh]).replace(/\D/g,"");
    if(dbP === cl) {
      const dbPw = String(d[i][idxPw]);
      const isMatch = (dbPw === String(pw)) || (dbPw.includes(":") && dbPw.split(":")[0] === Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw + dbPw.split(":")[1])));
      if(isMatch) {
        let t = d[i][idxTk];
        if(!t || t === "") { t = "TK-" + Utilities.getUuid(); safeSetValue(s, i+1, idxTk, t); }
        safeSetValue(s, i+1, getIdx(m, ["LastLogin"]), new Date());
        return responseJSON({ status: "success", user: { id: d[i][getIdx(m,["ID"])], name: d[i][getIdx(m,["Name"])], phone: cl, points: Number(d[i][getIdx(m,["Points"])])||0, role: d[i][getIdx(m,["Role"])] || "user", authToken: t }});
      }
    }
  }
  return responseJSON({status: "error", message: "Identifiants incorrects"});
}

function registerUser(d) {
  const s = getSheet("Users"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  const clP = String(d.phone).replace(/\D/g,"");
  for(let i=1; i<dt.length; i++) if(String(dt[i][getIdx(m,["Phone"])]).replace(/\D/g,"") === clP) return responseJSON({status: "error", message: "Déjà inscrit"});
  const id = "USR-" + Utilities.getUuid(), t = "TK-" + Utilities.getUuid(), salt = Utilities.getUuid();
  const h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d.password + salt)) + ":" + salt;
  const row = new Array(dt[0].length).fill("");
  const set = (k,v) => { const i=getIdx(m,[k]); if(i>-1) row[i]=v; };
  set("ID", id); set("Name", sanitize(d.name)); set("Phone", "'"+clP); set("Password", h); set("JoinDate", new Date()); set("AuthToken", t); set("Points", 0); set("Role", "user"); set("LastLogin", new Date());
  s.appendRow(row);
  return responseJSON({status: "success", user: {id:id, name:d.name, phone:clP, authToken:t, role:"user", points:0}});
}

function getUserByToken(t) {
  if(!t) return null;
  const s = getSheet("Users"), d = s.getDataRange().getValues(), m = getIndices(d[0]);
  const idx = getIdx(m, ["AuthToken"]);
  for(let k=1; k<d.length; k++) if(String(d[k][idx]).trim() === String(t).trim()) return { rowIndex: k, id: d[k][getIdx(m,["ID"])], name: d[k][getIdx(m,["Name"])], token: t, points: Number(d[k][getIdx(m,["Points"])]) || 0, role: d[k][getIdx(m,["Role"])] || "user" };
  return null;
}

// ... (Catalog, Order, Address Functions) ...
function getCatalogJson(refresh) {
  const cache = CacheService.getScriptCache();
  if(refresh !== "true") { const c = cache.get("catalog_v14_0"); if(c) return responseJSON({status: "success", data: JSON.parse(c), source: "cache"}); }
  try {
    const s = getSheet("Catalog"), data = s.getDataRange().getValues();
    if(data.length < 2) return responseJSON({status: "success", data: []});
    const m = getIndices(data.shift());
    const products = data.map(r => {
      const id = r[getIdx(m, ['ID'])]; if(!id) return null;
      return {
        id: String(id),
        title: { fr: String(r[getIdx(m, ['Title_FR','Title'])]||""), en: String(r[getIdx(m, ['Title_EN'])]||""), ar: String(r[getIdx(m, ['Title_AR'])]||"") },
        desc: { fr: String(r[getIdx(m, ['Desc_FR'])]||""), en: String(r[getIdx(m, ['Desc_EN'])]||""), ar: String(r[getIdx(m, ['Desc_AR'])]||"") },
        price_MAD: parseFloat(r[getIdx(m, ['Price_MAD'])]) || 0,
        stock: parseInt(r[getIdx(m, ['Stock'])]) || 0,
        category: String(r[getIdx(m, ['Category'])] || "General"),
        image: String(r[getIdx(m, ['Image_URL'])] || ""),
        label: String(r[getIdx(m, ['Label','Tag'])] || ""),
        variant_name: String(r[getIdx(m, ['Variant_Name'])] || "") 
      };
    }).filter(p => p !== null);
    try { cache.put("catalog_v14_0", JSON.stringify(products), 21600); } catch(e){}
    return responseJSON({status: "success", data: products, source: "sheet"});
  } catch(e) { return responseJSON({status: "error", message: e.toString()}); }
}

function placeOrderSecure(d,u,t) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const s = getSheet("Orders"), h = s.getDataRange().getValues()[0], m = getIndices(h);
    const id = "ORD-" + Math.floor(Date.now()/1000), date = Utilities.formatDate(new Date(), "GMT+1", "yyyy-MM-dd HH:mm:ss");
    const row = new Array(h.length).fill(""); 
    const set = (k,v) => { const i=getIdx(m,[k]); if(i>-1) row[i]=v; };
    set("Order_ID", id); set("User_ID", u ? u.token : (t||"Guest")); set("Customer_Name", sanitize(d.name)); set("Phone", "'"+String(d.phone).replace(/\D/g,""));
    set("Address", sanitize(d.address)); set("Total", d.total); set("Items_JSON", d.cart); set("Date", date); set("Status", "Pending"); set("Coupon", d.coupon||""); set("Points_Used", d.pointsUsed||0); set("Payment_Method", d.paymentMethod || "COD");
    s.appendRow(row);
    if(u && d.pointsUsed > 0) {
      const uS = getSheet("Users"), latestU = getUserByToken(u.token);
      if(latestU && latestU.points >= d.pointsUsed) safeSetValue(uS, u.rowIndex + 1, getIdx(getIndices(uS.getDataRange().getValues()[0]), ["Points"]), latestU.points - d.pointsUsed);
    }
    return responseJSON({status: "success", orderId: id});
  } catch(e) { return responseJSON({status: "error", message: e.toString()}); } finally { lock.releaseLock(); }
}

function getUserOrders(t) {
  const u = getUserByToken(t); if(!u) return responseJSON({status: "error"});
  const d = getSheet("Orders").getDataRange().getValues(), m = getIndices(d[0]);
  const idxU = getIdx(m, ["User_ID"]), idxId = getIdx(m, ["Order_ID"]);
  const orders = d.slice(1).filter(r => String(r[idxU]) === String(t)).map(r => ({ id: r[idxId], date: r[getIdx(m, ["Date"])], total: r[getIdx(m, ["Total"])], status: r[getIdx(m, ["Status"])], items: r[getIdx(m, ["Items_JSON"])] })).reverse();
  return responseJSON({status: "success", orders: orders});
}

function cancelOrder(d, u) {
  const s = getSheet("Orders"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  const idxId = getIdx(m, ["Order_ID"]), idxUser = getIdx(m, ["User_ID"]), idxStatus = getIdx(m, ["Status"]);
  for(let i=1; i<dt.length; i++) {
    if(String(dt[i][idxId]) === String(d.orderId) && String(dt[i][idxUser]) === u.token) {
      if(String(dt[i][idxStatus]) === "Pending") { safeSetValue(s, i+1, idxStatus, "Cancelled"); return responseJSON({status: "success"}); } 
      else return responseJSON({status: "error", message: "Commande déjà traitée"});
    }
  }
  return responseJSON({status: "error", message: "Introuvable"});
}

function updateAddress(d, u) {
  const s = getSheet("Addresses"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  const colName = d.type === 'Home' ? "Home_JSON" : "Office_JSON";
  let colIdx = getIdx(m, [colName]);
  if(colIdx === -1) { colIdx = dt[0].length; s.getRange(1, colIdx + 1).setValue(colName); }
  const tokenIdx = getIdx(m, ["User_Token", "Token"]);
  let found = false;
  for(let i=1; i<dt.length; i++) if(String(dt[i][tokenIdx]) === u.token) { safeSetValue(s, i+1, colIdx, d.addressJson); found = true; break; }
  if(!found) { const newRow = new Array(s.getLastColumn()).fill(""); newRow[tokenIdx] = u.token; newRow[colIdx] = d.addressJson; s.appendRow(newRow); }
  return responseJSON({status: "success"});
}

function getUserData(t) {
  const u = getUserByToken(t); if(!u) return responseJSON({status: "error", error_code: ERROR_CODES.AUTH});
  let cart = "[]", wishlist = "[]", addresses = [];
  const cD = getSheet("Carts").getDataRange().getValues();
  const cR = cD.find(r => String(r[0]) === u.token);
  if(cR) cart = cR[1];
  const aS = getSheet("Addresses"), aD = aS.getDataRange().getValues();
  if(aD.length > 1) {
    const aM = getIndices(aD[0]), idxTok = getIdx(aM, ["User_Token", "Token"]), idxHome = getIdx(aM, ["Home_JSON", "Home"]), idxOff = getIdx(aM, ["Office_JSON", "Office"]);
    for(let i=1; i<aD.length; i++) if(String(aD[i][idxTok]) === u.token) {
      if(idxHome > -1 && aD[i][idxHome]) try { addresses.push(JSON.parse(aD[i][idxHome])); } catch(e){}
      if(idxOff > -1 && aD[i][idxOff]) try { addresses.push(JSON.parse(aD[i][idxOff])); } catch(e){}
      break;
    }
  }
  return responseJSON({status: "success", profile: u, cart: cart, wishlist: wishlist, addresses: addresses});
}

// ... (Admin & Utils) ...
function getAdminDashboard(pw) {
  if(String(pw) !== SECURE_ADMIN_PW) return responseJSON({status: "error"});
  const s = getSheet("Orders"), d = s.getDataRange().getValues(), m = getIndices(d[0]);
  const orders = d.slice(Math.max(1, d.length-100)).map(r => ({ id: r[getIdx(m, ["Order_ID"])], name: r[getIdx(m, ["Customer_Name"])], phone: r[getIdx(m, ["Phone"])], total: r[getIdx(m, ["Total"])], status: r[getIdx(m, ["Status"])], date: r[getIdx(m, ["Date"])], items: r[getIdx(m, ["Items_JSON"])] })).reverse();
  return responseJSON({status: "success", orders: orders});
}

function getCPanelData(pw) {
  if(String(pw) !== SECURE_ROOT_PW) return responseJSON({status: "error", message: "Invalid Password"});
  const c = {};
  const configSheet = getSheet("Config");
  if(configSheet.getLastRow() > 0) configSheet.getDataRange().getValues().forEach(r => { if(r[0]) c[String(r[0]).trim()] = r[1]; });
  const uS = getSheet("Users");
  let users = [];
  if (uS.getLastRow() > 1) {
    const uD = uS.getDataRange().getValues(), uM = getIndices(uD[0]);
    users = uD.slice(1).map(r => ({ id: r[getIdx(uM, ['ID'])], name: r[getIdx(uM, ['Name'])], phone: r[getIdx(uM, ['Phone'])], role: r[getIdx(uM, ['Role'])] || 'user', points: r[getIdx(uM, ['Points'])] || 0 }));
  }
  const countRows = (sheetName) => Math.max(0, getSheet(sheetName).getLastRow() - 1);
  return responseJSON({ status: "success", config: c, users: users, stats: { orders: countRows("Orders"), products: countRows("Catalog"), reviews: countRows("Reviews") }});
}

function checkCoupon(c, t) {
  const s = getSheet("Coupons"), d = s.getDataRange().getValues();
  for(let i=1; i<d.length; i++) {
    const dbCode = String(d[i][0]).toUpperCase().trim();
    const isActive = String(d[i][2]).toUpperCase().trim() === "TRUE";
    if(dbCode === String(c).toUpperCase().trim() && isActive) {
      if(parseFloat(t) >= (parseFloat(d[i][3]) || 0)) return responseJSON({status: "success", discount: parseFloat(d[i][1])});
    }
  }
  return responseJSON({status: "error", message: "Code invalide"});
}

function getReviews(pid) {
  const s = getSheet("Reviews"), d = s.getDataRange().getValues(), m = getIndices(d[0]);
  const reviews = d.slice(1).filter(r => String(r[getIdx(m, ["ProductId"])]) === String(pid) && String(r[getIdx(m, ["Status"])]) === "Active").map(r => ({ name: r[getIdx(m, ["UserName"])], rating: r[getIdx(m, ["Rating"])], comment: r[getIdx(m, ["Comment"])] })).reverse();
  return responseJSON({status: "success", data: {reviews: reviews}});
}

function getAdminReviews(pw) {
  if(String(pw) !== SECURE_ADMIN_PW) return responseJSON({status: "error"});
  const s = getSheet("Reviews"), d = s.getDataRange().getValues(), m = getIndices(d[0]);
  const reviews = d.slice(1).map(r => ({ id: r[getIdx(m, ["ID"])], user: r[getIdx(m, ["UserName"])], product: r[getIdx(m, ["ProductId"])], rating: r[getIdx(m, ["Rating"])], comment: r[getIdx(m, ["Comment"])], status: r[getIdx(m, ["Status"])] })).reverse();
  return responseJSON({status: "success", reviews: reviews});
}

function addReview(d, u) {
  const s = getSheet("Reviews");
  s.appendRow(["REV-"+Utilities.getUuid().split('-')[0], new Date(), u.id, u.name, d.productId, d.rating, sanitize(d.comment), "Active"]);
  return responseJSON({status: "success"});
}

function updateOrderStatus(d) {
  const s = getSheet("Orders"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  for(let i=1; i<dt.length; i++) if(String(dt[i][getIdx(m, ["Order_ID"])]) === String(d.orderId)) { safeSetValue(s, i+1, getIdx(m, ["Status"]), d.status); return responseJSON({status: "success"}); }
  return responseJSON({status: "error"});
}

function updateReviewStatus(d) {
  const s = getSheet("Reviews"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  for(let i=1; i<dt.length; i++) if(String(dt[i][getIdx(m, ["ID"])]) === String(d.reviewId)) { safeSetValue(s, i+1, getIdx(m, ["Status"]), d.status); return responseJSON({status: "success"}); }
  return responseJSON({status: "error"});
}

function updateProductStatus(d) {
  const s = getSheet("Catalog"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  const idxID = getIdx(m, ["ID"]), idxStock = getIdx(m, ["Stock"]), idxLabel = getIdx(m, ["Label", "Tag"]);
  for(let i=1; i<dt.length; i++) {
    if(String(dt[i][idxID]) === String(d.productId)) {
      const st = d.status;
      if(st==='available'){ safeSetValue(s,i+1,idxStock,100); safeSetValue(s,i+1,idxLabel,""); }
      else if(st==='out'){ safeSetValue(s,i+1,idxStock,0); safeSetValue(s,i+1,idxLabel,""); }
      else if(st==='sale'){ safeSetValue(s,i+1,idxStock,100); safeSetValue(s,i+1,idxLabel,"Sale"); }
      else if(st==='restock'){ safeSetValue(s,i+1,idxStock,0); safeSetValue(s,i+1,idxLabel,"Restock"); }
      return responseJSON({status: "success"});
    }
  }
  return responseJSON({status: "error", message: "Product not found"});
}

function updatePrice(d) {
  const s = getSheet("Catalog"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  for(let i=1; i<dt.length; i++) if(String(dt[i][getIdx(m, ["ID"])]) === String(d.productId)) { safeSetValue(s, i+1, getIdx(m, ["Price_MAD"]), parseFloat(d.price)); return responseJSON({status: "success"}); }
  return responseJSON({status: "error"});
}

function saveSystemConfig(d) {
  const s = getSheet("Config"), dt = s.getDataRange().getValues();
  for(const k in d.updates) {
    let row = -1;
    for(let i=1; i<dt.length; i++) if(String(dt[i][0]) === k) { row = i+1; break; }
    if(row > -1) s.getRange(row, 2).setValue(d.updates[k]);
    else s.appendRow([k, d.updates[k], "Set via CPanel"]);
  }
  return responseJSON({status: "success"});
}

function updateUserRole(d) {
  const s = getSheet("Users"), dt = s.getDataRange().getValues(), m = getIndices(dt[0]);
  for(let i=1; i<dt.length; i++) if(String(dt[i][getIdx(m, ["ID"])]) === String(d.userId)) { safeSetValue(s, i+1, getIdx(m, ["Role"]), d.role); return responseJSON({status: "success"}); }
  return responseJSON({status: "error"});
}

function getTranslations() {
  const t = {}, c = {};
  getSheet("Translator").getDataRange().getValues().slice(1).forEach(r => { if(r[0]) t[String(r[0]).trim()] = {en: r[1], fr: r[2], ar: r[3]}; });
  getSheet("Config").getDataRange().getValues().forEach(r => { if(r[0]) c[String(r[0]).trim()] = r[1]; });
  return responseJSON({status: "success", translations: t, config: c});
}

function checkStoreStatus() {
  const c = {};
  getSheet("Config").getDataRange().getValues().forEach(r => { if(r[0]) c[String(r[0]).trim()] = r[1]; });
  return responseJSON({status: "success", isOpen: c['store_open'] !== "FALSE", config: c});
}

function repairDatabase(pw) {
  if(String(pw) !== SECURE_ROOT_PW && String(pw) !== SECURE_ADMIN_PW) return responseJSON({status: "error"});
  const schema = {
    "Orders": ["Order_ID","User_ID","Customer_Name","Phone","Address","Total","Payment_Method","Items_JSON","Date","Status","Coupon","Points_Used"],
    "Users": ["ID","Name","Phone","Password","JoinDate","AuthToken","Points","Role","LastLogin"],
    "Catalog": ["ID","Title_FR","Title_EN","Title_AR","Desc_FR","Price_MAD","Stock","Category","Image_URL","Label","Variant_Name"],
    "Addresses": ["User_Token","Home_JSON","Office_JSON","Last_Updated"],
    "Carts": ["User_Token","Cart_JSON","Last_Updated"],
    "Config": ["Key","Value","Description"],
    "Reviews": ["ID","Date","UserId","UserName","ProductId","Rating","Comment","Status"],
    "Coupons": ["Code","Discount_Percent","Is_Active","Min_Amount"],
    "Wishlists": ["User_ID","Product_IDs","Currency","Last_Updated"],
    "Translator": ["Key","English","French","Arabic"],
    "Viewed": ["Timestamp", "User_Token", "ProductID"] // NEW SHEET
  };
  
  for (const [name, headers] of Object.entries(schema)) {
    const s = getSheet(name);
    if (s.getLastRow() === 0) s.appendRow(headers);
  }
  return responseJSON({status: "success"});
}
