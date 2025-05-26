import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import serial
import threading
import queue
import time
import os # Para leer variables de entorno (opcional pero bueno)

# ===================== CONFIGURACIÓN INICIAL =====================
# Configuración del puerto serial (ajustar según necesidad)
# Intenta leer de una variable de entorno, si no, usa un valor por defecto para Windows
# Este será el puerto en el que el simulador ESCRIBE
SERIAL_PORT_SIMULADOR = os.getenv('SIMULADOR_SERIAL_PORT', 'COM1') # <--- CAMBIA A COM1 (o el primer puerto de tu par)
BAUD_RATE = 9600

class EnhancedSensorUI:
    """Clase principal que maneja la interfaz gráfica y la lógica de control"""

    def __init__(self, root):
        """Inicializa la aplicación con la ventana principal"""
        self.root = root
        self.root.title("Control de Sensores IoT - Mejorado")
        self.root.geometry("900x700")

        # ========== CONFIGURACIÓN DE ESTILOS ==========
        self.setup_styles()

        # ========== VARIABLES DE ESTADO ==========
        self.sonico = tk.IntVar(value=0)
        self.fotoresistencia = tk.IntVar(value=1)
        self.temperatura = tk.DoubleVar(value=22.5)
        self.humedad = tk.DoubleVar(value=45.0)
        self.led_ultra = tk.IntVar(value=0)
        self.leds = [tk.IntVar(value=0) for _ in range(10)]
        self.buzzer = tk.IntVar(value=0)
        self.rfid = tk.StringVar(value="ID0001ABC")
        self.sending_active = True

        # ========== CONFIGURACIÓN DE LA INTERFAZ ==========
        self.setup_main_frames()
        self.setup_sensor_controls()
        self.setup_actuator_controls()
        self.setup_console_system()
        self.setup_status_bar()

        # ========== SISTEMA DE COLAS ==========
        self.data_queue = queue.Queue()
        self.update_queue = queue.Queue(maxsize=10)

        # ========== INICIO DE SERVICIOS ==========
        try:
            # Usar la variable SERIAL_PORT_SIMULADOR
            self.serial_port = serial.Serial(SERIAL_PORT_SIMULADOR, BAUD_RATE, timeout=1)
            self.running = True
            self.start_services()
            self.update_status(f"Sistema iniciado - Enviando datos a {SERIAL_PORT_SIMULADOR}...") # Actualizar mensaje
        except Exception as e:
            messagebox.showerror("Error de Puerto Serial (Simulador)",
                                 f"No se pudo abrir el puerto serial '{SERIAL_PORT_SIMULADOR}':\n{str(e)}\n\n"
                                 f"Asegúrate de:\n"
                                 f"1. Haber creado un puente de puertos virtuales (ej. COM1 <-> COM2).\n"
                                 f"2. Que '{SERIAL_PORT_SIMULADOR}' sea el primer puerto del par (en el que este simulador escribe).\n"
                                 f"3. Que ningún otro programa esté usando '{SERIAL_PORT_SIMULADOR}'.")
            self.root.destroy()
            return

        # ========== CONFIGURACIÓN ADICIONAL ==========
        self.setup_tooltips()
        self.root.after(100, self.process_updates)

    # ... (El resto del código de EnhancedSensorUI sigue igual que antes) ...
    # Solo hemos modificado la parte de SERIAL_PORT y el mensaje de error.

    def setup_styles(self):
        """Configura los estilos visuales de la interfaz (tema claro)"""
        self.style = ttk.Style()
        self.style.theme_use('clam')  # Tema claro con bordes definidos

        # Configuración de colores y estilos
        self.style.configure('.', background='#f0f0f0', foreground='black')
        self.style.configure('TFrame', background='#f0f0f0')
        self.style.configure('TLabel', background='#f0f0f0', foreground='black')
        self.style.configure('TLabelframe', background='#f0f0f0', foreground='black')
        self.style.configure('TLabelframe.Label', background='#f0f0f0', foreground='black')
        self.style.configure('TButton', background='#e1e1e1', foreground='black')
        self.style.configure('TEntry', fieldbackground='white', foreground='black')
        self.style.configure('TSpinbox', fieldbackground='white', foreground='black')
        self.style.configure('Status.TLabel', background='#e0e0e0', relief=tk.SUNKEN)

    def setup_main_frames(self):
        """Configura los frames principales de la interfaz"""
        # Frame principal que contiene todo
        self.main_frame = ttk.Frame(self.root, padding="10")
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # Frame para sensores
        self.sensor_frame = ttk.LabelFrame(self.main_frame, text="Sensores", padding=10)
        self.sensor_frame.grid(row=0, column=0, padx=5, pady=5, sticky="nsew")

        # Frame para actuadores
        self.actuator_frame = ttk.LabelFrame(self.main_frame, text="Actuadores", padding=10)
        self.actuator_frame.grid(row=1, column=0, padx=5, pady=5, sticky="nsew")

        # Configuración de grid responsive
        self.main_frame.grid_rowconfigure(0, weight=1)
        self.main_frame.grid_rowconfigure(1, weight=1)
        self.main_frame.grid_columnconfigure(0, weight=1)

    def setup_sensor_controls(self):
        """Configura los controles para los sensores"""
        # Sónico - Checkbutton
        ttk.Label(self.sensor_frame, text="Sónico:").grid(row=0, column=0, sticky=tk.W)
        self.sonico_btn = ttk.Checkbutton(
            self.sensor_frame,
            variable=self.sonico,
            command=lambda: self.log_action(f"Sónico cambiado a {self.sonico.get()}")
        )
        self.sonico_btn.grid(row=0, column=1, sticky=tk.W)

        # Fotoresistencia - Checkbutton
        ttk.Label(self.sensor_frame, text="Fotoresistencia:").grid(row=1, column=0, sticky=tk.W)
        self.fotoresistencia_btn = ttk.Checkbutton(
            self.sensor_frame,
            variable=self.fotoresistencia,
            command=self.update_fotoresistencia
        )
        self.fotoresistencia_btn.grid(row=1, column=1, sticky=tk.W)

        # Temperatura - Spinbox con valores decimales
        ttk.Label(self.sensor_frame, text="Temperatura (°C):").grid(row=2, column=0, sticky=tk.W)
        self.temp_spin = ttk.Spinbox(
            self.sensor_frame,
            from_=-10.0,
            to=50.0,
            increment=0.1,
            textvariable=self.temperatura,
            width=8,
            command=lambda: self.log_action(f"Temperatura ajustada a {self.temperatura.get()}°C")
        )
        self.temp_spin.grid(row=2, column=1, sticky=tk.W)

        # Humedad - Spinbox con valores decimales
        ttk.Label(self.sensor_frame, text="Humedad (%):").grid(row=3, column=0, sticky=tk.W)
        self.hum_spin = ttk.Spinbox(
            self.sensor_frame,
            from_=0.0,
            to=100.0,
            increment=0.5,
            textvariable=self.humedad,
            width=8,
            command=lambda: self.log_action(f"Humedad ajustada a {self.humedad.get()}%")
        )
        self.hum_spin.grid(row=3, column=1, sticky=tk.W)

        # RFID - Entry con validación
        ttk.Label(self.sensor_frame, text="RFID:").grid(row=4, column=0, sticky=tk.W)
        self.rfid_entry = ttk.Entry(
            self.sensor_frame,
            textvariable=self.rfid,
            validate="key",
            validatecommand=(self.root.register(self.validate_rfid), '%P'),
            width=15
        )
        self.rfid_entry.grid(row=4, column=1, sticky=tk.W)

    def setup_actuator_controls(self):
        """Configura los controles para los actuadores"""
        # LED Ultra Brillante
        ttk.Label(self.actuator_frame, text="LED Ultra:").grid(row=0, column=0, sticky=tk.W)

        # Botón para detener manualmente el LED
        self.led_btn = ttk.Button(
            self.actuator_frame,
            text="Detener LED",
            command=self.stop_led,
            state=tk.DISABLED  # Inicialmente desactivado
        )
        self.led_btn.grid(row=0, column=1, sticky=tk.W, padx=5)

        # Indicador visual del LED (canvas con círculo)
        self.led_canvas = tk.Canvas(
            self.actuator_frame,
            width=30,
            height=30,
            bg='white',
            highlightbackground='black',
            highlightthickness=1
        )
        self.led_canvas.grid(row=0, column=2, sticky=tk.W)
        self.led_indicator = self.led_canvas.create_oval(5, 5, 25, 25, fill='gray', outline='black')

        # Estado textual del LED
        self.led_status = ttk.Label(self.actuator_frame, text="Apagado (Fotoresistencia activa)")
        self.led_status.grid(row=0, column=3, sticky=tk.W, padx=5)

        # 10 LEDs individuales
        ttk.Label(self.actuator_frame, text="10 LEDs:").grid(row=1, column=0, sticky=tk.W)
        self.led_frame = ttk.Frame(self.actuator_frame)
        self.led_frame.grid(row=1, column=1, columnspan=3, sticky=tk.W)

        for i in range(10):
            led = ttk.Checkbutton(
                self.led_frame,
                text=str(i+1),
                variable=self.leds[i],
                command=lambda i=i: self.log_action(f"LED {i+1} cambiado a {self.leds[i].get()}")
            )
            led.grid(row=0, column=i, padx=2)

        # Buzzer - Checkbutton
        ttk.Label(self.actuator_frame, text="Buzzer:").grid(row=2, column=0, sticky=tk.W)
        self.buzzer_btn = ttk.Checkbutton(
            self.actuator_frame,
            variable=self.buzzer,
            command=lambda: self.log_action(f"Buzzer cambiado a {self.buzzer.get()}")
        )
        self.buzzer_btn.grid(row=2, column=1, sticky=tk.W)

        # Frame para botones de control general
        self.control_frame = ttk.Frame(self.actuator_frame)
        self.control_frame.grid(row=3, column=0, columnspan=4, pady=10)

        # Botón para detener/reanudar el envío de datos
        self.stop_btn = ttk.Button(
            self.control_frame,
            text="Detener Envío",
            command=self.toggle_sending,
            style='TButton'
        )
        self.stop_btn.pack(side=tk.LEFT, padx=5)

    def setup_console_system(self):
        """Configura el sistema de consolas divididas"""
        console_frame = ttk.Frame(self.main_frame)
        console_frame.grid(row=2, column=0, padx=5, pady=5, sticky="nsew")

        # Consola superior: Muestra solo los datos enviados
        data_console_frame = ttk.LabelFrame(console_frame, text="Datos Enviados", padding=5)
        data_console_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        self.data_console = scrolledtext.ScrolledText(
            data_console_frame,
            height=5,
            state=tk.DISABLED,
            bg='white',
            fg='black',
            font=('Consolas', 9),
            insertbackground='black'
        )
        self.data_console.pack(fill=tk.BOTH, expand=True)

        # Consola inferior: Muestra los eventos del sistema
        event_console_frame = ttk.LabelFrame(console_frame, text="Eventos del Sistema", padding=5)
        event_console_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        self.event_console = scrolledtext.ScrolledText(
            event_console_frame,
            height=5,
            state=tk.DISABLED,
            bg='white',
            fg='black',
            font=('Consolas', 9),
            insertbackground='black'
        )
        self.event_console.pack(fill=tk.BOTH, expand=True)

    def setup_status_bar(self):
        """Configura la barra de estado en la parte inferior"""
        self.status_var = tk.StringVar(value="Sistema iniciado - Esperando configuración de puerto...") # Mensaje inicial
        status_bar = ttk.Label(
            self.root,
            textvariable=self.status_var,
            relief=tk.SUNKEN,
            anchor=tk.W,
            style='Status.TLabel'
        )
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    def setup_tooltips(self):
        """Configura los tooltips para los controles"""
        self.create_tooltip(self.sonico_btn, "Activa/desactiva el sensor sónico (1=ON, 0=OFF)")
        self.create_tooltip(self.fotoresistencia_btn, "Controla el sensor de luz. Cuando está activo, el LED Ultra se apaga automáticamente")
        self.create_tooltip(self.temp_spin, "Ajuste la temperatura actual en grados Celsius (-10 a 50°C)")
        self.create_tooltip(self.hum_spin, "Ajuste el porcentaje de humedad relativa (0 a 100%)")
        self.create_tooltip(self.rfid_entry, "Ingrese el código RFID (máx. 10 caracteres alfanuméricos)")
        self.create_tooltip(self.led_canvas, "Estado del LED Ultra Brillante (controlado por fotoresistencia)")
        self.create_tooltip(self.buzzer_btn, "Activa/desactiva el buzzer")

    # ===================== MÉTODOS DE FUNCIONALIDAD =====================

    def create_tooltip(self, widget, text):
        """Crea un tooltip para un widget específico"""
        widget.bind("<Enter>", lambda e: self.show_tooltip(text))
        widget.bind("<Leave>", lambda e: self.hide_tooltip())

    def show_tooltip(self, text):
        """Muestra el tooltip con información contextual"""
        self.tooltip = tk.Toplevel(self.root)
        self.tooltip.wm_overrideredirect(True)  # Elimina la decoración de ventana
        # Posicionar el tooltip cerca del cursor
        self.tooltip.wm_geometry(f"+{self.root.winfo_pointerx()+20}+{self.root.winfo_pointery()+20}")

        label = ttk.Label(
            self.tooltip,
            text=text,
            background="#ffffe0", # Color de fondo amarillo claro
            foreground="#000000", # Texto negro
            relief=tk.SOLID,
            borderwidth=1,
            padding=5,
            wraplength=250 # Ajustar para que el texto no sea muy ancho
        )
        label.pack()

    def hide_tooltip(self):
        """Oculta el tooltip cuando el mouse sale del widget"""
        if hasattr(self, 'tooltip') and self.tooltip:
            self.tooltip.destroy()
            self.tooltip = None # Limpiar la referencia

    def start_services(self):
        """Inicia los servicios en segundo plano (hilo de envío serial)"""
        self.serial_thread = threading.Thread(target=self.send_data_loop, daemon=True)
        self.serial_thread.start()
        # El estado se actualiza en __init__ después de abrir el puerto

    def stop_led(self):
        """Detiene el LED ultra brillante manualmente"""
        self.led_ultra.set(0)
        self.update_led_display()
        self.led_btn.config(state=tk.DISABLED)
        self.log_action("LED detenido manualmente")

    def update_fotoresistencia(self):
        """Actualiza el estado del LED basado en la fotoresistencia"""
        state = self.fotoresistencia.get()

        if state == 1:  # Fotoresistencia ACTIVADA
            self.led_ultra.set(0)
            self.led_btn.config(state=tk.DISABLED)
            self.log_action("Fotoresistencia ACTIVADA - LED apagado automáticamente")
        else:  # Fotoresistencia DESACTIVADA
            self.led_ultra.set(1)  # Se enciende automáticamente
            self.led_btn.config(state=tk.NORMAL)  # Habilita el botón de detener
            self.log_action("Fotoresistencia DESACTIVADA - LED encendido automáticamente")

        self.update_led_display()

    def update_led_display(self):
        """Actualiza el indicador visual del LED ultra brillante"""
        color = 'green' if self.led_ultra.get() else 'gray'

        if self.fotoresistencia.get() == 1:
            text = "Apagado (Fotoresistencia activa)"
        else:
            if self.led_ultra.get() == 1:
                text = "Encendido"
            else:
                text = "Apagado (Detenido manualmente)"

        self.led_canvas.itemconfig(self.led_indicator, fill=color)
        self.led_status.config(text=text)

    def validate_rfid(self, new_value):
        """Valida que el RFID ingresado sea válido (alfanumérico y <= 10 caracteres)"""
        if len(new_value) > 10:
            # No mostrar messagebox aquí para no interrumpir la escritura
            return False # Simplemente no permite más caracteres
        return new_value.isalnum() or new_value == "" # Permitir campo vacío

    def show_error(self, title, message): # No usado directamente en validación ahora
        """Muestra un mensaje de error en un cuadro de diálogo"""
        messagebox.showerror(title, message)
        self.update_status(f"Error: {message}")

    def log_action(self, message):
        """Registra una acción en la consola de eventos con timestamp"""
        timestamp = time.strftime("%H:%M:%S")
        self.update_event_console(f"[{timestamp}] {message}")

    def update_event_console(self, message):
        """Agrega un mensaje a la cola para actualizar la consola de eventos"""
        self.update_queue.put(lambda: self._update_console(self.event_console, message))

    def update_data_console(self, message):
        """Agrega un mensaje a la cola para actualizar la consola de datos"""
        self.update_queue.put(lambda: self._update_console(self.data_console, message))

    def _update_console(self, console_widget, message):
        """Función genérica para actualizar una consola (ejecutado en el hilo principal)"""
        console_widget.config(state=tk.NORMAL)
        console_widget.insert(tk.END, message + "\n")
        console_widget.see(tk.END) # Auto-scroll
        console_widget.config(state=tk.DISABLED)


    def update_status(self, message):
        """Actualiza el mensaje en la barra de estado"""
        self.status_var.set(message)
        # No loguear cada cambio de estado para no llenar la consola de eventos
        # self.log_action(f"Estado: {message}")

    def generate_data_string(self):
        """Genera la cadena de datos en formato CSV para enviar por serial"""
        return (
            f"{self.sonico.get()},{self.fotoresistencia.get()},"
            f"{self.temperatura.get():.2f},{self.humedad.get():.2f},"
            f"{self.led_ultra.get()},{self.get_leds_binary()},"
            f"{self.buzzer.get()},{self.rfid.get()}"
        )

    def get_leds_binary(self):
        """Devuelve el estado de los 10 LEDs como cadena binaria"""
        return ''.join([str(led.get()) for led in self.leds])

    def send_data_loop(self):
        """Bucle principal para enviar datos periódicamente por puerto serial"""
        while self.running: # Usar self.running para controlar el bucle
            if self.sending_active:
                try:
                    data = self.generate_data_string()
                    self.serial_port.write((data + "\n").encode('utf-8')) # Especificar encoding
                    self.update_data_console(data) # Mostrar en consola de datos
                    # El estado se actualiza con menos frecuencia para no ser molesto
                except serial.SerialException as se:
                    self.update_status(f"Error serial al escribir: {str(se)}")
                    # Podríamos intentar cerrar y reabrir el puerto aquí, o simplemente pausar
                    self.sending_active = False # Pausar envío en error
                    self.update_queue.put(lambda: self.stop_btn.config(text="Reanudar Envío (Error)"))
                    break # Salir del bucle de envío si hay un error grave
                except Exception as e:
                    self.update_status(f"Error inesperado en envío: {str(e)}")
                    break # Salir en otros errores también

            time.sleep(2) # Espera 2 segundos entre envíos (si está activo)
        # Cuando el bucle termina (por self.running = False o error)
        if not self.running :
            self.update_status("Hilo de envío detenido.")


    def toggle_sending(self):
        """Alterna el estado de envío de datos (activado/desactivado)"""
        self.sending_active = not self.sending_active

        if self.sending_active:
            self.stop_btn.config(text="Detener Envío")
            self.update_status(f"Reanudando envío de datos a {SERIAL_PORT_SIMULADOR}...")
            # Si el hilo se detuvo por error, podríamos necesitar reiniciarlo
            # pero por ahora, solo cambia el flag. El bucle send_data_loop
            # debería continuar si self.running es True.
        else:
            self.stop_btn.config(text="Reanudar Envío")
            self.update_status("Envío de datos pausado.")

        self.log_action(f"Envío de datos {'ACTIVADO' if self.sending_active else 'DESACTIVADO'}")

    def process_updates(self):
        """Procesa las actualizaciones pendientes en la cola (ejecutado en el hilo principal)"""
        try:
            while not self.update_queue.empty():
                update_fn = self.update_queue.get_nowait()
                update_fn()
        except queue.Empty:
            pass

        self.root.after(100, self.process_updates)

    def stop(self):
        """Detiene la aplicación de forma segura, cerrando recursos"""
        self.log_action("Iniciando cierre de la aplicación...")
        self.running = False # Señal para que el hilo de envío termine
        self.update_status("Deteniendo servicios...")

        # Esperar un poco a que el hilo termine
        if hasattr(self, 'serial_thread') and self.serial_thread.is_alive():
            self.serial_thread.join(timeout=1.0) # Esperar 1 segundo

        try:
            if hasattr(self, 'serial_port') and self.serial_port.is_open:
                self.serial_port.close()
                self.log_action("Puerto serial cerrado.")
        except Exception as e:
            self.log_action(f"Error al cerrar puerto serial: {e}")


        self.root.after(200, self.root.destroy) # Usar destroy en lugar de quit para asegurar limpieza
        # self.root.quit() # quit a veces no cierra bien en hilos

# ===================== PUNTO DE ENTRADA =====================
if __name__ == "__main__":
    root = tk.Tk()
    app = EnhancedSensorUI(root)
    root.protocol("WM_DELETE_WINDOW", app.stop)  # Manejar cierre de ventana
    root.mainloop()