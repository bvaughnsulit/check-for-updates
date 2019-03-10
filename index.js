const {google} = require('googleapis');
const sheets = google.sheets('v4');
const { remote } = require('webdriverio');
const fs = require('fs').promises;
require('dotenv').config();


(
  async () => {
    const credentials = process.env
    const config = await getConfigs()
    const sheetId = config.sheetId
    const sites = "sites!A:F"
    const results = "results!A:C"
    const auth = getCredentials(credentials)
    const data = await getRange(sheetId, sites, auth)
    const browser = await startSession()
    const query = config.query

    var enrichedData = data

    for (var row in enrichedData){
      var pageData = await checkPage(browser, data[row][1], data[row][2], query)
      enrichedData[row][3] = pageData.totalElems
      enrichedData[row][4] = pageData.totalTextMatches

      var newRows = []

      for (var i in pageData.matches){
        newRows.push([data[row][0],pageData.matches[i].text,pageData.matches[i].href,pageData.matches[i].html])
      }

      updateRange(sheetId, sites, enrichedData, auth) 
      appendRows(sheetId, results, newRows, auth)

    }

    browser.deleteSession()

  }
)().catch((e) => console.error(e));



async function getConfigs() {
  const config = await fs.readFile('./config.json')
  return JSON.parse(config)
}



function getCredentials(credentials) {
  const oAuth2Client = new google.auth.OAuth2(
    credentials.client_id, credentials.client_secret, credentials.redirect_uri);

    const token = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      scope: credentials.scope,
      token_type: credentials.token_type,
      expiry_date: credentials.expiry_date
    }

    oAuth2Client.setCredentials(token);
    return oAuth2Client
}



async function getRange(sheetId, range, auth) {

    var request = {
      spreadsheetId: sheetId, 
      auth: auth,
      range: range
    };
  
    const response = await sheets.spreadsheets.values.get(request)
    return response.data.values

}



async function startSession(){
  const browser = await remote({
    path: '/',
    logLevel: 'error',
    capabilities: {
        browserName: 'chrome'
    }
  })
  return browser
}



async function checkPage(browser, pageUrl, elementPath, stringToMatch){

  await browser.url(pageUrl)
  var elems = []

  try {
    await browser.waitUntil(async () => {
      elems = await browser.$$(`a[href*='${elementPath}']`)
      return elems.length > 0
    }, 7000, "none found");
  } catch(e) {}

  const matchedElems = await browser.$$(`//*[contains(text(),'${stringToMatch}')]`)

  var matches = []
  
for (var i in matchedElems){
    var match = {}
    match.text = await matchedElems[i].getText() || 'text'
    match.href = await findHref(matchedElems[i]) || 'href'
    match.html = await matchedElems[i].getHTML() || 'html'
    match.html = match.html.toString().substring(0,255)
    matches.push(match)
  }

  return {
    matches: matches,
    totalElems: elems.length,
    totalTextMatches: matches.length
  }
}



async function findHref(element){
    if(await element.getAttribute('href')){
        return element.getAttribute('href')
    } else {
        const parent = await element.$('..')
        return parent.getAttribute('href')
    }
}



async function updateRange(sheetId, range, values, auth) {

  const valueRange = {
    values: values
  }

  var request = {
    spreadsheetId: sheetId, 
    auth: auth,
    range: range,
    valueInputOption: "USER_ENTERED",
    resource: valueRange
  };

  const response = await sheets.spreadsheets.values.update(request)
  return response.data

}



async function appendRows(sheetId, range, values, auth) {

  const valueRange = {
    values: values
  }

  var request = {
    spreadsheetId: sheetId, 
    auth: auth,
    range: range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: valueRange
  };

  const response = await sheets.spreadsheets.values.append(request)
  return response.data

}