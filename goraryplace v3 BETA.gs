// ==========================================
// SUSHI ELITE BACKEND - v86.0 (ULTIMATE)
// ==========================================

var SPREADSHEET_ID = "1O5L8yrkZVMbcZqitOAgStQj8E4sJzxyNrjoZCCswESo"; 
var SS;

try {
  SS = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
} catch(e) { SS = null; }

// --- HELPERS ---
function getConfig() {
  var sheet = SS.getSheetByName("Config");
  if(!sheet) return { open: 11, close: 23, tz: "Africa/Casablanca", free: 200 }; // Fallback
  var data = sheet.getDataRange().getValues();
  var conf = {};
  for(var i=1; i<data.length; i++) conf[data[i][0]] = data[i][1];
  return conf;
}

// --- ROUTER ---
function doGet(e) {
  var a = e.parameter.action;
  if (a == "getCatalog") return getCatalog();
  if (a == "getUserData") return getUserData(e.parameter.userId);
  if (a == "checkStoreStatus") return checkStoreStatus();
  return responseJSON({status: "error", message: "Invalid GET"});
}

function doPost(e) {
  var p = JSON.parse(e.postData.contents);
  var a = p.action;
  var d = p.data;
  
  if (a == "placeOrder") return placeOrderSecure(d);
  if (a == "checkCoupon") return checkCoupon(d.code);
  if (a == "syncCart") return syncCart(d);
  if (a == "syncWishlist") return syncWishlist(d);
  if (a == "register") return registerUser(d);
  if (a == "login") return loginUser(d);
  if (a == "updatePreference") return updatePreference(d);
  return responseJSON({status: "error", message: "Invalid POST"});
}

// --- LOGIC ---

function checkStoreStatus() {
  var conf = getConfig();
  var now = new Date(new Date().toLocaleString("en-US", {timeZone: conf.Timezone || "Africa/Casablanca"}));
  var hour = now.getHours();
  // Simple check: Is current hour between Open and Close?
  var isOpen = (hour >= conf.Open_Hour && hour < conf.Close_Hour);
  return responseJSON({
    status: "success", 
    isOpen: isOpen, 
    hours: conf.Open_Hour + ":00 - " + conf.Close_Hour + ":00",
    config: conf // Send full config to frontend for delivery calc
  });
}

function checkCoupon(code) {
  var sheet = SS.getSheetByName("Coupons");
  var data = sheet.getDataRange().getValues();
  for(var i=1; i<data.length; i++) {
    if(String(data[i][0]).toUpperCase() === String(code).toUpperCase() && data[i][2] === true) {
      return responseJSON({status: "success", discount: data[i][1], code: data[i][0]});
    }
  }
  return responseJSON({status: "error", message: "Invalid Code"});
}

function placeOrderSecure(d) {
  var conf = getConfig();
  
  // 1. Validate Store Hours
  var now = new Date(new Date().toLocaleString("en-US", {timeZone: conf.Timezone}));
  if (now.getHours() < conf.Open_Hour || now.getHours() >= conf.Close_Hour) {
    return responseJSON({status: "error", message: "Store is Closed"});
  }

  // 2. Validate Price
  var sheet = SS.getSheetByName("Catalog");
  var prods = sheet.getDataRange().getValues();
  var subtotal = 0;
  var cart = JSON.parse(d.cart);
  var itemsList = [];

  cart.forEach(function(item) {
    var price = 0;
    for(var i=1; i<prods.length; i++) {
      if(String(prods[i][0]) === String(item.id)) { price = prods[i][3]; break; } // Col D (MAD)
    }
    subtotal += (price * item.qty * item.variantMult);
    itemsList.push(item.qty + "x " + item.title);
  });

  // 3. Delivery & Discount
  var delKey = "Delivery_" + d.zone;
  var delFee = conf[delKey] || 0;
  if(subtotal >= (conf.Free_Shipping_Threshold || 200)) delFee = 0;

  var disc = 0;
  if(d.couponCode) {
    var cRes = JSON.parse(checkCoupon(d.couponCode).getContent());
    if(cRes.status === "success") disc = subtotal * cRes.discount;
  }

  var total = subtotal + delFee - disc;

  // 4. Save
  var oSheet = SS.getSheetByName("Orders");
  var oid = "ORD-" + Math.floor(Math.random() * 1000000);
  oSheet.appendRow([oid, d.userId||"Guest", d.name, "'"+d.phone, d.zone+" ("+d.address+")", total.toFixed(2), d.method, JSON.stringify(itemsList), new Date(), "Pending", "MAD"]);
  
  return responseJSON({status: "success", orderId: oid, secureTotal: total});
}

function getCatalog() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("catalog_v86");
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  var sheet = SS.getSheetByName("Catalog");
  var data = sheet.getDataRange().getValues();
  data.shift();
  var products = [];
  data.forEach(function(r) {
    if(r[0] === "") return;
    products.push({
      id: r[0], title: r[1], category: r[2],
      price_MAD: r[3], price_EUR: r[4], price_USD: r[5],
      oldPrice_MAD: r[6], oldPrice_EUR: r[7], oldPrice_USD: r[8],
      stock: r[9], image: r[10], tags: r[11], desc: r[12]
    });
  });
  var json = JSON.stringify({status: "success", data: products});
  cache.put("catalog_v86", json, 1200); 
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getUserData(uid) {
  var wSheet = SS.getSheetByName("Wishlists");
  var cSheet = SS.getSheetByName("Carts");
  var uSheet = SS.getSheetByName("Users");
  var oSheet = SS.getSheetByName("Orders");
  
  var wishlist = String(findVal(wSheet, uid, 2) || "");
  var cart = "", cartCurr = "";
  var cRows = cSheet.getDataRange().getValues();
  for(var k=1; k<cRows.length; k++) {
    if(String(cRows[k][0]) === String(uid)) { cart = cRows[k][1]; cartCurr = cRows[k][2]; break; }
  }
  
  var joinDate = "-", userPrefCurr = "MAD";
  var uRows = uSheet.getDataRange().getValues();
  for(var i=1; i<uRows.length; i++) {
    if(String(uRows[i][0]) === String(uid)) {
      if(uRows[i][4]) joinDate = new Date(uRows[i][4]).toLocaleDateString();
      if(uRows[i][5]) userPrefCurr = uRows[i][5];
      break;
    }
  }

  var isCartEmpty = (cart === "" || cart === "[]");
  var finalCurrency = (!isCartEmpty && cartCurr) ? cartCurr : (userPrefCurr || "MAD");

  var orders = [];
  var oRows = oSheet.getDataRange().getValues();
  for(var j=1; j<oRows.length; j++) {
    if(String(oRows[j][1]) === String(uid)) {
      orders.push({id: oRows[j][0], total: oRows[j][5], date: oRows[j][8], status: oRows[j][9], items: oRows[j][7]});
    }
  }
  orders.reverse();

  return responseJSON({status: "success", wishlist: wishlist, cart: cart, joinDate: joinDate, currency: finalCurrency, orders: orders});
}

// Basic Sync Functions
function syncCart(d) { updateOrAppend(SS.getSheetByName("Carts"), d.userId, 2, d.cartJson, d.currency); return responseJSON({status:"success"}); }
function syncWishlist(d) { updateOrAppend(SS.getSheetByName("Wishlists"), d.userId, 2, d.items); return responseJSON({status:"success"}); }
function updatePreference(d) { var s=SS.getSheetByName("Users"); var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(d.userId)){s.getRange(i+1,6).setValue(d.currency); return responseJSON({status:"success"});}} return responseJSON({status:"error"}); }
function registerUser(d) { var s=SS.getSheetByName("Users"); var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][2])==String(d.phone)) return responseJSON({status:"error",message:"Taken"});} var id=Utilities.getUuid(); s.appendRow([id,d.name,"'"+d.phone,d.password,new Date(),"MAD"]); return responseJSON({status:"success",userId:id,name:d.name}); }
function loginUser(d) { var s=SS.getSheetByName("Users"); var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][2])==String(d.phone)&&String(r[i][3])==String(d.password)) return responseJSON({status:"success",userId:r[i][0],name:r[i][1]});} return responseJSON({status:"error"}); }

// Helpers
function updateOrAppend(s,k,c,v,cur) { var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k)){s.getRange(i+1,c).setValue(v); if(cur)s.getRange(i+1,3).setValue(cur); s.getRange(i+1,4).setValue(new Date()); return;}} s.appendRow([k,v,cur||"MAD",new Date()]); }
function findVal(s,k,c) { var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k)) return r[i][c-1];} return null; }
function responseJSON(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
