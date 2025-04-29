import random
import time

from paho.mqtt import client as mqtt_client

broker = 'broker.emqx.io'
port = 1883
topic = "amerike/cyber/mqtt"

#comentario
client_id = f'publish-{random.randint(0,1000)}'



def connect_mqtt():
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("Connected to MQTT Broker")
        else:
            print("Failed to command, return code %d\n", rc)
        
    client = mqtt_client.Client(client_id)
    client.on_connect = on_connect
    client.connect(broker, port)
    return client

def publish(client):
    msg_count = 1
    while True:
        time.sleep(1)
        msg = f"messages: (msg_count)"
        result = client.publish(topic, msg)

        status = result[0]
        if status == 0:
            print(f"Send ´{msg}´ to topic ´{topic}´")
        else:
            print("Failed to send message to topic {topic}")
        msg_count += 1
        if msg_count > 5:
            break

def run():
    client = connect_mqtt()
    client.loop_start()
    publish(client)
    client.loop_stop()


if __name__=='__main__':
    run()