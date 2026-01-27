/* GORARY VAPE - ULTIMATE BACKEND ENGINE */

const SPREADSHEET_ID = "18LvTBWXkoYSCWeyD3ga5EYuFYZx-En3m-DE6ld0FIw8"; 
const MASTER_PIN = PropertiesService.getScriptProperties().getProperty("ADMIN_PW") || "1234";
const SS = SpreadsheetApp.openById(SPREADSHEET_ID);
const USER_ID_PREFIX = "GVU";

/* =========================================
   1. HTTP ROUTER
   ========================================= */

function doGet(e) {
  try {
    var a = e.parameter.action;
    
    // Public
    if (a == "getCatalog") return getCatalog();
    if (a == "getCatalogVersion") return getCatalogVersion(); // Critical for Caching
    if (a == "checkStoreStatus") return checkStoreStatus();
    if (a == "getReviews") return getReviews(e.parameter.productId);
    if (a == "getAllReviews") return getAllReviews();
    
    // User
    if (a == "getUserData") return getUserData(e.parameter.userId);
    if (a == "getUserOrders") return getUserOrders(e.parameter.phone);
    
    // Admin
    if (a == "getAdminDashboard") return getAdminDashboard(e.parameter.pw);

    return responseJSON({status: "error", message: "Invalid GET Action"});
  } catch (err) { return responseJSON({status: "error", message: err.toString()}); }
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var a = p.action, d = p.data || p;
    
    if (d.phone) d.phone = String(d.phone).replace(/\D/g, "").trim();

    // Auth
    if (a == "register") return registerUser(d);
    if (a == "login") return loginUser(d); 
    
    // Sync & Interaction
    if (a == "syncUserData") return syncUserData(d);
    if (a == "logView") return logView(d);
    if (a == "addReview") return addReview(d);
    
    // Commerce
    if (a == "placeOrder") return placeOrderSecure(d);
    if (a == "checkCoupon") return checkCoupon(d.code, d.total);
    if (a == "cancelOrder") return cancelOrder(d);
    
    // Admin (Requires Master PIN)
    var isMaster = (String(d.password) === MASTER_PIN);
    if (a == "toggleStock" && isMaster) return toggleStock(d);
    if (a == "updateOrderStatus" && isMaster) return updateOrderStatus(d);
    if (a == "updatePrice" && isMaster) return updatePrice(d);
    if (a == "toggleStore" && isMaster) return toggleStore(d);

    return responseJSON({status: "error", message: "Invalid POST Action"});
  } catch(e) { 
    return responseJSON({status: "error", message: e.toString()}); 
  }
}

/* =========================================
   2. CORE FEATURES
   ========================================= */

// --- A. CATALOG CACHE VERSIONING ---
function getCatalogVersion() {
  // Returns the timestamp of the last modification to the sheet.
  // This tells the frontend whether to re-download the CSV or use the Cache.
  var file = DriveApp.getFileById(SPREADSHEET_ID);
  return responseJSON({ status: "success", version: file.getLastUpdated().getTime() });
}

/* --- B. COUPON SYSTEM (Matches your Sheet Structure) --- */
function checkCoupon(code, total) {
  var s = SS.getSheetByName("Coupons");
  if (!s) return responseJSON({status: "error", message: "No coupons available"});
  
  var data = s.getDataRange().getValues();
  // Assuming Columns: Code (0), Discount (1), Active (2), MinAmount (3)
  
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
  return responseJSON({status: "error", message: "Invalid Code"});
}

// --- C. DATA PERSISTENCE (Fixed) ---
function getUserData(uid) {
  var userId = String(uid).replace(/\D/g, "");
  if(!userId) return responseJSON({status:"error"});

  var res = { status: "success", cart: "[]", cartTime: 0, wishlist: "[]", wishTime: 0, viewed: "[]", viewedTime: 0, addresses: {home: null, office: null} };
  
  // Helper to remove leading single quote
  function clean(v) { return String(v).startsWith("'") ? String(v).substring(1) : String(v); }

  // 1. Get Cart
  var cSheet = SS.getSheetByName("Carts");
  if(cSheet) {
    var data = cSheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) {
        res.cart = clean(data[i][1]); 
        break;
      }
    }
  }

  // 2. Get Wishlist
  var wSheet = SS.getSheetByName("Wishlists");
  if(wSheet) {
    var data = wSheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) {
        var csv = clean(data[i][1]);
        if(csv) {
          try {
             var arr = csv.split(',').filter(function(x){return x.trim()!=""}).map(function(id){ return {id: id.replace(/'/g,"").trim()}; });
             res.wishlist = JSON.stringify(arr);
          } catch(e) {}
        }
        break;
      }
    }
  }

  // 3. Get Addresses (Robust Check)
  var aSheet = SS.getSheetByName("Addresses"); // Standardized Name
  if(aSheet) {
    var data = aSheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) {
        try { res.addresses.home = JSON.parse(data[i][1]); } catch(e) { res.addresses.home = null; }
        try { res.addresses.office = JSON.parse(data[i][2]); } catch(e) { res.addresses.office = null; }
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
    var s = SS.getSheetByName("Carts") || SS.insertSheet("Carts");
    if(s.getLastRow()===0) s.appendRow(["User_ID","Cart_JSON","Currency","Last_Updated"]);
    var data = s.getDataRange().getValues(), found = false;
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) {
        s.getRange(i+1, 2).setValue("'"+d.items); s.getRange(i+1, 4).setValue(now); found = true; break;
      }
    }
    if(!found) s.appendRow(["'"+userId, "'"+d.items, "MAD", now]);
  }

  if(d.type === 'wishlist') {
    var s = SS.getSheetByName("Wishlists") || SS.insertSheet("Wishlists");
    if(s.getLastRow()===0) s.appendRow(["User_ID","Product_IDs","Currency","Last_Updated"]);
    var list = []; try { list = JSON.parse(d.items); } catch(e){}
    var csv = list.map(function(x){return x.id}).join(",");
    var data = s.getDataRange().getValues(), found = false;
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]).replace(/\D/g, "") === userId) {
        s.getRange(i+1, 2).setValue("'"+csv); s.getRange(i+1, 4).setValue(now); found = true; break;
      }
    }
    if(!found) s.appendRow(["'"+userId, "'"+csv, "MAD", now]);
  }
  return responseJSON({status: "success", time: now.getTime()});
}

function logView(d) {
  var s = SS.getSheetByName("Viewed") || SS.insertSheet("Viewed");
  if(s.getLastRow()===0) s.appendRow(["Timestamp","UserID","ProductID"]);
  s.appendRow([new Date(), "'"+String(d.userId).replace(/\D/g,""), "'"+d.productId]);
  return responseJSON({status:"success"});
}

/* =========================================
   3. ORDERS & AUTH
   ========================================= */

function placeOrderSecure(d) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return responseJSON({status: "error", message: "Busy"}); }

  try {
    var s = SS.getSheetByName("Orders");
    // Ensure headers exist if it's a new sheet
    if (!s) { 
      s = SS.insertSheet("Orders"); 
      s.appendRow(["Order_ID", "User_ID", "Customer_Name", "Phone", "Address", "Total", "Payment_Method", "Items_JSON", "Date", "Status", "Currency", "Total_in_MAD", "Coupon", "Points_Used"]); 
    }
    
    var id = "ORD-" + Math.floor(Math.random() * 1000000);
    var now = Utilities.formatDate(new Date(), "Africa/Casablanca", "yyyy-MM-dd HH:mm:ss");
    
    var cartItems = (typeof d.cart === 'object') ? JSON.stringify(d.cart) : d.cart;
    var couponUsed = d.coupon || "";
    var pointsUsed = d.pointsUsed || 0;

    // MATCHING YOUR SCREENSHOT COLUMNS EXACTLY:
    // A: ID, B: UserID, C: Name, D: Phone, E: Address, F: Total, G: Payment, H: Items, I: Date, J: Status, K: Currency
    // L: Total_in_MAD (Duplicate total), M: Coupon, N: Points
    s.appendRow([
      id, 
      d.userId || "Guest", 
      d.name, 
      "'" + String(d.phone).replace(/\D/g, ""), 
      d.address, 
      d.total, 
      "COD", 
      cartItems, 
      now, 
      "Pending", 
      "MAD",
      d.total,     // <--- Column L (Total_in_MAD)
      couponUsed,  // <--- Column M (Coupon)
      pointsUsed   // <--- Column N (Points_Used)
    ]);
    
    if (d.userId && d.userId !== "Guest") syncUserData({ phone: d.phone, type: 'cart', items: "[]" });
    
    return responseJSON({status: "success", orderId: id});
  } catch (err) { return responseJSON({status: "error", message: err.message}); } 
  finally { lock.releaseLock(); }
}

function loginUser(d) {
  var s = SS.getSheetByName("Users"), data = s.getDataRange().getDisplayValues();
  var p = String(d.phone).replace(/\D/g,""), pass = String(d.password).trim();
  for(var i=1; i<data.length; i++) {
    if(String(data[i][2]).replace(/\D/g,"") === p && String(data[i][3]).trim() === pass) {
       s.getRange(i+1, 12).setValue(Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm"));
       return responseJSON({status:"success", user:{id:data[i][0], name:data[i][1], phone:p, points:Number(data[i][9])||0, role:data[i][10]}});
    }
  }
  return responseJSON({status:"error", message:"Identifiants incorrects"});
}

function registerUser(d) {
  var s = SS.getSheetByName("Users");
  if (!s) { s = SS.insertSheet("Users"); s.appendRow(["ID","Name","Phone","Password","JoinDate","Currency","Email","Lang","Address","Points","Role","LastLogin"]); }
  
  var data = s.getDataRange().getDisplayValues(), p = String(d.phone).replace(/\D/g,"");
  for(var i=1; i<data.length; i++) if(String(data[i][2]).replace(/\D/g,"") === p) return responseJSON({status:"error", message:"Ce numéro existe déjà"});
  
  var id = USER_ID_PREFIX+"-"+Math.floor(Math.random()*100000);
  s.appendRow([id, d.name, "'"+p, d.password, new Date(), "MAD", d.email, "fr", "", 0, "user", new Date()]);
  return responseJSON({status:"success", user:{id:id, name:d.name, phone:p}});
}

function getUserOrders(phone) {
  if(!phone) return responseJSON({status: "error"});
  const clean = String(phone).replace(/\D/g, "");
  const data = SS.getSheetByName("Orders").getDataRange().getValues();
  const orders = [];
  for(let i = 1; i < data.length; i++) {
    if(String(data[i][3]).replace(/\D/g, "") === clean) {
      orders.push({ id: data[i][0], total: data[i][5], date: data[i][8], status: data[i][9], items: data[i][7] });
    }
  }
  return responseJSON({status: "success", orders: orders.reverse()});
}

// --- UTILS ---
function responseJSON(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// --- ADMIN / PLACEHOLDERS ---
function getCatalog(){ return responseJSON({status:"success", data:[]}); } // Frontend uses CSV
function checkStoreStatus(){ return responseJSON({status:"success", isOpen:true}); }
function getReviews(pid){ var s = SS.getSheetByName("Reviews"); if(!s) return responseJSON({status:"success", reviews:[]}); var data = s.getDataRange().getValues(); var revs = data.slice(1).filter(r => String(r[4]) === String(pid)).map(r => ({ name: r[3], rating: r[5], comment: r[6], isVerified: true })); return responseJSON({status:"success", reviews: revs.reverse()}); }
function getAllReviews(){ return responseJSON({status:"success", reviews:[]}); }
function getCoupons(){ return responseJSON({status:"success", data:[]}); }
function updatePrice(d) { var s = SS.getSheetByName("Catalog"); var data = s.getDataRange().getValues(); var tid = String(d.productId).trim(); for (let i = 1; i < data.length; i++) if (String(data[i][0]).trim() === tid) { s.getRange(i+1, 4).setValue(parseFloat(d.price)); return responseJSON({status: 'success'}); } return responseJSON({status: 'error'}); }
function toggleStock(d) { var s = SS.getSheetByName("Catalog"); var data = s.getDataRange().getValues(); var tid = String(d.productId).trim(); for(let i = 1; i < data.length; i++) if(String(data[i][0]) === tid) { s.getRange(i+1, 5).setValue(d.status ? 100 : 0); return responseJSON({status: 'success'}); } return responseJSON({status: 'error'}); }
function toggleStore(d) { return responseJSON({status:"success"}); }
function getAdminDashboard(pw) { if (String(pw).trim() !== MASTER_PIN) return responseJSON({status:'error'}); var data = SS.getSheetByName("Orders").getDataRange().getValues(); data.shift(); var orders = data.map(r => ({ id: r[0], userId: r[1], name: r[2], phone: r[3], address: r[4], total: r[5], items: r[7], date: r[8], status: r[9] })).reverse(); return responseJSON({status:'success', orders: orders}); }
function updateOrderStatus(d) { var s = SS.getSheetByName("Orders"); var data = s.getDataRange().getValues(); for(var i=1; i<data.length; i++) if(String(data[i][0]) === String(d.orderId)) { s.getRange(i+1, 10).setValue(d.status); return responseJSON({status: 'success'}); } return responseJSON({status: 'error'}); }
function addReview(d) { var s = SS.getSheetByName("Reviews") || SS.insertSheet("Reviews"); if(s.getLastRow()===0) s.appendRow(["ID","Date","UserId","UserName","ProductId","Rating","Comment","Status"]); s.appendRow(["REV-"+Math.floor(Math.random()*999), new Date(), d.phone, d.name, d.productId, d.rating, d.comment, "Active"]); return responseJSON({status:"success"}); }
function cancelOrder(d) { var s = SS.getSheetByName("Orders"); var data = s.getDataRange().getValues(); for(var i=1; i<data.length; i++) if(String(data[i][0]) === String(d.orderId)) { s.getRange(i+1, 10).setValue("Cancelled"); return responseJSON({status: "success"}); } return responseJSON({status: "error"}); }

/* --- ADDRESS MANAGEMENT FUNCTION --- */
function updateAddress(d) {
  // 1. Ensure the "Addresses" sheet exists with correct headers
  var s = SS.getSheetByName("Addresses");
  if (!s) {
    s = SS.insertSheet("Addresses");
    // Columns: User ID | Home Address (JSON) | Office Address (JSON) | Last Updated
    s.appendRow(["User_ID", "Home_JSON", "Office_JSON", "Last_Updated"]);
    s.setColumnWidth(2, 300); // Make columns wider for JSON data
    s.setColumnWidth(3, 300);
  }

  var data = s.getDataRange().getValues();
  // Sanitize User ID (remove non-digits)
  var userId = String(d.userId).replace(/\D/g, "");
  
  // Determine which column to update (Home=Col 2, Office=Col 3)
  // Note: Array index is 0-based, Sheet column is 1-based.
  // Home is Index 1 (Col B), Office is Index 2 (Col C)
  var type = String(d.type).toLowerCase(); 
  var colIndex = (type === 'home') ? 2 : 3; 
  var found = false;

  // 2. Find the user row and update the specific cell
  for (var i = 1; i < data.length; i++) {
    // Check if ID matches
    if (String(data[i][0]).replace(/\D/g, "") === userId) {
      // Update the specific cell (Home or Office)
      s.getRange(i + 1, colIndex).setValue(d.addressJson);
      // Update the timestamp (Column 4)
      s.getRange(i + 1, 4).setValue(new Date());
      found = true;
      break;
    }
  }

  // 3. If user doesn't exist, create a new row
  if (!found) {
    // Format: [ID, Home, Office, Date]
    var newRow = ["'" + userId, "", "", new Date()];
    // Set the specific address in the correct array slot
    newRow[colIndex - 1] = d.addressJson; 
    s.appendRow(newRow);
  }

  return responseJSON({ status: "success" });
}

