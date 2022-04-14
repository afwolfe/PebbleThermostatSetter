// const Clay = require('pebble-clay');
// const messageKeys = require('message_keys');

// const clayConfig = require('./config.json');
// const clay = new Clay(clayConfig);
var Promise = require('bluebird');
// require('./polyfills/string');

const config = require("./config.js");

// Command Enums
const COMMAND_TEMP_CHANGE = 0;
const COMMAND_MODE_CHANGE = 1;

const DEBUG = 0;

var baseUrl,
    savedToken,
    thermostats,
    endpoints,
    modes;


// Called as soon as application is ready. It initializes data.
Pebble.addEventListener("ready", function(e) {
    baseUrl = config.baseUrl;
    thermostats = config.thermostats;
    endpoints = config.endpoints;
    modes = config.modes;

    if (DEBUG > 0) { console.log("Initializing thermostat data ..."); }
    initializeThermostatData();
});

// Receives a message from the watch with data to change temperature
Pebble.addEventListener("appmessage", function(e) {
    var msg = e.payload;
    if (msg.hasOwnProperty("command")) {
        if (msg.command == COMMAND_TEMP_CHANGE && msg.hasOwnProperty("temperatureChange") && msg.hasOwnProperty("thermostatIndex")) {
            var temperatureChange = parseInt(msg.temperatureChange),
                thermostatIndex = parseInt(msg.thermostatIndex);
    
            changeTemperature(thermostatIndex, temperatureChange);
        }
        else if (msg.command == COMMAND_MODE_CHANGE && msg.hasOwnProperty("thermostatIndex")) {
            var thermostatIndex = parseInt(msg.thermostatIndex);
            changeMode(thermostatIndex);
        }
    }
    else if (DEBUG > 0) { console.error("Command key not found"); }
});

// Changes the temperature of a thermostat adding temperatureChange to
// its current temperature. Returns error in case of failure.
function changeTemperature(thermostatIndex, temperatureChange){
    if (DEBUG > 0) { console.log("Requesting temperature change: " + temperatureChange + ", for thermostat: " + thermostatIndex); }
    
    var thermostatId = thermostats[thermostatIndex].id;
    loginIfNecessary().then(function(){
        var thermostatData = {"thermostatIndex": thermostatIndex};
        
        getTemperature(thermostatId).then(function(data) {
            var newTemperature = data.temperature + (temperatureChange / 1.8);
            
            setTemperature(thermostatId, newTemperature).then(function(data) {
                thermostatData.thermostatTemperature = encodeTemperature(newTemperature);
            })
            .catch(function(data) {
                if (DEBUG > 0) { console.error("Error setting temperature."); }
                thermostatData.thermostatName = "Error";
            })
            .finally(function() {
                sendThermostatData(thermostatData);
            });
        })
        .catch(function(data) { // reject getTemperature
            if (DEBUG > 0) { console.error("Error getting temperature."); }
            thermostatData.thermostatName = "Error";
            sendThermostatData(thermostatData);
        });
    });
}

function changeMode(thermostatIndex){
    if (DEBUG > 0) { console.log("Requesting mode change for thermostat: " + thermostatIndex); }
    
    var thermostatId = thermostats[thermostatIndex].id;
    loginIfNecessary().then(function(){
        var thermostatData = {"thermostatIndex": thermostatIndex};

        getMode(thermostatId).then(function(data) {
            var currentMode = parseInt(data.mode);
            var numModes = Object.keys(modes).length;
            var nextMode = (currentMode + 1) % numModes;
            setMode(thermostatId, nextMode).then(function(data) { 
                thermostatData.thermostatMode = modes[nextMode];
                return thermostatData;
            })
            .catch(function(data) {
                if (DEBUG > 0) { console.error("Error setting mode."); }
                thermostatData.thermostatMode = modes[currentMode];
                thermostatData.thermostatName = "Error";
                return thermostatData
            })
            .finally(function() {
                sendThermostatData(thermostatData);
            });
        })
        .catch(function(data) {
            if (DEBUG > 0) { console.error("Error getting mode."); }
            thermostatData.thermostatName = "Error";
            sendThermostatData(thermostatData);
        });
    });
}

// sends thermostat data to the Pebble
function sendThermostatData(thermostatData) {
    if (thermostatData.hasOwnProperty("thermostatIndex")) {
        if (DEBUG > 1) { console.log("Sending data to Pebble."); }
        if (!thermostatData.hasOwnProperty("thermostatName")) {
            // If name isn't specified (previous error)
            thermostatData["thermostatName"] = thermostats[thermostatData.thermostatIndex].name;
        }
        if (thermostatData.hasOwnProperty("thermostatId")) { // Never send ID
            delete thermostatData.thermostatId;
        }
        Pebble.sendAppMessage(thermostatData);
    }
}

// Gets the temperature of a thermostat
// Resolve returns the temperature
// Reject returns a status code
function getTemperature(thermostatId) {
    var endpoint = prepareToCallEndpoint("getTemperature", thermostatId);

    var options = {
        url: baseUrl + endpoint.url,
        method: endpoint.method,
        headers: endpoint.headers
    };
    return new Promise(function(resolve, reject) {
        xhrPromise(options).then(
            function(data) { // resolve
                try {
                    var temperature = extractVariable(data, endpoint.value);
                    if (DEBUG > 0) { console.log("Thermostat " + thermostatId + " current temperature: " + temperature); }
                    return resolve({"temperature": temperature});
                }
                catch (e){
                    if (DEBUG > 0) {
                        console.error('Unable to get current temperature for thermostat '
                            + thermostatId + ".\nError: " + e);
                        console.log("Response text: " + data);
                    }
                    return reject({"status" : 400});
                }
            },
            function(data) { // reject
                return reject(data);
        });
    });
}


// Gets the temperature of a thermostat
// Resolve returns the temperature
// Reject returns a status code
function getMode(thermostatId) {
    var endpoint = prepareToCallEndpoint("getMode", thermostatId);

    var options = {
        url: baseUrl + endpoint.url,
        method: endpoint.method,
        headers: endpoint.headers
    };
    return new Promise(function(resolve, reject) {
        xhrPromise(options).then(
            function(data) { // resolve
                try {
                    var mode = extractVariable(data, endpoint.value);
                    if (DEBUG > 0) { console.log("Thermostat " + thermostatId + " current mode: " + modes[mode]); }
                    return resolve({"mode": mode});
                }
                catch (e){
                    if (DEBUG > 0) {
                        console.error('Unable to get current mode for thermostat '
                            + thermostatId + ".\nError: " + e);
                        console.log("Response text: " + data);
                    }
                    return reject({"status" : 400});
                }
            },
            function(data) { // reject
                return reject(data);
        });
    });
}

// Sets the temperature of a thermostat
function setTemperature(thermostatId, temperature){
    var endpoint = prepareToCallEndpoint("setTemperature", thermostatId, temperature);
    var options = {
        url: baseUrl + endpoint.url,
        body: endpoint.body,
        method: endpoint.method,
        headers: endpoint.headers
    };

    return new Promise(function(resolve, reject) {
        xhrPromise(options).then(
            function(data) { // resolve
                if (DEBUG > 0) { console.log("Temperature updated!"); }
                return resolve(data);
            },
            function(data) { // reject
                if (DEBUG > 0) {
                    console.error('Unable to set temperature for thermostat ' + thermostatId + ".\nError: " + data.status);
                }
                return reject(data);
            }
        );
    });
}


// Sets the temperature of a thermostat
function setMode(thermostatId, mode){
    var endpoint = prepareToCallEndpoint("setMode", thermostatId, mode);
    var options = {
        url: baseUrl + endpoint.url,
        body: endpoint.body,
        method: endpoint.method,
        headers: endpoint.headers
    };

    return new Promise(function(resolve, reject) {
        xhrPromise(options).then(
            function(data) { // resolve
                if (DEBUG > 0) { console.log("Mode updated!"); }
                return resolve(data);
            },
            function(data) { // reject
                if (DEBUG > 0) {
                    console.error('Unable to set mode for thermostat ' + thermostatId + ".\nError: " + data.status);
                }
                return reject(data);
            }
        );
    });
}

// Logs in into the login endpoint and stores the token
function loginIfNecessary(){
    return new Promise(function(resolve, reject) {
        if (!savedToken && endpoints.hasOwnProperty("login")) {
            if (DEBUG > 0) { console.log("Logging in"); }
            var endpoint = prepareToCallEndpoint("login");
            var options = {
                url: baseUrl + endpoint.url,
                body: endpoint.body,
                method: endpoint.method,
                headers: endpoint.headers,
            };
            xhrPromise(options).then(
                function(data) { // resolve
                    if (DEBUG > 0) { console.log("Logged in successfully."); }
                    savedToken = "Bearer " + extractVariable(data, endpoint.value);
                    if (DEBUG > 2) { console.log(savedToken); }
                    return resolve();
                },
                function(data) { // reject
                    if (DEBUG > 0) { console.error("Failed to login: " + data.status); }
                    return reject();
                }
            );
        }
        return resolve();
    });
}

// Initializes the thermostat data with login response data
function initializeThermostatData(){
    loginIfNecessary().then(
        function() { // resolve login
        var thermostatsCount = thermostats.length;

        if (thermostatsCount > 0){
            for (var i = 0; i < thermostatsCount; i++){
                var thermostat = {
                    "thermostatIndex": i,
                    "thermostatId": thermostats[i].id,
                    "thermostatName": thermostats[i].name,
                };

                // Get the target (desired) temperature per each thermostat and
                // send the data for each thermostat to the watch at 1 second intervals
                setTimeout(function(thermostatData) {
                        getTemperature(thermostatData["thermostatId"]).then(
                            function(data) {
                                if (DEBUG > 1) { console.log("Sending thermostat to Pebble"); }
                                thermostatData["thermostatTemperature"] = encodeTemperature(data.temperature);
                                sendThermostatData(thermostatData);
                            });
                }.bind(null,thermostat), 1000);
            }
        }
        else {
            if (DEBUG > 0) { console.error("No thermostats found."); }
        }
    });
}

// Converts temperature to string and adds symbol °
function encodeTemperature(temperature){
    return convert("c", "f", temperature).toFixed(0) + "\u00B0"; // Unicode for °
}

// Substitutes the variables in the endpoint and returns the updated endpoint object.
function prepareToCallEndpoint(endpointName, thermostatId, bodyValue) {
    
    if (endpoints[endpointName]) {
        var tempEndpoint = endpoints[endpointName];
        // tempEndpoint.url = substituteVariable(tempEndpoint.url, thermostatId, temperature);
        // tempEndpoint.body = substituteVariable(tempEndpoint.body, thermostatId, temperature);
        if (endpointName == "getTemperature" || endpointName == "setTemperature" || endpointName == "getMode" || endpointName == "setMode") {
            tempEndpoint.url = "/api/accessories/" + thermostatId
        }

        if (endpointName == "setTemperature") {
            tempEndpoint.body = {
                "characteristicType": "TargetTemperature",
                "value": bodyValue
            }
        }
        else if (endpointName == "setMode") {
            tempEndpoint.body = {
                "characteristicType": "TargetHeatingCoolingState",
                "value": bodyValue
            }
        }
        return tempEndpoint;
    } 
}

// FIXME: replace/replaceAll does not exist. Polyfills not working?
function substituteVariable(str, thermostatId, temperature) {
    if (thermostatId) {
        // str = str.replaceAll("${ThermostatId}", thermostatId);
        str = str.replace("${ThermostatId}", thermostatId);
    }
    // TODO: Update for mode/temperature.
    if (temperature) {
        // str = str.replaceAll("${TargetTemperature}", temperature);
        str = str.replace("${TargetTemperature}", temperature);
    }
    return str;
}

// Given a json data object and a . separated variable path,
// Iterate over the variable path to get the value.
function extractVariable(data, variable) {
    try {
        var variable_split = variable.split(".")
            for (var j in variable_split) {
            data = data[variable_split[j]];
            }
        if (data) {
            if (DEBUG > 1) { console.log("Found variable " + variable + " in response"); } 
        }
    }
    catch (e) {
        if (DEBUG > 0) { console.error("Failed to extract variable" + variable + " from response."); } 
    }
    return data;
}

// Basic temperature conversion function.
function convert(from, to, temperature) {
    if (from.toLowerCase() === "c") {
        if (to.toLowerCase() === "f") {
            return temperature * 1.8 + 32;
        }
        else if (to.toLowerCase() === "k") {
            return temperature + 273.15;
        }
    }
    if (from.toLowerCase() === "f") {
        if (to.toLowerCase() === "c") {
            return (temperature - 32) / 1.8;
        }
        else if (to.toLowerCase() === "k") {
            return convert(from, "c", temperature) + 273.15;
        }
    }
    return temperature;
}


// A helper function to make XHRs using Promises.
function xhrPromise(options) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();

        var method = (options.method || 'GET').toUpperCase(),
        headers = options.headers,
        body = options.body,
        params = options.params,
        url = options.url + (method === 'GET' && params ? '?' + params : '');

        xhr.addEventListener("readystatechange", function () {
            if (xhr.readyState === 4) {
                if (DEBUG > 2) { console.debug(method, url, xhr.status); }
                var data;
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (xhr.responseText) {
                        data = JSON.parse(xhr.responseText);
                    }
                    resolve(data);
                } else { // Error returned
                    if (DEBUG > 0) { console.error(xhr.status); }
                    data = {"status": xhr.status};
                    if (savedToken) {
                        savedToken = null;
                    }
                    return reject(data);
                }
            }
        });

        xhr.addEventListener("timeout", function () {
            data = {"status": 408};
            return reject(data);
        });

        xhr.open(method, url);
        xhr.timeout = 5000;

        // Set headers
        if (headers){
            Object.keys(headers).forEach(function(key){
                if (DEBUG > 2 ) { console.log("Setting header: {"+ key + " : " + headers[key] + "}"); }
                xhr.setRequestHeader(key, headers[key]);
            });
        }
        if (savedToken) {
            if (DEBUG > 2) { console.log("Setting Authorization header with stored token."); }
            xhr.setRequestHeader("Authorization", savedToken);
        }

        if (body) {
            if (DEBUG > 2 ) { console.log(JSON.stringify(body)); }
            xhr.send(JSON.stringify(body));
        }
        else {
            xhr.send();
        }
    });
}