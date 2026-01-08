// ==========================================
// SUSHI ELITE BACKEND - v83.7 (STABLE)
// ==========================================

// CONFIGURATION
var SPREADSHEET_ID = "1O5L8yrkZVMbcZqitOAgStQj8E4sJzxyNrjoZCCswESo"; 
var SS;

try {
  SS = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
} catch(e) {
  SS = null;
  console.error("Spreadsheet Connection Failed:", e);
}

// --- HTTP HANDLERS ---

function doGet(e) {
  var action = e.parameter.action;
  
  if (action == "getCatalog") return getCatalog();
  if (action == "getUserData") return getUserData(e.parameter.userId);

  return responseJSON({status: "error", message: "Invalid Action"});
}

function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var action = params.action;

  if (action == "register") return registerUser(params.data);
  if (action == "login") return loginUser(params.data);
  if (action == "syncWishlist") return syncWishlist(params.data);
  if (action == "syncCart") return syncCart(params.data);
  if (action == "placeOrder") return placeOrder(params.data);
  if (action == "updatePreference") return updatePreference(params.data);

  return responseJSON({status: "error", message: "Invalid Action"});
}

// --- CORE FUNCTIONS ---

function getCatalog() {
  var cache = CacheService.getScriptCache();
  var cachedData = cache.get("catalog_v3");
  
  if (cachedData != null) {
    return ContentService.createTextOutput(cachedData).setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SS.getSheetByName("Catalog");
  var data = sheet.getDataRange().getValues();
  var headers = data.shift(); 
  var products = [];

  data.forEach(function(row) {
    if(row[0] === "") return;
    
    var product = {
      id: row[0],
      title: row[1],
      category: row[2],
      price_MAD: row[3],
      price_EUR: row[4],
      price_USD: row[5],
      oldPrice_MAD: row[6],
      oldPrice_EUR: row[7],
      oldPrice_USD: row[8],
      stock: row[9],
      image: row[10],
      tags: row[11],
      desc: row[12]
    };
    products.push(product);
  });

  var json = JSON.stringify({status: "success", data: products});
  cache.put("catalog_v3", json, 1200); 

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getUserData(userId) {
  var wSheet = SS.getSheetByName("Wishlists");
  var cSheet = SS.getSheetByName("Carts");
  var uSheet = SS.getSheetByName("Users");
  var oSheet = SS.getSheetByName("Orders");
  
  // 1. Get Lists (Force String)
  var wishlist = String(findVal(wSheet, userId, 2) || "");
  
  // 2. Get Cart
  var cart = "";
  var cartCurrency = "";
  var cRows = cSheet.getDataRange().getValues();
  for(var k=1; k<cRows.length; k++) {
    if(String(cRows[k][0]) === String(userId)) {
      cart = cRows[k][1];
      cartCurrency = cRows[k][2];
      break;
    }
  }
  
  // 3. Get User Details
  var joinDate = "-";
  var userPrefCurrency = "MAD";
  var uRows = uSheet.getDataRange().getValues();
  
  for(var i=1; i<uRows.length; i++) {
    if(String(uRows[i][0]) === String(userId)) {
      var rawDate = uRows[i][4];
      if(rawDate) joinDate = new Date(rawDate).toLocaleDateString();
      if(uRows[i][5]) userPrefCurrency = uRows[i][5];
      break;
    }
  }

  var isCartEmpty = (cart === "" || cart === "[]");
  var finalCurrency = (!isCartEmpty && cartCurrency) ? cartCurrency : (userPrefCurrency || "MAD");

  // 4. Get Orders
  var orders = [];
  var oRows = oSheet.getDataRange().getValues();
  for(var j=1; j<oRows.length; j++) {
    if(String(oRows[j][1]) === String(userId)) {
      orders.push({
        id: oRows[j][0],
        total: oRows[j][5],
        date: oRows[j][8],
        status: oRows[j][9],
        items: oRows[j][7]
      });
    }
  }
  orders.reverse();

  return responseJSON({
    status: "success", 
    wishlist: wishlist, 
    cart: cart, 
    joinDate: joinDate,
    currency: finalCurrency,
    orders: orders
  });
}

function updatePreference(data) {
  var sheet = SS.getSheetByName("Users");
  var rows = sheet.getDataRange().getValues();
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][0]) === String(data.userId)) {
      sheet.getRange(i+1, 6).setValue(data.currency);
      return responseJSON({status: "success"});
    }
  }
  return responseJSON({status: "error", message: "User not found"});
}

function syncCart(data) {
  var sheet = SS.getSheetByName("Carts");
  updateOrAppendCart(sheet, data.userId, data.cartJson, data.currency);
  return responseJSON({status: "success"});
}

function syncWishlist(data) {
  var sheet = SS.getSheetByName("Wishlists");
  updateOrAppend(sheet, data.userId, 2, data.items);
  return responseJSON({status: "success"});
}

function placeOrder(data) {
  var sheet = SS.getSheetByName("Orders");
  var orderId = "ORD-" + Math.floor(Math.random() * 1000000);
  
  sheet.appendRow([
    orderId,
    data.userId || "Guest",
    data.name,
    "'" + data.phone,
    data.address,
    parseFloat(data.total), 
    data.method,
    data.items,
    new Date(),
    "Pending",
    data.currency
  ]);
  
  return responseJSON({status: "success", orderId: orderId});
}

function registerUser(data) {
  var sheet = SS.getSheetByName("Users");
  var users = sheet.getDataRange().getValues();
  for (var i = 1; i < users.length; i++) {
    if (String(users[i][2]) === String(data.phone)) return responseJSON({status: "error", message: "Phone taken"});
  }
  var newId = Utilities.getUuid();
  sheet.appendRow([newId, data.name, "'" + data.phone, data.password, new Date(), "MAD"]);
  return responseJSON({status: "success", userId: newId, name: data.name});
}

function loginUser(data) {
  var sheet = SS.getSheetByName("Users");
  var users = sheet.getDataRange().getValues();
  for (var i = 1; i < users.length; i++) {
    if (String(users[i][2]) === String(data.phone) && String(users[i][3]) === String(data.password)) {
      return responseJSON({status: "success", userId: users[i][0], name: users[i][1]});
    }
  }
  return responseJSON({status: "error", message: "Invalid Credentials"});
}

// --- HELPERS ---

function updateOrAppend(sheet, key, updateCol, value) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) == String(key)) {
      sheet.getRange(i + 1, updateCol).setValue(value);
      sheet.getRange(i + 1, 3).setValue(new Date());
      return;
    }
  }
  sheet.appendRow([key, value, new Date()]);
}

function updateOrAppendCart(sheet, key, cartJson, currency) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) == String(key)) {
      sheet.getRange(i + 1, 2).setValue(cartJson);
      if(currency) sheet.getRange(i + 1, 3).setValue(currency);
      sheet.getRange(i + 1, 4).setValue(new Date());
      return;
    }
  }
  sheet.appendRow([key, cartJson, currency || "MAD", new Date()]);
}

function findVal(sheet, key, targetCol) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) == String(key)) return rows[i][targetCol - 1];
  }
  return "";
}

function responseJSON(content) {
  return ContentService.createTextOutput(JSON.stringify(content)).setMimeType(ContentService.MimeType.JSON);
}

// --- IMPORT TOOL ---
function importFromBlogger() {
  var BLOG_URL = "https://YOUR_BLOG_NAME.blogspot.com"; 
  var FEED_URL = BLOG_URL + "/feeds/posts/default?alt=json&max-results=500";
  var sheet = SS.getSheetByName("Catalog");
  if(!sheet) return;

  var response = UrlFetchApp.fetch(FEED_URL);
  var entries = JSON.parse(response.getContentText()).feed.entry;
  if(!entries) return;

  var newRows = [];
  entries.forEach(function(entry) {
    var title = entry.title.$t;
    var id = "p-" + entry.id.$t.split("post-")[1];
    var img = entry.media$thumbnail ? entry.media$thumbnail.url.replace("/s72-c/", "/s600/") : "";
    
    var priceMAD = 0, stock = 20, cat = "Sushi", tags = [];
    if(entry.category) {
      entry.category.forEach(function(c) {
        var t = c.term;
        if(t.indexOf("price-")>-1) priceMAD = parseFloat(t.replace("price-",""));
        else if(t.indexOf("stock-")>-1) stock = parseInt(t.replace("stock-",""));
        else { tags.push(t); if(["Sushi","Rolls","Drinks"].indexOf(t)>-1) cat = t; }
      });
    }
    
    var eur = (priceMAD/11).toFixed(2);
    var usd = (priceMAD/10).toFixed(2);
    
    newRows.push([id, title, cat, priceMAD, eur, usd, "", "", "", stock, img, tags.join(","), "Imported"]);
  });

  if(newRows.length > 0) sheet.getRange(2, 1, newRows.length, newRows[0].length).setValues(newRows);
}

function setupGoraryPlace() {
  var ss = SS || SpreadsheetApp.create("Gorary Place");
  var schema = {
    'Catalog': ['ID', 'Title', 'Category', 'Price_MAD', 'Price_EUR', 'Price_USD', 'Old_MAD', 'Old_EUR', 'Old_USD', 'Stock', 'Image_URL', 'Tags', 'Description'],
    'Users': ['User_ID', 'Name', 'Phone', 'Password', 'Join_Date', 'Currency_Pref'],
    'Wishlists': ['User_ID', 'Product_IDs', 'Last_Updated'],
    'Carts': ['User_ID', 'Cart_JSON', 'Currency', 'Last_Updated'],
    'Orders': ['Order_ID', 'User_ID', 'Customer_Name', 'Phone', 'Address', 'Total', 'Payment_Method', 'Items_JSON', 'Date', 'Status', 'Currency']
  };

  for(var s in schema) {
    if(!ss.getSheetByName(s)) {
      var sh = ss.insertSheet(s);
      sh.appendRow(schema[s]);
      sh.setFrozenRows(1);
    }
  }
}
