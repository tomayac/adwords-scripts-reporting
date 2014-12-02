/**
 * @author: Thomas Steiner (tomac@google.com)
 * @license CC0 1.0 Universal (CC0 1.0)
 */

/* jshint shadow:true, loopfunc:true, -W034, -W097 */
/* global MccApp, AdWordsApp, SpreadsheetApp, Logger */

'use strict';

// Store the output here
var SPREADSHEET_URL = '';

// AWQL query
var SELECT_VALUES = [
  'ExternalCustomerId',
  'AccountDescriptiveName',
  'Clicks',
  'Impressions'
];
var REPORT_QUERY = 'SELECT ' + SELECT_VALUES.join(', ') + ' ' +
    'FROM   ACCOUNT_PERFORMANCE_REPORT ' +
    'WHERE  Clicks > 0 ' +
    'DURING LAST_30_DAYS';

var PURGE_AFTER = 30 /* days */ * (24 * 60 *  60 * 1000) /* in milliseconds */;

// 20141217
var now = (new Date()).toISOString().substr(0, 10).replace(/-/g, '').toString();

function main() {
  // Remove remoteStorage items that were not from today
  for (var i = 0, lenI = remoteStorage.getLength(); i < lenI; i++) {
    var key = remoteStorage.key(i);
    if (key !== now) {
      remoteStorage.removeItem(key);
    }
  }
  // Start processing
  var processedAccounts = remoteStorage.getItem(now) || {};
  var notProcessedAccounts = {};
  var parallelExecutionLimit = 50;
  var accountIterator = MccApp.accounts().get();
  while (accountIterator.hasNext()) {
    var account = accountIterator.next();
    var cid = account.getCustomerId();
    if (!processedAccounts[cid]) {
      notProcessedAccounts[cid] = false;
      Logger.log('Not yet processed account ' + cid);
    } else {
      Logger.log('Already processed account ' + cid);
    }
  }
  // Process in chunks according to the parallel execution limit
  var i = 0;
  var currentRun = [];
  for (var cid in notProcessedAccounts) {
    if (i < parallelExecutionLimit) {
      currentRun.push(cid);
    } else {
      Logger.log('Maximum executeInParallel limit reached, starting parallel ' +
          'processing');
      break;
    }
    i++;
  }
  var accountSelector = MccApp.accounts().withIds(currentRun);
  accountSelector.executeInParallel('getReport', 'storeReports');
}

/**
 * Gets an AWQL report
 */
function getReport() {
  var account = AdWordsApp.currentAccount();
  var report = AdWordsApp.report(REPORT_QUERY);
  var rows = report.rows();
  var result = [];
  var i = 0;
  while (rows.hasNext()) {
    var row = rows.next();
    var line = [];
    SELECT_VALUES.forEach(function(selectValue, j) {
      if (selectValue === 'Date') {
        // Prevent Spreadsheets date parsing magic
        line[j] = row[selectValue].replace(/-/g, '');
      } else {
        line[j] = row[selectValue];
      }
    });
    line.push(now);
    result[i] = line;
    i++;
  }
  if (!result.length) {
    return;
  }
  return JSON.stringify(result);
}

/**
 * Stores reports in a spreadsheet
 */
function storeReports(results) {
  var spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = spreadsheet.getSheetByName('Report') !== null ?
      spreadsheet.getSheetByName('Report') : spreadsheet.insertSheet('Report');
  // Create the header if necessary
  SELECT_VALUES.push('Timestamp');
  var headerLength = SELECT_VALUES.length;
  if (sheet.getLastRow() < 2) {
    sheet.getRange(1, 1, 1, headerLength).setValues([SELECT_VALUES]);
    sheet.setFrozenRows(1);
  }
  var timestampIndex = SELECT_VALUES.indexOf('Timestamp') || false;
  // Delete values that are older than PURGE_AFTER days
  var nowMilliseconds = Date.now();
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
      .getValues();
  var bulkDeletionRows = [];
  var bulkDeletionCounter = -1;
  var last = -2;
  for (var i = 0, lenI = values.length; i < lenI; i++) {
    if (!timestampIndex) {
      break;
    }
    if (values[i][timestampIndex] && values[i][timestampIndex]) {
      // Ugly date parsing here, as we prevent Spreadsheets date parsing magic
      var date = values[i][timestampIndex].toString();
      var dateMilliseconds = Date.parse(
          date.substring(0, 4) + '/' +
          date.substring(4, 6) + '/' +
          date.substring(6, 8));
      if (nowMilliseconds - dateMilliseconds > PURGE_AFTER) {
        // If the rows are non-sequential, we need a new bulk deletion bucket
        if (i - last > 1) {
          bulkDeletionCounter++;
          bulkDeletionRows[bulkDeletionCounter] = [];
        }
        bulkDeletionRows[bulkDeletionCounter].push(i + 2);
        last = i;
      }
    }
  }
  // Reverse, so that we delete from the bottom up so that indices remain valid
  bulkDeletionRows.reverse();
  bulkDeletionRows.forEach(function(bulkDeletionBucket) {
    var bucketLength = bulkDeletionBucket.length;
    Logger.log('Deleting old rows from ' + bulkDeletionBucket[0] + '–' +
        bulkDeletionBucket[bucketLength - 1]);
    sheet.deleteRows(bulkDeletionBucket[0], bucketLength);
  });
  // Write new values
  var rows = [];
  var processedItems = remoteStorage.getItem(now) || {};
  for (var i = 0, lenI = results.length; i < lenI; i++) {
    var result = results[i];
    var cid = result.getCustomerId();
    processedItems[cid] = true;
    if (result.getError() !== null || result.getStatus() !== 'OK') {
      Logger.log(result.getError() || 'Error for ' + result.getCustomerId());
      continue;
    }
    if (result.getReturnValue() === 'undefined') {
      Logger.log('No results for ' + result.getCustomerId());
      continue;
    }
    Logger.log('Storing results for ' + result.getCustomerId());
    var lines = JSON.parse(result.getReturnValue());
    lines.forEach(function(line) {
      rows.push(line);
    });
  }
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
        .setValues(rows);
  }
  remoteStorage.setItem(now, processedItems);
  Logger.log('Done :-D');
}

/**
 * @author Thomas Steiner (tomac@google.com)
 * @license CC0 1.0 Universal (CC0 1.0)
 *
 * Provides a simple key-value storage API modeled closely after
 * the localStorage API in Web browsers, but tailored to AdWords Scripts.
 * AdWords Scripts, due to execution time limits published at
 * https://developers.google.com/adwords/scripts/docs/limits,
 * forces users to store the state of a given script using either labels
 * (https://developers.google.com/adwords/scripts/docs/tips#labels), or
 * some other mechanism. This script provides such mechanism.
 *
 * Usage:
 *
 * 1) Create a Spreadsheet and pass its URL to the constant SPREADSHEET_URL.
 *
 * 2) Copy and paste the script into your AdWords script. This exposes
 * a remoteStorage object with the following API:
 *
 * - remoteStorage.setItem('myKey', {value: 'my_value'});
 * - remoteStorage.getItem('myKey'); // returns {value: 'my_value'}
 * - remoteStorage.removeItem('myKey'); // removes the item with key 'myKey'
 * - remoteStorage.getLength(); // returns 0
 * - remoteStorage.clear();
 *
 * Note: unlike with localStorage, you do not need to JSON.parse/stringify
 * the values, the script takes care of this.
 */
var remoteStorage = (function() {
  'use strict';
  var spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = spreadsheet.getSheetByName('_remoteStorage') !== null ?
      spreadsheet.getSheetByName('_remoteStorage') :
      spreadsheet.insertSheet('_remoteStorage');
  var length = sheet.getDataRange().getValues().length;
  return {
    getItem: function(key) {
      if (!key) {
        return;
      }
      key = key.toString();
      var values = sheet.getDataRange().getValues();
      for (var i = 0, lenI = values.length; i < lenI; i++) {
        var currentKey = values[i][0].toString();
        if (currentKey === key && values[i][1]) {
          return JSON.parse(values[i][1]);
        }
      }
      return null;
    },
    setItem: function(key, value) {
      if (!key || !value) {
        return;
      }
      key = key.toString();
      value = JSON.stringify(value);
      var values = sheet.getDataRange().getValues();
      for (var i = 0, lenI = values.length; i < lenI; i++) {
        var currentKey = values[i][0].toString();
        if (currentKey === key) {
          var range =  sheet.getRange(i + 1, 1, 1, 2);
          length++;
          return range.setValues([[key, value]]);
        }
      }
      length++;
      return sheet.appendRow([key, value]);
    },
    removeItem: function(key) {
      if (!key) {
        return;
      }
      key = key.toString();
      var values = sheet.getDataRange().getValues();
      for (var i = 0, lenI = values.length; i < lenI; i++) {
        var currentKey = values[i][0].toString();
        if (currentKey === key) {
          length--;
          return sheet.deleteRow(i + 1);
        }
      }
    },
    key: function(index) {
      var values = sheet.getDataRange().getValues();
      if (values[index][0]) {
        return values[index][0].toString();
      }
      return null;
    },
    clear: function() {
      sheet.clear();
      length = 0;
    },
    getLength: function() {
      return length;
    }
  };
})();