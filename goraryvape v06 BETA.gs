/* ==========================================================
   GORARY VAPE - BACKEND (V9.1: DUAL SECURITY CORE)
   ========================================================== */

const props = PropertiesService.getScriptProperties();
const SECURE_ADMIN_PW = props.getProperty("SECURE_ADMIN_PW") || "AP123456"; 
const SECURE_ROOT_PW = props.getProperty("SECURE_ROOT_PW") || "RP123456"; 
const SPREADSHEET_ID = props.getProperty("SPREADSHEET_ID") || "18LvTBWXkoYSCWeyD3ga5EYuFYZx-En3m-DE6ld0FIw8"; 
const PROJECT_PREFIX = "GV1";

function doGet(e) {
  try {
    if (!e || !e.parameter) return responseJSON({status: "error", message: "No parameters"});
    var p = e.parameter, a = p.action;
    if (a == "checkStoreStatus") return checkStoreStatus();
    if (a == "getCatalogJson") return getCatalogJson(); 
    if (a == "getReviews") return getReviews(p.productId);
    if (a == "getCoupons") return getCoupons();
    if (a == "getTranslations") return getTranslations();
    if (a == "getUserData") return getUserData(p.token);
    if (a == "getUserOrders") return getUserOrders(p.token); 
    if (a == "getAdminDashboard") return getAdminDashboard(p.pw);
    if (a == "getAdminReviews") return getAdminReviews(p.pw);
    if (a == "getCPanelData") return getCPanelData(p.pw);
    if (a == "repairDatabase") return repairDatabase(p.pw);
    return responseJSON({status: "error", message: "Invalid Action"});
  } catch (err) { return responseJSON({status: "error", message: err.toString()}); }
}

function doPost(e) {
  try {
    var json = JSON.parse(e.postData.contents);
    var a = json.action, d = json.data || {};
    if(d.phone) d.phone = String(d.phone).replace(/\D/g, "");

    if (a == "register") return registerUser(d);
    if (a == "login") return loginUser(d.phone, d.password);
    if (a == "checkCoupon") return checkCoupon(json.code, json.total);

    if (["placeOrder", "syncUserData", "updateAddress", "addReview", "cancelOrder"].includes(a)) {
       var token = d.authToken || d.token || json.token; 
       var userRow = getUserByToken(token);
       if (a === "placeOrder") return placeOrderSecure(d, userRow, token); 
       if (!userRow) return responseJSON({status: "error", message: "Session expirée", code: "AUTH_FAIL"});
       if (a == "syncUserData") return syncUserData(d, userRow);
       if (a == "addReview") return addReview(d, userRow);
       if (a == "cancelOrder") return cancelOrder(d, userRow);
       if (a == "updateAddress") return updateAddress(d, userRow);
    }
    
    var pass = json.password || d.password;
    if (String(pass) === SECURE_ADMIN_PW) {
        if (a == "updateOrderStatus") return updateOrderStatus(d);
        if (a == "updateProductStatus") return updateProductStatus(d); 
        if (a == "toggleStock") return toggleStock(d); 
        if (a == "updatePrice") return updatePrice(d);
        if (a == "updateReviewStatus") return updateReviewStatus(d);
    }
    if (String(pass) === SECURE_ROOT_PW) {
        if (a == "getCPanelData") return getCPanelData(pass);
        if (a == "saveSystemConfig") return saveSystemConfig(d);
        if (a == "updateUserRole") return updateUserRole(d);
        if (a == "repairDatabase") return repairDatabase(pass);
    }
    if (String(pass) !== SECURE_ADMIN_PW && String(pass) !== SECURE_ROOT_PW && !["register","login","checkCoupon"].includes(a)) return responseJSON({status: "error", message: "Action non autorisée"});
    return responseJSON({status: "error", message: "Unknown"});
  } catch(e) { return responseJSON({status: "error", message: e.toString()}); }
}

function getCPanelData(pw) {
    if (String(pw) !== SECURE_ROOT_PW) return responseJSON({ status: "error", message: "Access Denied" });
    var config = getConfigMap();
    var sUsers = getSheet("Users"); var uData = sUsers.getDataRange().getValues(); var uMap = getIndices(uData[0]);
    var users = [];
    for(var i=1; i<uData.length; i++) users.push({ id: uData[i][getIdx(uMap, ['ID'])], name: uData[i][getIdx(uMap, ['Name'])], phone: uData[i][getIdx(uMap, ['Phone'])], role: uData[i][getIdx(uMap, ['Role'])] || 'user', points: uData[i][getIdx(uMap, ['Points'])] || 0 });
    return responseJSON({ status: "success", config: config, users: users, stats: { orders: getSheet("Orders").getLastRow() - 1, products: getSheet("Catalog").getLastRow() - 1, reviews: getSheet("Reviews").getLastRow() - 1 } });
}

function saveSystemConfig(d) {
    var s = getSheet("Config"); var data = s.getDataRange().getValues();
    var findRow = function(key) { for(var i=1; i<data.length; i++) if(String(data[i][0]) === key) return i+1; return null; };
    for (var key in d.updates) {
        var row = findRow(key);
        if (row) s.getRange(row, 2).setValue(d.updates[key]);
        else s.appendRow([key, d.updates[key], "Set via CPanel"]);
    }
    return responseJSON({ status: "success" });
}

function updateUserRole(d) {
    var s = getSheet("Users"); var data = s.getDataRange().getValues();
    var idxID = getIdx(getIndices(data[0]), ["ID"]); var idxRole = getIdx(getIndices(data[0]), ["Role"]);
    for(var i=1; i<data.length; i++) if(String(data[i][idxID]) === String(d.userId)) { safeSetValue(s, i+1, idxRole, d.role); return responseJSON({ status: "success" }); }
    return responseJSON({ status: "error", message: "User not found" });
}

function getConfigMap() { var s = getSheet("Config"); var data = s.getDataRange().getValues(); var map = {}; for(var i=1; i<data.length; i++) map[String(data[i][0]).trim()] = data[i][1]; return map; }
function checkStoreStatus() { var config = getConfigMap(); return responseJSON({ status: "success", isOpen: config['store_open'] !== "FALSE", config: { shipping_min: parseFloat(config['shipping_min']) || 100, shipping_cost: parseFloat(config['shipping_cost']) || 20, whatsapp: config['whatsapp_number'] || "212661552233" } }); }
function getTranslations() { try { var s = getSheet("Translator"); var data = s.getDataRange().getValues(); var dict = {}; for (var i = 1; i < data.length; i++) { if(data[i][0]) dict[String(data[i][0]).trim()] = { en: data[i][1], fr: data[i][2], ar: data[i][3] }; } var config = getConfigMap(); var banner = { title: config['banner_title'] || "VAPE PREMIUM", desc: config['banner_desc'] || "1,700+ Produits Originaux", btn: config['banner_btn'] || "ACHETER" }; return responseJSON({ status: "success", translations: dict, banner: banner }); } catch (e) { return responseJSON({ status: "error", message: e.toString() }); } }
/* --- 4. CATALOG (WITH VARIANTS) --- */
function getCatalogJson() {
  try {
    var s = getSheet("Catalog"); var data = s.getDataRange().getValues();
    if (data.length < 2) return responseJSON({status: "success", data: []});
    var headers = data.shift(); var map = getIndices(headers);
    var products = data.map(function(row, i) {
      var id = row[getIdx(map, ['ID'])]; if(!id) return null;
      return {
        id: String(id), 
        title: { fr: row[getIdx(map, ['Title_FR', 'Title'])] || "", en: row[getIdx(map, ['Title_EN'])] || "", ar: row[getIdx(map, ['Title_AR'])] || "" },
        desc: { fr: row[getIdx(map, ['Desc_FR'])] || "", en: row[getIdx(map, ['Desc_EN'])] || "", ar: row[getIdx(map, ['Desc_AR'])] || "" },
        price_MAD: parseFloat(row[getIdx(map, ['Price_MAD'])]) || 0,
        stock: parseInt(row[getIdx(map, ['Stock'])]) || 0,
        category: row[getIdx(map, ['Category'])],
        image: row[getIdx(map, ['Image_URL'])],
        label: row[getIdx(map, ['Label', 'Tag', 'Badge'])] || "",
        variant_name: row[getIdx(map, ['Variant_Name', 'Variants', 'Options'])] || "" 
      };
    }).filter(function(p) { return p !== null; });
    return responseJSON({status: "success", data: products});
  } catch (e) { return responseJSON({status: "error", message: e.toString()}); }
}

/* --- 5. ORDERS & POINTS --- */
function placeOrderSecure(d, user, rawToken) {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(e) { return responseJSON({status:"error", message:"Server Busy"}); }
    try {
        var s = getSheet("Orders"); var headers = s.getDataRange().getValues()[0]; var map = getIndices(headers);
        var id = generateId("ORD"); 
        var date = Utilities.formatDate(new Date(), "GMT+1", "yyyy-MM-dd HH:mm:ss");
        var itemsJson = (typeof d.cart === 'object') ? JSON.stringify(d.cart) : d.cart;
        var newRow = new Array(headers.length).fill("");
        var setCol = function(keys, val) { var idx = getIdx(map, keys); if(idx > -1) newRow[idx] = val; };

        setCol(["Order_ID", "ID"], id);
        setCol(["User_ID", "UserID"], (user && user.token) ? user.token : (rawToken || "Guest"));
        setCol(["Customer_Name", "Name"], d.name);
        setCol(["Phone"], "'" + d.phone);
        setCol(["Address"], d.address);
        setCol(["Total"], d.total);
        setCol(["Items_JSON", "Items"], itemsJson);
        setCol(["Date"], date);
        setCol(["Status"], "Pending");
        setCol(["Coupon"], d.coupon || "");
        setCol(["Points_Used"], d.pointsUsed || 0);

        s.appendRow(newRow);
        
        // Deduct points
        if (user && d.pointsUsed > 0) {
             var uSheet = getSheet("Users"); var uMap = getIndices(uSheet.getDataRange().getValues()[0]); var idxPts = getIdx(uMap, ["Points"]);
             if(idxPts > -1 && user.rowIndex) uSheet.getRange(user.rowIndex + 1, idxPts + 1).setValue(Math.max(0, user.points - d.pointsUsed));
        }
        return responseJSON({ status: "success", orderId: id });
    } catch(err) { return responseJSON({ status: "error", message: err.message }); } 
    finally { lock.releaseLock(); }
}

function updateOrderStatus(d) {
    var s = getSheet("Orders"); var data = s.getDataRange().getValues();
    var map = getIndices(data[0]);
    var idxID = getIdx(map, ["Order_ID"]); var idxStat = getIdx(map, ["Status"]);
    var idxUser = getIdx(map, ["User_ID", "UserID"]); var idxTotal = getIdx(map, ["Total"]);

    for (var i = 1; i < data.length; i++) {
        if (String(data[i][idxID]) == String(d.orderId)) {
            var oldStatus = String(data[i][idxStat]);
            var newStatus = d.status;
            safeSetValue(s, i + 1, idxStat, newStatus);
            
            // Award Points on Delivery
            if ((newStatus === "Delivered" || newStatus === "Completed") && oldStatus !== "Delivered" && oldStatus !== "Completed") {
                var userToken = data[i][idxUser];
                var orderTotal = parseFloat(data[i][idxTotal]) || 0;
                var pointsEarned = Math.floor(orderTotal * 0.1); 
                
                if (pointsEarned > 0 && userToken && userToken !== "Guest") {
                    var uSheet = getSheet("Users"); var uData = uSheet.getDataRange().getValues();
                    var uMap = getIndices(uData[0]);
                    var uIdxToken = getIdx(uMap, ["AuthToken"]); var uIdxPoints = getIdx(uMap, ["Points"]);
                    for(var k=1; k<uData.length; k++) {
                        if(String(uData[k][uIdxToken]) === String(userToken)) {
                            var currentPoints = Number(uData[k][uIdxPoints]) || 0;
                            safeSetValue(uSheet, k+1, uIdxPoints, currentPoints + pointsEarned);
                            break;
                        }
                    }
                }
            }
            return responseJSON({ status: "success" });
        }
    }
    return responseJSON({ status: "error" });
}

/* --- 6. AUTH & USER DATA --- */
function loginUser(phone, password) {
  var s = getSheet("Users"); var data = s.getDataRange().getValues(); var map = getIndices(data[0]);
  var cleanPhone = String(phone).replace(/\D/g, "");
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][getIdx(map, ["Phone"])]).replace(/\D/g, "") === cleanPhone && String(data[i][getIdx(map, ["Password"])]).trim() === String(password).trim()) {
       var token = data[i][getIdx(map, ["AuthToken"])] || generateToken(); 
       if(!data[i][getIdx(map, ["AuthToken"])]) safeSetValue(s, i+1, getIdx(map, ["AuthToken"]), token); 
       return responseJSON({
         status: "success",
         user: { id: data[i][getIdx(map, ["ID"])], name: data[i][getIdx(map, ["Name"])], phone: cleanPhone, points: Number(data[i][getIdx(map, ["Points"])]) || 0, role: data[i][getIdx(map, ["Role"])], authToken: token }
       });
    }
  }
  return responseJSON({ status: "error", message: "Identifiants incorrects" });
}

function registerUser(d) {
  var s = getSheet("Users"); var data = s.getDataRange().getValues(); var p = String(d.phone).replace(/\D/g,"");
  for(var i=1; i<data.length; i++) if(String(data[i][getIndices(data[0])["phone"]]).replace(/\D/g,"") === p) return responseJSON({status:"error", message:"Déjà inscrit"});
  var id = generateId("USR"); var token = generateToken(); 
  var newRow = new Array(data[0].length).fill(""); var map = getIndices(data[0]);
  var set = (k, v) => { var idx=getIdx(map, [k]); if(idx>-1) newRow[idx]=v; };
  set("ID", id); set("Name", d.name); set("Phone", "'" + p); set("Password", d.password); set("JoinDate", new Date()); set("AuthToken", token); set("Points", 0); set("Role", "user");
  s.appendRow(newRow);
  return responseJSON({status:"success", user:{id:id, name:d.name, phone:p, authToken:token}});
}

function getUserData(token) {
   var user = getUserByToken(token); if (!user) return responseJSON({ status: "error", message: "Invalid" });
   var cart = "[]", wishlist = "[]";
   var cSheet = getSheet("Carts"); var cData = cSheet.getDataRange().getValues();
   for(var i=1; i<cData.length; i++) if(String(cData[i][0]) === user.token) { cart = cData[i][1]; break; }
   var wSheet = getSheet("Wishlists"); var wData = wSheet.getDataRange().getValues();
   for(var i=1; i<wData.length; i++) if(String(wData[i][0]) === user.token) { wishlist = wData[i][1]; break; }
   var addresses = [];
   var aSheet = getSheet("Addresses"); var aData = aSheet.getDataRange().getValues();
   for(var i=1; i<aData.length; i++) { if(String(aData[i][0]) === user.token) { 
       if(aData[i][1]) try { addresses.push(JSON.parse(aData[i][1])); } catch(e){}
       if(aData[i][2]) try { addresses.push(JSON.parse(aData[i][2])); } catch(e){}
       break; 
   } }
   return responseJSON({ status: "success", profile: user, cart: cart, wishlist: wishlist, addresses: addresses });
}

function getUserOrders(token) {
  var user = getUserByToken(token); if (!user) return responseJSON({ status: "error", message: "Invalid Session" });
  var s = getSheet("Orders"); var data = s.getDataRange().getValues(); var map = getIndices(data[0]); var userOrders = [];
  var idxID = getIdx(map, ["Order_ID", "ID"]); var idxUser = getIdx(map, ["User_ID", "UserID"]); var idxDate = getIdx(map, ["Date"]); var idxTotal = getIdx(map, ["Total"]); var idxStatus = getIdx(map, ["Status"]); var idxItems = getIdx(map, ["Items_JSON", "Items"]);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idxUser]).trim() === String(token).trim()) {
       userOrders.push({ id: data[i][idxID], date: data[i][idxDate], total: data[i][idxTotal], status: data[i][idxStatus], items: data[i][idxItems] });
    }
  }
  return responseJSON({ status: "success", orders: userOrders.reverse() });
}

function updateAddress(d, user) {
    var s = getSheet("Addresses"); var data = s.getDataRange().getValues(); var found = false;
    var col = (d.type.toLowerCase() === 'home') ? 1 : 2; 
    for(var i=1; i<data.length; i++) if(String(data[i][0]) === user.token) { safeSetValue(s, i+1, col, d.addressJson); found = true; break; }
    if(!found) { var row=[user.token, "", "", new Date()]; row[col]=d.addressJson; s.appendRow(row); }
    return responseJSON({ status: "success" });
}

function syncUserData(d, user) {
    if(d.type === 'cart') {
        var s = getSheet("Carts"); var data = s.getDataRange().getValues(); var found = false;
        for(var i=1; i<data.length; i++) if(String(data[i][0]) === user.token) { safeSetValue(s, i+1, 1, "'" + d.items); found = true; break; }
        if(!found) s.appendRow([user.token, "'" + d.items, "MAD", new Date(), d.coupon || ""]);
    }
    if(d.type === 'wishlist') {
        var s = getSheet("Wishlists"); var data = s.getDataRange().getValues(); var found = false;
        for(var i=1; i<data.length; i++) if(String(data[i][0]) === user.token) { safeSetValue(s, i+1, 1, "'" + d.items); found = true; break; }
        if(!found) s.appendRow([user.token, "'" + d.items, new Date()]);
    }
    return responseJSON({ status: "success" });
}

/* --- 7. ADMIN DASHBOARD (STORE MANAGER) --- */
function getAdminDashboard(pw) {
    if (String(pw) !== SECURE_ADMIN_PW) return responseJSON({ status: "error", message: "Unauthorized" });
    var s = getSheet("Orders"); var data = s.getDataRange().getValues(); var map = getIndices(data[0]); var orders = [];
    var start = Math.max(1, data.length - 100);
    for (var i = start; i < data.length; i++) {
        orders.push({ 
            id: data[i][getIdx(map, ["Order_ID"])], name: data[i][getIdx(map, ["Customer_Name"])], 
            phone: data[i][getIdx(map, ["Phone"])], total: data[i][getIdx(map, ["Total"])], 
            status: data[i][getIdx(map, ["Status"])], date: data[i][getIdx(map, ["Date"])], 
            items: data[i][getIdx(map, ["Items_JSON"])], address: data[i][getIdx(map, ["Address"])], note: data[i][getIdx(map, ["Payment_Method"])] 
        });
    }
    return responseJSON({ status: "success", orders: orders.reverse() });
}

function updateProductStatus(d) {
    var s = getSheet("Catalog"); var data = s.getDataRange().getValues(); var headers = data[0]; var map = getIndices(headers);
    var idxID = getIdx(map, ["ID"]); var idxStock = getIdx(map, ["Stock"]);
    var idxLabel = getIdx(map, ["Label", "Tag", "Badge"]);
    if (idxLabel === -1) { s.getRange(1, headers.length + 1).setValue("Label"); idxLabel = headers.length; }

    for (var i = 1; i < data.length; i++) {
        if (String(data[i][idxID]) === String(d.productId)) {
            var row = i + 1;
            if (d.status === 'available') { safeSetValue(s, row, idxStock, 100); safeSetValue(s, row, idxLabel, ""); }
            else if (d.status === 'out') { safeSetValue(s, row, idxStock, 0); safeSetValue(s, row, idxLabel, ""); }
            else if (d.status === 'sale') { safeSetValue(s, row, idxStock, 100); safeSetValue(s, row, idxLabel, "Sale"); }
            else if (d.status === 'restock') { safeSetValue(s, row, idxStock, 0); safeSetValue(s, row, idxLabel, "Restock"); }
            return responseJSON({status: "success"});
        }
    }
    return responseJSON({status: "error"});
}

function updatePrice(d) {
    var s = getSheet("Catalog"); var data = s.getDataRange().getValues();
    var idxPrice = getIdx(getIndices(data[0]), ["Price_MAD"]); var idxID = getIdx(getIndices(data[0]), ["ID"]);
    for(var i=1; i<data.length; i++) if(String(data[i][idxID])==String(d.productId)){ safeSetValue(s, i+1, idxPrice, d.price); return responseJSON({status:"success"}); }
    return responseJSON({status:"error"});
}

function toggleStock(d) {
    return updateProductStatus({ productId: d.productId, status: d.status ? 'available' : 'out' });
}

function getAdminReviews(pw) { if (String(pw) !== SECURE_ADMIN_PW) return responseJSON({ status: "error" }); var s = getSheet("Reviews"); var data = s.getDataRange().getValues(); var map = getIndices(data[0]); var reviews = []; var start = Math.max(1, data.length - 200); for(var i = start; i < data.length; i++) { reviews.push({ id: data[i][getIdx(map, ["ID"])], date: data[i][getIdx(map, ["Date"])], user: data[i][getIdx(map, ["UserName"])], product: data[i][getIdx(map, ["ProductId"])], rating: data[i][getIdx(map, ["Rating"])], comment: data[i][getIdx(map, ["Comment"])], status: data[i][getIdx(map, ["Status"])] }); } return responseJSON({ status: "success", reviews: reviews.reverse() }); }
function updateReviewStatus(d) { var s = getSheet("Reviews"); var data = s.getDataRange().getValues(); var idxID = getIdx(getIndices(data[0]), ["ID"]); var idxStat = getIdx(getIndices(data[0]), ["Status"]); for(var i=1; i<data.length; i++) { if(String(data[i][idxID]) === String(d.reviewId)) { safeSetValue(s, i+1, idxStat, d.status); return responseJSON({status:"success"}); } } return responseJSON({status:"error"}); }

/* --- 8. REVIEWS & COUPONS --- */
function getReviews(pid) { var s = getSheet("Reviews"); var data = s.getDataRange().getValues(); var map = getIndices(data[0]); var reviews = []; var idxPid = getIdx(map, ["ProductId"]); var idxName = getIdx(map, ["UserName", "Name"]); var idxRating = getIdx(map, ["Rating"]); var idxComment = getIdx(map, ["Comment"]); var idxStatus = getIdx(map, ["Status"]); for(let i=1; i<data.length; i++) { if(String(data[i][idxPid]).trim() === String(pid).trim() && String(data[i][idxStatus]).toLowerCase() === "active") { reviews.push({name:data[i][idxName], rating:data[i][idxRating], comment:data[i][idxComment]}); } } return responseJSON({status:"success", reviews:reviews.reverse()}); }
function addReview(d, user) { var s = getSheet("Reviews"); var reviewId = generateId("REV"); var date = Utilities.formatDate(new Date(), "GMT+1", "yyyy-MM-dd HH:mm:ss"); s.appendRow([reviewId, date, user.token, user.name, "'" + String(d.productId).trim(), d.rating, d.comment, "Inactive"]); return responseJSON({status: "success"}); }
function checkCoupon(code, total) { var s = getSheet("Coupons"); var data = s.getDataRange().getValues(); for(var i=1; i<data.length; i++){ var isActive = String(data[i][2]).toLowerCase() === "true" || data[i][2] === true || data[i][2] === 1; if(String(data[i][0]).toUpperCase().trim() === String(code).toUpperCase().trim() && isActive){ if(parseFloat(total) >= (parseFloat(data[i][3])||0)) return responseJSON({status:"success", discount: parseFloat(data[i][1])}); } } return responseJSON({status: "error"}); }
function cancelOrder(d, user) { var s = getSheet("Orders"); var data = s.getDataRange().getValues(); for(var i=1; i<data.length; i++) if(String(data[i][0])==String(d.orderId) && String(data[i][1])==user.token) { safeSetValue(s, i+1, 9, "Cancelled"); return responseJSON({status:"success"}); } return responseJSON({status:"error"}); }

/* --- 9. SHARED UTILS --- */
function repairDatabase(pw){ if (String(pw) !== SECURE_ROOT_PW) return responseJSON({ status: "error" }); getSheet("Orders"); getSheet("Users"); getSheet("Catalog"); getSheet("Addresses"); getSheet("Carts"); getSheet("Config"); getSheet("Reviews"); return responseJSON({ status: "success", message: "Database Integrity Checked" }); }
function runMigration(pw){ return responseJSON({status:"success"}); }
function getCoupons(){ return responseJSON({status:"error", message: "Use checkCoupon"}); }
function logView(){ return responseJSON({status:"success"}); }
function getCatalogVersion(){ return responseJSON({status:"success", version: "1.0"}); }
function getUserByToken(token) { if (!token || String(token).length < 5) return null; var s = getSheet("Users"); var data = s.getDataRange().getValues(); var map = getIndices(data[0]); var idxToken = getIdx(map, ["AuthToken"]); for(var i=1; i<data.length; i++) if (idxToken > -1 && String(data[i][idxToken]).trim() === String(token).trim()) { return { rowIndex: i, id: data[i][getIdx(map, ["ID"])], name: data[i][getIdx(map, ["Name"])], token: token, points: Number(data[i][getIdx(map, ["Points"])]) || 0 }; } return null; }
function generateId(type) { return PROJECT_PREFIX + "-" + type + "-" + Utilities.formatDate(new Date(), "GMT+1", "MMdd-HHmmss") + "-" + Math.floor(Math.random() * 100); }
function generateToken() { return PROJECT_PREFIX + "-" + Utilities.getUuid(); }
function getIndices(headers) { var map = {}; if (!headers) return map; headers.forEach((h, i) => { if(h) map[String(h).trim().toLowerCase()] = i; }); return map; }
function getIdx(map, keys) { for(var k of keys) { if(map.hasOwnProperty(k.toLowerCase())) return map[k.toLowerCase()]; } return -1; }
function safeSetValue(sheet, row, colIndex, value) { if (colIndex < 0) return; sheet.getRange(row, colIndex + 1).setValue(value); }
function responseJSON(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function getSheet(name) { var ss = SpreadsheetApp.openById(SPREADSHEET_ID); var s = ss.getSheetByName(name); if (!s) s = ss.insertSheet(name); return s; }
