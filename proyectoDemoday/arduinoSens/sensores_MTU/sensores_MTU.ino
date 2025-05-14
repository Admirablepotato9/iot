#include <FastLED.h>
#include <SPI.h>
#include <MFRC522.h>
#include "DHT.h"

//notas
long DO=523.25, //definimos las frecuencias de las notas
        DoS=554.37,
        RE=587.33,
        RES=622.25,
        MI=659.26,
        FA=698.46,
        FAS=739.99,
        SOL=783.99,
        SOLS=830.61,
        LA=880,
        LAS=932.33,
 
       SI=987.77,
        RE2=1174.66,
        FAS2=1479.98,
        PAU=30000; //pausa

#define LED_PIN     6
#define NUM_LEDS    10

CRGB leds[NUM_LEDS];

#define BUZZER 5
#define FR_PIN A0
#define LED 7
#define TRIG 2
#define ECHO 3

#define SS_PIN 10
#define RST_PIN 9

MFRC522 mfrc522(SS_PIN, RST_PIN);
String tarjetasValidas[] = { "34 E7 E5 75", "F4 81 EC E9" };

int trecorrido = 0;
float distancia = 0;

#define DHTPIN 8
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

unsigned long anterior = 0;
const long intervalo = 5000;
unsigned long actual;

void setup() {
    Serial.begin(9600);
    pinMode(TRIG, OUTPUT);
    pinMode(ECHO, INPUT);
    digitalWrite(TRIG, LOW);

    pinMode(BUZZER, OUTPUT);
    pinMode(LED, OUTPUT);

    FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
    FastLED.clear();
    FastLED.show();

    SPI.begin();
    mfrc522.PCD_Init();

    dht.begin();

    Serial.println("Sistema RFID listo...");
}

void loop() {
    actual = millis();

    // Sensor sónico a 1 bit
    digitalWrite(TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG, LOW);
    trecorrido = pulseIn(ECHO, HIGH, 30000);
    int sonicoBit = (trecorrido > 0) ? 1 : 0;

    // Fotoresistencia a 1 bit
    int luz = analogRead(FR_PIN);
    int fotoresistenciaBit = (luz < 15) ? 1 : 0;

    // Control del LED según la fotoresistencia
    if (fotoresistenciaBit == 1) {
        digitalWrite(LED, LOW);  // Apagar LED
        fotoresistenciaBit = 0;
    } else {
        digitalWrite(LED, HIGH); // Encender LED
        fotoresistenciaBit = 1;
    }

    // Sensor de humedad y temperatura a char(5)
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    char humedad[6];
    char temperatura[6];
    dtostrf(h, 5, 2, humedad);
    dtostrf(t, 5, 2, temperatura);

    // LED a 1 bit
    int ledBit = digitalRead(LED);

    // Leds WS2812 a binarios
    String ledsBinarios = "";
    for (int i = 0; i < 8; i++) {
        ledsBinarios += (leds[i].r > 0 || leds[i].g > 0 || leds[i].b > 0) ? "1" : "0";
    }

    // RFID UID a char(9)
    String uidTarjeta = "";
    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        for (byte i = 0; i < mfrc522.uid.size; i++) {
            uidTarjeta += String(mfrc522.uid.uidByte[i], HEX);
            if (i < mfrc522.uid.size - 1) uidTarjeta += " ";
        }
        uidTarjeta.toUpperCase();
        mfrc522.PICC_HaltA();
    }
    char rfid[10];
    uidTarjeta.toCharArray(rfid, 10);

    // Envío a Serial en una sola línea
    Serial.print(sonicoBit);
    Serial.print(",");
    Serial.print(fotoresistenciaBit);
    Serial.print(",");
    Serial.print(humedad);
    Serial.print(",");
    Serial.print(temperatura);
    Serial.print(",");
    Serial.print(ledBit);
    Serial.print(",");
    Serial.print(ledsBinarios);
    Serial.print(",");
    Serial.println(rfid);

    delay(500);
}