import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://broker.emqx.io');

client.on('connect', () => {
  console.log('Connection established');
  setInterval(() => {
    const temperature = Math.floor(Math.random() * 50); // Generate random temperature
    client.publish('amerike/cyber/mqtt/ric', temperature.toString());
    console.log(`Message published to "temperature": ${temperature}`);
  }, 5000); // Publish every 5 seconds
});

client.on('error', (error) => {
  console.error('Connection error:', error);

  if (error.error === -3008) {

    console.log('Connection error: Guardar en la db'+iConst);
    iConst = iConst + 1;
  }
   else{
    console.error('Connection error:', error);
   }

}
);