// Importar módulos necesarios
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline'; // Parser para leer línea por línea
import mqtt from 'mqtt';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path'; // Para construir rutas de archivo de forma segura

// Cargar variables de entorno
dotenv.config();

// --- Configuración ---
const serialPortPath = process.env.SERIAL_PORT_PATH;
const baudRate = 9600; // Debe coincidir con la configuración del emisor (simulador/Arduino)

const mqttBrokerUrl = process.env.MQTT_BROKER_URL;
const mqttOutputTopic = process.env.MQTT_TOPIC_OUTPUT;

const logFilePath = path.resolve(process.env.LOG_FILE_PATH || './serial_data_log.txt');
// --------------------

// --- Validar Configuración Esencial ---
if (!serialPortPath) {
    console.error("Error: SERIAL_PORT_PATH no está definido en el archivo .env. Saliendo.");
    process.exit(1);
}
if (!mqttBrokerUrl || !mqttOutputTopic) {
    console.error("Error: Configuración MQTT incompleta en el archivo .env. Saliendo.");
    process.exit(1);
}
// -----------------------------------

// --- Conexión MQTT ---
const mqttClient = mqtt.connect(mqttBrokerUrl);

mqttClient.on('connect', () => {
    console.log(`MQTT: Conectado al broker ${mqttBrokerUrl}`);
});

mqttClient.on('error', (error) => {
    console.error('MQTT: Error de conexión:', error);
});
// --------------------

// --- Funciones de Ayuda ---
function appendToLogFile(data) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - RX_SERIAL: ${data}\n`;
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) {
            console.error('LOG: Error al escribir en el archivo de log:', err);
        } else {
            // console.log('LOG: Datos guardados en el archivo de log.'); // Puede ser muy verboso
        }
    });
}
// -------------------------

// --- Conexión Serial ---
console.log(`SERIAL: Intentando conectar a ${serialPortPath} a ${baudRate} baudios...`);

const port = new SerialPort({
    path: serialPortPath,
    baudRate: baudRate,
    autoOpen: false // No abrir automáticamente, lo haremos manualmente
});

// Parser para leer datos línea por línea
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

port.open((err) => {
    if (err) {
        console.error(`SERIAL: Error al abrir el puerto ${serialPortPath}:`, err.message);
        console.error("Asegúrate de que el simulador Python (`simuladorGUI.py`) esté corriendo y usando el mismo puerto,");
        console.error("o que el Arduino esté conectado y el puerto sea correcto.");
        return;
    }
    console.log(`SERIAL: Puerto ${serialPortPath} abierto exitosamente.`);
});

// --- Manejo de Datos Seriales Entrantes ---
parser.on('data', (dataLine) => {
    const receivedData = dataLine.toString().trim(); // .trim() para quitar espacios/saltos de línea
    console.log(`SERIAL RX: <${receivedData}>`);

    // 1. Guardar los logs en un .txt
    appendToLogFile(receivedData);

    // 2. Enviar los datos a MQTT separados por ;
    // El simulador envía CSV: sonico,fotoresistencia,temperatura,humedad,led_ultra,leds_binario,buzzer,rfid
    // Lo re-formatearemos a punto y coma para MQTT.
    // Si los datos ya vinieran del Arduino en el formato CSV correcto, este paso es solo cambiar la coma por punto y coma.
    if (receivedData) {
        const mqttPayload = receivedData.replace(/,/g, ';'); // Reemplazar todas las comas por punto y coma

        if (mqttClient.connected) {
            mqttClient.publish(mqttOutputTopic, mqttPayload, (err) => {
                if (err) {
                    console.error('MQTT TX: Error al publicar:', err);
                } else {
                    console.log(`MQTT TX: Publicado a '${mqttOutputTopic}': <${mqttPayload}>`);
                }
            });
        } else {
            console.warn('MQTT: No conectado al broker. Mensaje no publicado:', mqttPayload);
        }
    }
});
// ---------------------------------------

// --- Manejo de Errores Seriales ---
port.on('error', (err) => {
    console.error('SERIAL: Error en el puerto:', err.message);
});

port.on('close', () => {
    console.log('SERIAL: Puerto cerrado.');
});
// ---------------------------------

// --- Manejo de Cierre Limpio ---
function cleanupAndExit() {
    console.log("\nCerrando conexiones...");
    if (port && port.isOpen) {
        port.close(() => {
            console.log("Puerto serial cerrado.");
            if (mqttClient && mqttClient.connected) {
                mqttClient.end(true, () => { // true para forzar el cierre si hay mensajes en cola
                    console.log("Cliente MQTT desconectado.");
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });
    } else {
        if (mqttClient && mqttClient.connected) {
            mqttClient.end(true, () => {
                console.log("Cliente MQTT desconectado.");
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    }
}

process.on('SIGINT', cleanupAndExit); // Capturar Ctrl+C
process.on('SIGTERM', cleanupAndExit); // Capturar señal de terminación
// ------------------------------

console.log("Node.js: Script `serial_to_mqtt_logger.js` iniciado. Presiona Ctrl+C para salir.");