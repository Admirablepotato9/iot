import random
from paho.mqtt import client as mqtt_client

# Datos del servidor Mosquitto
broker = '172.16.48.92'
port = 1883
client_id = f'subscriber-{random.randint(0, 1000)}'

# Lista sede/piso/sensor
opciones = {
    # -------- CDMX --------
    '1':  ('amerikeCDMX/PB/temp', 'CDMX PB - Temperatura'),
    '2':  ('amerikeCDMX/PB/hum', 'CDMX PB - Humedad'),
    '3':  ('amerikeCDMX/PB/rfid', 'CDMX PB - RFID autorizado'),
    '4':  ('amerikeCDMX/PB/rfid/denegado', 'CDMX PB - RFID denegado'),
    '5':  ('amerikeCDMX/PB/otros', 'CDMX PB - Otros sensores'),

    '6':  ('amerikeCDMX/P1/temp', 'CDMX P1 - Temperatura'),
    '7':  ('amerikeCDMX/P1/hum', 'CDMX P1 - Humedad'),
    '8':  ('amerikeCDMX/P1/rfid', 'CDMX P1 - RFID autorizado'),
    '9':  ('amerikeCDMX/P1/rfid/denegado', 'CDMX P1 - RFID denegado'),
    '10': ('amerikeCDMX/P1/otros', 'CDMX P1 - Otros sensores'),

    '11': ('amerikeCDMX/P2/temp', 'CDMX P2 - Temperatura'),
    '12': ('amerikeCDMX/P2/hum', 'CDMX P2 - Humedad'),
    '13': ('amerikeCDMX/P2/rfid', 'CDMX P2 - RFID autorizado'),
    '14': ('amerikeCDMX/P2/rfid/denegado', 'CDMX P2 - RFID denegado'),
    '15': ('amerikeCDMX/P2/otros', 'CDMX P2 - Otros sensores'),

    # -------- GDJ --------
    '16': ('amerikeGDJ/PB/temp', 'GDJ PB - Temperatura'),
    '17': ('amerikeGDJ/PB/hum', 'GDJ PB - Humedad'),
    '18': ('amerikeGDJ/PB/rfid', 'GDJ PB - RFID autorizado'),
    '19': ('amerikeGDJ/PB/rfid/denegado', 'GDJ PB - RFID denegado'),
    '20': ('amerikeGDJ/PB/otros', 'GDJ PB - Otros sensores'),

    '21': ('amerikeGDJ/P1/temp', 'GDJ P1 - Temperatura'),
    '22': ('amerikeGDJ/P1/hum', 'GDJ P1 - Humedad'),
    '23': ('amerikeGDJ/P1/rfid', 'GDJ P1 - RFID autorizado'),
    '24': ('amerikeGDJ/P1/rfid/denegado', 'GDJ P1 - RFID denegado'),
    '25': ('amerikeGDJ/P1/otros', 'GDJ P1 - Otros sensores'),

    '26': ('amerikeGDJ/P2/temp', 'GDJ P2 - Temperatura'),
    '27': ('amerikeGDJ/P2/hum', 'GDJ P2 - Humedad'),
    '28': ('amerikeGDJ/P2/rfid', 'GDJ P2 - RFID autorizado'),
    '29': ('amerikeGDJ/P2/rfid/denegado', 'GDJ P2 - RFID denegado'),
    '30': ('amerikeGDJ/P2/otros', 'GDJ P2 - Otros sensores'),
}

# Mostrar menú
print("Selecciona el topic al que deseas suscribirte:\n")
for k, v in opciones.items():
    print(f"{k}. {v[1]}")

opcion = input("\nIngresa el número de opción: ").strip()

if opcion not in opciones:
    print("❌ Opción inválida.")
    exit(1)

topic = opciones[opcion][0]
print(f"\n📡 Suscrito a: {topic} - {opciones[opcion][1]}")

# Conexión al broker
def connect_mqtt():
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("✅ Conectado al broker MQTT")
        else:
            print(f"❌ Error de conexión, código {rc}")

    client = mqtt_client.Client(client_id)
    client.username_pw_set("mtuuser", "amerike")
    client.on_connect = on_connect
    client.connect(broker, port)
    return client

# Lógica de suscripción
def subscribe(client):
    def on_message(client, userdata, msg):
        print(f"📥 Mensaje recibido: '{msg.payload.decode()}' del topic '{msg.topic}'")

    client.subscribe(topic)
    client.on_message = on_message

def run():
    client = connect_mqtt()
    subscribe(client)
    client.loop_forever()

if __name__ == '__main__':
    run()
