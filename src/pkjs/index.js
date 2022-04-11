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
    var msg = e.payload;
    if (msg.hasOwnProperty("temperatureChange") && msg.hasOwnProperty("thermostatIndex")) {
        var temperatureChange = parseInt(msg.temperatureChange),
            thermostatIndex = parseInt(msg.thermostatIndex);

        changeTemperature(temperatureChange, thermostatIndex);
    }
    else {
        if (DEBUG > 0) { console.error("missing message keys"); }
    }
});

// Changes the temperature of a thermostat adding temperatureChange to
// its current temperature. Returns error in case of failure.
function changeTemperature(temperatureChange, thermostatIndex){

    console.log("Requesting temperature change: " + temperatureChange
        + ", for thermostat: " + thermostatIndex);
    
    var thermostatId = thermostats[thermostatIndex].id;

    loginIfNecessary(function(){
        getTemperature(thermostatId, function(currentTemperature, success){
            var thermostatData = {"thermostatIndex": thermostatIndex},
                newTemperature;

            if (!success){
                if (DEBUG > 0) { console.error("Error getting temperature."); }
                thermostatData.thermostatName = "Error";
                sendThermostatData(thermostatData);
                return;
            }

            newTemperature = currentTemperature + (temperatureChange / 1.8);

            setTemperature(thermostatId, newTemperature, function(data){
                if (data) {
                    thermostatData.thermostatTemperature =
                            encodeTemperature(newTemperature);
                }
                else {
                    if (DEBUG > 0) { console.error("Error setting temperature."); }
                    thermostatData.thermostatName = "Error";
                }

                sendThermostatData(thermostatData);
            });
        })
    });
}

function sendThermostatData(thermostatData) {
    Pebble.sendAppMessage({
        "thermostatIndex": thermostatData.thermostatIndex,
        "thermostatName": thermostatData.thermostatName,
        "thermostatTemperature": thermostatData.thermostatTemperature
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
        body: endpoint.body,
        method: endpoint.method,
        headers: endpoint.headers,
        callback: function(data){
            try {
                if (data) {
                    console.log("Temperature updated!");
                }
            }
            catch (e){
                console.error('Unable to set temperature for thermostat '
                    + thermostatId + ". Error: " + e);
                success = false;
            }

            callback(data);
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
            for (var i = 0; i < thermostatsCount; i++){
                var thermostat = {
                    "thermostatIndex": i,
                    "thermostatId": thermostats[i].id,
                    "thermostatName": thermostats[i].name,
                };

                // Get the target (desired) temperature per each thermostat and
                // send the data for each thermostat to the watch at 1 second intervals
                setTimeout(function(thermostatData) {
                        getTemperature(thermostatData["thermostatId"], function(temperature) {
                            console.log("Sending thermostat to Pebble");
                            thermostatData["thermostatTemperature"] = encodeTemperature(temperature);
                            sendThermostatData(thermostatData)
                        });
                }.bind(null,thermostat), 1000);
            }
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

    return convert("c", "f", temperature).toFixed(0) + "\u00B0"; // Unicode for °
}

// Substitutes the variables in the endpoint and returns the updated endpoint object.
function prepareToCallEndpoint(endpointName, thermostatId, temperature) {
    
    if (endpoints[endpointName]) {
        var tempEndpoint = endpoints[endpointName];
        // tempEndpoint.url = substituteVariable(tempEndpoint.url, thermostatId, temperature);
        if (endpointName == "getTemperature" || endpointName == "setTemperature") {
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
        // str = str.replaceAll("${ThermostatId}", thermostatId);
        str = str.replace("${ThermostatId}", thermostatId);
    }
    if (temperature) {
        // str = str.replaceAll("${TargetTemperature}", temperature);
        str = str.replace("${TargetTemperature}", temperature);
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
    if (from.toLowerCase() === "f") {
        if (to.toLowerCase() === "c") {
            return (temperature - 32) / 1.8;
        }
    }
    return temperature;
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
            if (DEBUG > 2 ) { console.log("Setting header: {"+ key + " : " + headers[key] + "}"); }
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
    if (body) {
        if (DEBUG > 2 ) { console.log(JSON.stringify(body)); }
        xhr.send(JSON.stringify(body));
    }
    else {
        xhr.send();
    }


}