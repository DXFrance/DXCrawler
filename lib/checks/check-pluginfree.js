/**
 * Description: Looks for:
 *  1) Compatibility issues related to ActiveX plugins in the CV lists
 *  2) Any plugin or ActiveX control different than Flash or SVG
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

var cvlist = require('./compatlist.js'),
    Deferred = require('promised-io').Deferred,
    fs = require('fs'),
    path = require('path'),
    $ = require('cheerio');

var globaloptions = { allowFlash: true, allowSilverlight: true, allowOthers: false };

var options = null;

function getOptions() {
    if (options)
        return options;
    
    if (!!config.check_pluginfree_options) {
        options = config.check_pluginfree_options;
        return options;
    }
    
    return globaloptions;
}

var initiate = function (website, options) {
    options = options || getOptions();
    
    var deferred = new Deferred(),
        test = {
            testName: "pluginfree",
            passed: true,
            data: []
        };
    
    function removeItems(original, itemsToRemove) {
        var cleaned = [],
            remove;
        for (var i = 0; i < original.length; i++) {
            remove = true;
            for (var j = 0; j < itemsToRemove.length; j++) {
                if (original[i] === itemsToRemove[j]) {
                    remove = false;
                    break;
                }
            }
            if (remove) {
                cleaned.push(original[i]);
            }
        }
        
        return cleaned;
    }
    
    function countControls(elements, type) {
        var count = 0;
        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            if (element.type === type) {
                count += element.controls.length;
            }
        }
        
        return count;
    }
    
    cvlist.getList().then(function (list) {
        var resultWebsite = list[website.url.hostname.replace('-', '_').replace('www.', '')];
        
        if (resultWebsite && (resultWebsite.noFlash || (resultWebsite.featureSwitch && resultWebsite.featureSwitch === "requiresActiveX:true"))) {
            test.passed = false;
            test.data = { activex: !resultWebsite.noFlash, cvlist: true };
        } else {
            var elements = [];
            for (var i = 0; i < config.check_pluginfree_elements.length; i++) {
                var element = config.check_pluginfree_elements[i];
                
                elements.push({
                    selector: element.selector,
                    type: element.type,
                    controls: website.$(element.selector)
                });
            }
            
            var flashControls = countControls(elements, 'flash');
            var silverlightControls = countControls(elements, 'silverlight');
            var svgControls = countControls(elements, 'svg');
            var activeXControls = countControls(elements, 'other') - flashControls - silverlightControls - svgControls;
            
            if (flashControls > 0 && !options.allowFlash) {
                test.passed = false;
                test.data = { activex: true, cvlist: false, flash: true, controls: flashControls };
            } else if (silverlightControls > 0 && !options.allowSilverlight) {
                test.passed = false;
                test.data = { activex: true, cvlist: false, silverlight: true, controls: silverlightControls };
            } else if (activeXControls > 0 && !options.allowOthers) {
                test.passed = false;
                test.data = { activex: true, cvlist: false, controls: activeXControls };
            }
        }
        
        deferred.resolve(test);
    },
    function () {
        deferred.reject();
    });
    
    return deferred.promise;
};

module.exports.check = initiate;