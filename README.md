# Pebble Thermostat Setter REST

A fork of [jose-troche/PebbleThermostatSetter](https://www.github.com/jose-troche/PebbleThermostatSetter) designed with the homebridge-ui-x API in mind, but with support for generic REST endpoints.


## Installing the Application

* Install the Pebble SDK in your computer and the Pebble mobile app in your iPhone or Android device. More details [here](https://developer.rebble.io/developer.pebble.com/sdk/index.html)
* Pair the watch with the phone
* Clone this repo:
```bash
git clone git@github.com:afwolfe/PebbleThermostatSetter.git
```
* Compile and deploy:
```bash
pebble build
pebble install --logs
```
* Done!

## Configuration

Example: 

```json
var self = module.exports = {
  baseUrl: "http://server",
  thermostats: [
    {"id": "",
    "name": ""
    }
  ],
  modes: {
    0: "OFF",
    1: "HEAT",
    2: "COOL",
    3: "AUTO"
  },
  values: {
    "CurrentHeatingCoolingState": "CurrentHeatingCoolingState",
    "TargetHeatingCoolingState": "TargetHeatingCoolingState",
    "CurrentTemperature": "CurrentTemperature",
    "TemperatureDisplayUnits": "TemperatureDisplayUnits",
    "HeatingThresholdTemperature": "HeatingThresholdTemperature",
    "CoolingThresholdTemperature": "CoolingThresholdTemperature",
    "TargetTemperature": "TargetTemperature"
  },
  unit: "c",
  endpoints: {
    "getThermostat": {
      "method": "GET",
      "url": "/api/accessories/${ThermostatId}",
      "headers": {},
      "values": "values"
    },
    "setTemperature": {
      "method": "PUT",
      "url": "/api/accessories/${ThermostatId}",
      "headers": {"Content-Type": "application/json"},
      "body": {
        "characteristicType": "TargetTemperature",
        "value": "${TargetTemperature}"
      }
    },
    "getMode": {
      "method": "GET",
      "url": "/api/accessories/${ThermostatId}",
      "values": "values"
    },
    "setMode": {
      "method": "PUT",
      "url": "/api/accessories/${ThermostatId}",
      "headers": {"Content-Type": "application/json"},
      "body": {
        "characteristicType": "TargetHeatingCoolingState",
        "value": "${TargetHeatingCoolingState}"
      }
    },
    "login": {
      "method": "POST",
      "url": "/api/auth/login",
      "body": {},
      "headers": {
        "Content-Type": "application/json"
      },
      "value": "access_token"
    }
  }
};
```

## Usage
## Features

* [x] Support for generic REST endpoints
* [x] Display a "current" and "target" temperature
* [x] Display and control the thermostat "mode." 
* [ ] Setting heating/cooling threshold in "AUTO" mode.
* [ ] Color and vibration feedback on request success/failures.
* [ ] Dynamic config page similar to Stateful/[kennedn's fork of clay](https://github.com/kennedn/clay)

## Acknowledgements

* Inspired by [kennedn/Stateful](https://www.github.com/kennedn/Stateful).
* Based on [jose-troche/PebbleThermostatSetter](https://www.github.com/jose-troche/PebbleThermostatSetter)