// ==========================================
// REALTRUCK PRICING CALCULATOR - BACKEND API
// ==========================================

// 1. Serve the HTML Web App
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Sterling Fleet Outfitters Configurator')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1') // <--- This forces mobile responsiveness
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==========================================
// 🔐 PHASE 2: AUTHENTICATION & USER LOGIC
// ==========================================

const ADMIN_USER = "Admin";
const ADMIN_PASS = "4321"; // Hardcoded Master Admin Passcode

function verifyLogin(username, passcode) {
  // 1. Check Hardcoded Admin
  if (String(username).trim().toLowerCase() === ADMIN_USER.toLowerCase() && String(passcode).trim() === ADMIN_PASS) {
    return { success: true, role: 'Admin', userId: 'A-000', name: 'System Admin' };
  }
  
  // 2. Check Standard Users in tbl_Users
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName('tbl_Users');
    if (!userSheet) return { success: false, message: "Database error: tbl_Users not found." };
    
    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    
    const idCol = headers.indexOf('User ID');
    const userCol = headers.indexOf('Username');
    const fullNameCol = headers.indexOf('Full Name'); // New Field
    const passCol = headers.indexOf('Passcode');
    const roleCol = headers.indexOf('Role');
    const statusCol = headers.indexOf('Status');
    
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      let dbUser = String(row[userCol]).trim();
      let dbPass = String(row[passCol]).trim();
      let dbStatus = String(row[statusCol]).trim();
      let dbFullName = fullNameCol > -1 && row[fullNameCol] ? String(row[fullNameCol]).trim() : dbUser;
      
      if (dbUser.toLowerCase() === String(username).trim().toLowerCase() && dbPass === String(passcode).trim()) {
        if (dbStatus.toLowerCase() === 'deleted') continue; // Hide deleted
        if (dbStatus.toLowerCase() !== 'active') return { success: false, message: "Account is disabled." };
        
        return {
          success: true,
          role: row[roleCol] || 'User',
          userId: row[idCol],
          name: dbFullName // Now maps to the Full Name field!
        };
      }
    }
    return { success: false, message: "Invalid Username or Passcode." };
  } catch (error) {
    return { success: false, message: "Error connecting to database: " + error.toString() };
  }
}

// 2. Helper Function: Read Sheet Data as JSON Objects
// This prevents us from having to loop through raw 2D arrays on the frontend.
function getSheetData_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error("Sheet '" + sheetName + "' not found. Please check tab names.");
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Return empty if only headers exist
  
  const headers = data.shift(); // Remove and store headers
  
  return data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header.toString().trim()] = row[index];
    });
    return obj;
  });
}

// 3. API: Get Initial Truck Data for Cascading Dropdowns
// Called when the page loads to populate Make > Model > Size Category
function getTruckData() {
  return getSheetData_('tbl_Trucks'); 
}

// 4a. API: Get Full Base Table for Fiberglass (used to build dropdowns)
function getFiberglassBaseTable() {
  return getSheetData_('tbl_Fiberglass_Base');
}

// 4b. API: Get Full Base Table for Commercial (used to build dropdowns)
function getCommercialBaseTable() {
  return getSheetData_('tbl_Commercial_Base');
}

// 4c. API: Get Base Pricing for Fiberglass
function getFiberglassBase(sizeCategory, bedLength, capModel) {
  const data = getSheetData_('tbl_Fiberglass_Base');
  const match = data.find(row => 
    row['Size Category'] === sizeCategory && 
    row['Bed Length'] === bedLength
  );
  return match ? (parseFloat(match[capModel]) || 0) : 0;
}

// 5. API: Get Options for Fiberglass Models
function getFiberglassOptions(sizeCategory, capModel) {
  const data = getSheetData_('tbl_Fiberglass_Options');
  return data.filter(row => 
    (row['Size Category'] === sizeCategory || row['Size Category'] === 'All' || row['Size Category'] === '') && 
    row[capModel] !== '' && row[capModel] !== undefined
  );
}

// 6. API: Get Options for Commercial Models
function getCommercialOptions(sizeCategory, capModel) {
  const data = getSheetData_('tbl_Commercial_Options');
  return data.filter(row => 
    (row['Size Category'] === sizeCategory || row['Size Category'] === 'All' || row['Size Category'] === '') && 
    row[capModel] !== '' && row[capModel] !== undefined
  );
}

// 7. API: Get Surcharge / Combination Rules
function getLogicRules() {
  return getSheetData_('tbl_Logic_Rules');
}

// ==========================================
// 📊 PHASE 2: DASHBOARD LOGIC
// ==========================================

function getDashboardQuotes() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('tbl_Quotes');
    
    // Return empty array if sheet isn't set up yet or has no data
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // Only headers exist
    
    const headers = data[0];
    const quotes = [];
    
    // Loop backwards so the newest quotes appear at the top of the dashboard
    for (let i = data.length - 1; i > 0; i--) { 
      let row = data[i];
      if (!row[0]) continue; // Skip totally blank rows
      
      quotes.push({
        quoteId: row[headers.indexOf('Quote ID')],
        revisionOf: row[headers.indexOf('Revision Of')],
        date: row[headers.indexOf('Date')],
        createdBy: row[headers.indexOf('Created By')],
        clientName: row[headers.indexOf('Client Name')],
        make: row[headers.indexOf('Make')],
        model: row[headers.indexOf('Model')],
        sizeCategory: row[headers.indexOf('Size Category')],
        capType: row[headers.indexOf('Cap Type')],
        bedLength: row[headers.indexOf('Bed Length')],
        capModel: row[headers.indexOf('Cap Model')],
        totalPrice: row[headers.indexOf('Total Price')],
        configStateJSON: row[headers.indexOf('Config State (JSON)')]
      });
    }
    
    return quotes;
  } catch (e) {
    Logger.log("Dashboard Error: " + e.toString());
    return [];
  }
}

// ==========================================
// 💾 PHASE 3 & 4: SAVE & LOAD ENGINE
// ==========================================

function saveQuoteToDB(quoteData, configJSON) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('tbl_Quotes');
    
    // Generate new Quote ID (e.g., Q-1005)
    const lastRow = sheet.getLastRow();
    let newIdNum = 1000;
    if (lastRow > 1) {
      const lastId = sheet.getRange(lastRow, 1).getValue();
      if (String(lastId).startsWith('Q-')) {
        newIdNum = parseInt(String(lastId).replace('Q-', '')) + 1;
      } else {
        newIdNum = lastRow + 999;
      }
    }
    const newQuoteId = 'Q-' + newIdNum;
    
    // Revision Logic: If quoteData has an existing ID, log it as the parent
    let revisionOf = quoteData.revisionOf || '';
    
    // Append to Sheet
    sheet.appendRow([
      newQuoteId, revisionOf, new Date().toISOString(), quoteData.createdBy || 'Unknown',
      quoteData.clientName, quoteData.clientPhone, quoteData.clientEmail,
      quoteData.make, quoteData.model, quoteData.sizeCategory, quoteData.capType,
      quoteData.bedLength, quoteData.capModel, quoteData.totalPrice, configJSON
    ]);
    
    return { success: true, newQuoteId: newQuoteId };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ==========================================
// 👥 PHASE 6: ADMIN USER MANAGEMENT
// ==========================================

function getAdminUsersDB() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idCol = headers.indexOf('User ID');
    const userCol = headers.indexOf('Username');
    const fnCol = headers.indexOf('Full Name');
    const passCol = headers.indexOf('Passcode');
    const roleCol = headers.indexOf('Role');
    const statusCol = headers.indexOf('Status');
    
    const users = [];
    for (let i = 1; i < data.length; i++) {
       let status = String(data[i][statusCol]).trim();
       if (status !== 'Deleted') { // Filter out deleted users
         users.push({ 
           id: data[i][idCol], 
           username: data[i][userCol], 
           fullName: fnCol > -1 ? data[i][fnCol] : data[i][userCol],
           passcode: String(data[i][passCol]), // Enforce string
           role: data[i][roleCol], 
           status: status 
         });
       }
    }
    return users;
  } catch (e) { return []; }
}

function saveNewUserDB(username, fullName, passcode) {
  try {
    const checkUser = String(username).trim().toLowerCase();
    
    // 1. Check if the username conflicts with the Hardcoded Admin
    if (checkUser === ADMIN_USER.toLowerCase()) {
      return { success: false, message: "Username already exists." };
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userCol = headers.indexOf('Username');
    
    // 2. Check if the username already exists in tbl_Users
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][userCol]).trim().toLowerCase() === checkUser) {
        return { success: false, message: "Username already exists." };
      }
    }

    // 3. If unique, proceed with saving
    const newId = 'U-' + Math.floor(1000 + Math.random() * 9000);
    // Notice the "'" + passcode -> Forces Google Sheets to save '0000' exactly as text
    sheet.appendRow([newId, username, fullName, "'" + passcode, 'User', 'Active']);
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updateUserPasscodeDB(userId, newPasscode) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = headers.indexOf('User ID');
    const passCol = headers.indexOf('Passcode');
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] === userId) {
        // +1 because sheet rows are 1-indexed and header is row 1
        sheet.getRange(i + 1, passCol + 1).setValue("'" + newPasscode);
        return { success: true };
      }
    }
    return { success: false, message: "User not found." };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteUserDB(userId) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = headers.indexOf('User ID');
    const statusCol = headers.indexOf('Status');
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] === userId) {
        sheet.getRange(i + 1, statusCol + 1).setValue('Deleted');
        return { success: true };
      }
    }
    return { success: false, message: "User not found." };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ==========================================
// 🏢 PHASE 7: CLIENTS & LOGIN DATA
// ==========================================

function getActiveUsersList() {
  try {
    let users = [];
    
    // 1. Always include the Hardcoded Admin first
    users.push({
      username: ADMIN_USER,
      fullName: 'System Admin'
    });

    // 2. Fetch the rest from tbl_Users
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Users');
    if (!sheet) return users;
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userCol = headers.indexOf('Username');
    const fnCol = headers.indexOf('Full Name');
    const statusCol = headers.indexOf('Status');
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][statusCol]).trim() === 'Active') {
        users.push({
          username: data[i][userCol],
          fullName: fnCol > -1 && data[i][fnCol] ? data[i][fnCol] : data[i][userCol]
        });
      }
    }
    return users;
  } catch (e) { return []; }
}

function getClientsDB() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Clients');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    let clients = [];
    for (let i = 1; i < data.length; i++) {
      clients.push({
        name: String(data[i][1]).trim(),
        phone: String(data[i][2]).trim(),
        email: String(data[i][3]).trim()
      });
    }
    return clients;
  } catch (e) { return []; }
}

function saveOrUpdateClientDB(name, phone, email) {
  try {
    if (!name) return;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Clients');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    
    // Check if client exists
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim().toLowerCase() === String(name).trim().toLowerCase()) {
        // Update phone/email if they provided new ones
        if (phone) sheet.getRange(i + 1, 3).setValue(phone);
        if (email) sheet.getRange(i + 1, 4).setValue(email);
        return { success: true, message: 'Updated' };
      }
    }
    
    // If not found, create new client
    const newId = 'C-' + Math.floor(10000 + Math.random() * 90000);
    sheet.appendRow([newId, name, phone, email]);
    return { success: true, message: 'Added' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

// ==========================================
// 📝 PHASE 8: TERMS & CONDITIONS ENGINE
// ==========================================

function getTCData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let pool = [], templates = [];
    
    const pSheet = ss.getSheetByName('tbl_TC_Pool');
    if (pSheet) {
      const pData = pSheet.getDataRange().getValues();
      for (let i = 1; i < pData.length; i++) if (pData[i][0]) pool.push({ id: pData[i][0], text: String(pData[i][1]).trim() });
    }
    
    const tSheet = ss.getSheetByName('tbl_TC_Templates');
    if (tSheet) {
      const tData = tSheet.getDataRange().getValues();
      for (let i = 1; i < tData.length; i++) {
        if (tData[i][0]) templates.push({ 
          id: tData[i][0], 
          name: tData[i][1], 
          statements: String(tData[i][2]), 
          isDefault: String(tData[i][3]).toLowerCase() === 'true' 
        });
      }
    }
    return { pool: pool, templates: templates };
  } catch (e) { return { pool: [], templates: [] }; }
}

function saveSmartTC(newStatements, newTemplates) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (newStatements && newStatements.length > 0) {
      const pSheet = ss.getSheetByName('tbl_TC_Pool');
      newStatements.forEach(text => {
        pSheet.appendRow(['S-' + Math.floor(10000 + Math.random() * 90000), text]);
      });
    }
    if (newTemplates && newTemplates.length > 0) {
      const tSheet = ss.getSheetByName('tbl_TC_Templates');
      newTemplates.forEach(tpl => {
        tSheet.appendRow(['T-' + Math.floor(10000 + Math.random() * 90000), tpl.name, tpl.statements, false]);
      });
    }
    return { success: true };
  } catch (e) { return { success: false }; }
}

function adminUpdateTCTemplate(id, name, statements, isDefault) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_TC_Templates');
    const data = sheet.getDataRange().getValues();
    
    if (isDefault) {
      for (let i = 1; i < data.length; i++) sheet.getRange(i + 1, 4).setValue(false); // Clear old defaults
    }
    
    if (id) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === id) {
          sheet.getRange(i + 1, 2).setValue(name);
          sheet.getRange(i + 1, 3).setValue(statements);
          sheet.getRange(i + 1, 4).setValue(isDefault);
          return { success: true };
        }
      }
    } else {
      sheet.appendRow(['T-' + Math.floor(10000 + Math.random() * 90000), name, statements, isDefault]);
      return { success: true };
    }
    return { success: false };
  } catch (e) { return { success: false }; }
}

function adminDeleteTCTemplate(id) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_TC_Templates');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) { sheet.deleteRow(i + 1); return { success: true }; }
    }
    return { success: false };
  } catch (e) { return { success: false }; }
}

function adminDeleteTCStatementDB(id) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_TC_Pool');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) { sheet.deleteRow(i + 1); return { success: true }; }
    }
    return { success: false };
  } catch (e) { return { success: false }; }
}
