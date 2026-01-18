var SPREADSHEET_ID = "1O5L8yrkZVMbcZqitOAgStQj8E4sJzxyNrjoZCCswESo"; // Your Sheet ID

// --- SECURITY SETTINGS ---
// CHANGE THESE TO YOUR OWN SECRET PASSWORDS!
var SECURE_DRIVER_PIN = PropertiesService.getScriptProperties().getProperty("DRIVER_PIN");       // Driver App PIN
var SECURE_ADMIN_PW = PropertiesService.getScriptProperties().getProperty("ADMIN_PW"); // Admin Dashboard Password
var SECURE_ROOT_PIN = PropertiesService.getScriptProperties().getProperty("ROOT_PIN"); // SUPER ADMIN / CPANEL KEY (NEW)
var SS;

try {
  SS = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
} catch(e) { SS = null; }

function doGet(e) {
  try {
    if (!SS) throw new Error("Spreadsheet Connection Failed.");
    var a = e.parameter.action;
    
    // Public Actions
    if (a == "getCatalog") return getCatalog();
    if (a == "getUserData") return getUserData(e.parameter.userId, e.parameter.token);
    if (a == "checkStoreStatus") return checkStoreStatus();
    if (a == "getTranslations") return getTranslations(); 
    if (a == "getReviews") return getReviews(e.parameter.productId);
    if (a == "getCoupons") return getCoupons();
    
    // Protected Actions (Merchant & Driver)
    if (a == "getAdminDashboard") return getAdminDashboard(e.parameter.pw);
    
    // Super Admin Action (cPanel)
    if (a == "getSuperAdminData") return getSuperAdminData(e.parameter.rootPw);
    
    if (a == "clearCache") {
      if (e.parameter.pw !== SECURE_ADMIN_PW) return responseJSON({status: "error", message: "Unauthorized"});
      CacheService.getScriptCache().removeAll(['cat_v170', 'trans_v150', 'rev_summary']);
      return responseJSON({status: "success", message: "Cache Cleared"});
    }
    return responseJSON({status: "error", message: "Invalid Action"});
  } catch (error) { return responseJSON({status: "error", message: "Backend Error: " + error.toString()}); }
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var a = p.action, d = p.data;
    
    // --- AUTHENTICATION ACTIONS ---
    if (a == "register") return registerUser(d);
    if (a == "login") return loginUser(d);
    
    // --- SECURE LOGIN ACTIONS ---
    if (a == "driverLogin") {
      if (String(d.pin) === String(SECURE_DRIVER_PIN)) {
        return responseJSON({status: "success"});
      } else {
        return responseJSON({status: "error", message: "Invalid PIN"});
      }
    }

    // --- ADMIN ACTIONS (Merchant) ---
    if (a == "updateStatus" || a == "toggleStore") {
      if (d.password !== SECURE_ADMIN_PW) return responseJSON({status: "error", message: "Unauthorized"});
      if (a == "updateStatus") return updateOrderStatus(d);
      if (a == "toggleStore") return toggleStore(d);
    }

    // --- SUPER ADMIN ACTIONS (cPanel) ---
    if (a == "updateConfig" || a == "updateUserRole") {
      if (d.rootPassword !== SECURE_ROOT_PIN) return responseJSON({status: "error", message: "Access Denied"});
      if (a == "updateConfig") return updateConfig(d);
      if (a == "updateUserRole") return updateUserRole(d);
    }
    
    // --- PUBLIC/USER ACTIONS ---
    if (a == "checkCoupon") return checkCoupon(d.code, d.total);

    // Session Verification for User Actions
    if (d.userId && d.userId !== "Guest" && a !== "placeOrder" && a !== "bookTable") { 
       if (!verifySession(d.userId, d.authToken)) return responseJSON({status: "error", message: "Session Expired"});
    }

    if (a == "placeOrder") return placeOrderSecure(d);
    if (a == "bookTable") return bookTable(d);
    if (a == "syncCart") return syncCart(d);
    if (a == "syncWishlist") return syncWishlist(d);
    if (a == "updatePreference") return updatePreference(d);
    if (a == "updateAddress") return updateAddress(d);
    if (a == "updateUser") return updateUser(d);
    if (a == "submitReview") return submitReview(d);
    if (a == "logView") return logView(d);
    if (a == "cancelOrder") return cancelOrder(d);

    return responseJSON({status: "error", message: "Invalid POST Action"});
  } catch(e) { return responseJSON({status: "error", message: "JSON Parse Error: " + e.message}); }
}

// --- CORE FUNCTIONS ---

function getAdminDashboard(pw) {
  // Allow Admin Password OR Driver PIN
  if (pw !== SECURE_ADMIN_PW && String(pw) !== String(SECURE_DRIVER_PIN)) {
      return responseJSON({status: "error", message: "Wrong Password"});
  }
  
  var oSheet = SS.getSheetByName("Orders");
  var cSheet = SS.getSheetByName("Config");
  var rSheet = SS.getSheetByName("Reservations");
  
  var oData = oSheet.getDataRange().getValues();
  var orders = [];
  var revenueToday = 0;
  var todayStr = Utilities.formatDate(new Date(), "Africa/Casablanca", "yyyy-MM-dd");
  
  // --- ANALYTICS VARIABLES ---
  var itemCounts = {};
  var hourCounts = {};
  var customerSpend = {};
  
  for (var i = oData.length - 1; i >= 1; i--) {
    var row = oData[i];
    var oDate = new Date(row[8]);
    var oTotal = Number(row[5]);
    var oItems = row[7];
    var oUser = row[2];

    // Add to orders list (Limit 50 for performance)
    if (orders.length < 50) {
      orders.push({ 
        id: row[0], 
        userId: row[1], 
        name: row[2], 
        phone: row[3], 
        address: row[4], 
        total: row[5], 
        status: row[9], 
        date: row[8], 
        items: row[7] 
      });
    }

    // Revenue Calculation
    if ((row[9] === "Completed" || row[9] === "Delivered") && String(row[8]).indexOf(todayStr) > -1) { 
        revenueToday += oTotal; 
    }

    // Analytics Aggregation (Exclude Cancelled)
    if (row[9] !== "Cancelled") {
        // 1. Best Sellers
        try {
            var itemsJson = JSON.parse(oItems);
            itemsJson.forEach(function(it) {
                var t = (typeof it.title === 'object') ? it.title.en : it.title;
                itemCounts[t] = (itemCounts[t] || 0) + it.qty;
            });
        } catch(e) {}

        // 2. Peak Hours
        var h = oDate.getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;

        // 3. Top Customers
        if(oUser && oUser !== "Unknown") {
            customerSpend[oUser] = (customerSpend[oUser] || 0) + oTotal;
        }
    }
  }

  // Format Analytics Data
  var bestSellers = Object.keys(itemCounts).map(function(k){return {name:k, qty:itemCounts[k]}}).sort(function(a,b){return b.qty-a.qty}).slice(0, 5);
  var peakHours = Object.keys(hourCounts).map(function(k){return {hour:k, count:hourCounts[k]}});
  var topCustomers = Object.keys(customerSpend).map(function(k){return {name:k, total:customerSpend[k]}}).sort(function(a,b){return b.total-a.total}).slice(0, 5);
  
  var resData = rSheet ? rSheet.getDataRange().getValues() : [];
  var reservations = [];
  for (var j = 1; j < resData.length; j++) {
    if (resData[j][8] === "Pending") { reservations.push({ id: resData[j][0], name: resData[j][3], date: resData[j][5], time: resData[j][6], guests: resData[j][7] }); }
  }
  
  var config = {};
  var cData = cSheet.getDataRange().getValues();
  for(var k=1; k<cData.length; k++) config[cData[k][0]] = cData[k][1];
  
  return responseJSON({ 
      status: "success", 
      orders: orders, 
      reservations: reservations, 
      revenue: revenueToday.toFixed(2), 
      config: config,
      analytics: {
          bestSellers: bestSellers,
          peakHours: peakHours,
          topCustomers: topCustomers
      }
  });
}

function getSuperAdminData(pw) {
  if (pw !== SECURE_ROOT_PIN) return responseJSON({status: "error", message: "Invalid Root PIN"});
  
  var cSheet = SS.getSheetByName("Config");
  var uSheet = SS.getSheetByName("Users");
  
  // 1. Get Config
  var config = {};
  var cData = cSheet.getDataRange().getValues();
  for(var k=1; k<cData.length; k++) config[cData[k][0]] = cData[k][1];
  
  // 2. Get Users
  var users = [];
  if(uSheet) {
    var uData = uSheet.getDataRange().getValues();
    for(var k=1; k<uData.length; k++) {
       users.push({
         id: uData[k][0],
         name: uData[k][1],
         phone: uData[k][2],
         role: uData[k][10] || "customer"
       });
    }
  }
  
  return responseJSON({ status: "success", config: config, users: users });
}

function updateConfig(d) {
  var s = SS.getSheetByName("Config");
  if (!s) { s = SS.insertSheet("Config"); s.appendRow(["Key", "Value"]); }
  
  var data = s.getDataRange().getValues();
  var found = false;
  
  for(var i=1; i<data.length; i++) {
    if(String(data[i][0]) === d.key) {
       s.getRange(i+1, 2).setValue(d.value);
       found = true; break;
    }
  }
  if(!found) s.appendRow([d.key, d.value]);
  return responseJSON({status:"success"});
}

function updateUserRole(d) {
  var s = SS.getSheetByName("Users");
  var data = s.getDataRange().getValues();
  for(var i=1; i<data.length; i++) {
    if(String(data[i][0]) === d.targetId) {
       s.getRange(i+1, 11).setValue(d.role); 
       return responseJSON({status:"success"});
    }
  }
  return responseJSON({status:"error", message:"User not found"});
}

function registerUser(d) { 
  if (!isValidMoroccanPhone(d.phone)) return responseJSON({status: "error", message: "Invalid Phone"}); 
  var s = SS.getSheetByName("Users"), r = s.getDataRange().getValues(); 
  for (var i = 1; i < r.length; i++) if (String(r[i][2]) == String(d.phone)) return responseJSON({status: "error", message: "Taken"}); 
  
  var id = Utilities.getUuid();
  var t = Utilities.getUuid(); 
  var startPoints = 0;

  if(d.referralCode) {
    for(var j=1; j<r.length; j++) {
      if(String(r[j][0]).substring(0,6).toUpperCase() === d.referralCode.toUpperCase()) {
         var referrerPoints = Number(r[j][9] || 0);
         s.getRange(j+1, 10).setValue(referrerPoints + 50); 
         startPoints = 25; 
         break;
      }
    }
  }

  s.appendRow([id, d.name, "'" + d.phone, d.password, new Date(), "MAD", (d.email || ""), "en", t, startPoints]); 
  return responseJSON({status: "success", userId: id, name: d.name, authToken: t}); 
}

function placeOrderSecure(d) {
  if (!isValidMoroccanPhone(d.phone)) return responseJSON({status: "error", message: "Invalid Phone."});
  if (d.userId && !checkRateLimit(d.userId)) return responseJSON({status: "error", message: "Please wait 30s."});
  
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return responseJSON({status: "error", message: "System busy."}); }

  try {
    var s = SS.getSheetByName("Catalog");
    var o = SS.getSheetByName("Orders");
    var u = SS.getSheetByName("Users");
    var c = SS.getSheetByName("Carts"); // <--- Access Carts Sheet
    
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
          
          var extraCost = 0;
          if (item.extras && Array.isArray(item.extras) && idxExtras > -1) {
             var availableExtras = []; try { availableExtras = JSON.parse(pData[r][idxExtras] || "[]"); } catch(e) {}
             item.extras.forEach(function(reqExtra) {
                var found = availableExtras.find(function(ex) { 
                    var exName = (typeof ex.name === 'object') ? ex.name.en : ex.name;
                    return exName === reqExtra; 
                });
                if (found) { extraCost += Number(found.price); }
             });
          }
          s.getRange(rowIndex, idxStock + 1).setValue(currentStock - item.qty);
          sub += (price + extraCost) * item.qty * (Number(item.variantMult)||1);
          
          var histItem = {
            id: item.id,
            title: item.title,
            qty: item.qty,
            price: (price + extraCost) * (Number(item.variantMult)||1),
            image: pData[r][getIdx("Image_URL")],
            variant: item.variantMult > 1 ? {mult: item.variantMult} : null
          };
          il.push(histItem);
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
    
    var pointsUsed = 0;
    var pointsDiscount = 0;
    if (d.userId && d.userId !== "Guest") {
      var uData = u.getDataRange().getValues();
      var userRowIndex = -1;
      var currentPoints = 0;
      for(var ui = 1; ui < uData.length; ui++) {
        if(String(uData[ui][0]) === String(d.userId)) { userRowIndex = ui + 1; currentPoints = Number(uData[ui][9] || 0); break; }
      }
      if (d.usePoints === true && userRowIndex > -1) {
         var maxDiscount = sub * 0.50; 
         var potentialDiscount = currentPoints / 10; 
         if (potentialDiscount > maxDiscount) { pointsDiscount = maxDiscount; pointsUsed = maxDiscount * 10; } 
         else { pointsDiscount = potentialDiscount; pointsUsed = currentPoints; }
         u.getRange(userRowIndex, 10).setValue(currentPoints - pointsUsed);
         currentPoints = currentPoints - pointsUsed;
      }
      var moneySpent = (sub + df - di - pointsDiscount);
      if(moneySpent > 0 && userRowIndex > -1) {
        var pointsEarned = Math.floor(moneySpent * 0.10); 
        u.getRange(userRowIndex, 10).setValue(currentPoints + pointsEarned);
      }
    }

    var tot = sub + df - di - pointsDiscount;
    if(tot < 0) tot = 0;

    var id = "ORD-" + Math.floor(Math.random() * 1000000);
    var fd = Utilities.formatDate(new Date(), "Africa/Casablanca", "yyyy-MM-dd HH:mm:ss");
    var finalNote = (pointsUsed > 0) ? "(Paid " + pointsUsed + " pts) " + (d.notes || "") : (d.notes || "");
    
    o.appendRow([String(id), String(d.userId || "Guest"), String(d.name || "Unknown"), "'" + String(d.phone || "No Phone"), String(d.address || d.zone || "N/A"), Number(tot.toFixed(2)), finalNote, JSON.stringify(il), String(fd), "Pending", "MAD", Number(tot.toFixed(2))]);
    
    // --- SERVER SIDE CART WIPE FIX ---
    if (d.userId && d.userId !== "Guest") {
       var cData = c.getDataRange().getValues();
       for(var ci = 1; ci < cData.length; ci++) {
          if(String(cData[ci][0]) === String(d.userId)) {
             c.getRange(ci + 1, 2).setValue("[]"); // Wipe cart
             break;
          }
       }
    }
    // ---------------------------------
    
    CacheService.getScriptCache().remove("cat_v170"); 
    return responseJSON({status: "success", orderId: id, secureTotal: tot.toFixed(2), pointsRedeemed: pointsUsed});
  } catch (err) {
    return responseJSON({status: "error", message: "Server Error: " + err.message});
  } finally { lock.releaseLock(); }
}

function toggleStore(d) { 
  var s = SS.getSheetByName("Config");
  if (!s) return responseJSON({status: "error", message: "Config Sheet not found"});
  var data = s.getDataRange().getValues();
  var found = false;
  var rowIndex = -1;
  for(var i = 1; i < data.length; i++) {
    if(String(data[i][0]) === "Manual_Close") { rowIndex = i + 1; found = true; break; }
  }
  if(found) s.getRange(rowIndex, 2).setValue(d.state);
  else s.appendRow(["Manual_Close", d.state]);
  return responseJSON({status: "success", newState: d.state}); 
}

function updateOrderStatus(d) { 
  var s = SS.getSheetByName("Orders"); var r = s.getDataRange().getValues(); for (var i = 1; i < r.length; i++) if (String(r[i][0]) === String(d.orderId)) { s.getRange(i + 1, 10).setValue(d.newStatus); return responseJSON({status: "success"}); } return responseJSON({status: "error", message: "Order not found"}); 
}

function getCatalog(){ 
  var c = CacheService.getScriptCache(), h = c.get("cat_v170"); 
  if (h) return ContentService.createTextOutput(h).setMimeType(ContentService.MimeType.JSON); 
  var s = SS.getSheetByName("Catalog"), d = s.getDataRange().getValues(), headers = d[0]; 
  function getIdx(name) { var i = headers.indexOf(name); if (i > -1) return i; return headers.findIndex(function(h) { return String(h).toLowerCase() === String(name).toLowerCase(); }); } 
  var idxID = getIdx("ID"), idxCat = getIdx("Category"), idxPrice = getIdx("Price_MAD"), idxStock = getIdx("Stock"), idxImg = getIdx("Image_URL"), idxTags = getIdx("Tags"), idxExtras = getIdx("Extras_JSON"); 
  var idxTitleEn = getIdx("Title_EN"), idxTitleFr = getIdx("Title_FR"), idxTitleAr = getIdx("Title_AR"), idxDescEn = getIdx("Desc_EN"), idxDescFr = getIdx("Desc_FR"), idxDescAr = getIdx("Desc_AR"), idxOldPrice = getIdx("Old_Price_MAD"); 
  function safeNum(val) { if (!val) return 0; var clean = String(val).replace(/[^0-9.]/g, ""); var num = parseFloat(clean); return isNaN(num) ? 0 : num; }
  var products = []; 
  for (var i = 1; i < d.length; i++) { 
    var r = d[i]; 
    if (!r[idxID]) continue; 
    var extras = []; 
    if(idxExtras > -1 && r[idxExtras]) { try { extras = JSON.parse(r[idxExtras]); } catch(e) {} } 
    products.push({ 
      id: r[idxID], 
      category: (idxCat > -1) ? r[idxCat] : "General", 
      title: { en: r[idxTitleEn] || "", fr: r[idxTitleFr] || "", ar: r[idxTitleAr] || "" }, 
      desc: { en: r[idxDescEn] || "", fr: r[idxDescFr] || "", ar: r[idxDescAr] || "" }, 
      price_MAD: (idxPrice > -1) ? safeNum(r[idxPrice]) : 0, 
      old_price_MAD: (idxOldPrice > -1) ? safeNum(r[idxOldPrice]) : 0, 
      stock: (idxStock > -1) ? safeNum(r[idxStock]) : 0, 
      image: (idxImg > -1 && r[idxImg]) ? r[idxImg] : "", 
      tags: (idxTags > -1) ? r[idxTags] : "", 
      extras: extras 
    }); 
  } 
  var j = JSON.stringify({status: "success", data: products}); 
  c.put("cat_v170", j, 1200); 
  return ContentService.createTextOutput(j).setMimeType(ContentService.MimeType.JSON); 
}

function getUserData(uid, token){ 
  var w = SS.getSheetByName("Wishlists"), c = SS.getSheetByName("Carts"), u = SS.getSheetByName("Users"), o = SS.getSheetByName("Orders"), as = SS.getSheetByName("Adresses")||SS.getSheetByName("Adress")||SS.getSheetByName("Address"); 
  var v = SS.getSheetByName("Viewed"); 
  var wl = String(findVal(w,uid,2)||""), cart="", curr="MAD"; 
  var cr=c.getDataRange().getValues(); for(var k=1;k<cr.length;k++) if(String(cr[k][0])==String(uid)){cart=cr[k][1];curr=cr[k][2];break} 
  var p={name:"",phone:"",email:"",joined:"", lang:"en", points: 0}, ur=u.getDataRange().getValues(); 
  for(var i=1;i<ur.length;i++) 
    if(String(ur[i][0])==String(uid)){ p.name=ur[i][1]; p.phone=ur[i][2]; 
    if(ur[i][4])p.joined=new Date(ur[i][4]).toLocaleDateString(); 
    if(ur[i][6])p.email=ur[i][6]; 
    if(ur[i][7])p.lang=ur[i][7]; p.points = (ur[i].length > 9) ? Number(ur[i][9]||0) : 0; 
    p.role = ur[i][10] || "customer";break; } 
  var ad={home:null,office:null}; 
  if(as){ var adv=as.getDataRange().getValues(); for(var m=1;m<adv.length;m++) if(String(adv[m][0])===String(uid)){ try{ad.home=JSON.parse(adv[m][1])}catch(e){ad.home=adv[m][1]?{full:adv[m][1]}:null} try{ad.office=JSON.parse(adv[m][2])}catch(e){ad.office=adv[m][2]?{full:adv[m][2]}:null} break } } 
  var ord=[],or=o.getDataRange().getValues(); 
  for(var j=1;j<or.length;j++) if(String(or[j][1])==String(uid)){ var valSecure = Number(or[j][11]) || Number(or[j][9]) || 0; ord.push({ id:or[j][0], total: valSecure.toFixed(2), date:or[j][8], status:or[j][9], items:or[j][7] }) } 
  var recentIds = [];
  if (v) {
    var vData = v.getDataRange().getValues();
    var now = new Date();
    var oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1); 
    for (var x = vData.length - 1; x >= 1; x--) {
      var rowDate = new Date(vData[x][0]);
      if (String(vData[x][1]) === String(uid) && rowDate >= oneMonthAgo) {
        var pid = String(vData[x][2]);
        if (recentIds.indexOf(pid) === -1) recentIds.push(pid);
        if (recentIds.length >= 12) break;
      }
    }
  }
  return responseJSON({status:"success",wishlist:wl,cart:cart,currency:curr,profile:p,orders:ord.reverse(),addresses:ad, recent:recentIds}) 
}

function submitReview(d) { var s = SS.getSheetByName("Reviews"); if(!s) { s = SS.insertSheet("Reviews"); s.appendRow(["ID","Date","UserId","UserName","ProductId","Rating","Comment","Status"]); } var id = "REV-" + Utilities.getUuid().substring(0,8); s.appendRow([id, new Date(), d.userId, d.userName, d.productId, d.rating, d.comment, "Active"]); CacheService.getScriptCache().remove("rev_summary"); return responseJSON({status: "success", message: "Review Submitted"}); }
function getReviews(pid) { var s = SS.getSheetByName("Reviews"); if(!s) return responseJSON({status:"success", data:[]}); var data = s.getDataRange().getValues(); var reviews = []; var total = 0; var count = 0; for(var i=1; i<data.length; i++) { if(String(data[i][4]) === String(pid) && data[i][7] !== 'Hidden') { reviews.push({ user: data[i][3], date: new Date(data[i][1]).toLocaleDateString(), rating: data[i][5], comment: data[i][6] }); total += Number(data[i][5]); count++; } } return responseJSON({status:"success", data: reviews, avg: count>0 ? (total/count).toFixed(1) : 0, count: count}); }
function isValidMoroccanPhone(p) { var clean = String(p).replace(/[^0-9+]/g, ''); return /^(?:(?:\+|00)212|0)[67]\d{8}$/.test(clean); }
function isValidEmail(e) { if (!e) return true; return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(e); }
function verifySession(uid, token) { if (!uid || !token) return false; var c = CacheService.getScriptCache(); if (c.get("auth_" + uid) === token) return true; var s = SS.getSheetByName("Users"), d = s.getDataRange().getValues(); for (var i = 1; i < d.length; i++) if (String(d[i][0]) === String(uid) && String(d[i][8]) === token) { c.put("auth_" + uid, token, 600); return true; } return false; }
function checkRateLimit(uid) { var c = CacheService.getScriptCache(), k = "limit_" + (uid || "guest"); if (c.get(k)) return false; c.put(k, "1", 30); return true; }
function updateUser(d) { var s = SS.getSheetByName("Users"), r = s.getDataRange().getValues(); for (var i = 1; i < r.length; i++) if (String(r[i][0]) === String(d.userId)) { if (d.name) s.getRange(i + 1, 2).setValue(d.name); if (d.phone) s.getRange(i + 1, 3).setValue("'" + d.phone); if (d.email) s.getRange(i + 1, 7).setValue(d.email); if (d.lang) s.getRange(i + 1, 8).setValue(d.lang); return responseJSON({status: "success"}); } return responseJSON({status: "error", message: "User not found"}); }
function loginUser(d) { 
  var s = SS.getSheetByName("Users"), r = s.getDataRange().getValues(); 
  for (var i = 1; i < r.length; i++) {
    if (String(r[i][2]) == String(d.phone) && String(r[i][3]) == String(d.password)) { 
      var t = Utilities.getUuid(); 
      s.getRange(i + 1, 9).setValue(t); 
      CacheService.getScriptCache().put("auth_" + r[i][0], t, 600); 
      var role = r[i][10] || "customer"; 
      return responseJSON({ status: "success", userId: r[i][0], name: r[i][1], authToken: t, role: role }); 
    } 
  }
  return responseJSON({status: "error", message: "Invalid Login"}); 
}

function syncCart(d){ updateOrAppend(SS.getSheetByName("Carts"),d.userId,2,d.cartJson,d.currency); return responseJSON({status:"success"}) }
function syncWishlist(d){ updateOrAppend(SS.getSheetByName("Wishlists"),d.userId,2,d.items); return responseJSON({status:"success"}) }
function updatePreference(d){ var s=SS.getSheetByName("Users"),r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++) if(String(r[i][0])==String(d.userId)){ s.getRange(i+1,6).setValue(d.currency); return responseJSON({status:"success"}); } return responseJSON({status:"error"}) }
function getTranslations() { var c = CacheService.getScriptCache(), cached = c.get("trans_v150"); if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON); var sheet = SS.getSheetByName("Translator"), dict = {}; if (sheet) { var data = sheet.getDataRange().getValues(), headers = data[0]; for (var i = 1; i < data.length; i++) { var key = data[i][0]; if (key) { dict[key] = {}; for (var j = 1; j < headers.length; j++) { var langCode = headers[j].toLowerCase().substring(0, 2); if(langCode === "al") langCode = "ar"; dict[key][langCode] = data[i][j]; } } } } var json = JSON.stringify({status: "success", data: dict}); c.put("trans_v150", json, 3600); return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON); }
function updateAddress(d){ var s=SS.getSheetByName("Adresses")||SS.getSheetByName("Adress")||SS.getSheetByName("Address"); if(!s)return responseJSON({status:"error",message:"Sheet missing"}); var r=s.getDataRange().getValues(),idx=-1,tid=String(d.userId); for(var i=1;i<r.length;i++) if(String(r[i][0])===tid){idx=i+1;break} var as=d.addressJson; if(idx>-1){ if(d.type==='Home')s.getRange(idx,2).setValue(as); if(d.type==='Office')s.getRange(idx,3).setValue(as) }else{ s.appendRow([tid,(d.type==='Home'?as:''),(d.type==='Office'?as:'')]) } return responseJSON({status:"success"}) }
function updateOrAppend(s,k,c,v,cur){ var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){ if(String(r[i][0])==String(k)){ s.getRange(i+1,c).setValue(v); if(cur)s.getRange(i+1,3).setValue(cur); s.getRange(i+1,4).setValue(new Date()); return; } } s.appendRow([k,v,cur||"MAD",new Date()]) }
function findVal(s,k,c){ var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++) if(String(r[i][0])==String(k)) return r[i][c-1]; return null; }
function bookTable(d){ var s=SS.getSheetByName("Reservations"); if(!s){s=SS.insertSheet("Reservations"); s.appendRow(["ID","UserID","DateCreated","Name","Phone","ResDate","ResTime","Guests","Status"]);} var id="RES-"+Utilities.getUuid().substring(0,6); s.appendRow([id,d.userId,new Date(),d.name,"'"+d.phone,d.date,d.time,d.guests,"Pending"]); return responseJSON({status:"success",id:id}); }
function responseJSON(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON) }

function logView(d) {
  var s = SS.getSheetByName("Viewed");
  if (!s) { s = SS.insertSheet("Viewed"); s.appendRow(["Timestamp", "UserID", "ProductID"]); }
  s.appendRow([new Date(), d.userId, d.productId]);
  return responseJSON({status: "success"});
}

function getCoupons() {
  var s = SS.getSheetByName("Coupons");
  if(!s) return responseJSON({status: "success", data: []});
  var data = s.getDataRange().getValues();
  var coupons = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === true) {
      coupons.push({ code: data[i][0], discount: Number(data[i][1]), min: Number(data[i][3] || 0), desc: data[i][4] || "" });
    }
  }
  return responseJSON({status: "success", data: coupons});
}

// --- PASTE AT THE BOTTOM OF CODE.GS ---

function checkStoreStatus() {
  try {
    var s = SS.getSheetByName("Config");
    if (!s) return responseJSON({status: "error", message: "Config sheet missing"});
    
    var data = s.getDataRange().getValues();
    var config = {};
    
    // Convert Config sheet rows to a JSON object
    for (var i = 1; i < data.length; i++) {
      config[data[i][0]] = data[i][1];
    }
    
    var now = new Date();
    // Adjust timezone if needed, matching your Config sheet
    var hour = Number(Utilities.formatDate(now, config.Timezone || "Africa/Casablanca", "H"));
    
    var openH = Number(config.Open_Hour || 0);
    var closeH = Number(config.Close_Hour || 23);
    var isManualClosed = (String(config.Manual_Close).toLowerCase() === "true");
    
    var isOpen = (hour >= openH && hour < closeH) && !isManualClosed;
    
    return responseJSON({status: "success", isOpen: isOpen, config: config});
  } catch(e) {
    return responseJSON({status: "error", message: e.message});
  }
}

function checkCoupon(code, total) {
  try {
    var s = SS.getSheetByName("Coupons");
    if (!s) return responseJSON({status: "error", message: "No coupons sheet"});
    
    var data = s.getDataRange().getValues();
    // CSV Structure: Code, Discount_Percent, Is_Active, Min_Amount, Description
    
    for (var i = 1; i < data.length; i++) {
      var rowCode = String(data[i][0]).trim().toUpperCase();
      var inputCode = String(code).trim().toUpperCase();
      
      if (rowCode === inputCode) {
        var isActive = (String(data[i][2]).toLowerCase() === "true");
        if (!isActive) return responseJSON({status: "error", message: "Coupon expired"});
        
        var minAmount = Number(data[i][3] || 0);
        if (Number(total) < minAmount) {
          return responseJSON({status: "error", message: "Minimum order: " + minAmount + " DH"});
        }
        
        return responseJSON({
          status: "success", 
          code: rowCode, 
          discount: Number(data[i][1]), // e.g., 0.1 for 10%
          desc: data[i][4] 
        });
      }
    }
    return responseJSON({status: "error", message: "Invalid Code"});
  } catch(e) {
    return responseJSON({status: "error", message: e.message});
  }
}

function cancelOrder(d) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); // Prevent double clicks
    var s = SS.getSheetByName("Orders");
    var data = s.getDataRange().getValues();
    
    for (var i = 1; i < data.length; i++) {
      // Check ID matches AND User Matches (Security)
      if (String(data[i][0]) === String(d.orderId) && String(data[i][1]) === String(d.userId)) {
        
        var currentStatus = data[i][9]; // Column J is Status
        
        // Only allow if Pending
        if (currentStatus === "Pending") {
          s.getRange(i + 1, 10).setValue("Cancelled");
          
          // OPTIONAL: Auto-Restock items (Advanced)
          // For now, we just mark as cancelled to keep it safe.
          
          return responseJSON({status: "success", message: "Order cancelled."});
        } else {
          return responseJSON({status: "error", message: "Order is already " + currentStatus});
        }
      }
    }
    return responseJSON({status: "error", message: "Order not found"});
  } catch(e) {
    return responseJSON({status: "error", message: e.message});
  } finally {
    lock.releaseLock();
  }
}
