// ==========================================
// SUSHI ELITE BACKEND - v88.0 (DATA INTEGRITY)
// ==========================================

var SPREADSHEET_ID = "1O5L8yrkZVMbcZqitOAgStQj8E4sJzxyNrjoZCCswESo"; 
var SS;

try {
  SS = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
} catch(e) { SS = null; }

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

function placeOrderSecure(d) {
  var oSheet = SS.getSheetByName("Orders");
  var oid = "ORD-" + Math.floor(Math.random() * 1000000);
  var formattedDate = Utilities.formatDate(new Date(), "Africa/Casablanca", "yyyy-MM-dd HH:mm:ss");

  // 1. Calculate Total (Server Side)
  var sheet = SS.getSheetByName("Catalog");
  var prods = sheet.getDataRange().getValues();
  var subtotal = 0;
  var itemsList = [];
  var cart = [];

  try {
    cart = JSON.parse(d.cart);
  } catch(e) {
    cart = [];
  }

  if (cart.length > 0) {
    cart.forEach(function(item) {
      var price = 0;
      for(var i=1; i<prods.length; i++) {
        if(String(prods[i][0]) === String(item.id)) { price = Number(prods[i][3]); break; }
      }
      subtotal += (price * item.qty * item.variantMult);
      itemsList.push(item.qty + "x " + item.title);
    });
  }

  // 2. Delivery & Discount Logic
  var confSheet = SS.getSheetByName("Config");
  var confData = confSheet.getDataRange().getValues();
  var conf = {}; 
  for(var j=1; j<confData.length; j++) conf[confData[j][0]] = confData[j][1];

  var delKey = "Delivery_" + d.zone;
  var delFee = Number(conf[delKey] || 0);
  if(subtotal >= (conf.Free_Shipping_Threshold || 200)) delFee = 0;

  var disc = 0;
  if(d.couponCode) {
    var cRes = JSON.parse(checkCoupon(d.couponCode).getContent());
    if(cRes.status === "success") disc = subtotal * cRes.discount;
  }

  var total = subtotal + delFee - disc;

  // 3. STRICT WRITE (Columns A-K match your screenshot exactly)
  oSheet.appendRow([
    String(oid),                            // A: Order_ID
    String(d.userId || "Guest"),            // B: User_ID
    String(d.name || "Unknown"),            // C: Customer_Name
    "'" + String(d.phone || ""),            // D: Phone
    String(d.address || d.zone),            // E: Address (Fixed: Now saves full address)
    Number(total.toFixed(2)),               // F: Total (Number format)
    String(d.method || "Cash"),             // G: Payment_Method
    JSON.stringify(itemsList),              // H: Items_JSON
    formattedDate,                          // I: Date
    "Pending",                              // J: Status
    "MAD"                                   // K: Currency
  ]);
  
  return responseJSON({status: "success", orderId: oid, secureTotal: total.toFixed(2)});
}

function checkStoreStatus() {
  var sheet = SS.getSheetByName("Config");
  var data = sheet.getDataRange().getValues();
  var conf = {};
  for(var i=1; i<data.length; i++) conf[data[i][0]] = data[i][1];

  var now = new Date(new Date().toLocaleString("en-US", {timeZone: conf.Timezone || "Africa/Casablanca"}));
  var hour = now.getHours();
  return responseJSON({
    status: "success", 
    isOpen: (hour >= conf.Open_Hour && hour < conf.Close_Hour), 
    hours: conf.Open_Hour + ":00 - " + conf.Close_Hour + ":00",
    config: conf
  });
}

function getCatalog() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("catalog_v88");
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
  cache.put("catalog_v88", json, 1200); 
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// Helpers
function checkCoupon(code) { var s = SS.getSheetByName("Coupons"); var d = s.getDataRange().getValues(); for(var i=1; i<d.length; i++) { if(String(d[i][0]).toUpperCase() === String(code).toUpperCase() && d[i][2] === true) return responseJSON({status: "success", discount: d[i][1], code: d[i][0]}); } return responseJSON({status: "error"}); }
function getUserData(uid) { var w=SS.getSheetByName("Wishlists"), c=SS.getSheetByName("Carts"), u=SS.getSheetByName("Users"), o=SS.getSheetByName("Orders"); var wl=String(findVal(w,uid,2)||""), cart="", curr="MAD"; var cr=c.getDataRange().getValues(); for(var k=1;k<cr.length;k++) if(String(cr[k][0])==String(uid)){cart=cr[k][1]; curr=cr[k][2]; break;} var jd="-"; var ur=u.getDataRange().getValues(); for(var i=1;i<ur.length;i++) if(String(ur[i][0])==String(uid)){if(ur[i][4])jd=new Date(ur[i][4]).toLocaleDateString(); break;} var ord=[]; var or=o.getDataRange().getValues(); for(var j=1;j<or.length;j++) if(String(or[j][1])==String(uid)) ord.push({id:or[j][0], total:or[j][5], date:or[j][8], status:or[j][9]}); return responseJSON({status:"success", wishlist:wl, cart:cart, joinDate:jd, currency:curr, orders:ord.reverse()}); }
function syncCart(d) { updateOrAppend(SS.getSheetByName("Carts"), d.userId, 2, d.cartJson, d.currency); return responseJSON({status:"success"}); }
function syncWishlist(d) { updateOrAppend(SS.getSheetByName("Wishlists"), d.userId, 2, d.items); return responseJSON({status:"success"}); }
function updatePreference(d) { var s=SS.getSheetByName("Users"); var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(d.userId)){s.getRange(i+1,6).setValue(d.currency); return responseJSON({status:"success"});}} return responseJSON({status:"error"}); }
function registerUser(d) { var s=SS.getSheetByName("Users"); var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][2])==String(d.phone)) return responseJSON({status:"error",message:"Taken"});} var id=Utilities.getUuid(); s.appendRow([id,d.name,"'"+d.phone,d.password,new Date(),"MAD"]); return responseJSON({status:"success",userId:id,name:d.name}); }
function loginUser(d) { var s=SS.getSheetByName("Users"); var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][2])==String(d.phone)&&String(r[i][3])==String(d.password)) return responseJSON({status:"success",userId:r[i][0],name:r[i][1]});} return responseJSON({status:"error"}); }
function updateOrAppend(s,k,c,v,cur) { var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k)){s.getRange(i+1,c).setValue(v); if(cur)s.getRange(i+1,3).setValue(cur); s.getRange(i+1,4).setValue(new Date()); return;}} s.appendRow([k,v,cur||"MAD",new Date()]); }
function findVal(s,k,c) { var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k)) return r[i][c-1];} return null; }
function responseJSON(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
