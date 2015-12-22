/**
 * Description: Test the JavaScript library version detection.
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

var checklibs = require('../lib/checks/check-libs.js'),
    url = require('url'),
    request = require('request'),
    cheerio = require('cheerio'),
    jsloader = require('../lib/checks/loadjs.js'),
    testServer = require('../static/test-server.js'),
    testUrl = 'http://localhost:' + testServer.port + '/libs-';


function checkPage(page, test, expected, config) {
    var uri = testUrl + page,
        dataKeys = [],
        tests = 1;
    
    if (expected.data) {
        dataKeys = Object.keys(expected.data[0]);
        tests += dataKeys.length * expected.data.length;
    }
    
    test.expect(tests);
    
    request(uri, function (error, response, content) {
        var website = {
            url: url.parse(uri),
            content: content,
            $: cheerio.load(content)
        };
        
        if (config)
            checklibs.merge(config);
        
        jsloader.loadjsFiles(website)
            .then(checklibs.check)
            .then(function (result) {
            test.equal(result.passed, expected.passed, uri + " " + result.data.join("\n"));
            if (expected.data) {
                for (var i = 0; i < expected.data.length; i++) {
                    for (var key in expected.data[i]) {
                        test.equal(result.data[i] ? result.data[i][key] : null, expected.data[i][key], uri + " " + (result.data[i] ?result.data[i][key] : null));
                    }
                }
            }
            
            if (config)
                checklibs.merge(null);
            
            test.done();
        });
    });
}

function checkCompareVersions(test, expected, data) {
    test.equal(checklibs.checkCompareVersions(data.v1, data.v2), expected);
    test.done();
}


module.exports['JS Libraries'] = {
    '1.7.1 < 1.7.10': function (test) {
        checkCompareVersions(test, -1, {
            v1: "1.7.1",
            v2: "1.7.10"
        });
    }, 
    '1.7.10 > 1.7.1': function (test) {
        checkCompareVersions(test, 1, {
            v1: "1.7.10",
            v2: "1.7.1"
        });
    },
    '1.8 == 1.8': function (test) {
        checkCompareVersions(test, 0, {
            v1: "1.8",
            v2: "1.8"
        });
    },
    '1.8 > 1.5.10': function (test) {
        checkCompareVersions(test, 1, {
            v1: "1.8",
            v2: "1.5.10"
        });
    },
    '1.10.2 > 1.1.10': function (test) {
        checkCompareVersions(test, 1, {
            v1: "1.10.2",
            v2: "1.1.10"
        });
    },
    'jQuery - latest version': function (test) {
        checkPage('1.html', test, {
            passed: true
        });
    },
    'jQuery - 1.4.2': function (test) {
        checkPage('2.html', test, {
            passed: false,
            data: [
                {
                    lineNumber: 7,
                    version: "1.4.2",
                    minVersion: "1.6.4"
                }
            ]
        });
    },
    'dojo - latest version': function (test) {
        checkPage('3.html', test, { passed: true });
    },
    'dojo - v1.5.0': function (test) {
        checkPage('4.html', test, {
            passed: false,
            data: [
                {
                    lineNumber: 7,
                    version: "1.5.0",
                    minVersion: "1.5.3"
                }
            ]
        });
    },
    'jQuery UI - latest version': function (test) {
        checkPage('5.html', test, { passed: true });
    },
    'jQuery UI - v1.8.20': function (test) {
        checkPage('16.html', test, {
            passed: false,
            data: [
                {
                    lineNumber: 7,
                    version: "1.8.20",
                    minVersion: "1.8.24"
                }
            ]
        });
    },    
    'jQuery UI - v1.9.0': function (test) {
        // Validates that 1.9.0 > minVersion of 1.8.24
        checkPage('6.html', test, { passed: true });
    },
    'jQuery UI - v1.9.0 min': function (test) {
        checkPage('7.html', test, { passed: true });
    },
    'jQuery & dojo up to date': function (test) {
        checkPage('8.html', test, {
            passed: true
        });
    },
    'jQuery up to date & dojo v 1.5.1': function (test) {
        checkPage('9.html', test, {
            passed: false,
            data: [
                {
                    lineNumber: 8,
                    version: "1.5.1",
                    minVersion: "1.5.3"
                }
            ]
        });
    },
    'jQuery 1.4.2 & dojo v 1.7.0': function (test) {
        checkPage('10.html', test, {
            passed: false,
            data: [
                {
                    lineNumber: 7,
                    version: "1.4.2",
                    minVersion: "1.6.4"
                },
                {
                    lineNumber: 8,
                    version: "1.5.1",
                    minVersion: "1.5.3"
                }
            ]
        });
    },
    'several libraries updated': function (test) {
        checkPage('12.html', test, {
            passed: true
        });
    },
    'several libraries updated but banned version': function (test) {
        checkPage('12.html', test, {
            passed: false,
            data: [
                {
                    version: "1.4.1",
                    bannedVersion: "1.4.1",
                    name: "jQuery cookie"
                }
            ]
        },
        [
            {
                name: "jQuery cookie",
                bannedVersions: [
                    "1.4.1"
                ]
            }
        ]
        );
    },
    'several libraries outdated': function (test) {
        checkPage('13.html', test, {
            passed: false,
            data: [
                {
                    version: "1.3.0",
                    minVersion: "1.3.1",
                    name: "jQuery cookie"
                },
                {
                    version: "3.1.10",
                    minVersion: "3.1.12",
                    name: "jQuery mousewheel"
                },
                {
                    version: "1.7.0",
                    minVersion: "1.8.0",
                    name: "hoverIntent"
                },
                {
                    version: "1.4.2",
                    minVersion: "1.4.3",
                    name: "jQuery mobile"
                },
                {
                    version: "2.0.1",
                    minVersion: "2.0.2",
                    name: "hammer js"
                }
            ]
        });
    },
    'several libraries outdated skip jQuery cookie': function (test) {
        checkPage('13.html', test, {
            passed: false,
            data: [
                {
                    version: "3.1.10",
                    minVersion: "3.1.12",
                    name: "jQuery mousewheel"
                },
                {
                    version: "1.7.0",
                    minVersion: "1.8.0",
                    name: "hoverIntent"
                },
                {
                    version: "1.4.2",
                    minVersion: "1.4.3",
                    name: "jQuery mobile"
                },
                {
                    version: "2.0.1",
                    minVersion: "2.0.2",
                    name: "hammer js"
                }
            ]
        },
        [
            {
                name: "jQuery cookie",
                skip: true
            }
        ]
        );
    },
    'several libraries outdated with config': function (test) {
        checkPage('14.html', test, {
            passed: false,
            data: [
                {
                    version: "1.3.0",
                    minVersion: "1.3.1",
                    name: "jQuery cookie"
                },
                {
                    version: "3.1.10",
                    minVersion: "3.1.12",
                    name: "jQuery mousewheel"
                },
                {
                    version: "1.7.0",
                    minVersion: "1.8.0",
                    name: "hoverIntent"
                },
                {
                    version: "1.4.2",
                    minVersion: "1.4.3",
                    name: "jQuery mobile"
                },
                {
                    version: "2.0.1",
                    minVersion: "2.0.2",
                    name: "hammer js"
                },
                {
                    version: "1.2.3",
                    minVersion: "1.2.4",
                    name: "mytools"
                }
            ]
        },
        [
            {
                name: "mytools",
                match: "mytools.(\\d+\\.\\d+\\.\\d+)",
                minVersion: { major: "1.2.", minor: "4" }
            }
        ]          
        );
    },
    // Unit test for issue #16 (https://github.com/deltakosh/DXCrawler/issues/16)
    // Tests both compiled & minified version of Bootstrap 3.3.5 which previously caused a
    // false negative scan (detected as out dated jQuery)
    'Boostrap 3.3.5': function (test) {
        checkPage('15.html', test, {
            passed: true
        });
    }  
};