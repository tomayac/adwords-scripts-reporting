AdWords Scripts Reporting
=========================

This project allows you to easily get started with AdWords
[My Client Center](http://www.google.com/adwords/myclientcenter/) (MCC)
cross-account reports using [AdWords Scripts](https://developers.google.com/adwords/scripts/)
and with the full expressive power of the
[AdWords Query Language](https://developers.google.com/adwords/api/docs/guides/awql) (AWQL).

Setup Guide
===========

* Log in to the MCC account for which you want to create the cross-account report.
* Using this account, create a [new Google spreadsheet](https://docs.google.com/spreadsheet/).
* In [AdWords](https://adwords.google.com/), navigate to "Bulk operations" → "Scripts",
and click "Create script".
* Paste the contents of the file ```mcc_cross_account_report.js``` into the scripts editor.
* Paste the URL of the spreadsheet from step 1 at the beginning of the script: 
```javascript
// Store the output here
var SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/ABCdefGHIjklMNOpqrSTUvwxYZ/edit';
```
* Fill in the desired AWQL ```SELECT``` fields, respecting the
[report guidelines](https://developers.google.com/adwords/api/docs/appendix/reports)
for your desired report type:
```javascript
// AWQL query
var SELECT_VALUES = [
  'ExternalCustomerId',
  'AccountDescriptiveName',
  'Clicks',
  'Impressions'
];
```
* Fill in the rest of the AWQL query, again respecting the
[report guidelines](https://developers.google.com/adwords/api/docs/appendix/reports)
for your desired report type:
```javascript
var REPORT_QUERY = 'SELECT ' + SELECT_VALUES.join(', ') + ' ' +
    'FROM   ACCOUNT_PERFORMANCE_REPORT ' +
    'WHERE  Clicks > 0 ' +
    'DURING LAST_30_DAYS';
```
* (Optional) Old rows in the spreadsheet will be auto-purged after ```n``` days,
so that the spreadsheet does not overflow with data. Adapt ```n``` accordingly:
```javascript
var PURGE_AFTER = 30 /* days */ * (24 * 60 *  60 * 1000) /* in milliseconds */;
```

Deployment Instructions
=======================

After setting up the script according to the guide above,
it is time to test it:

* Make a test-run of the script in
[Preview mode](https://developers.google.com/adwords/scripts/docs/concepts/preview)
by clicking "Preview".
* If all goes well, you should see logging output on the script console and data in the spreadsheet.
* If you get an error, the most likely case is that your AWQL query is invalid
  according to the [report guidelines](https://developers.google.com/adwords/api/docs/appendix/reports). 

If you are happy with the script's output, delete all data in the spreadsheet
and schedule the script to run *hourly*. This is important, as we can only process
[50 accounts per run](https://developers.google.com/adwords/scripts/docs/limits#mcc_scripts).

* On the Scripts page in the "Actions" column, click "+ Create schedule" next to the just created script. 
* In the drop-down box next to "Frequency", choose *hourly*. The script will process all accounts
  and stop once all accounts are done.
* Click "Save" and you are ready to go.

Possible Errors
===============

If the reports per account take longer than
[60 minutes](https://developers.google.com/adwords/scripts/docs/limits#mcc_scripts)
to generate, the script will get interrupted. Simplify your AWQL query in this case.

For all other errors, check the [errors](https://developers.google.com/adwords/scripts/docs/concepts/errors)
section of the AdWords Scripts documentation.

License
=======
Copyright 2014 Thomas Steiner (tomac@google.com)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
