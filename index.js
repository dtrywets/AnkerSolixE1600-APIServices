const E1600API = require("ankersolixe1600");
require('dotenv').config();
const MQTT = require("mqtt");
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const fs = require("fs");
let siteInstance = null;
let siteHomepage = null;

const { spawn } = require('child_process');

const restartScript = function(req,res) {
  console.log('Restarting the service...');
  res.status(503).json({err:"Service Restarting"});     
  server.close(() => {
    const node = process.argv[0];
    const script = process.argv[1];
    const args = process.argv.slice(2);

    const child = spawn(node, [script, ...args], {
      stdio: 'inherit'
    });

    child.on('exit', (code, signal) => {
      console.log(`Child process exited with code ${code} and signal ${signal}`);
    });
  });
}

const createSession = async function(resetSession) {
    if( 
        ((typeof resetSession !== 'undefined')&&(resetSession==false)) ||
        (fs.existsSync("./session.json"))
    )          
    {
        try {
            const options = JSON.parse(fs.readFileSync("./session.json"));
            siteInstance = new E1600API(options);
            siteHomepage = await siteInstance.getSitehomepage();
        } catch(e) {
            try {
                fs.unlink("./session.json");
            } catch(e2) {}

            await createSession(true);
            console.log("Fallback to Username/Password Login");
        }
    }
    else
    {
        const options = {
            username: process.env.ANKER_USERNAME,
            password: process.env.ANKER_PASSWORD,
            country: process.env.ANKER_COUNTRY
        }
        try {
            siteInstance = new E1600API(options);
            siteHomepage = await siteInstance.getSitehomepage();
            fs.writeFileSync("./session.json", JSON.stringify(siteInstance.getSessionConfiguration()));
        } catch(e) {
            throw new Error("Unable to create session. " + (e.response?.data?.msg || ''));
        }
    }
    return;
}
const restGetHomepage = async function(req, res) {
    try {
        const homepage = await siteInstance.getSitehomepage();
        res.status(200).json(homepage);
    } catch(e) {
        res.status(500).json({
            error: {
                message: e.message
            }
        });
        console.error('/getHomepage', e);
    }
};

const restSetEnergy = async function(req,res) {
    let site_id = 0; // use site_id 0 as Default
    let power = 200; // setPower to default 200W
    if(typeof req.params.site_id !== 'undefined') site_id = req.params.site_id;
    if(typeof req.query.site_id !== 'undefined') side_id = req.query.site_id;
    if(typeof req.query.power !== 'undefined') power = req.query.power;
    if(typeof req.body.power !== 'undefined') power = req.body.power;
    power = power * 1 ; //typecast
    let turn_on = true;
    if(power < 150) turn_on = false; else {
        power = 50 * (Math.round(power/50));
    }
    try {
        const schedule =  {
            "ranges": [
                {
                    "id": 0,
                    "start_time": "00:00",
                    "end_time": "24:00",
                    "turn_on": turn_on,
                    "appliance_loads": [
                        {
                            "id": 0,
                            "name": "Generic Load",
                            "power": power,
                            "number": 1
                        }
                    ]
                }
            ],
            "min_load": 150,
            "max_load": 800,
            "step": 50
        };
        let r = await siteInstance.setSchedule(schedule,site_id);
        res.status(200).json(r);           
    } catch(e) {
        res.status(500).json({
            error: {
                message: e.message
            }
        });
        console.error('/setEnergy',e);
    }
    return;
}

const restGetSchedule = async function(req,res) {
    let site_id = 0;
    if(typeof req.params.site_id !== 'undefined') site_id = req.params.site_id;
    if(typeof req.query.site_id !== 'undefined') side_id = req.query.site_id;
    try {
        let r = await siteInstance.getSchedule(site_id);
        res.status(200).json(r);           
    } catch(e) {
        res.status(500).json({
            error: {
                message: e.message
            }
        });
        console.error('/getSchedule',e);
    }
    return;
}

const mqttService = async function() {
    try {
        const connection = MQTT.connect(process.env.MQTT_URL);
        connection.on('connect', function () {
            console.log("Connected to MQTT: "+process.env.MQTT_URL);
            if(typeof process.env.MQTT_TOPIC_ROOT !== 'undefined') {
                connection.subscribe(process.env.MQTT_TOPIC_ROOT+"/energy", function() {});
                const publisherStatus = async function() {
                    try {
                        const status = await siteInstance.getSitehomepage();
                        connection.publish(process.env.MQTT_TOPIC_ROOT + '/homepage', JSON.stringify(status), {retain:true});
                        for(let i=0; i<status.solarbank_list.length; i++) {
                            for (const [key, value] of Object.entries(status.solarbank_list[i])) {
                                connection.publish(process.env.MQTT_TOPIC_ROOT + '/solarbank/'+i+'/'+key, value, {retain:true});
                            }
                        }
                    } catch(e) {
                        console.log("Error publishing MQTT", e);
                    }
                };
                setInterval(publisherStatus, 60000);
                publisherStatus();
                console.log("Publishing "+process.env.MQTT_TOPIC_ROOT);
                connection.on('message', async (topic, payload) => {
                    try {
                        console.log('setEnergy', payload);
                        let site_id = 0;
                        let power = payload * 1; 
                        if(typeof req.params.site_id !== 'undefined') site_id = req.params.site_id;
                        if(typeof req.query.site_id !== 'undefined') side_id = req.query.site_id;
                        if(typeof req.query.power !== 'undefined') power = req.query.power;
                        if(typeof req.body.power !== 'undefined') power = req.body.power;
                        power = power * 1; // typecast
                        let turn_on = true;
                        if(power < 150) turn_on = false; else {
                            power = 50 * (Math.round(power/50));
                        }

                        const schedule = {
                            "ranges": [
                                {
                                    "id": 0,
                                    "start_time": "00:00",
                                    "end_time": "24:00",
                                    "turn_on": turn_on,
                                    "appliance_loads": [
                                        {
                                            "id": 0,
                                            "name": "Generic Load",
                                            "power": power,
                                            "number": 1
                                        }
                                    ]
                                }
                            ],
                            "min_load": 150,
                            "max_load": 800,
                            "step": 50
                        };
                        await siteInstance.setSchedule(schedule, site_id);
                    } catch(e) {
                        console.log("Error processing MQTT message", e);
                    }
                    return;
                });
            }           
        });
    } catch(e) {
        console.log("Unable to connect to MQTT. Will Retry in 20 seconds");
        console.debug(e);
        setTimeout(mqttService, 20000);
    }
    return;
}

const restSetSchedule = async function(req,res) {
    let site_id = 0; // use site_id 0 as Default
    if(typeof req.params.site_id !== 'undefined') site_id = req.params.site_id;
    if(typeof req.query.site_id !== 'undefined') side_id = req.query.site_id;
    try {
        let r = await siteInstance.setSchedule(req.body, site_id);
        res.status(200).json(r);         
    } catch(e) {
        res.status(500).json({
            error: {
                message: e.message
            }
        });
        console.error('/setSchedule', e);
    }    
}

// eigene Endpunkte
const restGetSites = async function(req, res) {
    try {
        const sites = await siteInstance.getSites();
        res.status(200).json(sites);
    } catch(e) {
        res.status(500).json({
            error: {
                message: e.message
            }
        });
        console.error('/getSites', e);
    }
};

const restGetHomeLoadChart = async function(req, res) {
    try {
        const siteId = req.params.site_id;
        const deviceSn = req.query.device_sn || "";
        const loadChart = await siteInstance.getHomeLoadChart({ siteId, deviceSn });
        res.status(200).json(loadChart);
    } catch(e) {
        res.status(500).json({
            error: {
                message: e.message
            }
        });
        console.error('/getHomeLoadChart', e);
    }
};

app.get('/getHomeLoadChart/:site_id', restGetHomeLoadChart);


const restGetSiteDeviceParam = async function(req, res) {
    try {
        const siteId = req.params.site_id;
        const paramType = req.query.paramType || "4"; // Default paramType if not provided
        const device = {
            siteId: siteId,
            paramType: paramType
        };

        const deviceParams = await siteInstance.getSiteDeviceParam(device);
        res.status(200).json(deviceParams);
    } catch(e) {
        res.status(500).json({
            error: {
                message: e.message
            }
        });
        console.error('/getSiteDeviceParam', e);
    }
};

const restGetRelateAndBindDevices = async function(req, res) {
    try {
        const devices = await siteInstance.getRelateAndBindDevices();
        res.status(200).json(devices);
    } catch(e) {
        res.status(500).json({ error: { message: e.message } });
        console.error('/getRelateAndBindDevices', e);
    }
};
app.get('/getRelateAndBindDevices', restGetRelateAndBindDevices);

const restGetUserMqttInfo = async function(req, res) {
    try {
        const mqttInfo = await siteInstance.getUserMqttInfo();
        res.status(200).json(mqttInfo);
    } catch(e) {
        res.status(500).json({ error: { message: e.message } });
        console.error('/getUserMqttInfo', e);
    }
};
app.get('/getUserMqttInfo', restGetUserMqttInfo);

const restGetScenInfo = async function(req, res) {
    try {
        const siteId = req.params.site_id;
        const scenInfo = await siteInstance.scenInfo(siteId);
        res.status(200).json(scenInfo);
    } catch(e) {
        res.status(500).json({ error: { message: e.message } });
        console.error('/getScenInfo', e);
    }
};
app.get('/getScenInfo/:site_id', restGetScenInfo);

const restGetEnergyAnalysis = async function(req, res) {
    try {
        const siteId = req.params.site_id;
        const deviceSn = req.query.device_sn || "";
        const type = req.query.type;
        const startTime = new Date(req.query.start_time);
        const endTime = new Date(req.query.end_time);
        const deviceType = req.query.device_type || "solar_production";
        const analysis = await siteInstance.energyAnalysis({ siteId, deviceSn, type, startTime, endTime, deviceType });
        res.status(200).json(analysis);
    } catch(e) {
        res.status(500).json({ error: { message: e.message } });
        console.error('/energyAnalysis', e);
    }
};
app.get('/energyAnalysis/:site_id', restGetEnergyAnalysis);


app.get('/getHomepage', restGetHomepage);


const restService = async function() {
    var cors = require('cors');
    const bodyParser = require('body-parser');
    app.use(bodyParser.json());
    app.use(cors());
    app.use('/', express.static('public'));
    app.all('/setEnergy/:side_id?', restSetEnergy);
    app.get('/schedule/:side_id?', restGetSchedule);
    app.get('/getSites', restGetSites);
    app.get('/getSiteDeviceParam/:site_id', restGetSiteDeviceParam);
    app.post('/schedule/:side_id?', restSetSchedule);
    app.all('/restart', restartScript);
    // Add any additional endpoints as needed

    const port = process.env.HTTP_PORT || 3002;
    server.listen(port, () => {
        console.log(`HTTP/REST Service Listening on http://localhost:${port}`);
    });
    return;
};

const service = async function() {
    const _createSession = async function() {
        try {
            await createSession(false);
        } catch(e) {
            const message = e.message;
            const retryMatch = message.match(/try again in (\d+) hours/);
            if (retryMatch) {
                const retryAfterHours = parseInt(retryMatch[1], 10);
                const retryAfterMilliseconds = retryAfterHours * 60 * 60 * 1000;
                console.log(`Login blocked. Will retry in ${retryAfterHours} hours.`);
                setTimeout(_createSession, retryAfterMilliseconds);
            } else {
                console.log("Unable to create session to Anker Cloud. Will Retry in 20 seconds");
                setTimeout(_createSession, 20000);
            }
        }
        return;
    };

    await _createSession();

    if(typeof process.env.HTTP_PORT !== 'undefined') {
        restService();
    }

    if(typeof process.env.MQTT_URL !== 'undefined') {
        mqttService();
    }
    return;
}

service();
