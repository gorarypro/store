var SPREADSHEET_ID = "1O5L8yrkZVMbcZqitOAgStQj8E4sJzxyNrjoZCCswESo"; 
var ADMIN_SECRET = "admin123"; 
var SS;

try {
  SS = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
} catch(e) { SS = null; }

// --- SAFTEY NET WRAPPER FOR GET REQUESTS ---
function doGet(e) {
  try {
    if (!SS) throw new Error("Spreadsheet Connection Failed. Check ID.");
    
    var a = e.parameter.action;
    
    if (a == "getCatalog") return getCatalog();
    if (a == "getUserData") return getUserData(e.parameter.userId, e.parameter.token);
    if (a == "checkStoreStatus") return checkStoreStatus();
    if (a == "getTranslations") return getTranslations(); 
    if (a == "getReviews") return getReviews(e.parameter.productId);
    
    // Cache Clear
    if (a == "clearCache") {
      if (e.parameter.pw !== ADMIN_SECRET) return responseJSON({status: "error", message: "Unauthorized"});
      var c = CacheService.getScriptCache();
      c.remove("cat_v156");
      c.remove("trans_v150");
      c.remove("rev_summary");
      return responseJSON({status: "success", message: "Cache Cleared"});
    }
    
    return responseJSON({status: "error", message: "Invalid GET Action: " + a});
    
  } catch (error) {
    // THIS FIXES THE CORS ERROR by returning JSON even when it crashes
    return responseJSON({status: "error", message: "CRITICAL BACKEND ERROR: " + error.toString()});
  }
}

function doPost(e) {
  try {
    if (!SS) throw new Error("Spreadsheet Connection Failed.");
    
    var p = JSON.parse(e.postData.contents);
    var a = p.action;
    var d = p.data;
    
    if (a == "register") return registerUser(d);
    if (a == "login") return loginUser(d);
    if (a == "checkCoupon") return checkCoupon(d.code);
    if (a == "updateStatus") return updateOrderStatus(d);

    // Security Check for User Actions
    if (d.userId && a !== "placeOrder" && a !== "bookTable") { 
       if (!verifySession(d.userId, d.authToken)) {
         return responseJSON({status: "error", message: "Session Expired. Please Login Again."});
       }
    }

    if (a == "placeOrder") return placeOrderSecure(d);
    if (a == "bookTable") return bookTable(d);
    if (a == "syncCart") return syncCart(d);
    if (a == "syncWishlist") return syncWishlist(d);
    if (a == "updatePreference") return updatePreference(d);
    if (a == "updateAddress") return updateAddress(d);
    if (a == "updateUser") return updateUser(d);
    if (a == "submitReview") return submitReview(d);
    
    return responseJSON({status: "error", message: "Invalid POST Action"});
  } catch(e) {
    return responseJSON({status: "error", message: "JSON Parse Error: " + e.toString()});
  }
}

// --- CORE FUNCTIONS ---

function getUserData(uid, token){
  var w = SS.getSheetByName("Wishlists");
  var c = SS.getSheetByName("Carts");
  var u = SS.getSheetByName("Users");
  var o = SS.getSheetByName("Orders");
  var as = SS.getSheetByName("Adresses")||SS.getSheetByName("Adress")||SS.getSheetByName("Address");
  
  if (!u) throw new Error("Users sheet missing");

  var wl = String(findVal(w,uid,2)||""), cart="", curr="MAD";
  
  // Get Cart
  var cr=c.getDataRange().getValues();
  for(var k=1;k<cr.length;k++) if(String(cr[k][0])==String(uid)){cart=cr[k][1];curr=cr[k][2];break}
  
  // Get Profile
  var p={name:"",phone:"",email:"",joined:"", lang:"en", points: 0}, ur=u.getDataRange().getValues();
  for(var i=1;i<ur.length;i++) {
    if(String(ur[i][0])==String(uid)){ 
      p.name=ur[i][1]; 
      p.phone=ur[i][2]; 
      if(ur[i][4])p.joined=new Date(ur[i][4]).toLocaleDateString(); 
      if(ur[i][6])p.email=ur[i][6]; 
      if(ur[i][7])p.lang=ur[i][7]; 
      // SAFE CHECK FOR POINTS COLUMN (Col J / Index 9)
      p.points = (ur[i].length > 9) ? Number(ur[i][9]||0) : 0; 
      break; 
    }
  }
  
  // Get Addresses
  var ad={home:null,office:null};
  if(as){ 
    var adv=as.getDataRange().getValues(); 
    for(var m=1;m<adv.length;m++) if(String(adv[m][0])===String(uid)){ 
      try{ad.home=JSON.parse(adv[m][1])}catch(e){ad.home=adv[m][1]?{full:adv[m][1]}:null} 
      try{ad.office=JSON.parse(adv[m][2])}catch(e){ad.office=adv[m][2]?{full:adv[m][2]}:null} 
      break 
    } 
  }
  
  // Get Orders
  var ord=[],or=o.getDataRange().getValues();
  for(var j=1;j<or.length;j++) if(String(or[j][1])==String(uid)){ 
    var valSecure = Number(or[j][11]) || Number(or[j][9]) || 0; 
    ord.push({ id:or[j][0], total: valSecure.toFixed(2), date:or[j][8], status:or[j][9], items:or[j][7] }) 
  }
  
  return responseJSON({status:"success",wishlist:wl,cart:cart,currency:curr,profile:p,orders:ord.reverse(),addresses:ad})
}

// --- SUPPORTING FUNCTIONS ---

function getCatalog(){
  var c = CacheService.getScriptCache(), h = c.get("cat_v156"); 
  if (h) return ContentService.createTextOutput(h).setMimeType(ContentService.MimeType.JSON);
  
  var s = SS.getSheetByName("Catalog");
  if (!s) throw new Error("Catalog sheet not found");
  
  var d = s.getDataRange().getValues();
  if (d.length < 2) return responseJSON({status:"success", data: []});

  var headers = d[0];
  function getIdx(name) { var i = headers.indexOf(name); if (i > -1) return i; return headers.findIndex(function(h) { return String(h).toLowerCase() === String(name).toLowerCase(); }); }
  
  var idxID = getIdx("ID"), idxCat = getIdx("Category"), idxPrice = getIdx("Price_MAD"), idxStock = getIdx("Stock"), idxImg = getIdx("Image_URL"), idxTags = getIdx("Tags"), idxExtras = getIdx("Extras_JSON");
  var idxTitleEn = getIdx("Title_EN"), idxTitleFr = getIdx("Title_FR"), idxTitleAr = getIdx("Title_AR"), idxDescEn = getIdx("Desc_EN"), idxDescFr = getIdx("Desc_FR"), idxDescAr = getIdx("Desc_AR"), idxOldPrice = getIdx("Old_Price_MAD");
  
  var products = [];
  for (var i = 1; i < d.length; i++) {
    var r = d[i]; if (!r[idxID]) continue; 
    var extras = []; if(idxExtras > -1 && r[idxExtras]) { try { extras = JSON.parse(r[idxExtras]); } catch(e) {} }
    products.push({
      id: r[idxID], category: (idxCat > -1) ? r[idxCat] : "General",
      title: { en: r[idxTitleEn] || "", fr: r[idxTitleFr] || "", ar: r[idxTitleAr] || "" },
      desc: { en: r[idxDescEn] || "", fr: r[idxDescFr] || "", ar: r[idxDescAr] || "" },
      price_MAD: (idxPrice > -1) ? Number(r[idxPrice]) : 0,
      old_price_MAD: (idxOldPrice > -1) ? Number(r[idxOldPrice]) : 0,
      stock: (idxStock > -1) ? Number(r[idxStock]) : 0,
      image: (idxImg > -1 && r[idxImg]) ? r[idxImg] : "",
      tags: (idxTags > -1) ? r[idxTags] : "",
      extras: extras
    });
  }
  var j = JSON.stringify({status: "success", data: products});
  c.put("cat_v156", j, 1200);
  return ContentService.createTextOutput(j).setMimeType(ContentService.MimeType.JSON);
}

function placeOrderSecure(d) {
  if (!isValidMoroccanPhone(d.phone)) return responseJSON({status: "error", message: "Invalid Phone."});
  if (d.userId && !checkRateLimit(d.userId)) return responseJSON({status: "error", message: "Please wait 30s."});
  if (d.userId && d.userId !== "Guest" && !verifySession(d.userId, d.authToken)) return responseJSON({status: "error", message: "Auth Failed."});

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return responseJSON({status: "error", message: "System busy."}); }

  try {
    var s = SS.getSheetByName("Catalog");
    var o = SS.getSheetByName("Orders");
    var u = SS.getSheetByName("Users");
    
    var pData = s.getDataRange().getValues();
    var headers = pData[0];
    function getIdx(n){ return headers.findIndex(function(h){return String(h).toLowerCase()===String(n).toLowerCase()}); }
    
    var idxId = getIdx("ID"), idxPrice = getIdx("Price_MAD"), idxStock = getIdx("Stock"), idxExtras = getIdx("Extras_JSON");

    var sub = 0.0;
    var il = [];
    var cart = [];
    try { cart = JSON.parse(d.cart); } catch(e) { cart = []; }
    
    for (var k = 0; k < cart.length; k++) {
      var item = cart[k];
      var rowIndex = -1;
      for (var r = 1; r < pData.length; r++) {
        if (String(pData[r][idxId]) === String(item.id)) {
          rowIndex = r + 1;
          var currentStock = Number(pData[r][idxStock]);
          var price = Number(pData[r][idxPrice]);
          if (currentStock < item.qty) return responseJSON({status: "error", message: "Item " + item.title + " out of stock!"});
          
          var extraCost = 0; var extraNames = [];
          if (item.extras && Array.isArray(item.extras) && idxExtras > -1) {
             var availableExtras = []; try { availableExtras = JSON.parse(pData[r][idxExtras] || "[]"); } catch(e) {}
             item.extras.forEach(function(reqExtra) {
                var found = availableExtras.find(function(ex) { return ex.name === reqExtra; });
                if (found) { extraCost += Number(found.price); extraNames.push(found.name); }
             });
          }
          s.getRange(rowIndex, idxStock + 1).setValue(currentStock - item.qty);
          sub += (price + extraCost) * item.qty * (Number(item.variantMult)||1);
          var titleStr = item.qty + "x " + item.title;
          if(extraNames.length > 0) titleStr += " (" + extraNames.join(", ") + ")";
          il.push(titleStr);
          break;
        }
      }
    }

    var cs = SS.getSheetByName("Config");
    var cd = cs.getDataRange().getValues();
    var cf = {};
    for (var j = 1; j < cd.length; j++) cf[cd[j][0]] = cd[j][1];
    var dk = "Delivery_" + d.zone;
    var df = Number(cf[dk] || 0);
    if (sub >= (cf.Free_Shipping_Threshold || 200)) df = 0;
    
    var di = 0;
    if (d.couponCode) {
      var cr = JSON.parse(checkCoupon(d.couponCode).getContent());
      if (cr.status === "success") di = sub * cr.discount;
    }
    
    var tot = sub + df - di;
    
    if (d.userId && d.userId !== "Guest") {
      var pointsEarned = Math.floor(tot * 0.10); 
      var uData = u.getDataRange().getValues();
      for(var ui = 1; ui < uData.length; ui++) {
        if(String(uData[ui][0]) === String(d.userId)) {
          var currentPoints = Number(uData[ui][9] || 0); 
          u.getRange(ui+1, 10).setValue(currentPoints + pointsEarned);
          break;
        }
      }
    }

    var id = "ORD-" + Math.floor(Math.random() * 1000000);
    var fd = Utilities.formatDate(new Date(), "Africa/Casablanca", "yyyy-MM-dd HH:mm:ss");
    o.appendRow([String(id), String(d.userId || "Guest"), String(d.name || "Unknown"), "'" + String(d.phone || "No Phone"), String(d.address || d.zone || "N/A"), Number(tot.toFixed(2)), String(d.method || "Cash"), JSON.stringify(il), String(fd), "Pending", "MAD", Number(tot.toFixed(2))]);
    CacheService.getScriptCache().remove("cat_v156");
    return responseJSON({status: "success", orderId: id, secureTotal: tot.toFixed(2)});
  } catch (err) {
    return responseJSON({status: "error", message: "Server Error: " + err.message});
  } finally { lock.releaseLock(); }
}

function bookTable(d) {
  if (d.userId && d.userId !== "Guest" && !verifySession(d.userId, d.authToken)) return responseJSON({status: "error", message: "Auth Failed"});
  if (!isValidMoroccanPhone(d.phone)) return responseJSON({status: "error", message: "Invalid Phone"});
  var s = SS.getSheetByName("Reservations");
  if(!s) { s = SS.insertSheet("Reservations"); s.appendRow(["ID","Date","UserId","Name","Phone","ResDate","ResTime","Guests","Status"]); }
  var id = "RES-" + Math.floor(Math.random()*100000);
  s.appendRow([id, new Date(), d.userId||"Guest", d.name, "'"+d.phone, d.date, d.time, d.guests, "Pending"]);
  return responseJSON({status: "success", reservationId: id});
}

function submitReview(d) {
  var s = SS.getSheetByName("Reviews");
  if(!s) { s = SS.insertSheet("Reviews"); s.appendRow(["ID","Date","UserId","UserName","ProductId","Rating","Comment","Status"]); }
  var id = "REV-" + Utilities.getUuid().substring(0,8);
  s.appendRow([id, new Date(), d.userId, d.userName, d.productId, d.rating, d.comment, "Active"]);
  CacheService.getScriptCache().remove("rev_summary");
  return responseJSON({status: "success", message: "Review Submitted"});
}

function getReviews(pid) {
  var s = SS.getSheetByName("Reviews");
  if(!s) return responseJSON({status:"success", data:[]});
  var data = s.getDataRange().getValues();
  var reviews = []; var total = 0; var count = 0;
  for(var i=1; i<data.length; i++) {
    if(String(data[i][4]) === String(pid) && data[i][7] !== 'Hidden') {
      reviews.push({ user: data[i][3], date: new Date(data[i][1]).toLocaleDateString(), rating: data[i][5], comment: data[i][6] });
      total += Number(data[i][5]); count++;
    }
  }
  return responseJSON({status:"success", data: reviews, avg: count>0 ? (total/count).toFixed(1) : 0, count: count});
}

function registerUser(d) { if (!isValidMoroccanPhone(d.phone)) return responseJSON({status: "error", message: "Invalid Phone"}); var s = SS.getSheetByName("Users"), r = s.getDataRange().getValues(); for (var i = 1; i < r.length; i++) if (String(r[i][2]) == String(d.phone)) return responseJSON({status: "error", message: "Taken"}); var id = Utilities.getUuid(), t = Utilities.getUuid(); s.appendRow([id, d.name, "'" + d.phone, d.password, new Date(), "MAD", (d.email || ""), "en", t, 0]); return responseJSON({status: "success", userId: id, name: d.name, authToken: t}); }
function updateUser(d) { var s = SS.getSheetByName("Users"), r = s.getDataRange().getValues(); for (var i = 1; i < r.length; i++) if (String(r[i][0]) === String(d.userId)) { if (d.name) s.getRange(i + 1, 2).setValue(d.name); if (d.phone) s.getRange(i + 1, 3).setValue("'" + d.phone); if (d.email) s.getRange(i + 1, 7).setValue(d.email); if (d.lang) s.getRange(i + 1, 8).setValue(d.lang); return responseJSON({status: "success"}); } return responseJSON({status: "error", message: "User not found"}); }
function loginUser(d) { var s = SS.getSheetByName("Users"), r = s.getDataRange().getValues(); for (var i = 1; i < r.length; i++) if (String(r[i][2]) == String(d.phone) && String(r[i][3]) == String(d.password)) { var t = Utilities.getUuid(); s.getRange(i + 1, 9).setValue(t); CacheService.getScriptCache().put("auth_" + r[i][0], t, 600); return responseJSON({status: "success", userId: r[i][0], name: r[i][1], authToken: t}); } return responseJSON({status: "error", message: "Invalid Login"}); }
function updateOrderStatus(d) { if (d.adminSecret !== ADMIN_SECRET) return responseJSON({status: "error", message: "Unauthorized"}); var s = SS.getSheetByName("Orders"), r = s.getDataRange().getValues(); for (var i = 1; i < r.length; i++) if (String(r[i][0]) === String(d.orderId)) { s.getRange(i + 1, 10).setValue(d.newStatus); return responseJSON({status: "success"}); } return responseJSON({status: "error"}); }
function checkStoreStatus(){ var s=SS.getSheetByName("Config"),d=s.getDataRange().getValues(),c={}; for(var i=1;i<d.length;i++)c[d[i][0]]=d[i][1]; var n=new Date(new Date().toLocaleString("en-US",{timeZone:c.Timezone||"Africa/Casablanca"})),h=n.getHours(); return responseJSON({status:"success",isOpen:(h>=c.Open_Hour&&h<c.Close_Hour),hours:c.Open_Hour+":00 - "+c.Close_Hour+":00",config:c}) }
function checkCoupon(c){ var s=SS.getSheetByName("Coupons"),d=s.getDataRange().getValues(); for(var i=1;i<d.length;i++) if(String(d[i][0]).toUpperCase()===String(c).toUpperCase()&&d[i][2]===true) return responseJSON({status:"success",discount:d[i][1],code:d[i][0]}); return responseJSON({status:"error"}) }
function syncCart(d){ updateOrAppend(SS.getSheetByName("Carts"),d.userId,2,d.cartJson,d.currency); return responseJSON({status:"success"}) }
function syncWishlist(d){ updateOrAppend(SS.getSheetByName("Wishlists"),d.userId,2,d.items); return responseJSON({status:"success"}) }
function updatePreference(d){ var s=SS.getSheetByName("Users"),r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++) if(String(r[i][0])==String(d.userId)){ s.getRange(i+1,6).setValue(d.currency); return responseJSON({status:"success"}); } return responseJSON({status:"error"}) }
function getTranslations() { var c = CacheService.getScriptCache(), cached = c.get("trans_v150"); if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON); var sheet = SS.getSheetByName("Translator"), dict = {}; if (sheet) { var data = sheet.getDataRange().getValues(), headers = data[0]; for (var i = 1; i < data.length; i++) { var key = data[i][0]; if (key) { dict[key] = {}; for (var j = 1; j < headers.length; j++) { var langCode = headers[j].toLowerCase().substring(0, 2); if(langCode === "al") langCode = "ar"; dict[key][langCode] = data[i][j]; } } } } var json = JSON.stringify({status: "success", data: dict}); c.put("trans_v150", json, 3600); return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON); }
function updateAddress(d){ var s=SS.getSheetByName("Adresses")||SS.getSheetByName("Adress")||SS.getSheetByName("Address"); if(!s)return responseJSON({status:"error",message:"Sheet missing"}); var r=s.getDataRange().getValues(),idx=-1,tid=String(d.userId); for(var i=1;i<r.length;i++) if(String(r[i][0])===tid){idx=i+1;break} var as=d.addressJson; if(idx>-1){ if(d.type==='Home')s.getRange(idx,2).setValue(as); if(d.type==='Office')s.getRange(idx,3).setValue(as) }else{ s.appendRow([tid,(d.type==='Home'?as:''),(d.type==='Office'?as:'')]) } return responseJSON({status:"success"}) }
function updateOrAppend(s,k,c,v,cur){ var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){ if(String(r[i][0])==String(k)){ s.getRange(i+1,c).setValue(v); if(cur)s.getRange(i+1,3).setValue(cur); s.getRange(i+1,4).setValue(new Date()); return; } } s.appendRow([k,v,cur||"MAD",new Date()]) }
function findVal(s,k,c){ var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++) if(String(r[i][0])==String(k)) return r[i][c-1]; return null; }
function responseJSON(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON) }
function isValidMoroccanPhone(p) { var clean = String(p).replace(/[\s\-\(\)]/g, ''); return /^(?:(?:\+|00)212|0)[67]\d{8}$/.test(clean); }
function isValidEmail(e) { if (!e) return true; return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(e); }
function verifySession(uid, token) { if (!uid || !token) return false; var c = CacheService.getScriptCache(); if (c.get("auth_" + uid) === token) return true; var s = SS.getSheetByName("Users"), d = s.getDataRange().getValues(); for (var i = 1; i < d.length; i++) if (String(d[i][0]) === String(uid) && String(d[i][8]) === token) { c.put("auth_" + uid, token, 600); return true; } return false; }
function checkRateLimit(uid) { var c = CacheService.getScriptCache(), k = "limit_" + (uid || "guest"); if (c.get(k)) return false; c.put(k, "1", 30); return true; }
