require('dotenv').config();
const amqp = require('amqplib');
const { mapDroneMessage, mapMannedAviationMessage } = require('./modules/MapMessage');
const MessageProducerMQTT = require('./modules/MessageProducerMQTT');

const EGRESS_USER = process.env.EGRESS_USER;
const EGRESS_PASS = process.env.EGRESS_PASS;
const EGRESS_VHOST = process.env.EGRESS_VHOST;
const AMQP_URL = `amqp://${EGRESS_USER}:${EGRESS_PASS}@senegress.senair.io:5672/${EGRESS_VHOST}`;

const QUEUES = process.env.EGRESS_QUEUES
    ? process.env.EGRESS_QUEUES.split(',').map(q => q.trim())
    : [];

const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_TOPIC = process.env.MQTT_TOPIC;

async function consumeQueues() {
  try {
    // Initialize MQTT producer
    const producer = new MessageProducerMQTT({
        brokerUrl: MQTT_BROKER,
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
    });
    await producer.init();
    console.log(`MQTT producer ready, publishing to topic: ${MQTT_TOPIC}`);

    // Connect to AMQP
    const connection = await amqp.connect(AMQP_URL);
    const channel = await connection.createChannel();
    console.log(`Connected to AMQP broker at ${AMQP_URL}`);

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
            //  console.log(`[${queue}] Published to MQTT:`, JSON.stringify(geoJSONTract, null, 2));
            } else {
                const manned = mapMannedAviationMessage(rawData);
                if (manned) {
                    const topic = `${MQTT_TOPIC}/${queue}/${manned.id}`;
                    producer.sendMessage(topic, manned);
              //      console.log(`[${queue}] Published to MQTT:`, JSON.stringify(manned, null, 2));
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

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down...');
      producer.disconnect();
      connection.close();
      process.exit(0);
    });

  } catch (err) {
    console.error('Failed to connect or consume:', err);
  }
}

consumeQueues();
