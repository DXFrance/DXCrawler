"use strict";

var request = require('request');
var websites,
	progress,
    i,
	callbacker,
	originalCallback,
    connections;

function onFinishWrap(){
    var counter = connections;

    onFinishWrap = function(){
        counter--;
        if(counter === 0){
            module.exports.onFinish();
        }
    };

    counter--;
    if(counter === 0){
        module.exports.onFinish();
    }
}

function onFinish() {
    console.log('finished processing all websites');
}

function onError(url, err) {
    console.log('Error - ' + url);
}

var getNext = function () {
    return websites[i++];
};

function requestPage(url, progress) {
	setTimeout(function () { 
		if (progress.filter(function (alreadyProgressedUrl) { return alreadyProgressedUrl === url; }).length) {
			console.log("Skipping a site since it has already been checked before - " + url);
			originalCallback({ url : url, skipped : true });
			var nextWebsite = getNext();
			if (typeof nextWebsite === 'undefined') {
				onFinishWrap();
				return;
			}
			
			requestPage(nextWebsite, progress);
		}
		else {			
			console.log('request page', url);
			request({ url: url, timeout: 480000}, callbacker(url));
		}
    }, 0);
}

function pushRequestPage(url) {
    websites.push(url);
};

function callbackWrapper(callback, progress) {
    return function (url) {
        return function (err, response, body) {
            if (err != null) {
                module.exports.onError(url, err);
            } else {
                callback({url: url, body: body, skipped : false});
            }

            var nextWebsite = getNext();
            if (typeof nextWebsite === 'undefined') {
                onFinishWrap();
                return;
            }

            requestPage(nextWebsite, progress);
        };
    };
}

function start(max, webs, prog, callback) {
	websites = webs;
	progress = prog;

    connections = Math.min(max, webs.length);
	callbacker = callbackWrapper(callback, prog);
	originalCallback = callback;

    for (i = 0; i < connections; i++)
        if (websites[i])
            requestPage(websites[i], progress);
}

module.exports = {
    start: start,
    onFinish: onFinish,
    onError: onError,
    requestPage: requestPage,
    pushRequestPage: pushRequestPage
}