/**
 * Description: Downloads the Microsoft CV lists, which we query during testing to see
 * if a website has to be run in compat mode or has any ActiveX/Flash issues.
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

var config = require('./config.js'),
    fs = require('fs'),
    request = require('request'),
    xml2js = require('xml2js'),
    parser = new xml2js.Parser(),
    nodeCache = require('node-cache'),
    cvListCache = new nodeCache({ stdTTL: 86400 }), // 1 day
    Deferred = require('promised-io').Deferred,
    ready,
    cvlist = {},
    creationStamp,
    expiration = 86400000; //1 day in milliseconds

request = request.defaults({
    jar: false,
    proxy: process.env.HTTP_PROXY || process.env.http_proxy,
    headers: {
        'Accept-Language': 'en-US,en;q=0.5',
        'User-Agent': config.user_agent_edge}});

function getCompatListUrl(ieversion) {
    // actually there is no need to check for other IE versions as this is the list to be compatible with.
    // we need a mechanism to sync this url with the CV list updates through IE Partner Outreach
    return config.compatlisturlEdgeDesktop;
}

function addExplicitFlashBlockedSites(result) {
    var array,
    domain;
    if (result.iecompatlistdescription && result.iecompatlistdescription.NoFlash) {
        array = result.iecompatlistdescription.NoFlash[0].domain;
        for (var i = 0; i < array.length; i++) {
            domain = array[i]._ || array[i];
            if (domain) {
                domain = domain.trim().replace('-', '_');
                if (cvlist[domain]) {
                    cvlist[domain].noFlash = true;
                } else {
                    cvlist[domain] = {
                        noFlash: true
                    };
                }
            }
        }
    }
}

function addExplicitFlashApprovalSites(result) {
    var array,
    domain;
    if (result.iecompatlistdescription && result.iecompatlistdescription.Flash) {
        array = result.iecompatlistdescription.Flash[0].domain;
        for (var i = 0; i < array.length; i++) {
            domain = array[i]._ || array[i];
            if (domain) {
                domain = domain.trim().replace('-', '_');
                if (cvlist[domain]) {
                    cvlist[domain].flash = true;
                } else {
                    cvlist[domain] = {
                        flash: true
                    };
                }
            }
        }
    }
}

function addCompatSites(result) {
    var array = result.iecompatlistdescription.domain;

    for (var i = 0; i < array.length; i++) {
        if (array[i]._) {
            cvlist[array[i]._.replace('-', '_')] = array[i].$;
        } else {
            cvlist[array[i]] = {};
        }
    }
}

function parseCvList(body, deferred, cvlist) {
    parser.parseString(body, function (err, result) {
        if (err) {
            deferred.reject(err);
            return;
        }
        
        addCompatSites(result);
        addExplicitFlashApprovalSites(result);
        addExplicitFlashBlockedSites(result);
        
        deferred.resolve(cvlist);
    });
}

function downloadCVlist(ieversion) {
    var deferred = new Deferred(),
        cvlistUrl = getCompatListUrl(ieversion);
    
    // cache the CV lists
    cvListCache.get(ieversion, function (err, value) {
        if (value == undefined) {
            request(cvlistUrl, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    cvListCache.set(ieversion, body);
                    parseCvList(body, deferred, cvlist);
                }
            });
        } else {
            deferred.resolve(cvlist);
        }
    });

    return deferred.promise;
}

function downloadCVlists() {
    var deferred = new Deferred();

    downloadCVlist('ie10')
        .then(function() {
            downloadCVlist('ie9');
        })
        .then(function() {
            deferred.resolve();
        });

    return deferred.promise;
}

function getList() {
    var deferred = new Deferred();
    ready = false;

    if (typeof cvlist === "object" && Object.keys(cvlist).length > 0 && Date.now() - creationStamp < expiration) {
        deferred.resolve(cvlist);
    } else {
        downloadCVlists().then(function() {
            deferred.resolve(cvlist);
        }, function(err) {
            deferred.reject(err);
        });
    }

    return deferred.promise;
}

module.exports.getList = getList;
