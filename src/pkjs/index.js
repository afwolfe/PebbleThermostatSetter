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

const DEBUG = 3;

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
        
        getThermostatValues(thermostatId).then(function(data) {
            var newTemperature,
                currentMode,
                characteristicType;
            if (data.hasOwnProperty(config.values.CurrentTemperature)) {
                newTemperature = data[config.values.CurrentTemperature] + (temperatureChange * 1.8);
            }
            if (data.hasOwnProperty(config.values.CurrentHeatingCoolingState)) {
                currentMode = data[config.values.CurrentHeatingCoolingState];
                if (config.modes.hasOwnProperty(currentMode)) {
                    var modeName = config.modes[currentMode];
                    switch (modeName) {
                        case "COOL":
                            characteristicType = config.values.TargetTemperature;
                            break;
                        case "HEAT":
                            characteristicType = config.values.TargetTemperature;
                            break;
                        case "AUTO": // TODO: Implement "AUTO handling" - watchapp needs to differentiate heating/cooling threshold.
                            break;
                        default: // OFF or unsupported mode.
                            // TODO: Return an error message?
                            break;
                    }

                    if (characteristicType) {
                        setTemperature(thermostatId, characteristicType, newTemperature).then(function(data) {
                            thermostatData.thermostatTemperature = encodeTemperature(newTemperature);
                            return thermostatData;
                        })
                        .catch(function(data) {
                            if (DEBUG > 0) { console.error("Error setting temperature."); }
                            thermostatData.thermostatName = "Error";
                            return thermostatData;
                        })
                        .finally(function() {
                            sendThermostatData(thermostatData);
                        });
                    }
                    else {
                        if (DEBUG > 0) { console.error("Mode not found: " + currentMode); }
                    }

                } else {
                    if (DEBUG > 0) { console.error("Mode not found: " + currentMode); }
                }
            }
            else {
                if (DEBUG > 0) { console.error("CurrentHeatingCoolingState not found in response."); }
            }
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

        getThermostatValues(thermostatId).then(function(data) {
            if (data.hasOwnProperty(config.values.CurrentHeatingCoolingState)) {
                currentMode = parseInt(data[config.values.CurrentHeatingCoolingState]);
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
                    return thermostatData;
                })
                .finally(function() {
                    sendThermostatData(thermostatData);
                });
            }
            else {
                if (DEBUG > 0) { console.error("mode not found in response data.")}
            }
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

// Gets the values object of a thermostat
// Resolve returns the temperature and other info.
// Reject returns a status code
function getThermostatValues(thermostatId) {
    var endpoint = prepareToCallEndpoint("getThermostat", thermostatId);

    var options = {
        url: baseUrl + endpoint.url,
        method: endpoint.method,
        headers: endpoint.headers
    };
    console.log(options.url);
    return new Promise(function(resolve, reject) {
        xhrPromise(options).then(
            function(data) { // resolve
                try {
                    var values = extractVariable(data, endpoint.values);
                    if (DEBUG > 0) { console.log("Thermostat " + thermostatId + " values: " + values); }
                    return resolve(values);
                }
                catch (e){
                    if (DEBUG > 0) {
                        console.error('Unable to get extract info for thermostat '
                            + thermostatId + ".\nError: " + e);
                        console.log("Response text: " + data);
                    }
                    return reject(data);
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

// Sets the temperature of a thermostat
function setTemperature(thermostatId, characteristicType, value){
    value = value.toFixed(1);
    var endpoint = prepareToCallEndpoint("setTemperature", thermostatId, characteristicType, value);
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
                    console.error('Unable to set temperature for thermostat ' + thermostatId + ".\Response: " + data);
                }
                return reject(data);
            }
        );
    });
}


// Sets the temperature of a thermostat
function setMode(thermostatId, mode){
    var endpoint = prepareToCallEndpoint("setMode", thermostatId, config.values.TargetHeatingCoolingState, mode);
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
                    console.error('Unable to set mode for thermostat ' + thermostatId + ".\nResponse: " + data);
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
        else {
            return resolve();
        }
    });
}

// Initializes the thermostat data with login response data
function initializeThermostatData(){
    loginIfNecessary().then(function() { // resolve login
        var thermostatsCount = thermostats.length;

        if (thermostatsCount > 0){
            for (var i = 0; i < thermostatsCount; i++){
                var thermostatData = {
                    "thermostatIndex": i,
                    "thermostatId": thermostats[i].id,
                    "thermostatName": thermostats[i].name,
                };

                getThermostatValues(thermostatData["thermostatId"]).then(
                    function(data) {
                        if (DEBUG > 1) { console.log("Sending thermostat to Pebble"); }
                        if (data.hasOwnProperty(config.values.TargetTemperature)) {
                            var targetTemperature = data[config.values.TargetTemperature];
                            thermostatData["thermostatTemperature"] = encodeTemperature(targetTemperature);
                        }
                        if (data.hasOwnProperty(config.values.CurrentTemperature)) {
                            var currentTemperature = data[config.values.CurrentTemperature];
                            thermostatData["currentTemperature"] = encodeTemperature(currentTemperature);
                        }
                        sendThermostatData(thermostatData);
                    })
                    .catch(function(data) {
                        if (DEBUG > 0) { console.error("Error getting thermostat information for " + thermostatData["thermostatId"]); }
                    });
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
function prepareToCallEndpoint(endpointName, thermostatId, characteristicType, bodyValue) {
    
    if (endpoints[endpointName]) {
        var tempEndpoint = endpoints[endpointName];
        // tempEndpoint.url = substituteVariable(tempEndpoint.url, thermostatId, temperature);
        // tempEndpoint.body = substituteVariable(tempEndpoint.body, thermostatId, temperature);
        if (endpointName != "login") {
            tempEndpoint.url = "/api/accessories/" + thermostatId;
        }

        if (characteristicType && bodyValue) {
            tempEndpoint.body = {
                "characteristicType": characteristicType,
                "value": bodyValue
            };
        }
        return tempEndpoint;
    } 
    else {
        if (DEBUG > 0) { console.error("Endpoint not found: " + endpointName); }
        return;
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
                    return resolve(data);
                } else { // Error returned
                    if (DEBUG > 0) { console.error(xhr.status); }
                    var data;
                    if (xhr.responseText) {
                        data = JSON.parse(xhr.responseText);
                    }
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