// CONFIGURATION
var SPREADSHEET_ID = "1O5L8yrkZVMbcZqitOAgStQj8E4sJzxyNrjoZCCswESo"; 
var SS;

try {
  SS = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
} catch(e) {
  SS = null;
}

// --- HTTP GET HANDLER (Reading Data) ---
function doGet(e) {
  var action = e.parameter.action;
  
  if (action == "getCatalog") return getCatalog();
  if (action == "getUserData") return getUserData(e.parameter.userId);

  return responseJSON({status: "error", message: "Invalid Action"});
}

// --- HTTP POST HANDLER (Writing Data) ---
function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var action = params.action;

  if (action == "register") return registerUser(params.data);
  if (action == "login") return loginUser(params.data);
  if (action == "syncWishlist") return syncWishlist(params.data);
  if (action == "syncCart") return syncCart(params.data);
  if (action == "placeOrder") return placeOrder(params.data);

  return responseJSON({status: "error", message: "Invalid Action"});
}

// --- CORE FUNCTIONS ---

function getCatalog() {
  // 1. Check Cache First
  var cache = CacheService.getScriptCache();
  var cachedData = cache.get("catalog_data");
  
  if (cachedData != null) {
    // 🔥 RETURN CACHED DATA (FAST!)
    return ContentService.createTextOutput(cachedData).setMimeType(ContentService.MimeType.JSON);
  }

  // 2. If no cache, Read Sheet (SLOW)
  var sheet = SS.getSheetByName("Catalog");
  var data = sheet.getDataRange().getValues();
  var headers = data.shift();
  var products = [];

  data.forEach(function(row) {
    if(row[0] === "") return;
    var product = {};
    headers.forEach(function(header, i) { product[header] = row[i]; });
    products.push(product);
  });

  var jsonResult = JSON.stringify({status: "success", data: products});

  // 3. Save to Cache for 20 minutes (1200 seconds)
  cache.put("catalog_data", jsonResult, 1200); 

  return ContentService.createTextOutput(jsonResult).setMimeType(ContentService.MimeType.JSON);
}

function registerUser(data) {
  var sheet = SS.getSheetByName("Users");
  var users = sheet.getDataRange().getValues();
  
  for (var i = 1; i < users.length; i++) {
    if (String(users[i][2]) === String(data.phone)) {
      return responseJSON({status: "error", message: "Phone already registered"});
    }
  }

  var newId = Utilities.getUuid();
  sheet.appendRow([newId, data.name, "'" + data.phone, data.password, new Date()]);
  
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

function syncWishlist(data) {
  var sheet = SS.getSheetByName("Wishlists");
  updateOrAppend(sheet, data.userId, 2, data.items);
  return responseJSON({status: "success"});
}

function syncCart(data) {
  var sheet = SS.getSheetByName("Carts");
  updateOrAppend(sheet, data.userId, 2, data.cartJson);
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
    data.total,
    data.method,
    data.items,
    new Date(),
    "Pending"
  ]);
  
  return responseJSON({status: "success", orderId: orderId});
}

function getUserData(userId) {
  var wSheet = SS.getSheetByName("Wishlists");
  var cSheet = SS.getSheetByName("Carts");
  
  // FIX: Force data to String so the App doesn't crash on numbers/nulls
  var wishlist = String(findVal(wSheet, userId, 2) || "");
  var cart = String(findVal(cSheet, userId, 2) || "");

  return responseJSON({status: "success", wishlist: wishlist, cart: cart});
}

// --- HELPER FUNCTIONS ---

function updateOrAppend(sheet, key, updateCol, value) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == key) {
      sheet.getRange(i + 1, updateCol).setValue(value);
      sheet.getRange(i + 1, 3).setValue(new Date());
      return;
    }
  }
  sheet.appendRow([key, value, new Date()]);
}

function findVal(sheet, key, targetCol) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == key) return rows[i][targetCol - 1];
  }
  return "";
}

function responseJSON(content) {
  return ContentService.createTextOutput(JSON.stringify(content))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- DATABASE SETUP ---

function setupGoraryPlace() {
  var ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "") {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      Logger.log("📂 Using Existing Database: " + ss.getUrl());
    } catch(e) {
      Logger.log("❌ Could not open ID. Creating new...");
      ss = SpreadsheetApp.create("Gorary Place");
    }
  } else {
    ss = SpreadsheetApp.create("Gorary Place");
    Logger.log("🆕 Created New Database: " + ss.getUrl());
  }
  
  var schema = {
    'Catalog': ['ID', 'Title', 'Category', 'Price', 'Old_Price', 'Stock', 'Image_URL', 'Tags', 'Description'],
    'Users': ['User_ID', 'Name', 'Phone', 'Password', 'Join_Date'],
    'Wishlists': ['User_ID', 'Product_IDs', 'Last_Updated'],
    'Carts': ['User_ID', 'Cart_JSON', 'Last_Updated'],
    'Orders': ['Order_ID', 'User_ID', 'Customer_Name', 'Phone', 'Address', 'Total', 'Payment_Method', 'Items_JSON', 'Date', 'Status']
  };

  for (var sheetName in schema) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      var headers = [schema[sheetName]];
      var range = sheet.getRange(1, 1, 1, headers[0].length);
      range.setValues(headers);
      range.setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);
      Logger.log("✅ Created Sheet: " + sheetName);
      if (sheetName === 'Catalog') {
        sheet.appendRow(['m1', 'Dragon Roll', 'Sushi', 85, 100, 50, 'https://images.unsplash.com/photo-1579584425555-c3ce17fd43fb?w=600', 'hot,spicy', 'Eel and cucumber inside, avocado outside']);
      }
    }
  }
  
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  Logger.log("🚀 Database Setup Complete.");
}
