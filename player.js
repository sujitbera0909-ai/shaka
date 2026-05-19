// player.js - Minimalist HLS m3u8 video player
// (C) 2021-2024 Richard Stam, SigmaFxDx Software
console.log("Hello player.js!");
var video = document.getElementById('video');
var helpLink = document.getElementById('helpLink');
var urlObj, siteParam;
var firstM3u8, lastM3u8, m3u8Count = 0;
var clickOption, dblClickOption, showPlayerTooltips;
var playingMonitorInterval = 500;
var monitorStallEnabled = true;
var monitorStallTimeout = 20000;
var monitorSetIntervalId = null;
var playingStartTime = null;
var playingStopTime = null;
var elapsedWaitTime = null;
var videoPlayingPos = null;
var isPlaying = false;

var clickActions = {
    "PausePlay": togglePlayPause,
    "MuteUnmute": toggleMuteUnmute,
    "Fullscreen": toggleFullscreen,
    "OptionsPage": loadSettingsPage,
};
//#region Play m3u8
function playM3u8(url) {
    //console.log("playM3u8 url =", url);
    if(Hls.isSupported()) {
        video.volume = 0.7;
        var hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED,function() {
            video.muted = false;
            video.play();
        });
        hls.on(Hls.Events.ERROR, async (event, data) => {
            if (data.fatal) {
                if (data.type == Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                } else if (data.type == Hls.ErrorTypes.NETWORK_ERROR) {
                    //console.log('Hls fatal error details, data =', data.details, data);
                    loadSettingsPage(data, true);
                } else hls.destroy();
            } 
        });
    }
}
function loadSettingsPage(data = {}, replace = true) {
    var urlHashParts = window.location.href.split("#");
    var settingsUrlStr = urlHashParts.shift().replace("player.html", "settings.html");
    if (data.details) {
        settingsUrlStr += settingsUrlStr.indexOf("?") < 0 ? "?" : "&";
        settingsUrlStr += "error=" + data.details;
    }
    if (urlHashParts.length > 0) settingsUrlStr += "#" + urlHashParts.join("#");
    //alert("loadSettingsPage settingsUrlStr = " + settingsUrlStr);
    if (replace) location.replace(settingsUrlStr); else location.assign(settingsUrlStr);
}
//#endregion

//#region Utility Functions
function doClickOptions(clickAction) {
    //console.log("doClickOptions clickAction =", clickAction);
    if (clickActions[clickAction]) clickActions[clickAction]();
}
function togglePlayPause() { 
    if (video.paused) video.play(); else video.pause();
}
function toggleMuteUnmute() {
    video.muted = !video.muted;
}
async function toggleFullscreen() {
    //console.log("toggleFullscreen fullscreenElement =", document.fullscreenElement);
    let result = false;
    try {
        if(!document.fullscreenElement) {
            result = await document.body.requestFullscreen(); //video
        } else {
            result = await document.exitFullscreen();
        }
    } catch(ex) { /*console.log("ERROR: toggleFullscreen Exception =", ex);*/ }
    //console.log("toggleFullscreen result =", result);
    return result;
}
function getVideoSize() {
    let newSize = parseInt(localStorage.getItem("videoSize"));
    video.style.height = newSize + "%";
    video.style.width = newSize + "%";
    return newSize;
}
function setVideoSize(newSize = parseInt(video.style.height)) {
    video.style.height = newSize + "%";
    video.style.width = newSize + "%";
    localStorage.setItem("videoSize", newSize);
    return newSize;
}
function copyToClipboard(copyText) {
    var inputElement = document.createElement("input");
    if (inputElement) {
        inputElement.value = copyText; 
        document.body.appendChild(inputElement);
        inputElement.focus(); 
        inputElement.select();
        document.execCommand('copy');
        inputElement.parentNode.removeChild(inputElement);
        //console.log("copyToClipboard done =", inputElement.value);
    }
}
function setSiteTitle() {
    var title = "m3u8";
    if (siteParam) {
        let pathnames = stripProtocol(siteParam).split("?")[0].split("/");
        title = pathnames.pop() || pathnames.pop();
        let siteHome = pathnames.join("/");
        if (siteHome) title += " @ " + siteHome;
    }
    document.title = "Playing " + title;
    setVideoTooltip();
    return title;
}
function setVideoTooltip() {
    var tooltip = document.title;
    tooltip += siteParam ? "\n" + siteParam : "";
    video.title = showPlayerTooltips ? tooltip : "";
    return tooltip;
}
function stripProtocol(urlString) {
    var pos = urlString.indexOf("://");
    return pos ? urlString.substring(pos + 3) : urlString;
}
function checkEncodedURL(str) {
    var isEncoded = (str && str.indexOf("%3A%2F%2F") >= 0);
    return isEncoded ? decodeURIComponent(str) : str;
}
function doSiteReload() {
    if (siteParam) window.location.replace(siteParam);
    else window.location.reload();
}
//#endregion

//#region Video Monitor
function startMonitor() {
    console.log("startMonitor Date/Time =", (new Date).toLocaleString());
    monitorSetIntervalId = setInterval(
        () => monitorFunction(), playingMonitorInterval
    );
};
function stopMonitor() {
    if (monitorSetIntervalId) {
        clearInterval(monitorSetIntervalId);
        monitorSetIntervalId = null;
    }
}
function monitorFunction() {
    isPlaying = getIsPlaying();
    //console.log("monitorFunction isPlaying =", isPlaying);
    if (isPlaying) {
        if (!playingStartTime) playingStartTime = new Date();
        var playingPos = video.currentTime; 
        if (playingPos == videoPlayingPos) isPlaying = false;
        else videoPlayingPos = playingPos;
        if (playingStopTime) {
            var dateTime = new Date();
            elapsedWaitTime = dateTime - playingStopTime;
            console.log("monitorPlaying elapsedTime =", elapsedWaitTime);
            playingStopTime = null;
        }
        if (isPlaying) return;
    }
    if (video.paused) return;
    var dateTime = new Date();
    if (!playingStopTime) console.log("monitorNotPlaying time =", dateTime.toLocaleTimeString());
    if (!playingStopTime) playingStopTime = dateTime;
    elapsedWaitTime = dateTime - playingStopTime;
    if (!monitorStallEnabled || elapsedWaitTime < monitorStallTimeout) return;
    console.log("monitorNotPlaying STALLED elapsedWaitTime =", elapsedWaitTime);
    loadSettingsPage({details: "STALLED"}, true);
}
function getIsPlaying() {
    //console.log("getIsPlaying video =", video);
    if (!video) return false;
    var isPlaying = !!(video.currentTime > 0 && !video.paused 
        && !video.ended && video.readyState > 2);
    //console.log("getIsPlaying isPlaying =", isPlaying);
    return isPlaying;
}
//#endregion

//#region Message Handlers
async function sendToAllTabs(message = {}) {
    if (chrome && chrome.runtime) {
        let allTabs = await chrome.tabs.query({});
        allTabs.forEach(tab => { sendMessageToTab(message, tab); }); //??? await
    }
}
async function sendMessageToTab(message, tabObj) {
    //console.log("sendMessageToTab tabObj =", tabObj);
    if (!tabObj) return;
    var response = {};
    if (chrome && chrome.runtime) {
        try { response = await chrome.tabs.sendMessage(tabObj.id, message);
        } catch (err) { /*console.log("sendMessageToTab exception = ", err);*/ }
        //console.log("sendMessageToTab response = ", response);
    }
    return response ?? {};
}
async function sendClearRedirectMessage() {
    //console.log("player.js sendClearRedirectMessage...");
    //var message = {"command": "clearRedirectHistory", "text":snifferUtils.redirectTag} //???
    try { await chrome.runtime.sendMessage({"command":"clearRedirectHistory"});
    } catch (err) { /*console.log("player.js sendClearRedirectMessage exception = ", err);*/ }
}
async function sendMessage(message = {}) {
    //console.log("player.js sendMessage message =", message);
    try { var result = await chrome.runtime.sendMessage(message);
    } catch (err) { /*console.log("player.js sendMessage exception = ", err);*/ }
    //console.log("player.js sendMessage result =", result);
    return result;
}

if (chrome && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        //console.log("player.js onMessage message =", message);
        var response = null;
        switch (message.command) {
            case "updatePlayerStatus":
                if (message.requestM3u8) {
                    lastM3u8 = message.requestM3u8;
                    m3u8Count++;
                }
                break;
            case "updatePlayerSettings":
                //console.log("player.js updatePlayerSettings message =", message);
                if (message.hasOwnProperty("showPlayerTooltips")) {
                    showPlayerTooltips = message.showPlayerTooltips;
                    setVideoTooltip();
                }
                if (message.hasOwnProperty("monitorStallEnabled")) {
                    monitorStallEnabled = message.monitorStallEnabled;
                    monitorStallTimeout = message.monitorStallTimeout;
                    setVideoTooltip();
                }
                break;
            case "PopUpRefreshData":
                response = { firstM3u8, lastM3u8, m3u8Count, siteUrl:siteParam};
                break;
        }
        if (response) {
            //console.log("onMessage sendResponse response =", response);
            sendResponse(response);
        }
        //return true; // Needed if sendResponse is called asynclly
    });
}
//#endregion

//#region Event Handlers
video.addEventListener("fullscreenchange", function(event) {
    video.focus();
});
video.addEventListener("click", function(event) {
    event.preventDefault();
});
video.addEventListener("dblclick", function(event) {
    event.preventDefault();
    //event.stopPropagation();
    //event.stopImmediatePropagation();
});
window.addEventListener("click", function(event) {
    //console.log("player.js click event =", event);
    doClickOptions(clickOption);
});
window.addEventListener("dblclick", function(event) {
    //console.log("player.js dblclick event =", event);
    doClickOptions(dblClickOption);
});
window.addEventListener("contextmenu", function(event) {
    //console.log("player.js contextmenu event =", event);
    if (event.buttons > 0) {
        event.preventDefault();
        loadSettingsPage();
    }
});

let touchstartX = 0, touchStartTime = null;
window.addEventListener('touchstart', event => {
    //console.log("player.js touchstart event =", event);
    let touchCount = event.targetTouches.length;
    //console.log("player.js touchend touchCount =", touchCount);
    if (touchCount == 3) loadSettingsPage();
    else if (touchCount == 1) {
        let timeDelta = event.timeStamp - touchStartTime;
        //console.log("player.js touchend timeDelta =", timeDelta);
        if (timeDelta < 250) doClickOptions(dblClickOption);
    }
    touchStartTime = event.timeStamp;
    touchstartX = event.changedTouches[0].screenX;
}, {passive: false});

window.addEventListener('touchend', event => {
    //console.log("player.js touchend event =", event);
    let touchendX = event.changedTouches[0].screenX;
    let swipeDelta = touchendX - touchstartX;
    //console.log("player.js touchend swipeDelta =", swipeDelta);
    //alert("player.js touchend swipeDelta = " + swipeDelta);
    if (swipeDelta == 0) doClickOptions(clickOption);
    else if (swipeDelta < -120) loadSettingsPage();
    else if (swipeDelta > 120) history.back();
}, {passive: false});

window.addEventListener("keydown", function(event) {
    //console.log("player.js keydown event = ", event);
    let key = event.key, code = event.code;
    //console.log("player.js keydown key, code =", key, code);

    if (code == "KeyP" || code == "Space") {
        if (video.paused) video.play(); else video.pause();
    }
    if (code == "KeyZ" || code == "Enter") {
        event.preventDefault();
        toggleFullscreen();
    }
    if (code == "KeyM" || code == "KeyQ") {
        video.muted = !video.muted;
    }
    if (code == "KeyC") {
        let copyText = event.shiftKey ? siteParam : firstM3u8;
        if (copyText) copyToClipboard(copyText)
    }
    if (key == "[" || key == "]") {
        let delta = key == "[" ? -2 : 2;
        let newSize = parseInt(video.style.height) + delta;
        if (newSize < 50) newSize = 50;
        if (newSize > 100) newSize = 100;
        setVideoSize(newSize);
    }
    if (code == "KeyW") {
        setVideoSize(100);
    }
    if (code == "KeyT" && event.altKey && event.shiftKey) {
        showPlayerTooltips = !showPlayerTooltips;
        //console.log("keydown showPlayerTooltips = ", showPlayerTooltips)
        localStorage.setItem("showPlayerTooltips", showPlayerTooltips);
        sendToAllTabs({command:"updatePlayerSettings", showPlayerTooltips});
        setVideoTooltip();
    }
    if (code == "KeyS" || code == "Backspace") {
        event.preventDefault();
        loadSettingsPage();
    }
    if (key == "Cancel" /*|| event.ctrlKey && code == "KeyC"*/) {
        event.preventDefault();
        loadSettingsPage({details:"User Break"});
    }
    if (key == "F1") {
        event.preventDefault();
        helpLink.click();
    }
    if (key == "F5") {
        event.preventDefault();
        doSiteReload();
    }
    if (event.key == "?") {
    }
});
video.addEventListener("keydown", function(event) {
    if (event.code == "Space") {
        event.preventDefault();
        event.stopPropagation();
    }
    if (event.altKey) {
        if (event.code == "ArrowLeft" || event.code == "ArrowRight") {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }
});
video.textTracks.addEventListener('addtrack', (event) => {
    //console.log("player.js addtrack event =", event);
    for (const track of event.target) {
        if (track.mode == "showing") {
            if (!track.defaultMode) track.defaultMode = track.mode;
            track.mode = "hidden";
        }
    }
});
//#endregion

//#region Page Load
window.addEventListener('load', async (event) => {
if (chrome) sendClearRedirectMessage(); //??? await
    video = document.getElementById('video');
    urlObj = new URL(window.location.href);
    //console.log("player.js window load urlObj =", urlObj);
    siteParam = checkEncodedURL(urlObj.searchParams.get("site"));
    //console.log("player.js window load siteParam =", siteParam);
    if (siteParam) document.title = siteParam.split("://")[1];
    firstM3u8 = urlObj.hash.substring(1);
    if (!firstM3u8) {
        if (!siteParam) {
            console.log("player.js window load error =", "No video source specified.");
            //loadSettingsPage({details:"No video source specified"}, true);
            return;
        }
        doSiteReload(); 
    }
    if (!firstM3u8.startsWith("http")) { //goo gle_vig nette#, etc
        console.log("player.js load got not http firstM3u8 =", firstM3u8);
        firstM3u8 = firstM3u8.indexOf("http") < 0 ? "" : firstM3u8.substring(pos);
    }
    lastM3u8 = firstM3u8; m3u8Count++;
    monitorStallEnabled = (localStorage.getItem("monitorStallEnabled") ?? "true") == "true";
    monitorStallTimeout = localStorage.getItem("monitorStallTimeout") ?? 20000;
    clickOption = localStorage.getItem("clickOption") ?? "Nothing";
    dblClickOption = localStorage.getItem("dblClickOption") ?? "MuteUnmute";
    showPlayerTooltips = (localStorage.getItem("showPlayerTooltips") ?? "false") == "true";
    getVideoSize();
    setSiteTitle();
    playM3u8(firstM3u8);
    startMonitor();
});
//#endregion
