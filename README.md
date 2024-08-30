# AnkerSolixE1600-APIServices
API Services for the Anker Solix Solarbank E1600 

Added own endpoints to the api to make flows easier:
```
/getSites, /getHomeLoadChart/{site_id}, /getSiteDeviceParam/{site_id}, /getRelateAndBindDevices,
/getUserMqttInfo, /getScenInfo/{site_id}, and /energyAnalysis/{site_id}
```

[Test on GitPod](https://gitpod.io/#https://github.com/dtrywets/AnkerSolixE1600-APIServices)

## Features
- Provide REST API to manage load and unload (charge/discharge) of Solarbank
- Publish status to MQTT service
- Allow setting of Energy discharge via MQTT topic
- Lightweight Webinterface (not all features)

## Usage
Copy `sample.env` to `.env`
Edit `.env` as required

## Funding
This development is funded via our customers at https://corrently.energy/ 

## Maintainer / Imprint

<addr>
STROMDAO GmbH  <br/>
Gerhard Weiser Ring 29  <br/>
69256 Mauer  <br/>
Germany  <br/>
  <br/>
+49 6226 968 009 0  <br/>
  <br/>
kontakt@stromdao.com  <br/>
  <br/>
Handelsregister: HRB 728691 (Amtsgericht Mannheim)<br/>
  <br/>
https://stromdao.de/<br/>
</addr>
