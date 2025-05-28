import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import mqtt from 'mqtt';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const serialPortPath = process.env.SERIAL_PORT_PATH;
const baudRate = parseInt(process.env.SERIAL_BAUD_RATE || '9600', 10);
const mqttBrokerUrl = process.env.MQTT_BROKER_URL;
const mqttLogTopic = process.env.MQTT_LOG_TOPIC || 'amerike/cyber/iot/device_log';
const logFilePath = path.resolve(process.env.LOG_FILE_PATH || './serial_data_log.txt');

let arduinoDeviceLocation = null;
const ARDUINO_HANDSHAKE_CODE = "AX2343PC";
const ARDUINO_LOCATION_FOR_TOPIC = process.env.DEVICE_LOCATION_ID || "default_location/unknown_device";

if (!serialPortPath) {
    console.error("Error: SERIAL_PORT_PATH no definido. Saliendo.");
    process.exit(1);
}
if (!mqttBrokerUrl) {
    console.error("Error: MQTT_BROKER_URL no definido. Saliendo.");
    process.exit(1);
}

const mqttClient = mqtt.connect(mqttBrokerUrl);

mqttClient.on('connect', () => {
    console.log(`MQTT: Conectado a ${mqttBrokerUrl}`);
    mqttClient.publish(`${mqttLogTopic}/status`, "serial_to_mqtt_logger online", { retain: true });
});

mqttClient.on('error', (error) => {
    console.error('MQTT: Error de conexión:', error);
});

function appendToLogFile(data, type = "RX_SERIAL") {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${type}: ${data}\n`;
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) console.error('LOG: Error al escribir en log:', err);
    });
}

console.log(`SERIAL: Conectando a ${serialPortPath} a ${baudRate} baudios...`);
const port = new SerialPort({
    path: serialPortPath,
    baudRate: baudRate,
    autoOpen: false
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

port.open((err) => {
    if (err) {
        console.error(`SERIAL: Error al abrir ${serialPortPath}:`, err.message);
        return;
    }
    console.log(`SERIAL: Puerto ${serialPortPath} abierto.`);
    const handshakeMsg = `${ARDUINO_HANDSHAKE_CODE}|${ARDUINO_LOCATION_FOR_TOPIC}\n`;
    console.log(`SERIAL TX: Enviando validación: ${handshakeMsg.trim()}`);
    port.write(handshakeMsg, (writeErr) => {
        if (writeErr) console.error('SERIAL TX: Error enviando validación:', writeErr.message);
        else console.log('SERIAL TX: Validación enviada.');
    });
});

function parseArduinoData(dataString) {
    const sensors = {};
    const parts = dataString.split(';');

    parts.forEach(part => {
        if (part.trim() === '') return;

        if (part.startsWith("hum:")) {
            const value = part.match(/hum:([\d.]+)/);
            if (value && value[1]) sensors.humedad = parseFloat(value[1]);
        } else if (part.startsWith("temp:")) {
            const value = part.match(/temp:([\d.]+)/);
            if (value && value[1]) sensors.temperatura = parseFloat(value[1]);
        } else if (part.startsWith("rfid:")) {
            sensors.rfid_presente = 1; // O el valor que 'lector' tenga
            const validMatch = part.match(/:v-uid:(\w+)/); // true/false
            if (validMatch && validMatch[1]) sensors.rfid_valida = (validMatch[1] === 'true' || validMatch[1] === '1');

            const uidMatch = part.match(/:UID:([\w\s]+)/);
            if (uidMatch && uidMatch[1]) sensors.rfid_uid = uidMatch[1].trim();
            else sensors.rfid_uid = "N/A";

        } else if (part.startsWith("fr:")) {
            const value = part.match(/fr:(\d)/);
            if (value && value[1]) sensors.fotoresistencia = parseInt(value[1]);
        } else if (part.startsWith("dist:")) {
            const value = part.match(/dist:(\d)/);
            if (value && value[1]) sensors.distancia_sonico = parseInt(value[1]); // Esto es 0 o 1 según tu Arduino
        }
    });
    return sensors;
}


parser.on('data', (dataLine) => {
    const receivedData = dataLine.toString().trim();
    appendToLogFile(receivedData, "SERIAL_RX");

    if (receivedData.startsWith("Waiting code...")) {
        console.log(`SERIAL RX (INFO): ${receivedData}`);
        return;
    }
    if (receivedData.startsWith("APPROVED")) {
        console.log(`SERIAL RX (INFO): ${receivedData}`);
        // La ubicación ya se envió al Arduino, y él la usa para prefijar su salida.
        // No necesitamos extraerla de "APPROVED" como antes.
        return;
    }
    if (receivedData.startsWith("Not the code")) {
        console.log(`SERIAL RX (WARN): ${receivedData}`);
        return;
    }
    
    // Esperamos que la línea de datos comience con la ubicación enviada por el Arduino
    // Ejemplo: "amerike/cdmx/edi1/01| hum:25.00%t:f;temp:22.50*C:f;rfid:1:i:v-uid:true:b:UID:34 E7 E5 75;"
    const firstPipeIndex = receivedData.indexOf('|');
    if (firstPipeIndex === -1 && receivedData.length > 0) {
        console.warn(`SERIAL RX: Línea de datos sin separador '|' esperado: <${receivedData}>`);
        return;
    }
    
    let dataPayloadString;
    if (firstPipeIndex !== -1) {
        const potentialLocation = receivedData.substring(0, firstPipeIndex).trim();
        // Solo actualiza la ubicación si no está establecida o si es diferente
        // y parece una ruta válida (contiene al menos un '/')
        if ((!arduinoDeviceLocation || arduinoDeviceLocation !== potentialLocation) && potentialLocation.includes('/')) {
            arduinoDeviceLocation = potentialLocation;
            console.log(`MQTT: Base de topic establecida/actualizada desde Arduino: '${arduinoDeviceLocation}'`);
            appendToLogFile(`Ubicación base para topics: ${arduinoDeviceLocation}`, "SYSTEM_INFO");
            if (mqttClient.connected) {
                mqttClient.publish(`${mqttLogTopic}/device_location/${arduinoDeviceLocation}`, "active", { retain: true });
            }
        }
        dataPayloadString = receivedData.substring(firstPipeIndex + 1).trim();
    } else {
        // Si no hay pipe, y ya tenemos una ubicación, asumimos que toda la línea es payload
        // Esto es por si el Arduino deja de enviar el prefijo de ubicación en cada línea
        if (arduinoDeviceLocation && receivedData.length > 0) {
            dataPayloadString = receivedData;
        } else if (receivedData.length > 0) {
             console.warn(`SERIAL RX: Datos recibidos sin prefijo de ubicación y sin ubicación previa establecida: <${receivedData}>`);
             return;
        } else { // Línea vacía
            return;
        }
    }


    if (!arduinoDeviceLocation) {
        console.warn("SERIAL RX: No se ha establecido la ubicación del dispositivo Arduino. Los datos no se publicarán.");
        appendToLogFile("Datos recibidos sin ubicación establecida", "WARNING");
        return;
    }

    try {
        const parsedSensors = parseArduinoData(dataPayloadString);

        if (Object.keys(parsedSensors).length > 0) {
            for (const sensorName in parsedSensors) {
                const topic = `${arduinoDeviceLocation}/${sensorName}`;
                const payload = String(parsedSensors[sensorName]);

                if (mqttClient.connected) {
                    mqttClient.publish(topic, payload, (err) => {
                        if (err) {
                            console.error(`MQTT TX: Error al publicar a '${topic}':`, err);
                            appendToLogFile(`Error publicando a ${topic}: ${err.message}`, "MQTT_TX_ERROR");
                        } else {
                            console.log(`MQTT TX: Publicado a '${topic}': <${payload}>`);
                        }
                    });
                } else {
                    console.warn(`MQTT: No conectado. Mensaje no publicado: ${topic} -> ${payload}`);
                    appendToLogFile(`MQTT no conectado, no publicado: ${topic} -> ${payload}`, "MQTT_WARNING");
                }
            }
        } else if (dataPayloadString.length > 0) { // Si hubo payload pero no se parseó nada
            console.warn('SERIAL RX: No se pudieron parsear datos de sensores de la cadena:', dataPayloadString);
            appendToLogFile(`Fallo al parsear datos: ${dataPayloadString}`, "PARSE_ERROR");
        }

    } catch (e) {
        console.error('SERIAL RX: Error al procesar datos:', e.message, `| Datos: <${dataPayloadString}>`);
        appendToLogFile(`Error procesando datos: ${e.message} | Datos: ${dataPayloadString}`, "PROCESSING_CRITICAL");
    }
});

port.on('error', (err) => {
    console.error('SERIAL: Error en puerto:', err.message);
    appendToLogFile(`Error en puerto serial: ${err.message}`, "SERIAL_ERROR");
});

port.on('close', () => {
    console.log('SERIAL: Puerto cerrado.');
    appendToLogFile("Puerto serial cerrado", "SERIAL_INFO");
});

function cleanupAndExit() {
    console.log("\nCerrando conexiones...");
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(`${mqttLogTopic}/status`, "serial_to_mqtt_logger offline", { retain: true }, () => {
            mqttClient.end(true, () => {
                console.log("Cliente MQTT desconectado.");
                closeSerialPortAndExit();
            });
        });
    } else {
        closeSerialPortAndExit();
    }
}

function closeSerialPortAndExit() {
    if (port && port.isOpen) {
        port.close(() => {
            console.log("Puerto serial cerrado.");
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

console.log("Node.js: Script `serial_to_mqtt_logger.js` iniciado.");