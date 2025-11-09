require('dotenv').config();
const amqp = require('amqplib');
const { mapDroneMessage, mapMannedAviationMessage } = require('./modules/MapMessage');
const MessageProducerMQTT = require('./modules/MessageProducerMQTT');

const EGRESS_HOST = process.env.EGRESS_HOST || 'senegress.senair.io';
const EGRESS_PORT = process.env.EGRESS_PORT || 5672;

const EGRESS_USER = process.env.EGRESS_USER;
const EGRESS_PASS = process.env.EGRESS_PASS;
const EGRESS_VHOST = process.env.EGRESS_VHOST || 'hexagon';
const AMQP_URL = `amqp://${EGRESS_USER}:${EGRESS_PASS}@${EGRESS_HOST}:${EGRESS_PORT}/${EGRESS_VHOST}`;

const QUEUES = process.env.EGRESS_QUEUES
    ? process.env.EGRESS_QUEUES.split(',').map(q => q.trim())
    : [];

const DEBUG_LOG= process.env.DEBUG_LOG || false ;
// Defaults from environment
const DEFAULT_MQTT_HOST = process.env.MQTT_HOST || "localhost" ;
const DEFAULT_MQTT_PORT = process.env.MQTT_PORT || 1883;

const MQTT_BROKER = `mqtt://${DEFAULT_MQTT_HOST}:${DEFAULT_MQTT_PORT}`;
const MQTT_USERNAME =  process.env.MQTT_USER || 'admin';
const MQTT_PASSWORD = process.env.MQTT_PASS || 'admin';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'producers/senegress/data';

async function consumeQueues() {
  try {
    // Initialize MQTT producer
    const producer = new MessageProducerMQTT({
        brokerUrl: MQTT_BROKER,
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
    });

    try {
      await producer.init();
    } catch (err) {
        console.error("MQTT broker connection  failed:", err.message);
        process.exit(1); // Docker restart policy takes over
    }

    console.log(`MQTT producer ready, publishing to topic: ${MQTT_TOPIC}`);

    // Connect to AMQP
    let connection =  null;
    let channel = null
    try {
      connection = await amqp.connect(AMQP_URL);
      channel = await connection.createChannel();
    } catch (err) {
      console.error("AMQP Senegress broker connection failed:", err.message);
      process.exit(1); // Docker restart policy takes over
    }

    const AMQP_URL_MASKED = `amqp://${EGRESS_USER}:<YOURPASSWORD>@${EGRESS_HOST}:${EGRESS_PORT}/${EGRESS_VHOST}`;
    console.log(`Connected to AMQP broker at ${AMQP_URL_MASKED}`);

    // Setup a disconnect procerure
    setupGracefulShutdown(connection, producer);

    // Consume each queue
    QUEUES.forEach(queue => {
      channel.consume(queue, (msg) => {
        if (msg !== null) {
          try {
            const rawData = JSON.parse(msg.content.toString());
            const geoJSONTract = mapDroneMessage(rawData);

            if (geoJSONTract) {
              // Publish to MQTT
              const topic = `${MQTT_TOPIC}/${queue}/${geoJSONTract.id}`;
              producer.sendMessage(topic, geoJSONTract);
              if (DEBUG_LOG) console.log(`[${queue}] Published to MQTT:`, JSON.stringify(geoJSONTract, null, 2));
            } else {
                const manned = mapMannedAviationMessage(rawData);
                if (manned) {
                    const topic = `${MQTT_TOPIC}/${queue}/${manned.id}`;
                    producer.sendMessage(topic, manned);
                    if (DEBUG_LOG) console.log(`[${queue}] Published to MQTT:`, JSON.stringify(manned, null, 2));
                }
            }

          } catch (err) {
            console.error(`[${queue}] Failed to parse or map message:`, err);
          } finally {
            channel.ack(msg);
          }
        }
      }, { noAck: false });
    });

    connection.on('error', (err) => console.error('Connection error:', err));
    channel.on('error', (err) => console.error('Channel error:', err));

  } catch (err) {
    console.error('Failed to connect or consume:', err);
  }
}

consumeQueues();


function setupGracefulShutdown(connection, broker) {
    const shutdown = async (signal) => {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);

        try {
            if (connection) {
                console.log("Closing connectin to Senegress AMQP broker");
                connection.close();
                console.log("AMQP connection closed");
            }
            if (broker && typeof broker.disconnect === "function") {
                await broker.disconnect(); // ✅ Clean broker close if supported
            }
        } catch (err) {
            console.error("Error during shutdown:", err);
        } finally {
            console.log("Shutdown complete. Exiting.");
            process.exit(0);
        }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));  // Ctrl + C locally
    process.on("SIGTERM", () => shutdown("SIGTERM")); // Docker stop
}
