// ==========================================
// SUSHI ELITE BACKEND - v107.0 (ROBUST)
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
  if (a == "updateAddress") return updateAddress(d);
  return responseJSON({status: "error", message: "Invalid POST"});
}

// --- FIXED ADDRESS LOGIC ---

function updateAddress(d) {
  // 1. Try to find the sheet with user's specific spelling "Adresses" or fallback to "Address"
  var sheet = SS.getSheetByName("Adresses");
  if (!sheet) sheet = SS.getSheetByName("Addresses");
  
  if (!sheet) return responseJSON({status: "error", message: "Sheet 'Adresses' not found"});
  
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var targetId = String(d.userId); // Force String for comparison
  
  // 2. Find User Row
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === targetId) {
      rowIndex = i + 1;
      break;
    }
  }

  var addressString = d.addressJson; // This is the stringified JSON from frontend

  if (rowIndex > -1) {
    // Row exists: Update Column B (Home) or C (Office)
    if (d.type === 'Home') sheet.getRange(rowIndex, 2).setValue(addressString);
    if (d.type === 'Office') sheet.getRange(rowIndex, 3).setValue(addressString);
  } else {
    // New Row: [User_ID, Home_Addr, Office_Addr]
    var homeVal = (d.type === 'Home') ? addressString : "";
    var officeVal = (d.type === 'Office') ? addressString : "";
    sheet.appendRow([targetId, homeVal, officeVal]);
  }
  
  return responseJSON({status: "success"});
}

function getUserData(uid) { 
  var w=SS.getSheetByName("Wishlists"), c=SS.getSheetByName("Carts"), u=SS.getSheetByName("Users"), o=SS.getSheetByName("Orders");
  var addrSheet = SS.getSheetByName("Adresses") || SS.getSheetByName("Addresses"); // Fallback
  
  var wl=String(findVal(w,uid,2)||""), cart="", curr="MAD"; 
  var cr=c.getDataRange().getValues(); for(var k=1;k<cr.length;k++) if(String(cr[k][0])==String(uid)){cart=cr[k][1]; curr=cr[k][2]; break;} 
  var jd="-"; var ur=u.getDataRange().getValues(); for(var i=1;i<ur.length;i++) if(String(ur[i][0])==String(uid)){if(ur[i][4])jd=new Date(ur[i][4]).toLocaleDateString(); break;} 
  
  // Fetch Addresses safely
  var addresses = { home: null, office: null };
  if(addrSheet) {
    var ad = addrSheet.getDataRange().getValues();
    for(var m=1; m<ad.length; m++) {
      if(String(ad[m][0]) === String(uid)) {
        try { addresses.home = JSON.parse(ad[m][1]); } catch(e) { addresses.home = ad[m][1] ? { full: ad[m][1] } : null; }
        try { addresses.office = JSON.parse(ad[m][2]); } catch(e) { addresses.office = ad[m][2] ? { full: ad[m][2] } : null; }
        break;
      }
    }
  }

  var ord=[]; var or=o.getDataRange().getValues(); 
  for(var j=1;j<or.length;j++) {
    if(String(or[j][1])==String(uid)) {
      var madTotal = (or[j][11] !== "" && or[j][11] != null) ? or[j][11] : or[j][5];
      ord.push({ id: or[j][0], total: madTotal, date: or[j][8], status: or[j][9], items: or[j][7] });
    }
  }
  return responseJSON({
    status:"success", wishlist:wl, cart:cart, joinDate:jd, currency:curr, 
    orders:ord.reverse(), addresses: addresses
  }); 
}

// ... (Standard Helpers - Keep exactly as before) ...
function placeOrderSecure(d) { var oSheet=SS.getSheetByName("Orders"), oid="ORD-"+Math.floor(Math.random()*1000000), formattedDate=Utilities.formatDate(new Date(), "Africa/Casablanca", "yyyy-MM-dd HH:mm:ss"); var sheet=SS.getSheetByName("Catalog"), prods=sheet.getDataRange().getValues(), subtotalMAD=0.0, itemsList=[], cart=[]; try{cart=JSON.parse(d.cart)}catch(e){cart=[]} if(Array.isArray(cart)){cart.forEach(function(item){var price=0; for(var i=1;i<prods.length;i++) if(String(prods[i][0])===String(item.id)){price=Number(prods[i][3]);break} var qty=Number(item.qty)||1, mult=Number(item.variantMult)||1.0; subtotalMAD+=(price*qty*mult); itemsList.push(qty+"x "+item.title)})} var confSheet=SS.getSheetByName("Config"), confData=confSheet.getDataRange().getValues(), conf={}; for(var j=1;j<confData.length;j++) conf[confData[j][0]]=confData[j][1]; var delKey="Delivery_"+d.zone, delFee=Number(conf[delKey]||0); if(subtotalMAD>=(conf.Free_Shipping_Threshold||200)) delFee=0; var disc=0; if(d.couponCode){var cRes=JSON.parse(checkCoupon(d.couponCode).getContent()); if(cRes.status==="success") disc=subtotalMAD*cRes.discount} var totalMAD=subtotalMAD+delFee-disc; var rowData=[String(oid), String(d.userId||"Guest"), String(d.name||"Unknown"), "'"+String(d.phone||"No Phone"), String(d.address||d.zone||"N/A"), Number(totalMAD.toFixed(2)), String(d.method||"Cash"), JSON.stringify(itemsList), String(formattedDate), "Pending", "MAD", Number(totalMAD.toFixed(2))]; oSheet.appendRow(rowData); return responseJSON({status:"success", orderId:oid, secureTotal:totalMAD.toFixed(2)}); }
function checkStoreStatus() { var sheet=SS.getSheetByName("Config"), data=sheet.getDataRange().getValues(), conf={}; for(var i=1;i<data.length;i++) conf[data[i][0]]=data[i][1]; var now=new Date(new Date().toLocaleString("en-US", {timeZone: conf.Timezone||"Africa/Casablanca"})), hour=now.getHours(); return responseJSON({ status: "success", isOpen: (hour >= conf.Open_Hour && hour < conf.Close_Hour), hours: conf.Open_Hour + ":00 - " + conf.Close_Hour + ":00", config: conf }); }
function getCatalog() { var c=CacheService.getScriptCache(), h=c.get("cat_v95"); if(h)return ContentService.createTextOutput(h).setMimeType(ContentService.MimeType.JSON); var s=SS.getSheetByName("Catalog"), d=s.getDataRange().getValues(); d.shift(); var p=[]; d.forEach(function(r){if(r[0]!=="")p.push({id:r[0], title:r[1], category:r[2], price_MAD:r[3], price_EUR:r[4], price_USD:r[5], stock:r[9], image:r[10], tags:r[11], desc:r[12]})}); var j=JSON.stringify({status:"success", data:p}); c.put("cat_v95",j,1200); return ContentService.createTextOutput(j).setMimeType(ContentService.MimeType.JSON); }
function checkCoupon(code) { var s=SS.getSheetByName("Coupons"), d=s.getDataRange().getValues(); for(var i=1;i<d.length;i++) if(String(d[i][0]).toUpperCase()===String(code).toUpperCase()&&d[i][2]===true) return responseJSON({status:"success", discount:d[i][1], code:d[i][0]}); return responseJSON({status:"error"}); }
function syncCart(d) { updateOrAppend(SS.getSheetByName("Carts"), d.userId, 2, d.cartJson, d.currency); return responseJSON({status:"success"}); }
function syncWishlist(d) { updateOrAppend(SS.getSheetByName("Wishlists"), d.userId, 2, d.items); return responseJSON({status:"success"}); }
function updatePreference(d) { var s=SS.getSheetByName("Users"), r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++) if(String(r[i][0])==String(d.userId)){s.getRange(i+1,6).setValue(d.currency); return responseJSON({status:"success"});} return responseJSON({status:"error"}); }
function registerUser(d) { var s=SS.getSheetByName("Users"), r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++) if(String(r[i][2])==String(d.phone)) return responseJSON({status:"error",message:"Taken"}); var id=Utilities.getUuid(); s.appendRow([id,d.name,"'"+d.phone,d.password,new Date(),"MAD"]); return responseJSON({status:"success",userId:id,name:d.name}); }
function loginUser(d) { var s=SS.getSheetByName("Users"), r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++) if(String(r[i][2])==String(d.phone)&&String(r[i][3])==String(d.password)) return responseJSON({status:"success",userId:r[i][0],name:r[i][1]}); return responseJSON({status:"error"}); }
function updateOrAppend(s,k,c,v,cur) { var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k)){s.getRange(i+1,c).setValue(v); if(cur)s.getRange(i+1,3).setValue(cur); s.getRange(i+1,4).setValue(new Date()); return;}} s.appendRow([k,v,cur||"MAD",new Date()]); }
function findVal(s,k,c) { var r=s.getDataRange().getValues(); for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k)) return r[i][c-1];} return null; }
function responseJSON(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
