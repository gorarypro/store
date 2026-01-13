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
  if (a == "getTranslations") return getTranslations(); 
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
  if (a == "updateUser") return updateUser(d);
  return responseJSON({status: "error", message: "Invalid POST"});
}

// --- TRANSLATOR v144 ---
function getTranslations() {
  var c = CacheService.getScriptCache();
  var cached = c.get("trans_v144"); 
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  
  var sheet = SS.getSheetByName("Translator");
  var dict = {};
  if (sheet) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0]; 
    for (var i = 1; i < data.length; i++) {
      var key = data[i][0]; 
      if(key) {
        dict[key] = {};
        for (var j = 1; j < headers.length; j++) {
          var langCode = headers[j].toLowerCase().substring(0, 2); 
          if(langCode === "al") langCode = "ar";
          dict[key][langCode] = data[i][j];
        }
      }
    }
  }
  var json = JSON.stringify({status: "success", data: dict});
  c.put("trans_v144", json, 3600); 
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ... (Standard Helpers - No changes needed, keeping compact for stability) ...
function updateUser(d){var s=SS.getSheetByName("Users"),r=s.getDataRange().getValues();for(var i=1;i<r.length;i++)if(String(r[i][0])===String(d.userId)){if(d.name)s.getRange(i+1,2).setValue(d.name);if(d.phone)s.getRange(i+1,3).setValue("'"+d.phone);if(d.email)s.getRange(i+1,7).setValue(d.email);return responseJSON({status:"success"})}return responseJSON({status:"error",message:"User not found"})}
function updateAddress(d){var s=SS.getSheetByName("Adresses")||SS.getSheetByName("Adress")||SS.getSheetByName("Address");if(!s)return responseJSON({status:"error",message:"Sheet missing"});var r=s.getDataRange().getValues(),idx=-1,tid=String(d.userId);for(var i=1;i<r.length;i++)if(String(r[i][0])===tid){idx=i+1;break}var as=d.addressJson;if(idx>-1){if(d.type==='Home')s.getRange(idx,2).setValue(as);if(d.type==='Office')s.getRange(idx,3).setValue(as)}else{s.appendRow([tid,(d.type==='Home'?as:''),(d.type==='Office'?as:'')])}return responseJSON({status:"success"})}
function getUserData(uid){var w=SS.getSheetByName("Wishlists"),c=SS.getSheetByName("Carts"),u=SS.getSheetByName("Users"),o=SS.getSheetByName("Orders"),as=SS.getSheetByName("Adresses")||SS.getSheetByName("Adress")||SS.getSheetByName("Address"),wl=String(findVal(w,uid,2)||""),cart="",curr="MAD",cr=c.getDataRange().getValues();for(var k=1;k<cr.length;k++)if(String(cr[k][0])==String(uid)){cart=cr[k][1];curr=cr[k][2];break}var p={name:"",phone:"",email:"",joined:"-"},ur=u.getDataRange().getValues();for(var i=1;i<ur.length;i++)if(String(ur[i][0])==String(uid)){p.name=ur[i][1];p.phone=ur[i][2];if(ur[i][4])p.joined=new Date(ur[i][4]).toLocaleDateString();if(ur[i][6])p.email=ur[i][6];break}var ad={home:null,office:null};if(as){var adv=as.getDataRange().getValues();for(var m=1;m<adv.length;m++)if(String(adv[m][0])===String(uid)){try{ad.home=JSON.parse(adv[m][1])}catch(e){ad.home=adv[m][1]?{full:adv[m][1]}:null}try{ad.office=JSON.parse(adv[m][2])}catch(e){ad.office=adv[m][2]?{full:adv[m][2]}:null}break}}var ord=[],or=o.getDataRange().getValues();for(var j=1;j<or.length;j++)if(String(or[j][1])==String(uid)){var mt=(or[j][11]!==""&&or[j][11]!=null)?or[j][11]:or[j][5];ord.push({id:or[j][0],total:mt,date:or[j][8],status:or[j][9],items:or[j][7]})}return responseJSON({status:"success",wishlist:wl,cart:cart,currency:curr,profile:p,orders:ord.reverse(),addresses:ad})}
function placeOrderSecure(d){var o=SS.getSheetByName("Orders"),id="ORD-"+Math.floor(Math.random()*1000000),fd=Utilities.formatDate(new Date(),"Africa/Casablanca","yyyy-MM-dd HH:mm:ss"),s=SS.getSheetByName("Catalog"),p=s.getDataRange().getValues(),sub=0.0,il=[],c=[];try{c=JSON.parse(d.cart)}catch(e){c=[]}if(Array.isArray(c)){c.forEach(function(x){var pr=0;for(var i=1;i<p.length;i++)if(String(p[i][0])===String(x.id)){pr=Number(p[i][3]);break}var q=Number(x.qty)||1,m=Number(x.variantMult)||1.0;sub+=(pr*q*m);il.push(q+"x "+x.title)})}var cs=SS.getSheetByName("Config"),cd=cs.getDataRange().getValues(),cf={};for(var j=1;j<cd.length;j++)cf[cd[j][0]]=cd[j][1];var dk="Delivery_"+d.zone,df=Number(cf[dk]||0);if(sub>=(cf.Free_Shipping_Threshold||200))df=0;var di=0;if(d.couponCode){var cr=JSON.parse(checkCoupon(d.couponCode).getContent());if(cr.status==="success")di=sub*cr.discount}var tot=sub+df-di;o.appendRow([String(id),String(d.userId||"Guest"),String(d.name||"Unknown"),"'"+String(d.phone||"No Phone"),String(d.address||d.zone||"N/A"),Number(tot.toFixed(2)),String(d.method||"Cash"),JSON.stringify(il),String(fd),"Pending","MAD",Number(tot.toFixed(2))]);return responseJSON({status:"success",orderId:id,secureTotal:tot.toFixed(2)})}
function checkStoreStatus(){var s=SS.getSheetByName("Config"),d=s.getDataRange().getValues(),c={};for(var i=1;i<d.length;i++)c[d[i][0]]=d[i][1];var n=new Date(new Date().toLocaleString("en-US",{timeZone:c.Timezone||"Africa/Casablanca"})),h=n.getHours();return responseJSON({status:"success",isOpen:(h>=c.Open_Hour&&h<c.Close_Hour),hours:c.Open_Hour+":00 - "+c.Close_Hour+":00",config:c})}
function getCatalog(){var c=CacheService.getScriptCache(),h=c.get("cat_v95");if(h)return ContentService.createTextOutput(h).setMimeType(ContentService.MimeType.JSON);var s=SS.getSheetByName("Catalog"),d=s.getDataRange().getValues();d.shift();var p=[];d.forEach(function(r){if(r[0]!=="")p.push({id:r[0],title:r[1],category:r[2],price_MAD:r[3],price_EUR:r[4],price_USD:r[5],stock:r[9],image:r[10],tags:r[11],desc:r[12]})});var j=JSON.stringify({status:"success",data:p});c.put("cat_v95",j,1200);return ContentService.createTextOutput(j).setMimeType(ContentService.MimeType.JSON)}
function checkCoupon(c){var s=SS.getSheetByName("Coupons"),d=s.getDataRange().getValues();for(var i=1;i<d.length;i++)if(String(d[i][0]).toUpperCase()===String(c).toUpperCase()&&d[i][2]===true)return responseJSON({status:"success",discount:d[i][1],code:d[i][0]});return responseJSON({status:"error"})}
function syncCart(d){updateOrAppend(SS.getSheetByName("Carts"),d.userId,2,d.cartJson,d.currency);return responseJSON({status:"success"})}
function syncWishlist(d){updateOrAppend(SS.getSheetByName("Wishlists"),d.userId,2,d.items);return responseJSON({status:"success"})}
function updatePreference(d){var s=SS.getSheetByName("Users"),r=s.getDataRange().getValues();for(var i=1;i<r.length;i++)if(String(r[i][0])==String(d.userId)){s.getRange(i+1,6).setValue(d.currency);return responseJSON({status:"success"});}return responseJSON({status:"error"})}
function registerUser(d){var s=SS.getSheetByName("Users"),r=s.getDataRange().getValues();for(var i=1;i<r.length;i++)if(String(r[i][2])==String(d.phone))return responseJSON({status:"error",message:"Taken"});var id=Utilities.getUuid();s.appendRow([id,d.name,"'"+d.phone,d.password,new Date(),"MAD"]);return responseJSON({status:"success",userId:id,name:d.name})}
function loginUser(d){var s=SS.getSheetByName("Users"),r=s.getDataRange().getValues();for(var i=1;i<r.length;i++)if(String(r[i][2])==String(d.phone)&&String(r[i][3])==String(d.password))return responseJSON({status:"success",userId:r[i][0],name:r[i][1]});return responseJSON({status:"error"})}
function updateOrAppend(s,k,c,v,cur){var r=s.getDataRange().getValues();for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k)){s.getRange(i+1,c).setValue(v);if(cur)s.getRange(i+1,3).setValue(cur);s.getRange(i+1,4).setValue(new Date());return}}s.appendRow([k,v,cur||"MAD",new Date()])}
function findVal(s,k,c){var r=s.getDataRange().getValues();for(var i=1;i<r.length;i++){if(String(r[i][0])==String(k))return r[i][c-1];}return null}
function responseJSON(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
