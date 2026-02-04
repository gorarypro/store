/* GORARY VAPE - HYBRID BACKEND ENGINE (Final Fix) */

const SPREADSHEET_ID = "18LvTBWXkoYSCWeyD3ga5EYuFYZx-En3m-DE6ld0FIw8"; 

// --- 1. CONFIGURATION (FROM PROPERTIES) ---
const props = PropertiesService.getScriptProperties();
const ADMIN_PIN = props.getProperty("SECURE_ADMIN_PW") || "AP123456"; // Matches AP123456
const ROOT_PIN  = props.getProperty("SECURE_ROOT_PW") || "RP123456";  // Matches RP123456

const SS = SpreadsheetApp.openById(SPREADSHEET_ID);
const USER_ID_PREFIX = "GVU";

/* =========================================
   2. HTTP ROUTER
   ========================================= */

function doGet(e) {
  try {
    var a = e.parameter.action;
    if (a == "getCatalog") return getCatalog(); 
    if (a == "getCatalogJson") return getCatalogJson(); 
    if (a == "getCatalogVersion") return getCatalogVersion(); 
    if (a == "checkStoreStatus") return checkStoreStatus();
    if (a == "getReviews") return getReviews(e.parameter.productId);
    if (a == "getAllReviews") return getAllReviews();
    if (a == "getUserData") return getUserData(e.parameter.userId);
    if (a == "getUserOrders") return getUserOrders(e.parameter.phone);
    
    // Admin Dashboard (Uses ADMIN_PIN)
    if (a == "getAdminDashboard") return getAdminDashboard(e.parameter.pw);
    
    return responseJSON({status: "error", message: "Invalid GET Action"});
  } catch (err) { return responseJSON({status: "error", message: err.toString()}); }
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var a = p.action, d = p.data || p;
    if (d.phone) d.phone = String(d.phone).replace(/\D/g, "").trim();

    // Public Actions
    if (a == "register") return registerUser(d);
    if (a == "login") return loginUser(d); 
    if (a == "syncUserData") return syncUserData(d);
    if (a == "logView") return logView(d);
    if (a == "addReview") return addReview(d);
    if (a == "placeOrder") return placeOrderSecure(d);
    if (a == "checkCoupon") return checkCoupon(d.code, d.total);
    if (a == "cancelOrder") return cancelOrder(d);
    
    // Protected Actions (Check Password)
    var sentPw = String(d.password || "");
    var isAdmin = (sentPw === ADMIN_PIN);
    var isRoot = (sentPw === ROOT_PIN);

    if (a == "toggleStock") {
       if(!isAdmin) return responseJSON({status: "error", message: "Auth Failed"});
       return toggleStock(d);
    }
    if (a == "updateOrderStatus") {
       if(!isAdmin) return responseJSON({status: "error", message: "Auth Failed"});
       return updateOrderStatus(d);
    }
    if (a == "updatePrice") {
       if(!isAdmin) return responseJSON({status: "error", message: "Auth Failed"});
       return updatePrice(d);
    }
    if (a == "toggleStore" && (isAdmin || isRoot)) return toggleStore(d);
    if (a == "updateAddress") return updateAddress(d);

    return responseJSON({status: "error", message: "Invalid POST Action"});
  } catch(e) { 
    return responseJSON({status: "error", message: e.toString()}); 
  }
}

/* =========================================
   3. CORE FEATURES & PERSISTENCE
   ========================================= */

function getCatalogVersion() {
  var ver = PropertiesService.getScriptProperties().getProperty("CATALOG_VERSION");
  if (!ver) { ver = new Date().getTime().toString(); PropertiesService.getScriptProperties().setProperty("CATALOG_VERSION", ver); }
  return responseJSON({ status: "success", version: ver });
}

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() === "Catalog" || sheet.getName() === "Config") {
    PropertiesService.getScriptProperties().setProperty("CATALOG_VERSION", new Date().getTime().toString());
  }
}

function getUserData(uid) {
  var userId = String(uid).replace(/\D/g, "");
  if(!userId) return responseJSON({status:"error"});
  
  var res = { status: "success", cart: "[]", wishlist: "[]", addresses: {home: null, office: null}, coupon: null };
  function clean(v) { var s = String(v); return s.startsWith("'") ? s.substring(1) : s; }

  var cSheet = SS.getSheetByName("Carts");
  if(cSheet) {
    var data = cSheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) { 
        res.cart = clean(data[i][1]); 
        if(data[i][4]) { try { res.coupon = JSON.parse(clean(data[i][4])); } catch(e){} }
        break; 
      }
    }
  }

  var wSheet = SS.getSheetByName("Wishlists");
  if(wSheet) {
    var data = wSheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) {
        var csv = clean(data[i][1]);
        var arr = csv.split(',').filter(function(x){return x.trim()!=""}).map(function(id){ return {id: id.replace(/'/g,"").trim()}; });
        res.wishlist = JSON.stringify(arr); break;
      }
    }
  }
  var aSheet = SS.getSheetByName("Addresses");
  if(aSheet) {
    var data = aSheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) {
        try { res.addresses.home = JSON.parse(data[i][1]); } catch(e) {}
        try { res.addresses.office = JSON.parse(data[i][2]); } catch(e) {}
        break;
      }
    }
  }
  return responseJSON(res);
}

function syncUserData(d) {
  var userId = String(d.phone).replace(/\D/g, "");
  var now = new Date();
  
  if(d.type === 'cart') {
    var s = SS.getSheetByName("Carts");
    if (!s) { s = SS.insertSheet("Carts"); s.appendRow(["User_ID","Cart_JSON","Currency","Last_Updated","Coupon_JSON"]); }
    
    var data = s.getDataRange().getValues();
    var foundRowIndex = -1;

    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) { foundRowIndex = i + 1; break; }
    }

    var couponVal = d.coupon ? "'" + d.coupon : "";

    if(foundRowIndex > -1) {
      s.getRange(foundRowIndex, 2).setValue("'" + d.items); 
      s.getRange(foundRowIndex, 4).setValue(now); 
      if (d.coupon !== undefined) s.getRange(foundRowIndex, 5).setValue(couponVal); 
    } else {
      s.appendRow(["'" + userId, "'" + d.items, "MAD", now, couponVal]);
    }
  }
  
  if(d.type === 'wishlist') {
    var s = SS.getSheetByName("Wishlists") || SS.insertSheet("Wishlists");
    if(s.getLastRow()===0) s.appendRow(["User_ID","Product_IDs","Last_Updated"]);
    
    var list = []; try { list = JSON.parse(d.items); } catch(e){}
    var csv = list.map(function(x){return x.id}).join(",");
    
    var data = s.getDataRange().getValues(), found = false;
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) { 
        s.getRange(i+1, 2).setValue("'"+csv); 
        s.getRange(i+1, 3).setValue(now); 
        found = true; 
        break; 
      }
    }
    if(!found) s.appendRow(["'"+userId, "'"+csv, now]);
  }
  return responseJSON({status: "success", time: now.getTime()});
}

function getCatalogJson() {
  try {
    var s = SS.getSheetByName("Catalog");
    if (!s) return responseJSON({status: "error", message: "Catalog Sheet Missing"});
    
    var data = s.getDataRange().getValues();
    var headers = data.shift(); 
    var products = [];
    var hMap = {};
    headers.forEach(function(header, index) { hMap[String(header).trim().toLowerCase()] = index; });

    function getVal(row, possibleNames) {
      for (var i = 0; i < possibleNames.length; i++) {
        var key = possibleNames[i].toLowerCase();
        if (hMap.hasOwnProperty(key)) return row[hMap[key]];
      } return "";
    }

    function cleanImage(raw) {
      var val = String(raw).trim();
      if (val.startsWith('[')) { try { var arr = JSON.parse(val); return (Array.isArray(arr) && arr.length > 0) ? arr[0] : ""; } catch(e) { return ""; } }
      return val;
    }

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var id = getVal(row, ['ID', 'id', 'Code', 'Ref']);
      if (id) { 
        products.push({
          id: String(id),
          title: { en: getVal(row, ['Title_EN', 'Title']) || "", fr: getVal(row, ['Title_FR', 'Title']) || "", ar: getVal(row, ['Title_AR']) || "" },
          desc: { en: getVal(row, ['Desc_EN', 'Description']) || "", fr: getVal(row, ['Desc_FR', 'Description']) || "" },
          price_MAD: parseFloat(getVal(row, ['Price_MAD', 'Price', 'Prix'])) || 0,
          stock: parseInt(getVal(row, ['Stock', 'Quantité'])) || 0,
          category: getVal(row, ['Category', 'Catégorie', 'Cat']) || "General",
          image: cleanImage(getVal(row, ['Image_URL', 'Image'])), 
          variant_name: getVal(row, ['Variant_Name', 'Variant']) || "",
          is_best_seller: String(getVal(row, ['Tags'])).toLowerCase().includes('best')
        });
      }
    }
    return responseJSON({status: "success", data: products});
  } catch (e) { return responseJSON({status: "error", message: e.toString()}); }
}

function checkCoupon(code, total) {
  var s = SS.getSheetByName("Coupons");
  if (!s) return responseJSON({status: "error", message: "No coupons available"});
  
  var data = s.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(code).toUpperCase()) {
      var isActive = data[i][2];
      var minAmt = Number(data[i][3]) || 0;
      
      if (!isActive) return responseJSON({status: "error", message: "Coupon expired"});
      if (total < minAmt) return responseJSON({status: "error", message: "Min order: " + minAmt + " DH"});
      
      return responseJSON({
          status: "success", 
          discount: Number(data[i][1]), 
          code: data[i][0]
      });
    }
  }
  return responseJSON({status: "error", message: "Code invalide"});
}

function responseJSON(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function getCatalog(){ return responseJSON({status:"success", data:[]}); }
function checkStoreStatus(){ return responseJSON({status:"success", isOpen:true}); }
function getReviews(pid){ var s = SS.getSheetByName("Reviews"); if(!s) return responseJSON({status:"success", reviews:[]}); var data = s.getDataRange().getValues(); var revs = data.slice(1).filter(r => String(r[4]) === String(pid)).map(r => ({ name: r[3], rating: r[5], comment: r[6], isVerified: true })); return responseJSON({status:"success", reviews: revs.reverse()}); }
function getAllReviews(){ return responseJSON({status:"success", reviews:[]}); }
function getCoupons(){ return responseJSON({status:"success", data:[]}); }

function updatePrice(d) { var s = SS.getSheetByName("Catalog"); var data = s.getDataRange().getValues(); var tid = String(d.productId).trim(); for (let i = 1; i < data.length; i++) if (String(data[i][0]).trim() === tid) { s.getRange(i+1, 7).setValue(parseFloat(d.price)); return responseJSON({status: 'success'}); } return responseJSON({status: 'error'}); }
function toggleStock(d) { var s = SS.getSheetByName("Catalog"); var data = s.getDataRange().getValues(); var tid = String(d.productId).trim(); for(let i = 1; i < data.length; i++) if(String(data[i][0]) === tid) { s.getRange(i+1, 8).setValue(d.status ? 100 : 0); return responseJSON({status: 'success'}); } return responseJSON({status: 'error'}); }
function toggleStore(d) { return responseJSON({status:"success"}); }

// --- FIXED: GET ADMIN DASHBOARD (Check ADMIN_PIN) ---
function getAdminDashboard(pw) { 
  if (String(pw).trim() !== ADMIN_PIN) return responseJSON({status:'error', message:'Mot de passe incorrect'}); 
  
  var s = SS.getSheetByName("Orders");
  if(!s) return responseJSON({status:'error', message:'Feuille Orders manquante'});

  var data = s.getDataRange().getValues(); 
  data.shift(); 
  
  var orders = data.map(r => ({ 
    id: r[0], userId: r[1], name: r[2], phone: r[3], address: r[4], 
    items: r[7], total: r[5], date: r[8], status: r[9] 
  })).reverse(); 
  
  return responseJSON({status:'success', orders: orders}); 
}

function updateOrderStatus(d) { var s = SS.getSheetByName("Orders"); var data = s.getDataRange().getValues(); for(var i=1; i<data.length; i++) if(String(data[i][0]) === String(d.orderId)) { s.getRange(i+1, 10).setValue(d.status); return responseJSON({status: 'success'}); } return responseJSON({status: 'error'}); }
function addReview(d) { var s = SS.getSheetByName("Reviews") || SS.insertSheet("Reviews"); if(s.getLastRow()===0) s.appendRow(["ID","Date","UserId","UserName","ProductId","Rating","Comment","Status"]); s.appendRow(["REV-"+Math.floor(Math.random()*999), new Date(), d.phone, d.name, d.productId, d.rating, d.comment, "Active"]); return responseJSON({status:"success"}); }
function cancelOrder(d) { var s = SS.getSheetByName("Orders"); var data = s.getDataRange().getValues(); for(var i=1; i<data.length; i++) if(String(data[i][0]) === String(d.orderId)) { s.getRange(i+1, 10).setValue("Cancelled"); return responseJSON({status: "success"}); } return responseJSON({status: "error"}); }
function updateAddress(d) { var s = SS.getSheetByName("Addresses"); if (!s) { s = SS.insertSheet("Addresses"); s.appendRow(["User_ID", "Home_JSON", "Office_JSON", "Last_Updated"]); s.setColumnWidth(2, 300); s.setColumnWidth(3, 300); } var data = s.getDataRange().getValues(); var userId = String(d.userId).replace(/\D/g, ""); var type = String(d.type).toLowerCase(); var colIndex = (type === 'home') ? 2 : 3; var found = false; for (var i = 1; i < data.length; i++) { if (String(data[i][0]).replace(/\D/g, "") === userId) { s.getRange(i + 1, colIndex).setValue(d.addressJson); s.getRange(i + 1, 4).setValue(new Date()); found = true; break; } } if (!found) { var newRow = ["'" + userId, "", "", new Date()]; newRow[colIndex - 1] = d.addressJson; s.appendRow(newRow); } return responseJSON({ status: "success" }); }

/* =========================================
   4. ORDERS & AUTH
   ========================================= */

function loginUser(d) {
  var s = SS.getSheetByName("Users");
  var data = s.getDataRange().getDisplayValues();
  var p = String(d.phone).replace(/\D/g,"");
  var pass = String(d.password).trim();

  for(var i=1; i<data.length; i++) {
    if(String(data[i][2]).replace(/\D/g,"") === p && String(data[i][3]).trim() === pass) {
       s.getRange(i+1, 12).setValue(Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm"));
       return responseJSON({
         status: "success", 
         user: {
           id: data[i][0], name: data[i][1], phone: p, 
           points: Number(data[i][9])||0, role: data[i][10],
           authToken: "TOKEN" 
         }
       });
    }
  }
  return responseJSON({status:"error", message:"Identifiants incorrects"});
}

function registerUser(d) {
  var s = SS.getSheetByName("Users");
  if (!s) { s = SS.insertSheet("Users"); s.appendRow(["ID","Name","Phone","Password","JoinDate","Currency","Email","Lang","Address","Points","Role","LastLogin"]); }
  
  var data = s.getDataRange().getDisplayValues(); 
  var p = String(d.phone).replace(/\D/g,"");
  
  for(var i=1; i<data.length; i++) {
    if(String(data[i][2]).replace(/\D/g,"") === p) {
      return responseJSON({status:"error", message:"Ce numéro existe déjà"});
    }
  }
  
  var id = USER_ID_PREFIX + "-" + Math.floor(Math.random()*100000);
  s.appendRow([id, d.name, "'" + p, d.password, new Date(), "MAD", d.email, "fr", "", 0, "user", new Date()]);
  return responseJSON({status:"success", user:{id:id, name:d.name, phone:p}});
}

function placeOrderSecure(d) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return responseJSON({status: "error", message: "Busy"}); }
  
  try {
    var s = SS.getSheetByName("Orders");
    if (!s) { s = SS.insertSheet("Orders"); s.appendRow(["Order_ID", "User_ID", "Customer_Name", "Phone", "Address", "Total", "Payment_Method", "Items_JSON", "Date", "Status", "Currency", "Total_in_MAD", "Coupon", "Points_Used"]); }
    
    var id = "ORD-" + Math.floor(Math.random() * 1000000);
    var now = Utilities.formatDate(new Date(), "Africa/Casablanca", "yyyy-MM-dd HH:mm:ss");
    var cartItems = (typeof d.cart === 'object') ? JSON.stringify(d.cart) : d.cart;
    
    s.appendRow([
      id, d.userId || "Guest", d.name, "'" + String(d.phone).replace(/\D/g, ""), 
      d.address, d.total, "COD", cartItems, now, "Pending", "MAD", d.total, 
      d.coupon || "", d.pointsUsed || 0
    ]);
    
    if (d.userId && d.userId !== "Guest") {
      syncUserData({ phone: d.phone, type: 'cart', items: "[]", coupon: "" });
    }
    return responseJSON({status: "success", orderId: id});
  } catch (err) { return responseJSON({status: "error", message: err.message}); } 
  finally { lock.releaseLock(); }
}
