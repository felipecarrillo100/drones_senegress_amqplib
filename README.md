# Drones AMQP to MQTT Bridge

This repository provides a Node.js bridge application that consumes aviation-related messages from AMQP queues and retransmits them as MQTT messages.

The incoming data — published by Senegress via a RabbitMQ server — contains tracks from UAVs (drones), fused sources, and manned aviation. The bridge normalizes these heterogeneous messages into a consistent GeoJSON-like structure compatible with Catalog Explorer Live Tracks, and then republishes them to an MQTT broker for downstream consumption.

---

## Quick summary 

- Connects to AMQP and MQTT using your credentials set as environment variables (.env).
- Consumes messages from queues:
  - `manned_aviation_data`
  - `fused_data`
- Maps each incoming message to a GeoJSON-style object with `action`, `geometry`, `id`, `properties`.
- Publishes mapped messages to MQTT topics: `<MQTT_TOPIC>/<queue>/<id>`.
- Robust mapping functions and error handling to avoid crashes on malformed messages.

---

## Project Structure
```text
drones_amqplib/
├── index.js                  # Main entry point, consumes AMQP queues and republishes to MQTT
├── modules/
│   ├── MapMessage.js         # Contains MapMessage() and mapMannedAviationMessage() mapping functions
│   └── MessageProducerMQTT.js# MQTT producer wrapper for connecting and publishing
├── .env                      # Environment variables (never commit to Git!)
├── .env.sample               # Example environment variables for developers
├── package.json              # Project metadata, dependencies, and scripts
├── package-lock.json         # Auto-generated lockfile for dependencies
└── README.md                 # Documentation and usage instructions
```

## Table of Contents

1. [Features](#features)  
2. [Prerequisites](#prerequisites)  
3. [Installation](#installation)  
4. [Usage](#usage)  
5. [Configuration (env)](#configuration-env)  
6. [Important notes about AMQP queue properties](#important-notes-about-amqp-queue-properties)  
7. [Message examples & expected output](#message-examples--expected-output)  
8. [Graceful shutdown](#graceful-shutdown)  
9. [License](#license)  

---

## Features

- Multi-queue AMQP consumer (connects to the RabbitMQ from Senegress)
- Safe message mapping with fallbacks for missing fields
- Straightforward MQTT publisher (configurable broker + topic)
- Skips invalid messages instead of crashing
- Logs mapping errors and publish failures

---

## Prerequisites

- Node.js 18+ (tested on Node 20)
- npm (to install dependencies)
- Access to an AMQP broker (RabbitMQ / Senegress)
- Access to an MQTT broker (ActiveMQ or other)

Dependencies used in this project (from `package.json`): `amqplib`, `mqtt`, `dotenv`.

---

## Installation

```bash
git clone https://github.com/felipecarrillo100/drones_senegress_amqplib
cd drones_senegress_amqplib
npm install
```

Create a `.env` (or use other secret management) with your credentials — see the "Configuration" section below.
You can copy .env.sample to .env and fill in your credentials there

---

## Usage

Start the app:

```bash
npm run dev
```

What happens after start:

1. App connects to MQTT and AMQP (using environment credentials).  
2. For each queue configured, it consumes messages.  
3. Each message is JSON-parsed and passed to the mapping functions.  
4. If mapping returns a valid object, it is published to MQTT at:
   ```
   <MQTT_TOPIC>/<queue>/<id>
   ```
5. Messages are acknowledged in AMQP after processing (ack now; see improvement notes if you want ack after publish confirmation).

---

## Configuration (env)

This repository expects configuration in environment variables (you can place a `.env` in project root and use `dotenv`). These are the variables read by the bridge:

- `EGRESS_USER` — AMQP username
- `EGRESS_PASS` — AMQP password
- `EGRESS_VHOST` — AMQP vhost (virtual host)
- `MQTT_BROKER` — MQTT broker URL (e.g. `mqtt://localhost:1883`)
- `MQTT_USERNAME` — MQTT username (optional)
- `MQTT_PASSWORD` — MQTT password (optional)
- `MQTT_TOPIC` — Root topic to publish messages under (e.g. `producers/senegress/data`)

> The bridge will build topics like: `producers/senegress/data/manned_aviation_data/<track-id>`

---

## Message examples & expected output

**Raw manned aviation message (input):**

```json
{
  "alt": 35000.0,
  "fli": "MSR782",
  "lat": 51.65808726165254,
  "lon": 5.3356170654296875,
  "spd": 429.26,
  "trk": 120.98,
  "vrt": 12962.38,
  "icao": "10246",
  "track_id": "6535272f-6506-481f-bfb4-998d09db67e8"
}
```

**Mapped output (published to MQTT):**

```json
{
  "action": "PUT",
  "geometry": {
    "type": "Point",
    "coordinates": [5.3356171, 51.6580873, 35000]
  },
  "id": "6535272f-6506-481f-bfb4-998d09db67e8",
  "properties": {
    "flight": "MSR782",
    "altitude": 35000,
    "speed": 429.26,
    "heading": 120.98,
    "verticalRate": 12962.38,
    "icao": "10246",
    "sensorSerials": [],
    "timestamp": null
  }
}
```


## Graceful shutdown

- The `SIGINT` handler disconnects MQTT producer and closes AMQP channel & connection. Ensure long-running publishes are awaited if you change ack behaviour.

---

## License

MIT
