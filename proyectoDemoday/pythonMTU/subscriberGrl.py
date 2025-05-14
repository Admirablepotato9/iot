import random
from paho.mqtt import client as mqtt_client

# Datos del servidor Mosquitto
broker = '192.168.3.53'
port = 1883
client_id = f'subscribe-{random.randint(0, 1000)}'
username = 'mtuuser'
password = 'amerike'

# Nos suscribimos a todos los sensores: TEMP, HUM, RFID
topic = "amerike/sensor/#"

def connect_mqtt():
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("✅ Conectado al broker MQTT")
        else:
            print(f"❌ Error de conexión, código {rc}")
        
    client = mqtt_client.Client(client_id)
    client.username_pw_set(username, password)
    client.on_connect = on_connect
    client.connect(broker, port)
    return client

def subscribe(client: mqtt_client):
    def on_message(client, userdata, msg):
        print(f"📥 Recibido '{msg.payload.decode()}' del topic '{msg.topic}'")
    client.subscribe(topic)
    client.on_message = on_message

def run():
    client = connect_mqtt()
    subscribe(client)
    client.loop_forever()

if __name__ == '__main__':
    run()
