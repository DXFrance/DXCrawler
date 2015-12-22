var batch = require('./lib/batch.js');
var config = require('../../../../lib/checks/config.js');
var fs = require('fs');
var parseArgs = require('minimist');
var http = require('http');
var os = require('os');

var argv;

if (process.env.ScanJob_Arguments)
    argv = parseArgs(process.env.ScanJob_Arguments.split(/\s+/));
else
    argv = parseArgs(process.argv.slice(2));

console.dir(argv);

var useazurestorage = false;
var useazureastarget = false;
var useazureassource = false;

if (!argv.target || argv.target == 'azure') {
    useazurestorage = true;
    useazureastarget = true;
    var azure = require('azure-storage');
}

if (!argv.source || argv.source == 'azure') {
    useazurestorage = true;
    useazureassource = true;
    var azure = require('azure-storage');
}

var issimulation = false;

if (argv.simulation) {
    var jsonresponse = JSON.stringify(require('./response.json'));
    issimulation = true;
}

if (!argv.file)
    if (argv.source == 'azure')
        argv.file = 'websites.csv';
    else
        argv.file = './websites.csv';


if (!argv.prefix && argv.azure)
    argv.prefix = 'http://sites-scanner.azurewebsites.net/api/v2/scan?url=http://';

if (!argv.prefix && argv.azuredev)
    argv.prefix = 'http://sites-scanner-dev.azurewebsites.net/api/v2/scan?url=http://';

if (!argv.prefix && argv.azuretest)
    argv.prefix = 'http://sites-scanner-test.azurewebsites.net/api/v2/scan?url=http://';

if (!argv.prefix)
    argv.prefix = config.prefix;

var machines = {};
var connections;

if (argv.connections)
    connections = argv.connections;
else
    connections = 20;

if (connections > http.globalAgent.maxSockets)
    http.globalAgent.maxSockets = connections;

var errorCount = 0;
var areas = [];
var ranks = [];
var drows = {};
var retryRows = {};
var nrows = 0;
var DUMP_RESULTS = 1000;

var tests = [
    //'browserbite',
    'browserDetection',
    'cssprefixes',
    //'inputTypes',
    //'responsive',
    //'touch',
    'edge',
    'jslibs',
    'markup',
    'pluginfree'
//    'altImg',
//    'ariaTags',
];

var prefix = argv.prefix;


var suffix = createSuffix(new Date());
var originalSuffix = suffix;

var outputResultsFile = 'results' + suffix + '.csv';
var outputErrorsFile = 'errors' + suffix + '.txt';
var summaryErrorsFile = 'summary' + suffix + '.csv';
var errors = "";


startRun = function () {
    errors = "";
    //Clean up output files before appending data
    fs.writeFileSync(outputResultsFile, "");
    fs.writeFileSync(outputErrorsFile, "");
    fs.writeFileSync(summaryErrorsFile, "");
    
    errorCount = 0;
    areas = [];
    ranks = [];
    drows = {};
    retryRows = {};
    nrows = 0;
    
    if (useazurestorage) {
        console.log('account name', config.storage_account_name);
        console.log('access key', config.storage_account_key);
    }
    
    if (useazureassource) {
        var blobSvc = azure.createBlobService(config.storage_account_name, config.storage_account_key);
        console.log('reading blob', argv.file);
        blobSvc.getBlobToText(config.website_list_container_name, argv.file, function (err, text, blockBlob, response) {
            if (err) {
                console.log(err);
                return;
            }
            
            var lines = text.trim().split('\r\n');
            determineProgress(lines);
        });
    }
    else {
        var lines = fs.readFileSync(argv.file, 'utf8').trim().split('\r\n');
        
        determineProgress(lines);
    }
}
startRun();

function createSuffix(date) {
    var dd = date.getDate();
    var mm = date.getMonth() + 1;//January is 0!`
    
    var yyyy = date.getFullYear();
    if (dd < 10)
        dd = '0' + dd;
    
    if (mm < 10)
        mm = '0' + mm;
    
    return mm + '-' + dd + '-' + yyyy + '_';
}

function saveDataToAzureFile(filename, data, callback) {
    // Append local file
    fs.appendFile(filename, data, function (err1) {
        if (!err1) {
            console.log("'" + filename + "' local file appended.");
            
            // Upload to blob storage from local file
            var blobSvc = azure.createBlobService(config.storage_account_name, config.storage_account_key);
            //Remark: this overwrites the blob with the latest update over and over again, instead of updating the blob?
            blobSvc.createBlockBlobFromLocalFile(config.website_list_container_name, filename, filename, function (err2) {
                if (!err2) {
                    console.log("'" + filename + "' blob uploaded.");
                } else {
                    console.log("error uploading '" + filename + "' blob. ", err2);
                }
                
                if (!!callback) {
                    callback();
                }
            });
        } else {
            console.log("error appending data to '" + filename + "' local file. ", err1);
        }
    });
}

function saveDataToFile(filename, data, callback) {
    if (useazureastarget) {
        saveDataToAzureFile(filename, data, callback);
        return;
    }
    
    fs.appendFileSync(filename, data);
    console.log(filename + " appended");
    
    if (!!callback) {
        callback();
    }
}

var starting;

function determineProgress(lines) {
    var progress = [];
    if (useazureassource) {
        var blobSvc = azure.createBlobService(config.storage_account_name, config.storage_account_key);
        var startDate = new Date();
        var endDate = new Date(startDate.getTime() - (10 * 24 * 60 * 60 * 1000)); //go back 10 days
        var currentDate = new Date(startDate.getTime());
        
        
        complete = function () {
            outputResultsFile = 'results' + suffix + '.csv';
            outputErrorsFile = 'errors' + suffix + '.txt';
            summaryErrorsFile = 'summary' + suffix + '.csv';
            
            
            console.log('reading blob to determine progress', outputResultsFile);
            blobSvc.getBlobToText(config.website_list_container_name, outputResultsFile, function (err, text, blockBlob, response) {
                if (err) {
                    console.log(err);
                    doLines(lines, progress);
                }
                else {
                    if (text) {
                        progress = text.trim().split('\n');
                        
                        for (var progressCounter = 0; progressCounter < progress.length; progressCounter++) {
                            var currentProgressLine = progress[progressCounter];
                            if (currentProgressLine) {
                                currentProgressLine = currentProgressLine.split(',')[2]; //'rank, area, url'
                                currentProgressLine = prefix + currentProgressLine
                                    .split('"').join('').split('\'').join(''); //current progress now has "somesite.com" with quotes around it?
                                progress[progressCounter] = currentProgressLine;
                            }
                        }
                           
                    }
                    doLines(lines, progress);
                }
            });
        };
        
        
        findLastIncompleteFile = function () {
            var previousSuffix = createSuffix(currentDate);
            blobSvc.doesBlobExist(config.website_list_container_name, 'completedresults' + previousSuffix + '.csv', function (err, result, response) {
                if (!err && result) {
                    //we have a completed file, just continue with the suffix kept at 'today'
                    console.log("We have a completed date at " + previousSuffix + ", so let's start fresh with today");
                    //Reset suffix, in case this 'run' finished an earlier run first;
                    suffix = originalSuffix;
                    doLines(lines, progress);
                }
                else {
                    blobSvc.doesBlobExist(config.website_list_container_name, 'results' + previousSuffix + '.csv', function (err2, result2, response2) {
                        if (!err2 && result2) {
                            //we have an incomplete results file, let's continue on this one!
                            console.log("We have a incomplete date at " + previousSuffix + ", so let's finish that up first!");
                            suffix = previousSuffix;
                            complete();
                        }
                        else {
                            //we have absolutely nothing for this date...
                            currentDate.setTime(currentDate.getTime() - (1 * 24 * 60 * 60 * 1000));
                            
                            //Let's check the day before, or
                            if (currentDate.getTime() >= endDate.getTime())
                                findLastIncompleteFile();
                            //Let's just roll with 'today'
                            else
                                complete();
                        }
                    });
                }
            });
        }
        
        console.log("Trying to determine which date to run...");
        findLastIncompleteFile();
    }
    else {
        progress = fs.readFileSync(argv.progressFile, 'utf8').trim().split('\n');
        
        doLines(lines, progress);
    }
}

function doLines(lines, progress) {
    console.log(lines.length + ' to analyze');
    console.log(progress.length + ' of those already analyzed');
    
    var websites = lines.map(function (line) {
        var split = line.split(",");
        var url = prefix + split[0];
        
        areas[url] = split[1];
        ranks[url] = split[2];
        
        return url;
    });
    
    starting = new Date();
    console.log('starting date/time', starting);
    console.log('processing ' + websites.length + ' sites');
    console.log('date/time', new Date());
    console.log('current free memory:' + os.freemem());
    
    
    if (useazurestorage) {
        var blobSvc = azure.createBlobService(config.storage_account_name, config.storage_account_key);
        
        blobSvc.createContainerIfNotExists(config.website_list_container_name, { publicAccessLevel: 'blob' }, function (error, result, response) {
            if (error)
                console.log(error);
            else {
                if (suffix === originalSuffix)
                    
                    doWork(websites, progress);
                else {
                    console.log("Downloading previous progress...");
                    blobSvc.getBlobToLocalFile(config.website_list_container_name, outputResultsFile, outputResultsFile, function (err1) {
                        if (err1)
                            console.log(err1);
                        else
                            fs.app
                        blobSvc.getBlobToLocalFile(config.website_list_container_name, outputErrorsFile, outputErrorsFile, function (err2) {
                            if (err2)
                                console.log(err2);
                            else
                                errors = fs.readFileSync(outputErrorsFile);
                            blobSvc.getBlobToLocalFile(config.website_list_container_name, summaryErrorsFile, summaryErrorsFile, function (err3) {
                                if (err3)
                                    console.log(err3);
                                doWork(websites, progress);
                            });
                        });
                    })
                };
            }
			//	
        });
    }
    else
        doWork(websites, progress);
}

function doWork(websites, progress) {
    function getComment(body) {
        if (body.results)
            return "N/A";
        
        var result = "";
        
        // remote site failure
        result += "WARNING - " + (body.statusCode ? "Remote site Status Code: " + body.statusCode : "");
        
        if (body.message) {
            if (result != "")
                result += " ";
            result += "Message: " + body.message;
        }
        
        // scanner failure
        if (typeof body == "string") {
            result = body;
        }
        
        if (result == "")
            result = "ERROR - Empty response from the Scan API";
        
        return result.replace(",", "").replace("\n", " ").replace("\r", " ");
    }
    
    function updateQuotes(value) {
        if (!!value && typeof value === 'string') {
            value = value.replace(/"/g, "'");
        }
        
        return value;
    }
    
    function truncateForExcel(value) {
        var MAX_CHARACTERS_PER_CELL = 5000;
        if (!!value && typeof value === 'string' && value.length > MAX_CHARACTERS_PER_CELL) {
            value = value.substring(0, MAX_CHARACTERS_PER_CELL);
        }
        
        return value;
    }
    
    function getDataObjectSummary(testResult, prefix) {
        var summary = "";
        if (!testResult.passed && !!testResult.data) {
            if (!!prefix) {
                summary += prefix + " ";
            }
            
            var semicolon = false;
            for (var property in testResult.data) {
                if (testResult.data.hasOwnProperty(property)) {
                    if (semicolon) {
                        summary += "; ";
                    }
                    
                    var value = testResult.data[property];
                    summary += "'" + property + "': '" + updateQuotes(Array.isArray(value) ? value.join(';') : value) + "'";
                    semicolon = true;
                }
            }
        }
        
        return summary;
    }
    
    function getDataArraySummary(testResult, prefix) {
        var summary = "";
        if (!testResult.passed && !!testResult.data) {
            var endline = false;
            for (var i = 0; i < testResult.data.length; i++) {
                if (endline) {
                    summary += "\n";
                }
                
                if (!!prefix) {
                    summary += prefix + " ";
                }
                
                var rule = testResult.data[i];
                var semicolon = false;
                for (var property in rule) {
                    if (rule.hasOwnProperty(property)) {
                        if (semicolon) {
                            summary += "; ";
                        }
                        
                        var value = rule[property];
                        summary += "'" + property + "': '" + updateQuotes(Array.isArray(value) ? value.join(';') : value) + "'";
                        semicolon = true;
                    }
                }
                
                endline = true;
            }
        }
        
        return summary;
    }
    
    function getBrowserDetectionTestSummary(testResult) {
        var summary = '"';
        if (!testResult.passed && !!testResult.data) {
            if (!!testResult.data.javascript) {
                var javaScriptSumary = getDataArraySummary(testResult.data.javascript, "[JavaScript]");
                summary += javaScriptSumary;
            }
            
            if (!!testResult.data.comments) {
                var commentsSumary = getDataObjectSummary(testResult.data.comments, "[Comments]");
                
                if (summary.length > 1 && commentsSumary.length > 0) {
                    summary += "\n";
                }
                
                summary += commentsSumary;
            }
        }
        
        summary = truncateForExcel(summary) + '"';
        
        return summary;
    }
    
    function getCssPrefixesTestSummary(testResult) {
        var summary = '"';
        if (!testResult.passed && !!testResult.data) {
            var endline = false;
            for (var i = 0; i < testResult.data.length; i++) {
                var rule = testResult.data[i];
                for (var j = 0; j < rule.selectors.length; j++) {
                    if (endline) {
                        summary += "\n";
                    }
                    
                    var selector = rule.selectors[j];
                    var semicolon = false;
                    for (var property in selector) {
                        if (selector.hasOwnProperty(property)) {
                            if (semicolon) {
                                summary += "; ";
                            } else {
                                summary += "'cssFile': '" + rule.cssFile + "'; ";
                            }
                            
                            var value = selector[property];
                            summary += "'" + property + "': '" + updateQuotes(Array.isArray(value) ? value.join(';') : value) + "'";
                            semicolon = true;
                        }
                    }
                    
                    endline = true;
                }
            }
        }
        
        summary = truncateForExcel(summary) + '"';
        
        return summary;
    }
    
    function getEdgeTestSummary(testResult) {
        return '"' + truncateForExcel(getDataObjectSummary(testResult)) + '"';
    }
    
    function getJsLibsTestSummary(testResult) {
        return '"' + truncateForExcel(getDataArraySummary(testResult)) + '"';
    }
    
    function getMarkupTestSummary(testResult) {
        if (!!testResult.passed && (!!testResult.excluded || !!testResult.transient)) {
            return testResult.data;
        }
        
        var summary = '"';
        if (!testResult.passed && !!testResult.data) {
            for (var i = 0; i < testResult.data.length; i++) {
                var rule = testResult.data[i];
                if (!rule.passed) {
                    if (summary.length > 1) {
                        summary += "\n";
                    }
                    
                    summary += "The number of '" + rule.element + "' element tags is different. Edge: " + rule.edgeCount + " and Chrome: " + rule.chromeCount + " (threshold: " + rule.threshold + ")";
                }
            }
        }
        
        summary = truncateForExcel(summary) + '"';
        
        return summary;
    }
    
    function getPluginFreeTestSummary(testResult) {
        return '"' + truncateForExcel(getDataObjectSummary(testResult)) + '"';
    }
    
    function getSummary(testName, testResult) {
        var summary = null;
        switch (testName) {
            case 'browserDetection':
                summary = getBrowserDetectionTestSummary(testResult);
                break;
            case 'cssprefixes':
                summary = getCssPrefixesTestSummary(testResult);
                break;
            case 'edge':
                summary = getEdgeTestSummary(testResult);
                break;
            case 'jslibs':
                summary = getJsLibsTestSummary(testResult);
                break;
            case 'markup':
                summary = getMarkupTestSummary(testResult);
                break;
            case 'pluginfree':
                summary = getPluginFreeTestSummary(testResult);
                break;
            default:
                summary = '""';
                break;
        }
        
        return summary;
    }
    
    function processData(data) {
        var content;
        
        try {
            
            var url = data.url.replace(prefix, "");
            
            if (data.skipped || (url && url.toLowerCase() === 'url')) {
                drows[data.url] = {
                    url: url,
                    skipped : true
                };
                nrows++;
            }
            else {
                
                var body;
                
                if (typeof data.body != 'undefined' && data.body.indexOf('{') < 0)
                    body = data.body;
                else
                    body = JSON.parse(data.body);
                
                if (body.machine) {
                    if (!machines[body.machine])
                        machines[body.machine] = 0;
                    machines[body.machine] = machines[body.machine] + 1;
                }
                
                var info = body.results;
                
                var comment = getComment(body);
                
                var row = {
                    rank: ranks[data.url], 
                    area: areas[data.url],
                    url: url,
                    tests: [],
                    summary: [],
                    comment: comment
                }
                
                tests.forEach(function (item) {
                    var testResult = "N/A";
                    var testSummary = "N/A";
                    if (info && info[item]) {
                        var result = info[item];
                        testResult = result.passed ? 1 : 0;
                        testSummary = getSummary(item, result);
                    }
                    
                    row.tests.push(testResult);
                    row.summary.push(testSummary);
                });
                
                console.log('Checked - ' + data.url);
                
                if (comment != "N/A" && comment) {
                    console.log(comment);
                    batch.onError(data.url, comment);
                    
                    if (comment.indexOf("ENOTFOUND") < 0 && data.url && !retryRows[data.url]) {
                        retryRows[data.url] = row;
                        console.log('To Retry', data.url);
                        batch.pushRequestPage(data.url);
                    }
                    else {
                        drows[data.url] = row;
                        nrows++;
                        delete retryRows[data.url];
                    }
                }
                else {
                    drows[data.url] = row;
                    nrows++;
                }
            }
            
            // dump partial results every DUMP_RESULTS checks
            if (!!nrows && nrows % DUMP_RESULTS == 0) {
                console.log('current free memory:' + os.freemem());
                
                var newresults = '';
                var newsummary = '';
                
                
                var firstRow = true;
                for (var n in drows) {
                    var row = drows[n];
                    if (firstRow) {
                        firstRow = false;
                        if (!row.skipped) {
                            if (nrows <= DUMP_RESULTS) {
                                newresults = 'rank,area,url,' + tests.join(',') + ',comments\n';
                                newsummary = 'rank,area,url,' + tests.join(',') + '\n';
                            }
                        }
                    }
                    
                    if (row.rank) {
                        newresults += row.rank + "," + row.area + "," + row.url + "," + row.tests.join(",") + "," + row.comment + "\n";
                        newsummary += row.rank + "," + row.area + "," + row.url + "," + row.summary.join(",") + "\n";
                    } else if (row.tests && row.summary) {
                        newresults += ",," + row.url + "," + row.tests.join(",") + "," + row.comment + "\n";
                        newsummary += ",," + row.url + "," + row.summary.join(",") + "\n";
                    }
                    delete drows[n];
                }
                if (newsummary)
                    saveDataToFile(summaryErrorsFile, newsummary);
                if (newresults)
                    saveDataToFile(outputResultsFile, newresults);
                
                newresults = null;
                newsummary = null;
            }
        } catch (err) {
            console.log(err);
            console.log("data");
            console.dir(data);
            
            var comment = err.toString().replace(",", "").replace("\n", " ").replace("\r", " ");
            
            if (!url && data.url)
                try {
                    url = data.url.replace(prefix, "");
                }
                catch (err) { }
            
            var row = {
                rank: ranks[data.url], 
                area: areas[data.url],
                url: url,
                tests: [],
                summary: [],
                comment: err.toString()
            }
            
            tests.forEach(function (item) {
                row.tests.push(0);
                row.summary.push("");
            });
            
            console.log('error - ' + data.url, err);
            batch.onError(data.url, err);
            
            if (data && data.body == '' && data.url && !retryRows[data.url]) {
                retryRows[data.url] = row;
                console.log('To Retry', data.url);
                batch.pushRequestPage(data.url);
            }
            else {
                drows[data.url] = row;
                nrows++;
                delete retryRows[data.url];
            }
        }
        
        content += '\n';
        return content;
    }
    
    batch.onFinish = function () {
        //Bugfix: if the last websites are in the 'retry' queue, the crawler calls finish
        //and these websites are not pushed to the results file.
        for (var n in retryRows) {
            var notRetried = retryRows[n];
            console.log(notRetried);
            drows[notRetried.url] = notRetried;
        }

        var ending = new Date();
        console.log('ending date/time', ending);
        
        saveDataToFile(outputErrorsFile, errors, function () {
            if (useazureastarget) {
                // Remove local file
                fs.unlinkSync(outputErrorsFile);
            }
        });
        
        var newresults = '';
        var newsummary = '';
        
        console.log(drows);

        var firstRow = true;
        for (var n in drows) {
            var row = drows[n];
            if (firstRow) {
                firstRow = false;
                if (!row.skipped) {
                    if (nrows <= DUMP_RESULTS) {
                        newresults = 'rank,area,url,' + tests.join(',') + ',comments\n';
                        newsummary = 'rank,area,url,' + tests.join(',') + '\n';
                    }
                }
            }
            
            if (row.rank) {
                newresults += row.rank + "," + row.area + "," + row.url + "," + row.tests.join(",") + "," + row.comment + "\n";
                newsummary += row.rank + "," + row.area + "," + row.url + "," + row.summary.join(",") + "\n";
            } else if (row.tests && row.summary) {
                newresults += ",," + row.url + "," + row.tests.join(",") + "," + row.comment + "\n";
                newsummary += ",," + row.url + "," + row.summary.join(",") + "\n";
            }
        }

        tryAndWrapUp = function () {
            if (originalSuffix != suffix) {
                console.log("That's all folks. I finished a previous run, perhaps you'd like to reschedule me to start with a fresh run for today");
                //startRun();
            }
            else {
                console.log("That's all folks!");
            }
        }

       
        
        saveDataToFile(summaryErrorsFile, newsummary, function () {
            if (useazureastarget) {
                // Remove local file
                fs.unlinkSync(summaryErrorsFile);

            }
        });
        saveDataToFile(outputResultsFile, newresults, function () {
            if (useazureastarget) {
                // Remove local file
                fs.unlinkSync(outputResultsFile);
                
                
                if (useazureastarget) {
                    console.log("Renaming file from results to completedresults");
                    
                    var blobSvc = azure.createBlobService(config.storage_account_name, config.storage_account_key);
                    var resultsUrl = blobSvc.getUrl(config.website_list_container_name, outputResultsFile);
                    blobSvc.startCopyBlob(resultsUrl, config.website_list_container_name, 'completedresults' + suffix + ".csv", function (err, result) {
                        tryAndWrapUp();
                    });
                }
                else {
                    tryAndWrapUp();
                }
            }
        });
        
        console.log('Errors: ' + errorCount);
        console.log('All websites finished. Thanks!');
        
        console.log('milliseconds', ending.getTime() - starting.getTime());
        console.log('current free memory:' + os.freemem());
        
        for (var n in machines)
            console.log('machine', n, machines[n]);
        
        
        console.log("Completely done with: " + suffix);
        
        
    };
    
    batch.onError = function (url, err) {
        errorCount++;
        console.log('error analyzing ' + url);
        errors += url + ", " + err.toString().replace(",", "").replace("\n", " ").replace("\r", " ") + "\n";
        
        // dump error results every 100 errors
        if (errorCount % 100 == 0) {
            saveDataToFile(outputErrorsFile, errors);
            errors = "";
        }
    };
    
    if (issimulation) {
        websites.forEach(function (website) {
            var data = { url: website, body: jsonresponse, skipped : false };
            processData(data);
        });
        
        batch.onFinish();
    }
    else
        batch.start(connections, websites, progress, function (data) {
            processData(data);
        });
}

