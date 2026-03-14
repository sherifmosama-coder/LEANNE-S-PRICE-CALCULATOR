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
    
    if (!userSheet) {
      return { success: false, message: "Database error: tbl_Users not found in Google Sheets." };
    }
    
    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find column indexes to ensure it works even if you rearrange columns later
    const idCol = headers.indexOf('User ID');
    const userCol = headers.indexOf('Username');
    const passCol = headers.indexOf('Passcode');
    const roleCol = headers.indexOf('Role');
    const statusCol = headers.indexOf('Status');
    
    // Loop through users (skipping row 1 headers)
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      let dbUser = String(row[userCol]).trim();
      let dbPass = String(row[passCol]).trim();
      let dbStatus = String(row[statusCol]).trim();
      
      if (dbUser.toLowerCase() === String(username).trim().toLowerCase() && dbPass === String(passcode).trim()) {
        if (dbStatus.toLowerCase() !== 'active') {
          return { success: false, message: "Account is disabled. Please contact the Admin." };
        }
        
        return {
          success: true,
          role: row[roleCol] || 'User',
          userId: row[idCol],
          name: dbUser
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
    const users = [];
    for (let i = 1; i < data.length; i++) {
       users.push({ id: data[i][0], username: data[i][1], passcode: data[i][2], role: data[i][3], status: data[i][4] });
    }
    return users;
  } catch (e) { return []; }
}

function saveNewUserDB(username, passcode) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tbl_Users');
    const newId = 'U-' + Math.floor(1000 + Math.random() * 9000); // Random 4 digit ID
    sheet.appendRow([newId, username, passcode, 'User', 'Active']);
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}
