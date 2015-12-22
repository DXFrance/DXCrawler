/**
 * Description: Check for most common libraries and frameworks to verify site is
 * using a version without known compatibility issues with IE9/10.
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

var Deferred = require('promised-io').Deferred;
var fs = require('fs');
var path = require('path');

var libconfig = null;
var libconfigfile = path.join(__dirname, 'check-libs.json');

if (fs.existsSync(libconfigfile))
    libconfig = require(libconfigfile);

function checkVersion(library, version) {
    var vinfo = {
        name: library.name,
        needsUpdate: true,
        minVersion: library.minVersion.major + library.minVersion.minor,
        version: version
    };

    if (library.patchOptional) {
        // If lib can have an implied ".0", add it when needed
        // match 1.17, 1.17b2, 1.17-beta2; not 1.17.0, 1.17.2, 1.17b2
        var parts = version.match(/^(\d+\.\d+)(.*)$/);
        if (parts && !/^\.\d+/.test(parts[2])) {
            version = parts[1] + ".0" + parts[2];
        }
    }
    
    vinfo.needsUpdate = compareVersions(version, vinfo.minVersion) == -1;

    if (library.bannedVersions)
        if (library.bannedVersions.indexOf(version) >= 0) {
            vinfo.bannedVersion = version;
            vinfo.needsUpdate = true;
        }

    return vinfo;
}

function defaultCheck(scriptText) {
    var version = scriptText.match(new RegExp(this.match, "m"));
    var result = version && checkVersion(this, version[1]);
    return result;
}

var libraries = [
    {
        name: "Prototype",
        minVersion: { major: "1.6.", minor: "1" },
        check: function (scriptText) {
            var version = scriptText.match(/Prototype JavaScript framework, version (\d+\.\d+\.\d+)/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "Dojo",
        minVersion: { major: "1.5.", minor: "3" },
        check: function (scriptText) {
            if (scriptText.indexOf('dojo') === -1) {
                return false;
            }

            var version = scriptText.match(/\.version\s*=\s*\{\s*major:\s*(\d+)\D+(\d+)\D+(\d+)/m);
            if (version) {
                return checkVersion(this, version[1] + "." + version[2] + "." + version[3]);
            }

            version = scriptText.match(/\s*major:\s*(\d+),\s*minor:\s*(\d+),\s*patch:\s*(\d+),/mi);
            return version && checkVersion(this, version[1] + "." + version[2] + "." + version[3]);
        }
    },
    {
        name: "Mootools",
        minVersion: { major: "1.2.", minor: "6" },
        check: function (scriptText) {
            var version = scriptText.match(/this.MooTools\s*=\s*\{version:\s*'(\d+\.\d+\.\d+)/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "SWFObject",
        minVersion: { major: "2.", minor: "1" },
        check: function (scriptText) {
            var version = scriptText.match(/\*\s+SWFObject v(\d+\.\d+)/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "jQuery Form Plugin",
        minVersion: { major: "3.", minor: "19" },
        check: function (scriptText) {
            var version = scriptText.match(/Form Plugin\s+\*\s+version: (\d+\.\d+)/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "Modernizr",
        minVersion: { major: "1.1.", minor: "" },
        check: function (scriptText) {
            // Static analysis. :(  The version is set as a local variable, far from
            // where Modernizr._version is set. Just see if we have a commment header.
            // ALT: look for /VAR="1.2.3"/ then for /._version=VAR/ ... ugh.
            var version = scriptText.match(/\*\s*Modernizr\s+(\d+\.\d+\.\d+)/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "jQuery cookie",
        minVersion: { major: "1.3.", minor: "1" },
        patchOptional: false,
        check: function (scriptText) {
            var version = scriptText.match(/\*\s*jQuery Cookie Plugin v(\d+\.\d+\.\d+)/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "hoverIntent",
        minVersion: { major: "1.8.", minor: "0" },
        patchOptional: false,
        check: function (scriptText) {
            var version = scriptText.match(/\*\s*hoverIntent v(\d+\.\d+\.\d+)/m);
            if (version) {
                return version && checkVersion(this, version[1]);
            }
            
            version = scriptText.match(/\*\s*hoverIntent r(\d)/m);
            return version && checkVersion(this, "1." + version[1] + ".0");
        }
    },
    {
        name: "jQuery Easing",
        minVersion: { major: "1.3.", minor: "0" },
        patchOptional: true,
        check: function (scriptText) {
            var version = scriptText.match(/\*\s*jQuery Easing v(\d+\.\d+)\s*/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "underscore",
        minVersion: { major: "1.0.", minor: "0" },
        patchOptional: false,
        check: function (scriptText) {
            var version = scriptText.match(/exports._(?:.*)?.VERSION="(\d+.\d+.\d+)"/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "hammer js",
        minVersion: { major: "2.0.", minor: "2" },
        patchOptional: false,
        check: function (scriptText) {
            if (scriptText.indexOf("hammer.input") !== -1) {
                var version = scriptText.match(/.VERSION\s*=\s*['|"](\d+.\d+.\d+)['|"]/m);
                return version && checkVersion(this, version[1]);
            }

            return false;
        }
    },
    {
        name: "jQuery Superfish",
        minVersion: { major: "1.7.", minor: "4" },
        patchOptional: false,
        check: function (scriptText) {
            var version = scriptText.match(/jQuery Superfish Menu Plugin - v(\d+.\d+.\d+)"/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "jQuery mousewheel",
        minVersion: { major: "3.1.", minor: "12" },
        patchOptional: true,
        check: function (scriptText) {
            var version = scriptText.match(/.mousewheel={version:"(\d+.\d+.\d+)/);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "jQuery mobile",
        minVersion: { major: "1.4.", minor: "3" },
        patchOptional: true,
        check: function (scriptText) {
            var version = scriptText.match(/.mobile,{version:"(\d+.\d+.\d+)/);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "jQuery UI",
        minVersion: { major: "1.8.", minor: "24" },
        check: function (scriptText) {
            var version = scriptText.match(/\.ui,[\s\r\n]*\{[\s\r\n]*version:\s*"(\d+.\d+.\d+)/m);
            return version && checkVersion(this, version[1]);
        }
    },
    {
        name: "jQuery",
        minVersion: { major: "1.6.", minor: "4" },
        patchOptional: true,
        check: function (scriptText) {
            //We search the version in the header
            //Explanation: Some libraries have things like: Requires: jQuery v1.7.1 (cycle, for example)
            //We are matching regex that contain jQuery vx.y.z but do not have : right before jQuery
            var regex = /(?:jQuery\s*v)(\d+.\d+.\d+)\s/g;
            var version = regex.exec(scriptText);
            if (version) {
                var isPluginRegExp = new RegExp('(?::\\s*)' + version[0], 'g');

                if (!isPluginRegExp.exec(scriptText)) {
                    return checkVersion(this, version[1]);
                }
            }

            var version = scriptText.match(/jquery:\s*"([^"]+)/);
            if (version) {
                return checkVersion(this, version[1]);
            }

            //If header fails, we look with another pattern
            var regex = /(?:jquery[,\)].{0,200}=")(\d+\.\d+)(\..*?)"/gi;
            var results = regex.exec(scriptText);
            version = results ? (results[1] + (results[2] || "")) : null;

            return version && checkVersion(this, version);
        }
    }
];

var original_libraries = libraries;

if (libconfig)
    libraries = mergeConfig(libraries, libconfig);

function mergeConfig(libraries, libconfig) {
    var newlibraries = [];
    var libmap = { };

    libraries.forEach(function (library) {
        var newlibrary = {};

        for (var n in library)
            newlibrary[n] = library[n];

        if (library.name)
            libmap[library.name] = newlibrary;

        newlibraries.push(newlibrary);
    });

    libconfig.forEach(function (config) {
        if (!config.name)
            return;

        if (!libmap[config.name]) {
            config.check = defaultCheck;
            newlibraries.push(config);
            libmap[config.name] = config;
            return;
        }

        for (var n in config)
            libmap[config.name][n] = config[n];
    });

    return newlibraries;
}

function checkScript(js, website) {
    var status = {
        passed: true,
        data: null
    };

    // See if this script has any of our known libraries
    for (var i = 0; i < libraries.length; i++) {
        var lib = libraries[i],
            result;

        if (lib.skip)
            continue;

        if (js.jsUrl !== "embed") {
            result = lib.check.call(lib, js.content || "");
            if (result && result.needsUpdate) {
                var pos = website.content.indexOf(js.jsUrl),
                    lineNumber = website.content.substr(0, pos).split('\n').length;
                result.url = js.jsUrl;
                result.lineNumber = lineNumber;
                status.data = result;
                status.passed = false;
                break;
            }
        }
    }

    return status;
}

// base for this function was https://gist.github.com/TheDistantSea/8021359
function compareVersions(version1, version2) {
    if (typeof version1 !== 'string' || typeof version1 !== 'string') {
        return NaN;
    }

    var v1 = version1.split(".");
    var v2 = version2.split(".");
   
    v1 = v1.map(Number);
    v2 = v2.map(Number);

    function isValidPart(x) {
        return (/^\d+$/).test(x);
    }

    if (!v1.every(isValidPart) || !v2.every(isValidPart)) {
        return NaN;
    }

    for (var i = 0; i < v1.length; ++i) {
        if (v2.length == i) {
            return 1;
        }
        
        if (v1[i] == v2[i]) {
            continue;
        }
        else if (v1[i] > v2[i]) {
            return 1;
        }
        else {
            return -1;
        }
    }

    if (v1.length != v2.length) {
        return -1;
    }

    return 0;
}

var check = function (website) {
    var deferred = new Deferred();

    // Let the main loop run before we do this work
    process.nextTick(function () {
        var test = {
                testName: "jslibs",
                url: website.url.href,
                passed: true,
                data: []
            },
            result;

        for (var i = 0; i < website.js.length; i++) {
            result = checkScript(website.js[i], website);

            if (!result.passed) {
                test.passed = false;
                test.data.push(result.data);
            }
        }

        deferred.resolve(test);
    });

    return deferred.promise;
};

// this export is just for unit testing, can be removed when bulletproof
module.exports.checkCompareVersions = compareVersions;

module.exports.check = check;
module.exports.merge = function (config) {
    if (config) {
        libraries = mergeConfig(original_libraries, config);
        return libraries;
    }

    libraries = original_libraries;

    return libraries;
}
