require('dotenv').config();
const mqtt = require('mqtt');
const { SerialPort } = require('serialport');
const fs = require('fs');
const path = require('path');

// Configuración desde .env
const sede = process.env.SEDE || 'amerikeCDMX';
const piso = process.env.PISO || 'P1';
const baseTopic = `${sede}/${piso}`;

// Configuración de broker MQTT
const options = {
  host: '172.16.48.92',
  port: 1883,
  username: 'mtuuser',
  password: 'amerike'
};
const client = mqtt.connect(options);

// Configuración del puerto serial virtual
const serialPath = process.env.SERIAL_PORT || '/dev/pts/0';
const port = new SerialPort({ path: serialPath, baudRate: 9600 });

// UIDs de RFID permitidos
const autorizados = ['12345', '67890'];

let offlineLogStream = null;

// Verifica y crea carpeta logs si no existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Función para publicar cada sensor individualmente
function publicarDatosSeparados(partes) {
  const [sonico, fotores, temp, hum, led, ledsBin, buzzer, rfid] = partes;

  const mensajes = [
    { topic: `${baseTopic}/temp`, mensaje: `TEMP:${temp}` },
    { topic: `${baseTopic}/hum`, mensaje: `HUM:${hum}` },
    {
      topic: autorizados.includes(rfid)
        ? `${baseTopic}/rfid`
        : `${baseTopic}/rfid/denegado`,
      mensaje: `RFID:${rfid}`
    }
  ];

  mensajes.forEach(({ topic, mensaje }) => {
    if (client.connected) {
      client.publish(topic, mensaje);
      console.log(`📤 Publicado en '${topic}' → ${mensaje}`);
    } else {
      if (!offlineLogStream) {
        const filename = `offline_${Date.now()}.txt`;
        offlineLogStream = fs.createWriteStream(path.join(logsDir, filename), { flags: 'a' });
      }
      offlineLogStream.write(`${new Date().toISOString()} | ${mensaje} → ${topic}\n`);
    }
  });
}

// Lectura del puerto serial
port.on('data', (data) => {
  const message = data.toString().trim();
  console.log(`📡 Datos del Arduino: ${message}`);

  const partes = message.split(',');

  if (partes.length >= 8) {
    publicarDatosSeparados(partes);
  } else {
    const topic = `${baseTopic}/otros`;
    if (client.connected) {
      client.publish(topic, message);
      console.log(`📤 Publicado en '${topic}'`);
    } else {
      if (!offlineLogStream) {
        const filename = `offline_${Date.now()}.txt`;
        offlineLogStream = fs.createWriteStream(path.join(logsDir, filename), { flags: 'a' });
      }
      offlineLogStream.write(`${new Date().toISOString()} | ${message} → ${topic}\n`);
    }
  }
});

// Eventos de conexión
client.on('connect', () => {
  console.log('✅ Conectado al broker MQTT');
  if (offlineLogStream) {
    offlineLogStream.close();
    offlineLogStream = null;
  }
});

client.on('error', (err) => {
  console.error('❌ Error con MQTT:', err);
});
