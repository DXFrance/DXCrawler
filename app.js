/*
 * Modern.IE main service; runs under node.js.
 *
 * Copyright (c) Microsoft Corporation; All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
 * file except in compliance with the License. You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * THIS CODE IS PROVIDED AS IS BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER
 * EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS
 * OF TITLE, FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABLITY OR NON-INFRINGEMENT.
 *
 * See the Apache Version 2.0 License for specific language governing permissions
 * and limitations under the License.
 */

"use strict";

var url = require('url'),
    fs = require('fs'),
    port = process.env.PORT || 1337,
    request = require('request'),
    express = require('express'),
    app = express(),
    cheerio = require('cheerio'),
    promises = require('promised-io/promise'),
    Deferred = require('promised-io').Deferred,
    promised = require("promised-io/promise"),
    cssLoader = require('./lib/checks/loadcss.js'),
    config = require('./lib/checks/config.js'),
    jsLoader = require('./lib/checks/loadjs.js'),
    tests = require('./lib/checks/loadchecks.js').tests,
    http = require('http'),
    csv = require('csv'),
    jslinq = require('jslinq'),
    path = require('path'),
    zlib = require('zlib'),
    sanitize = require('validator').sanitize,
    charset = 'utf-8',
    querystring = require('querystring'),
    http = require('http'),
    scanner = require('./lib/scanner'),
    azure = require('azure-storage');
request = request.defaults({
    followAllRedirects: true,
    encoding: null,
    jar: false,
    proxy: process.env.HTTP_PROXY || process.env.http_proxy,
    headers: {
        'Accept': 'text/html, application/xhtml+xml, */*',
        'Accept-Encoding': 'gzip,deflate',
        'Accept-Language': 'en-US,en;q=0.5',
        'User-Agent': config.user_agent
    }
}); //IE11

// Adjust the global agent maxSockets

if (http.globalAgent.maxSockets < 100)
    http.globalAgent.maxSockets = 100;

/**
 * Serializes a test results array and sends it via the response
 * @param {object} res The response to use to send the results
 * @param {Timestamp} start The start timestamp
 * @param {Array} resultsArray The results of all the tests
 * */
function sendResults(res, start, resultsArray, url) {
    var results = {};
    
    for (var i = 0; i < resultsArray.length; i++) {
        results[resultsArray[i].testName] = resultsArray[i];
    }
    res.writeHeader(200, {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff"
    });
    
    if (!url)
        url = (this && this.url && this.url.href) || 'http://private';
        
    var time = (Date.now() - start) / 1000;
    
    var result = { url: { uri: url }, processTime: time };
    
    if (process.env.WEBSITE_INSTANCE_ID)
        result.machine = process.env.WEBSITE_INSTANCE_ID;
        
    result.results = results;
        
    res.write(JSON.stringify(result));
    res.end();
    console.log('response', url, 'time', time);
}

/**
 * Responds with a bad request error
 * */
function sendBadRequest(res) {
    res.writeHeader(400, { "Content-Type": "text/plain" });
    res.write('Your package is malformed' + '\n');
    res.end();
}


/**
 * Responds with an internal server error
 * */
function sendInternalServerError(error, res) {
    res.writeHeader(/*500*/ 200 , { "Content-Type": "text/plain" });
    res.write(JSON.stringify(error) + '\n');
    res.end();
}

/**
 * Responds with the error and message passed as parameters
 * */
function remoteErrorResponse(response, statusCode, message, url) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write(JSON.stringify({ statusCode: statusCode, message: message }));
    response.end();
    
    if (url)
        console.log('error', url, message);
}

function sendError(error, res) {
    res.writeHeader(500 , { "Content-Type": "text/plain" });
    res.write(JSON.stringify(error) + '\n');
    res.end();
}

/*
 * Returns the CSV file of the website list
 */
function returnWebsites(req, res) {
    // TODO: get from azure storage

    


    var file = path.join(__dirname, "public", "websites.csv");
    fs.exists(file, function (exists) {
        if (!exists) {
            sendError("File not found", res);
        } else {
            parseCsv(req, res, file, false);
        }
    });
}

function returnScanResults(req, res) {
    var dir = "App_Data/jobs/triggered/scan2";
    var regex = new RegExp("^results(.*)-(.*)-(.*)_(.*)-(.*)-(.*).csv");
    
    // read "dir" and create an array with the files that match the given regex
    var files = fs.readdirSync(dir).filter(function (file) {
        return regex.test(file);
    });
    
    if (files.length > 0) {
        // sort files by date and then pick the most recent
        var file = files.sort(function (a, b) {
            var matchA = regex.exec(a);
            var dateA = new Date(matchA[1], matchA[2], matchA[3], matchA[4], matchA[5], matchA[6], 0);
            var matchB = regex.exec(b);
            var dateB = new Date(matchB[1], matchB[2], matchB[3], matchB[4], matchB[5], matchB[6], 0);
            return dateB - dateA;
        })[0];
        
        file = path.join(__dirname, dir, file);
        parseCsv(req, res, file, true);
    } else {
        sendError("File not found", res);
    }
}

function parseCsv(req, res, file, skipFirstRow) {
    var json = {};
    var data = [];
    csv()
        .from.stream(fs.createReadStream(file))
        .on('record', function (row) {
            data.push(row.map(function (e) { return e.trimLeft().trimRight() }));
        })
        .on('end', function () {
            json['draw'] = req.query.draw;
            var resultset = jslinq(data)
                            .select(function (item) { return item })
                            .items;
            resultset = skipFirstRow ? jslinq(resultset).skip(1).items : resultset;
            var filteredResultSet = resultset;
            if (req.query.search && req.query.search.value && req.query.search.value !== '') {
                var regex = new RegExp(req.query.search.value, "gi"); //ignore case
                filteredResultSet = jslinq(resultset)
                                    .where(function (array) {
                                        return array.some(function (item) { return regex.test(item); });
                                    })
                                    .items;
            }
            json['data'] = jslinq(filteredResultSet)
                            .skip(req.query.start)
                            .take(req.query.length)
                            .items;
            json['recordsTotal'] = resultset.length;
            json['recordsFiltered'] = filteredResultSet.length;
            res.write(JSON.stringify(json));
            res.end();
    });
}

function uploadFileToAzure(localPath, remoteFileName, options) {
    console.log("File to upload to Azure: " + localPath);
    
    var storageccountname = config.storage_account_name;
    var storageaccountkey = config.storage_account_key;
    var container = config.website_list_container_name;
    
    var blobSvc = azure.createBlobService(storageccountname, storageaccountkey);
    
    blobSvc.createBlockBlobFromLocalFile(container, remoteFileName, localPath, options, function (err, result, response) {
        if (err) {
            throw 'Could not upload file ' + localPath + ' to Azure.';
        }
    });
}

/**
 * Handles the upload of a CSV file (overwrites existing file)
 */
function handleCsvUpload(req, res) {
    var localPath = req.files.uploadCsv.path;
    var remoteFileName = 'websites.csv';
    var options = {
        contentType: 'text/csv',
        contentEncoding: 'utf-8',
        contentLanguage: 'en-us',
    };
    try {
        uploadFileToAzure(localPath, remoteFileName, options);
        // refresh page after successful upload
        res.redirect('/sites.html');
    } catch (e) {
        sendError(e);
    }
}

/**
 * Decides what action needs to be done: show the main page or analyze a website (version 2)
 * */
function handleRequestV2(req, response) {
    console.log(req.url);
    var requestUrl = url.parse(req.url),
        parameters = querystring.parse(requestUrl.query),
        urlToAnalyze = sanitize(decodeURIComponent(parameters.url)).xss(),
        user = sanitize(decodeURIComponent(parameters.user)).xss(),
        password = sanitize(decodeURIComponent(parameters.password)).xss(),
        deep = (parameters.deep && parameters.deep === 'true'),
        auth;
    
    
    if (!deep)
        deep = false;
    
    scanner.scan(urlToAnalyze, user, password, deep, function (err, data) {
        if (err) {
            remoteErrorResponse(response, err.statusCode ? err.statusCode : 'No response', err.message, urlToAnalyze);
            return;
        }
        
        sendResults(response, data.start, data.results, urlToAnalyze);
    });
}

// ## CORS middleware
//
// see: http://stackoverflow.com/questions/7067966/how-to-allow-cors-in-express-nodejs
var allowCrossDomain = function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
        res.send(204);
    }
    else {
        next();
    }
};
app.use(allowCrossDomain);
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/websites', returnWebsites);
app.get('/scanresults', returnScanResults);

app.post('/sites', handleCsvUpload);

app.get('/api/v2/scan', handleRequestV2);

app.get('/test', function (req, res) {
    res.write('test');
    res.end();
});

require('events').EventEmitter.defaultMaxListeners = 0;

var server = app.listen(port);
server.timeout = 480000;
console.log('Server timeout', server.timeout);

console.log('Server started on port ' + port);
console.log('To scan a private url go to http://localhost:' + port + '/ and follow the instructions');

module.exports.port = port;