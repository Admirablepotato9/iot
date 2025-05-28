#include <ArduinoJson.h> // <<<<<<<<<<<<<<<<<<< NUEVA LIBRERÍA
#include <FastLED.h>
#include <SPI.h>
#include <MFRC522.h>
#include "DHT.h"

// --- Definiciones de Notas (sin cambios) ---
long DO=523.25, DoS=554.37, RE=587.33, RES=622.25, MI=659.26, FA=698.46,
     FAS=739.99, SOL=783.99, SOLS=830.61, LA=880, LAS=932.33, SI=987.77,
     RE2=1174.66, FAS2=1479.98, PAU=30000;

// --- Pines y Configuraciones de Hardware ---
#define LED_PIN_FASTLED   6
#define NUM_LEDS_FASTLED  10
CRGB leds[NUM_LEDS_FASTLED];

#define BUZZER_PIN        5
#define FR_PIN            A1
#define LED_FR_PIN        7
#define TRIG_PIN          2
#define ECHO_PIN          3

#define SS_PIN_RFID       10
#define RST_PIN_RFID      9
MFRC522 mfrc522(SS_PIN_RFID, RST_PIN_RFID);
String tarjetasValidas[] = { "34 E7 E5 75", "31 4E 8E 47"};
int indicesFastLEDs[] = {3, 5};
bool estadoFastLEDs[] = {false, false};

#define DHTPIN            8
#define DHTTYPE           DHT11
DHT dht(DHTPIN, DHTTYPE);

// --- Variables Globales ---
long tiempoRecorridoUltrasonico = 0;
float distanciaUltrasonico = 0.0;

unsigned long tiempoAnteriorDHT = 0;
const long intervaloLecturaDHT = 5000;

bool pcValidado = false;
String comandoRecibido, ubicacionDispositivo; // Esta 'ubicacionDispositivo' será usada por Node.js

// JsonDocument para construir el JSON. Ajustar tamaño según necesidad.
// Para 8 sensores con nombres y valores, 256 o 512 debería ser suficiente.
// Si añades más datos o nombres más largos, podrías necesitar aumentarlo.
StaticJsonDocument<512> jsonDoc; // <<<<<<<<<<<<<<<<<<< JSON DOCUMENT

void setup() {
    Serial.begin(9600);
    Serial.println("Esperando código de validación del PC...");

    while (!pcValidado) {
        if (Serial.available()) {
            String cadenaNode = Serial.readStringUntil('\n');
            cadenaNode.trim();
            int posicionPipe = cadenaNode.indexOf('|');
            if (posicionPipe != -1) {
                comandoRecibido = cadenaNode.substring(0, posicionPipe);
                comandoRecibido.trim();
                ubicacionDispositivo = cadenaNode.substring(posicionPipe + 1);
                ubicacionDispositivo.trim();

                if (comandoRecibido == "AX2343PC") {
                    pcValidado = true;
                    // Enviamos la ubicación al script Node.js para que la use en los topics MQTT
                    Serial.print("UBICACION_CONFIRMADA|"); // Prefijo para que Node.js sepa que esto es la ubicación
                    Serial.println(ubicacionDispositivo);
                } else {
                    Serial.println("Código incorrecto. Reintentando...");
                }
            } else {
                Serial.println("Formato de mensaje PC incorrecto.");
            }
        }
        delay(100);
    }

    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    digitalWrite(TRIG_PIN, LOW);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_FR_PIN, OUTPUT);

    FastLED.addLeds<WS2812, LED_PIN_FASTLED, GRB>(leds, NUM_LEDS_FASTLED);
    FastLED.setBrightness(50);
    FastLED.clear();
    FastLED.show();

    SPI.begin();
    mfrc522.PCD_Init();

    dht.begin();
    
    float h_inicial = dht.readHumidity();
    float t_inicial = dht.readTemperature();
    // No es necesario almacenar en payload_ variables aquí, se leerá en el loop y se pondrá en el JSON
    tiempoAnteriorDHT = millis();
}

void loop() {
    unsigned long tiempoActual = millis();
    jsonDoc.clear(); // Limpiar el documento JSON para nuevos datos <<<<<<<<<<<<<<<<<

    // Variables temporales para los valores de los sensores en este ciclo
    int val_sonico = 0;
    int val_fotores = 0;
    float val_temperatura = 0.0; // Usar un valor por defecto o la última lectura válida
    float val_humedad = 0.0;     // Usar un valor por defecto o la última lectura válida
    int val_led_ultra = 0;
    int val_leds_binario = 0;
    int val_buzzer_activo = 0;
    String val_rfid_uid = "N/A";

    // Leer la última temperatura y humedad conocidas para evitar enviar 0.0 si DHT no se lee en este ciclo
    static float ultima_temp_valida = 0.0;
    static float ultima_hum_valida = 0.0;


    bool tarjetaValidaEncontradaEsteCiclo = false;
    String uidTarjetaActual = "";

    // --- 1. LECTOR RFID ---
    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        uidTarjetaActual = "";
        for (byte i = 0; i < mfrc522.uid.size; i++) {
            uidTarjetaActual.concat(String(mfrc522.uid.uidByte[i] < 0x10 ? " 0" : " "));
            uidTarjetaActual.concat(String(mfrc522.uid.uidByte[i], HEX));
        }
        uidTarjetaActual.trim();
        uidTarjetaActual.toUpperCase();
        val_rfid_uid = uidTarjetaActual;

        for (int i = 0; i < (sizeof(tarjetasValidas) / sizeof(String)); i++) {
            if (uidTarjetaActual == tarjetasValidas[i]) {
                tarjetaValidaEncontradaEsteCiclo = true;
                estadoFastLEDs[i] = !estadoFastLEDs[i];
                break;
            }
        }

        FastLED.clear();
        for (int i = 0; i < (sizeof(indicesFastLEDs) / sizeof(int)); i++) {
            if (estadoFastLEDs[i]) {
                leds[indicesFastLEDs[i]] = CRGB::BlueViolet;
            }
        }
        FastLED.show();

        if (tarjetaValidaEncontradaEsteCiclo) {
            tone(BUZZER_PIN, LA, 500);
            val_buzzer_activo = 1;
        } else {
            tone(BUZZER_PIN, DO, 200);
            delay(250);
            tone(BUZZER_PIN, DO, 200);
            val_buzzer_activo = 1;
        }
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();
    }

    // --- 2. FOTORESISTENCIA y LED ASOCIADO (LED_ULTRA) ---
    int valorLuz = analogRead(FR_PIN);
    if (valorLuz < 100) {
        digitalWrite(LED_FR_PIN, HIGH);
        val_fotores = 0;
        val_led_ultra = 1;
    } else {
        digitalWrite(LED_FR_PIN, LOW);
        val_fotores = 1;
        val_led_ultra = 0;
    }

    // --- 3. SENSOR ULTRASÓNICO (SÓNICO) ---
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    tiempoRecorridoUltrasonico = pulseIn(ECHO_PIN, HIGH, 30000);
    if (tiempoRecorridoUltrasonico > 0) {
        distanciaUltrasonico = tiempoRecorridoUltrasonico * 0.0343 / 2.0;
        if (distanciaUltrasonico < 20.0 && distanciaUltrasonico > 0) {
            val_sonico = 1;
        } else {
            val_sonico = 0;
        }
    } else {
        val_sonico = 0;
    }

    // --- 4. SENSOR DHT (Temperatura y Humedad) ---
    if (tiempoActual - tiempoAnteriorDHT >= intervaloLecturaDHT) {
        tiempoAnteriorDHT = tiempoActual;
        float h = dht.readHumidity();
        float t = dht.readTemperature();
        if (!isnan(h)) ultima_hum_valida = h;
        if (!isnan(t)) ultima_temp_valida = t;
    }
    val_humedad = ultima_hum_valida;
    val_temperatura = ultima_temp_valida;


    // --- 5. ESTADO LEDS BINARIO (FastLEDs) ---
    val_leds_binario = 0;
    for (int i = 0; i < (sizeof(estadoFastLEDs) / sizeof(bool)); i++) {
        if (estadoFastLEDs[i]) {
            val_leds_binario = 1;
            break;
        }
    }

    // --- CONSTRUIR EL JSON ---
    // Opción 1: Un array de objetos, cada objeto es un sensor.
    // Esto es más flexible para el script Node.js que publica por sensor.
    JsonArray dataArray = jsonDoc.to<JsonArray>();

    JsonObject sonicoObj = dataArray.createNestedObject();
    sonicoObj["sensor"] = "sonico";
    sonicoObj["valor"] = val_sonico;

    JsonObject fotoresObj = dataArray.createNestedObject();
    fotoresObj["sensor"] = "fotoresistencia";
    fotoresObj["valor"] = val_fotores;

    JsonObject tempObj = dataArray.createNestedObject();
    tempObj["sensor"] = "temperatura";
    tempObj["valor"] = अराउंड(val_temperatura * 100.0) / 100.0; // Redondear a 2 decimales

    JsonObject humObj = dataArray.createNestedObject();
    humObj["sensor"] = "humedad";
    humObj["valor"] = around(val_humedad * 100.0) / 100.0; // Redondear a 2 decimales

    JsonObject ledUltraObj = dataArray.createNestedObject();
    ledUltraObj["sensor"] = "led_ultra";
    ledUltraObj["valor"] = val_led_ultra;

    JsonObject ledsBinObj = dataArray.createNestedObject();
    ledsBinObj["sensor"] = "leds_binario";
    ledsBinObj["valor"] = val_leds_binario;

    JsonObject buzzerObj = dataArray.createNestedObject();
    buzzerObj["sensor"] = "buzzer_activo";
    buzzerObj["valor"] = val_buzzer_activo;

    JsonObject rfidObj = dataArray.createNestedObject();
    rfidObj["sensor"] = "rfid_uid";
    rfidObj["valor"] = val_rfid_uid;
    
    // --- ENVIAR JSON POR SERIAL ---
    serializeJson(jsonDoc, Serial); // Envía el JSON completo
    Serial.println(); // Importante para que ReadlineParser en Node.js detecte el fin de línea

    delay(2000); // Aumentar un poco el delay si es necesario para la estabilidad del serial o procesamiento
}