# Sistema de Monitoreo IoT con Comunicación Serial

![IoT Banner](https://img.shields.io/badge/Platform-Node.js-green.svg) 
![Serial Comm](https://img.shields.io/badge/Protocol-Serial%20Communication-blue.svg)

Sistema completo para monitoreo y control de dispositivos IoT mediante comunicación serial, con interfaz gráfica (Python/Tkinter) y backend en Node.js para registro de datos.

## 📋 Características Principales

- **Monitorización en tiempo real** de 8 parámetros:
  - Sensor sónico (ON/OFF)
  - Fotoresistencia (Luz ambiental)
  - Temperatura (°C)
  - Humedad (%)
  - LED ultrabrillante
  - Array de 10 LEDs
  - Buzzer
  - Lecturas RFID

- **Interfaces disponibles**:
  - Aplicación Python con GUI (Tkinter)
  - Servidor Node.js para registro de datos
  - Protocolo serial estandarizado (CSV)

- **Funcionalidades avanzadas**:
  - Control automático/manual del LED
  - Validación de datos de entrada
  - Registro histórico en archivo log
  - Sistema de colas para procesamiento asíncrono