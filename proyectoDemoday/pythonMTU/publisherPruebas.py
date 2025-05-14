import random
import time
import os
from datetime import datetime
from paho.mqtt import client as mqtt_client

broker = '192.168.3.52' # ip VM
port = 1883
client_id = f'publish-{random.randint(0, 1000)}'

username = 'mtuuser' # config mosquitto en server
password = 'amerike'

offline_log = None
logs_dir = 'logs'

os.makedirs(logs_dir, exist_ok=True)

def connect_mqtt():
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("✅ Conectado al broker MQTT")
        else:
            print(f"❌ Error de conexión, código {rc}")
    client = mqtt_client.Client(client_id)
    client.username_pw_set(username, password) # agregado para considerar estos datos 
    client.on_connect = on_connect
    try:
        client.connect(broker, port)
    except Exception as e:
        print("❌ Fallo de conexión MQTT:", e)
    return client

def simulate_sensor_data():
    return random.choice([
        'TEMP:24.5',
        'HUM:60',
        'RFID:12345',
        'RFID:67890'
    ])

def get_topic_from_data(msg):
    if msg.startswith("TEMP"):
        return "amerike/sensor/temp"
    elif msg.startswith("HUM"):
        return "amerike/sensor/hum"
    elif msg.startswith("RFID"):
        return "amerike/sensor/rfid"
    else:
        return "amerike/sensor/otros"

def publish(client):
    global offline_log
    for _ in range(10):
        time.sleep(2)
        msg = simulate_sensor_data()
        topic = get_topic_from_data(msg)

        print(f"📦 Simulado: {msg} → {topic}")

        result = client.publish(topic, msg)
        status = result[0]

        if status == 0:
            print(f"📤 Enviado: '{msg}' al topic '{topic}'")
            if offline_log:
                offline_log.close()
                offline_log = None
        else:
            print("⚠️ Error al enviar, guardando localmente...")
            if not offline_log:
                filename = f"offline_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
                offline_log = open(os.path.join(logs_dir, filename), 'a')
            offline_log.write(f"{msg} -> {topic}\n")

def run():
    client = connect_mqtt()
    client.loop_start()
    publish(client)
    client.loop_stop()

if __name__ == '__main__':
    run()
