// const Clay = require('pebble-clay');
// const messageKeys = require('message_keys');

// const clayConfig = require('./config.json');
// const clay = new Clay(clayConfig);
const config = require("./config.js");
const DEBUG = 3;

var baseUrl;
var savedToken = null;
var thermostats;
var endpoints;


// Called as soon as application is ready. It initializes data.
Pebble.addEventListener("ready", function(e) {
    baseUrl = config.baseUrl;
    thermostats = config.thermostats;
    endpoints = config.endpoints;

    console.log("Initializing thermostat data ...");
    initializeThermostatData();
});

// Receives a message from the watch with data to change temperature
Pebble.addEventListener("appmessage", function(e) {
    var temperatureChange = parseInt(e.payload.temperatureChange),
        thermostatIndex = parseInt(e.payload.thermostatIndex),
        thermostatId = e.payload.thermostatId;

    changeTemperature(thermostatId, temperatureChange, thermostatIndex);
});

// Changes the temperature of a thermostat adding temperatureChange to
// its current temperature. Returns error in case of failure.
function changeTemperature(thermostatId, temperatureChange, thermostatIndex){
    console.log("Requesting temperature change: " + temperatureChange
        + ", for thermostat: " + thermostatId);

    loginIfNecessary(function(){
        getTemperature(thermostatId, function(currentTemperature, success){
            var thermostatData = {"thermostatIndex": thermostatIndex},
                newTemperature;

            if (!success){
                thermostatData.thermostatName = "Error";
                Pebble.sendAppMessage(thermostatData);
                return;
            }

            newTemperature = currentTemperature + temperatureChange;

            setTemperature(thermostatId, newTemperature, function(success){
                if (success){
                    thermostatData.thermostatTemperature =
                            encodeTemperature(newTemperature);
                }
                else {
                    thermostatData.thermostatName = "Error";
                }

                Pebble.sendAppMessage(thermostatData);
            });
        })
    });
}

// Gets the temperature of a thermostat
function getTemperature(thermostatId, callback){
    var endpoint = prepareToCallEndpoint("getTemperature", thermostatId);
    ajaxCall({
        url: baseUrl + endpoint.url,
        method: endpoint.method,
        headers: endpoint.headers,
        callback: function(data){
            var success = true,
                temperature = 0;
                // response = this.responseText;

            try {
                // var data = JSON.parse(response);

                temperature = extractVariable(data, endpoint.value);
                console.log("Thermostat " + thermostatId
                    + " current temperature: " + temperature);
            }
            catch (e){
                console.error('Unable to get current temperature for thermostat '
                    + thermostatId + ". Error: " + e);
                console.log("Response text: " + data);
                success = false;
            }

            callback(temperature, success);
        }
    });
}

// Sets the temperature of a thermostat
function setTemperature(thermostatId, temperature, callback){
    var endpoint = prepareToCallEndpoint("setTemperature", thermostatId, temperature);
    ajaxCall({
        url: baseUrl + endpoint.url,
        method: endpoint.method,
        headers: endpoint.headers,
        callback: function(data){
            var response = this.responseText,
                success;

            try {
                success = response && JSON.parse(response).success;
                if (!success) {
                    throw response;
                }
                console.log("Temperature updated!");
            }
            catch (e){
                console.error('Unable to set temperature for thermostat '
                    + thermostatId + ". Error: " + e);
                success = false;
            }

            callback(success);
        }
    });
}

// Logs in into the login endpoint and stores the token
function loginIfNecessary(callback){
    if (savedToken === null && endpoints.hasOwnProperty("login")) {
        console.log("Logging in");
        var endpoint = prepareToCallEndpoint("login");
        ajaxCall({
            url: baseUrl + endpoint.url,
            body: endpoint.body,
            method: endpoint.method,
            headers: endpoint.headers,
            callback: function(data) {
                console.log("Logged in.");
                // var response = JSON.parse(this.responseText);
                savedToken = "Bearer " + extractVariable(data, endpoint.value);
                if (DEBUG > 2) { console.log(savedToken); }
            }
        });
    }

    callback();
}

// Initializes the thermostat data with login response data
function initializeThermostatData(){
    loginIfNecessary(function(){
        var thermostatsCount = thermostats.length;

        if (thermostatsCount > 0){
            // for (var i = 0; i < thermostatsCount; i++){
            //     var thermostat = {
            //         "thermostatIndex": i,
            //         "thermostatId": thermostats[i].id,
            //         "thermostatName": thermostats[i].name,
            //     };

                // Get the target (desired) temperature per each thermostat and
                // send the data for each thermostat to the watch at 1 second intervals
            setTimeout(function() {
                for (var i = 0; i < thermostatsCount; i++) {
                    var thermostat = {
                        "thermostatIndex": i,
                        "thermostatId": thermostats[i].id,
                        "thermostatName": thermostats[i].name,
                    };
                    getTemperature(thermostat["thermostatId"], function(temperature) {
                        thermostat["thermostatTemperature"] = encodeTemperature(temperature);
                        Pebble.sendAppMessage(thermostat);
                    });
                }
            }, 1000);
        }
        else {
            console.log("No thermostats found.");
        }
    });
}

// Parses the login call response. Returns the thermostats data if the
// call was successful. Otherwise returns the errors.

// Converts temperature to string and adds symbol °
function encodeTemperature(temperature){

    return convert("c", "f", temperature).toFixed(1) + "\u00B0"; // Unicode for °
}

// Substitutes the variables in the endpoint and returns the updated endpoint object.
function prepareToCallEndpoint(endpointName, thermostatId, temperature) {
    
    if (endpoints[endpointName]) {
        var tempEndpoint = endpoints[endpointName];
        // tempEndpoint.url = substituteVariable(tempEndpoint.url, thermostatId, temperature);
        if (endpointName == "getTemperature") {
            tempEndpoint.url = "/api/accessories/" + thermostatId
        }
        // tempEndpoint.body = substituteVariable(tempEndpoint.body, thermostatId, temperature);
        if (endpointName == "setTemperature") {
            tempEndpoint.body = {
                "characteristicType": "TargetTemperature",
                "value": temperature
            }
        }
        return tempEndpoint;
    } 
}

function substituteVariable(str, thermostatId, temperature) {
    if (thermostatId) {
        str = str.replaceAll("${ThermostatId}", thermostatId);
    }
    if (temperature) {
        str = str.replaceAll("${TargetTemperature}", temperature);
    }
    return str;
}

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
        if (DEBUG > 0) { console.log("Failed to extract variable" + variable + " from response."); } 
    }
    return data;
}

function convert(from, to, temperature) {
    if (from.toLowerCase() === "c") {
        if (to.toLowerCase() === "f") {
            return temperature * 1.8 + 32;
        }
        else if (to.toLowerCase() === "k") {
            return temperature + 273.15;
        }
    }
}


// A helper function to make ajax Calls
function ajaxCall(options){
    console.log(options.url);
    var xhr = new XMLHttpRequest(),
        method = (options.method || 'GET').toUpperCase(),
        headers = options.headers,
        body = options.body,
        params = options.params,
        url = options.url + (method === 'GET' && params ? '?' + params : '');

    xhr.open(method, url);

    // Set headers
    if (headers){
        Object.keys(headers).forEach(function(key){
            xhr.setRequestHeader(key, headers[key]);
        });
    }
    if (savedToken) {
        if (DEBUG > 1) { console.log("Setting Authorization header with stored token."); }
        xhr.setRequestHeader("Authorization", savedToken);
    }

    xhr.onload = function() {
        if(this.status < 400) {
            var data = JSON.parse(this.responseText);
            options.callback(data);
        }
        else {
            console.log(this.status);
        }
    }
    xhr.onerror = function(e) {
        console.error(e);
        if (savedToken) {
            savedToken = null;
        }
    }

    xhr.timeout = 4000;
    xhr.ontimeout = function(e) {
        console.error(e);
        if (savedToken) {
            savedToken = null;
        }

    }
    

    xhr.send(JSON.stringify(body));
}