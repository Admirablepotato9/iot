import mqtt from 'mqtt';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io';
const mqttSubscriptionTopic = process.env.MQTT_DB_SUBSCRIPTION_TOPIC || 'amerike/#';

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'iot_proyecto',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// --- AJUSTA ESTOS IdSensor A LOS REALES DE TU BASE DE DATOS ---
const SENSOR_NAME_TO_ID_MAP = {
    "humedad": "11",            // ID del sensor de humedad
    "temperatura": "10",        // ID del sensor de temperatura
    "rfid_uid": "14",           // ID para guardar el UID de la tarjeta RFID
    "rfid_valida": "18",        // ID para guardar si la tarjeta RFID es válida (true/false o 1/0) - NUEVO, ASIGNAR ID
    "fotoresistencia": "12",    // ID del sensor de fotoresistencia (0 o 1)
    "distancia_sonico": "13"    // ID del sensor ultrasónico/sónico (0 o 1)
    // "rfid_presente": "XX",   // Si también quieres guardar el 'lector' (1 si hay intento, 0 si no) - ASIGNAR ID SI ES NECESARIO
    // Considera si necesitas "led_ultra", "leds_binario", "buzzer_activo" del mapeo anterior.
    // El código Arduino actual no los envía con nombres explícitos así,
    // pero podrías derivarlos o ajustar el Arduino para enviarlos si son necesarios.
};
// ------------------------------------------------------------

let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log("MQTT_TO_DB: Pool de MySQL creado.");
    pool.getConnection().then(conn => {
        console.log("MQTT_TO_DB: Conexión de prueba a MySQL OK.");
        conn.release();
    }).catch(err => {
        console.error("MQTT_TO_DB: Fallo en conexión de prueba a MySQL:", err.message);
    });
} catch (error) {
    console.error("MQTT_TO_DB: Error CRÍTICO al crear pool MySQL:", error);
    process.exit(1);
}

console.log(`MQTT_TO_DB: Conectando a MQTT Broker: ${mqttBrokerUrl}`);
const mqttClient = mqtt.connect(mqttBrokerUrl);

mqttClient.on('connect', () => {
    console.log(`MQTT_TO_DB: Conectado al Broker MQTT.`);
    mqttClient.subscribe(mqttSubscriptionTopic, (err) => {
        if (err) {
            console.error(`MQTT_TO_DB: Fallo al suscribir a '${mqttSubscriptionTopic}':`, err);
        } else {
            console.log(`MQTT_TO_DB: Suscrito a: ${mqttSubscriptionTopic}`);
        }
    });
});

mqttClient.on('error', (error) => console.error('MQTT_TO_DB: Error MQTT:', error));
mqttClient.on('reconnect', () => console.log('MQTT_TO_DB: Reconectando a MQTT...'));
mqttClient.on('close', () => console.log('MQTT_TO_DB: Conexión MQTT cerrada.'));

mqttClient.on('message', async (topic, message) => {
    const messageString = message.toString().trim();
    console.log(`\nMQTT_TO_DB: RX Topic: '${topic}', Payload: <${messageString}>`);

    try {
        const topicParts = topic.split('/');
        if (topicParts.length < 1) { // Necesitamos al menos el nombre del sensor
            console.warn(`MQTT_TO_DB: Topic inesperado: ${topic}.`);
            return;
        }

        const sensorNameFromTopic = topicParts[topicParts.length - 1];
        const sensorIdStr = SENSOR_NAME_TO_ID_MAP[sensorNameFromTopic];

        if (!sensorIdStr) {
            console.warn(`MQTT_TO_DB: Sin mapeo de IdSensor para '${sensorNameFromTopic}' (topic: '${topic}'). Saltando.`);
            return;
        }
        const sensorIdInt = parseInt(sensorIdStr, 10);
        if (isNaN(sensorIdInt)) {
            console.warn(`MQTT_TO_DB: IdSensor inválido ('${sensorIdStr}') para '${sensorNameFromTopic}'. Saltando.`);
            return;
        }

        const sensorValueLog = messageString;
        const now = new Date();
        const currentDate = now.toISOString().slice(0, 10);
        const currentTime = now.toTimeString().slice(0, 8);

        const sql = 'INSERT INTO RegistroSen (IdSensor, Fecha, Hora, Log) VALUES (?, ?, ?, ?)';
        const valuesToInsert = [sensorIdInt, currentDate, currentTime, sensorValueLog];

        try {
            const [results] = await pool.execute(sql, valuesToInsert);
            console.log(`MQTT_TO_DB:   -> OK. Sensor '${sensorNameFromTopic}' (ID: ${sensorIdInt}, Valor: ${sensorValueLog}) guardado. ID Reg: ${results.insertId}`);
        } catch (dbError) {
            console.error(`MQTT_TO_DB:   -> ERROR DB insertando SensorID ${sensorIdInt} ('${sensorNameFromTopic}'): ${dbError.message}`);
        }

    } catch (processingError) {
        console.error('MQTT_TO_DB: Error procesando mensaje MQTT:', processingError.message);
        console.error(`MQTT_TO_DB: Topic: ${topic}, Mensaje: ${messageString}`);
    }
});

function gracefulShutdown() {
    console.log("\nMQTT_TO_DB: Cerrando...");
    mqttClient.end(false, () => {
        console.log("MQTT_TO_DB: Cliente MQTT desconectado.");
        if (pool) {
            pool.end(err => {
                if (err) console.error("MQTT_TO_DB: Error cerrando pool MySQL:", err.message);
                else console.log("MQTT_TO_DB: Pool MySQL cerrado.");
                process.exit(err ? 1 : 0);
            });
        } else {
            process.exit(0);
        }
    });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

console.log("Node.js: Script `mqtt_to_db_saver.js` iniciado.")