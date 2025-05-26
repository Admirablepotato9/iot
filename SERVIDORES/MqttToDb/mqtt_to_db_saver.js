// mqtt_to_db_saver.js

// Importar módulos necesarios
import mqtt from 'mqtt';
import mysql from 'mysql2/promise'; // Usar la versión con promesas para async/await
import dotenv from 'dotenv';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

// --- Configuración Leída desde .env ---
const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io';
// Este es el topic al que este script se SUSCRIBE
const mqttInputTopic = process.env.MQTT_TOPIC_OUTPUT || 'amerike/cyber/iot/device_data_semicolon';

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'iot_proyecto',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    waitForConnections: true,
    connectionLimit: 10, // Límite de conexiones en el pool
    queueLimit: 0        // Límite de la cola de espera si todas las conexiones están ocupadas
};
// --------------------------------------

// --- Mapeo de Posición en la cadena (delimitada por ';') a IdSensor ---
// El orden DEBE COINCIDIR con cómo serial_to_mqtt_logger.js formatea el mensaje
// que a su vez DEBE COINCIDIR con cómo el simulador/Arduino envía los datos.
// Datos esperados: sonico;fotoresistencia;temperatura;humedad;led_ultra;leds_binario;buzzer;rfid
const SENSOR_ID_MAP_BY_POSITION = [
    "13", // Posición 0: Sónico (ej. IdSensor 13 en tu tabla Sensor)
    "12", // Posición 1: Fotoresistencia (ej. IdSensor 12)
    "10", // Posición 2: Temperatura (ej. IdSensor 10)
    "11", // Posición 3: Humedad (ej. IdSensor 11)
    "15", // Posición 4: LED Ultra (estado) (ej. IdSensor 15)
    "16", // Posición 5: LEDs Binario (estado) (ej. IdSensor 16)
    "17", // Posición 6: Buzzer (estado) (ej. IdSensor 17)
    "14"  // Posición 7: RFID (ej. IdSensor 14)
];
const EXPECTED_DATA_FIELDS = SENSOR_ID_MAP_BY_POSITION.length;
// -----------------------------------------------------------------

// --- Inicialización del Pool de Conexiones MySQL ---
let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log("MQTT_TO_DB: Pool de conexiones MySQL creado exitosamente.");
    // Opcional: Probar una conexión simple al iniciar
    // pool.getConnection().then(conn => {
    //     console.log("MQTT_TO_DB: Conexión de prueba a MySQL exitosa.");
    //     conn.release();
    // }).catch(err => {
    //     console.error("MQTT_TO_DB: Fallo en conexión de prueba a MySQL:", err.message);
    // });
} catch (error) {
    console.error("MQTT_TO_DB: Error CRÍTICO al crear el pool de conexiones MySQL:", error);
    process.exit(1); // Salir si no se puede crear el pool
}
// ---------------------------------------------

// --- Conexión al Broker MQTT ---
console.log(`MQTT_TO_DB: Intentando conectar a MQTT Broker: ${mqttBrokerUrl}`);
const mqttClient = mqtt.connect(mqttBrokerUrl);
// --------------------------------

// --- Manejadores de Eventos MQTT ---
mqttClient.on('connect', () => {
    console.log(`MQTT_TO_DB: Conectado al Broker MQTT.`);
    // Suscribirse al topic donde serial_to_mqtt_logger.js está publicando
    mqttClient.subscribe(mqttInputTopic, (err) => {
        if (err) {
            console.error(`MQTT_TO_DB: Fallo al suscribirse al topic '${mqttInputTopic}':`, err);
        } else {
            console.log(`MQTT_TO_DB: Suscrito exitosamente al topic: ${mqttInputTopic}`);
        }
    });
});

mqttClient.on('error', (error) => {
    console.error('MQTT_TO_DB: Error de conexión MQTT: ', error);
});

mqttClient.on('reconnect', () => {
    console.log('MQTT_TO_DB: Intentando reconectar al broker MQTT...');
});

mqttClient.on('close', () => {
    console.log('MQTT_TO_DB: Conexión MQTT cerrada.');
});
// ----------------------------------

// --- Manejador de Mensajes Entrantes de MQTT ---
mqttClient.on('message', async (topic, message) => { // Marcar como async para usar await
    const messageString = message.toString().trim();
    console.log(`\nMQTT_TO_DB: Mensaje recibido del topic '${topic}'`);
    console.log(`MQTT_TO_DB: Payload crudo: <${messageString}>`);

    try {
        // 1. Parsear la cadena separada por punto y coma
        const dataValues = messageString.split(';');

        if (dataValues.length !== EXPECTED_DATA_FIELDS) {
            console.warn(`MQTT_TO_DB: Formato de mensaje inesperado. Se esperaban ${EXPECTED_DATA_FIELDS} campos, se recibieron ${dataValues.length}. Mensaje: <${messageString}>`);
            return; // No procesar si el formato no es el esperado
        }

        // 2. Obtener fecha y hora actuales
        const now = new Date();
        const currentDate = now.toISOString().slice(0, 10); // Formato YYYY-MM-DD
        const currentTime = now.toTimeString().slice(0, 8); // Formato HH:MM:SS

        console.log(`MQTT_TO_DB: Procesando ${dataValues.length} lecturas para guardar en DB...`);

        // 3. Iterar sobre los valores y guardarlos usando el mapeo de IDs
        for (let i = 0; i < dataValues.length; i++) {
            const sensorIdStr = SENSOR_ID_MAP_BY_POSITION[i];
            const sensorValueLog = dataValues[i]; // El valor se guarda como string en la columna Log
            const sensorIdInt = parseInt(sensorIdStr, 10);

            if (isNaN(sensorIdInt)) {
                console.warn(`MQTT_TO_DB: IdSensor inválido en el mapeo para posición ${i} (valor: '${sensorIdStr}'). Saltando este registro.`);
                continue;
            }

            // 4. Construir y ejecutar la sentencia INSERT
            const sql = 'INSERT INTO RegistroSen (IdSensor, Fecha, Hora, Log) VALUES (?, ?, ?, ?)';
            const valuesToInsert = [sensorIdInt, currentDate, currentTime, sensorValueLog];

            try {
                // Usar el pool para obtener una conexión y ejecutar la consulta
                const [results] = await pool.execute(sql, valuesToInsert);
                console.log(`MQTT_TO_DB:   -> OK. SensorID ${sensorIdInt} (Valor: ${sensorValueLog}) guardado. ID Registro: ${results.insertId}`);
            } catch (dbError) {
                console.error(`MQTT_TO_DB:   -> ERROR al insertar SensorID ${sensorIdInt} en DB: ${dbError.message}`);
                // Podrías añadir más detalles del error o el valor que intentabas insertar
                // console.error(`MQTT_TO_DB:      Query: ${sql}`);
                // console.error(`MQTT_TO_DB:      Values: ${JSON.stringify(valuesToInsert)}`);
            }
        }
        console.log("MQTT_TO_DB: Todas las lecturas del mensaje procesadas.");

    } catch (processingError) {
        console.error('MQTT_TO_DB: Error general al procesar el mensaje MQTT:', processingError.message);
        console.error(`MQTT_TO_DB: Mensaje problemático: ${messageString}`);
    }
});
// ------------------------------------------

// --- Manejo de Cierre Limpio del Script ---
function gracefulShutdown() {
    console.log("\nMQTT_TO_DB: Recibida señal de cierre. Limpiando...");
    mqttClient.end(false, () => { // false para no forzar, deja que termine de enviar/recibir
        console.log("MQTT_TO_DB: Cliente MQTT desconectado.");
        if (pool) {
            pool.end(err => { // Cierra todas las conexiones en el pool
                if (err) {
                    console.error("MQTT_TO_DB: Error al cerrar el pool de MySQL:", err.message);
                    process.exit(1);
                } else {
                    console.log("MQTT_TO_DB: Pool de MySQL cerrado correctamente.");
                    process.exit(0);
                }
            });
        } else {
            process.exit(0);
        }
    });
}

process.on('SIGINT', gracefulShutdown); // Capturar Ctrl+C
process.on('SIGTERM', gracefulShutdown); // Capturar señal de terminación
// ---------------------------------------

console.log("Node.js: Script `mqtt_to_db_saver.js` iniciado. Esperando mensajes MQTT...");