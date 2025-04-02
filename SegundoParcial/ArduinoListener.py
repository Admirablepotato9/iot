import serial

SERIAL_PORT = 'COM3'
BAUD_RATE = 9600

def main():
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
            print(f"Escuchando en {SERIAL_PORT}...")
            while True:
                if ser.in_waiting > 0:
                    data = ser.readline().decode().strip()
                    print(f"Datos recibidos: {data}")
    except KeyboardInterrupt:
        print("\nPrograma terminado.")

if __name__ == "__main__":
    main()