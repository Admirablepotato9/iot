import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://broker.emqx.io');

client.on('connect', () => {
  console.log('Connection established');
  setInterval(() => {
    const temperature = Math.floor(Math.random() * 50); // Generate random temperature
    client.publish('amerike/cyber/mqtt/ric', temperature.toString());
    console.log(`Message published to "amerike/cyber/mqtt/ric": ${temperature}`); // Corregido nombre del topic en el log
  }, 5000); // Publish every 5 seconds
});

client.on('error', (error) => {
  console.error('MQTT Client Error:', error);
});

client.on('reconnect', () => {
    console.log('Attempting to reconnect...');
});
  
client.on('close', () => {
    console.log('MQTT Connection closed');
});

client.on('disconnect', (packet) => {
    console.log('MQTT Client disconnected (received DISCONNECT packet)', packet ? `Reason Code: ${packet.reasonCode}` : '');
});

client.on('offline', () => {
    console.log('MQTT Client is offline (will attempt to reconnect)');
});
