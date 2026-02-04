import sounddevice as sd
import numpy as np
import tkinter as tk
from tkinter import ttk
import json

class AudioLoopbackApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Capture et Lecture Audio en Temps Réel")
        
        # Charger la configuration
        with open('env.json', 'r') as f:
            self.env_config = json.load(f)
        
        # Variables
        self.is_running = False
        self.input_device = None
        self.output_device = None
        self.samplerate = 44100
        self.channels = 2
        
        # Initialiser la liste des périphériques
        self.devices = sd.query_devices()
        self.input_devices = [f"{i}: {d['name']}" for i, d in enumerate(self.devices) if d['max_input_channels'] > 0]
        self.output_devices = [f"{i}: {d['name']}" for i, d in enumerate(self.devices) if d['max_output_channels'] > 0]
        
        # Interface utilisateur
        self.create_widgets()
        
        # Sélectionner le périphérique d'entrée par défaut depuis env.json
        if 'DEVICE_NAME' in self.env_config and self.env_config['DEVICE_NAME'] != 'default':
            for i, device in enumerate(self.input_devices):
                if self.env_config['DEVICE_NAME'] in device:
                    self.input_combobox.current(i)
                    break
        
    def create_widgets(self):
        # Frame principale
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Sélection du périphérique d'entrée
        ttk.Label(main_frame, text="Périphérique d'entrée:").grid(row=0, column=0, sticky=tk.W)
        self.input_combobox = ttk.Combobox(main_frame, values=self.input_devices)
        self.input_combobox.grid(row=0, column=1, sticky=tk.EW, padx=5, pady=5)
        if self.input_devices:
            self.input_combobox.current(0)
        
        # Sélection du périphérique de sortie
        ttk.Label(main_frame, text="Périphérique de sortie:").grid(row=1, column=0, sticky=tk.W)
        self.output_combobox = ttk.Combobox(main_frame, values=self.output_devices)
        self.output_combobox.grid(row=1, column=1, sticky=tk.EW, padx=5, pady=5)
        if self.output_devices:
            self.output_combobox.current(0)
        
        # Boutons de contrôle
        self.start_button = ttk.Button(main_frame, text="Démarrer", command=self.start_stream)
        self.start_button.grid(row=2, column=0, pady=10)
        
        self.stop_button = ttk.Button(main_frame, text="Arrêter", command=self.stop_stream, state=tk.DISABLED)
        self.stop_button.grid(row=2, column=1, pady=10)
        
        # Configuration de la grille
        main_frame.columnconfigure(1, weight=1)
        
    def audio_callback(self, indata, outdata, frames, time, status):
        if status:
            print(status)
        outdata[:] = indata  # Simple copie de l'entrée vers la sortie
        
    def start_stream(self):
        if self.is_running:
            return
            
        try:
            # Récupérer les périphériques sélectionnés
            input_idx = int(self.input_combobox.get().split(":")[0])
            output_idx = int(self.output_combobox.get().split(":")[0])
            
            # Configurer et démarrer le flux audio
            self.stream = sd.Stream(
                device=(input_idx, output_idx),
                channels=self.channels,
                samplerate=self.samplerate,
                callback=self.audio_callback,
                dtype='float32'
            )
            
            self.stream.start()
            self.is_running = True
            self.start_button.config(state=tk.DISABLED)
            self.stop_button.config(state=tk.NORMAL)
            
        except Exception as e:
            tk.messagebox.showerror("Erreur", f"Impossible de démarrer le flux audio:\n{str(e)}")
        
    def stop_stream(self):
        if self.is_running:
            self.stream.stop()
            self.stream.close()
            self.is_running = False
            self.start_button.config(state=tk.NORMAL)
            self.stop_button.config(state=tk.DISABLED)

if __name__ == "__main__":
    root = tk.Tk()
    app = AudioLoopbackApp(root)
    root.mainloop()