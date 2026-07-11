#!/usr/bin/env python3
import serial
import serial.tools.list_ports
import struct
import time
import json
import socket
import hashlib
import base64
import threading
import sys

# Seed tables for DJI checksums
crc_table = [
    0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf,
    0x8c48, 0x9dc1, 0xaf5a, 0xbed3, 0xca6c, 0xdbe5, 0xe97e, 0xf8f7,
    0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e,
    0x9cc9, 0x8d40, 0xbfdb, 0xae52, 0xdaed, 0xcb64, 0xf9ff, 0xe876,
    0x2102, 0x308b, 0x0210, 0x1399, 0x6726, 0x76af, 0x4434, 0x55bd,
    0xad4a, 0xbcc3, 0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5,
    0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c,
    0xbdcb, 0xac42, 0x9ed9, 0x8f50, 0xfbef, 0xea66, 0xd8fd, 0xc974,
    0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9, 0x2732, 0x36bb,
    0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3,
    0x5285, 0x430c, 0x7197, 0x601e, 0x14a1, 0x0528, 0x37b3, 0x263a,
    0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72,
    0x6306, 0x728f, 0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9,
    0xef4e, 0xfec7, 0xcc5c, 0xddd5, 0xa96a, 0xb8e3, 0x8a78, 0x9bf1,
    0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738,
    0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862, 0x9af9, 0x8b70,
    0x8408, 0x9581, 0xa71a, 0xb693, 0xc22c, 0xd3a5, 0xe13e, 0xf0b7,
    0x0840, 0x19c9, 0x2b52, 0x3adb, 0x4e64, 0x5fed, 0x6d76, 0x7cff,
    0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036,
    0x18c1, 0x0948, 0x3bd3, 0x2a5a, 0x5ee5, 0x4f6c, 0x7df7, 0x6c7e,
    0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5,
    0x2942, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd,
    0xb58b, 0xa402, 0x9699, 0x8710, 0xf3af, 0xe226, 0xd0bd, 0xc134,
    0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c,
    0xc60c, 0xd785, 0xe51e, 0xf497, 0x8028, 0x91a1, 0xa33a, 0xb2b3,
    0x4a44, 0x5bcd, 0x6956, 0x78df, 0x0c60, 0x1de9, 0x2f72, 0x3efb,
    0xd68d, 0xc704, 0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232,
    0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a,
    0xe70e, 0xf687, 0xc41c, 0xd595, 0xa12a, 0xb0a3, 0x8238, 0x93b1,
    0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb, 0x0e70, 0x1ff9,
    0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330,
    0x7bc7, 0x6a4e, 0x58d5, 0x495c, 0x3de3, 0x2c6a, 0x1ef1, 0x0f78
]

hdr_checksum_table = [
    0x00,0x5E,0xBC,0xE2,0x61,0x3F,0xDD,0x83,0xC2,0x9C,0x7E,0x20,0xA3,0xFD,0x1F,0x41,
    0x9D,0xC3,0x21,0x7F,0xFC,0xA2,0x40,0x1E,0x5F,0x01,0xE3,0xBD,0x3E,0x60,0x82,0xDC,
    0x23,0x7D,0x9F,0xC1,0x42,0x1C,0xFE,0xA0,0xE1,0xBF,0x5D,0x03,0x80,0xDE,0x3C,0x62,
    0xBE,0xE0,0x02,0x5C,0xDF,0x81,0x63,0x3D,0x7C,0x22,0xC0,0x9E,0x1D,0x43,0xA1,0xFF,
    0x46,0x18,0xFA,0xA4,0x27,0x79,0x9B,0xC5,0x84,0xDA,0x38,0x66,0xE5,0xBB,0x59,0x07,
    0xDB,0x85,0x67,0x39,0xBA,0xE4,0x06,0x58,0x19,0x47,0xA5,0xFB,0x78,0x26,0xC4,0x9A,
    0x65,0x3B,0xD9,0x87,0x04,0x5A,0xB8,0xE6,0xA7,0xF9,0x1B,0x45,0xC6,0x98,0x7A,0x24,
    0xF8,0xA6,0x44,0x1A,0x99,0xC7,0x25,0x7B,0x3A,0x64,0x86,0xD8,0x5B,0x05,0xE7,0xB9,
    0x8C,0xD2,0x30,0x6E,0xED,0xB3,0x51,0x0F,0x4E,0x10,0xF2,0xAC,0x2F,0x71,0x93,0xCD,
    0x11,0x4F,0xAD,0xF3,0x70,0x2E,0xCC,0x92,0xD3,0x8D,0x6F,0x31,0xB2,0xEC,0x0E,0x50,
    0xAF,0xF1,0x13,0x4D,0xCE,0x90,0x72,0x2C,0x6D,0x33,0xD1,0x8F,0x0C,0x52,0xB0,0xEE,
    0x32,0x6C,0x8E,0xD0,0x53,0x0D,0xEF,0xB1,0xF0,0xAE,0x4C,0x12,0x91,0xCF,0x2D,0x73,
    0xCA,0x94,0x76,0x28,0xAB,0xF5,0x17,0x49,0x08,0x56,0xB4,0xEA,0x69,0x37,0xD5,0x8B,
    0x57,0x09,0xEB,0xB5,0x36,0x68,0x8A,0xD4,0x95,0xCB,0x29,0x77,0xF4,0xAA,0x48,0x16,
    0xE9,0xB7,0x55,0x0B,0x88,0xD6,0x34,0x6A,0x2B,0x75,0x97,0xC9,0x4A,0x14,0xF6,0xA8,
    0x74,0x2A,0xC8,0x96,0x15,0x4B,0xA9,0xF7,0xB6,0xE8,0x0A,0x54,0xD7,0x89,0x6B,0x35
]

# State dictionary for controller stick and buttons
ctrl_state = {
    "throttle": 0.0,
    "yaw": 0.0,
    "pitch": 0.0,
    "roll": 0.0,
    "camera": 0.0,
    "btn_fn": 0,
    "btn_photo": 0,
    "btn_rtbh": 0,
    "btn_pause": 0,
    "dial_click": 0,
    "rc_battery": 100,
    "rc_charging": 0,
    "port": "None",
    "dji_connected": False,
    "status": "Waiting for connection..."
}

sequence_number = 0x34eb
last_packet_time = 0.0

def calc_checksum(packet, plength):
    v = 0x3692
    for i in range(0, plength):
        vv = v >> 8
        v = vv ^ crc_table[((packet[i] ^ v) & 0xFF)]
    return v

def calc_pkt55_hdr_checksum(seed, packet, plength):
    chksum = seed
    for i in range(0, plength):
        chksum = hdr_checksum_table[((packet[i] ^ chksum) & 0xFF)]
    return chksum

def send_duml(ser_conn, source, target, cmd_type, cmd_set, cmd_id, payload=None):
    global sequence_number
    packet = bytearray.fromhex('55')
    length = 13
    if payload is not None:
        length += len(payload)

    packet += struct.pack('B', length & 0xff)
    packet += struct.pack('B', (length >> 8) | 0x4)
    hdr_crc = calc_pkt55_hdr_checksum(0x77, packet, 3)
    packet += struct.pack('B', hdr_crc)
    packet += struct.pack('B', source)
    packet += struct.pack('B', target)
    packet += struct.pack('<H', sequence_number)
    packet += struct.pack('B', cmd_type)
    packet += struct.pack('B', cmd_set)
    packet += struct.pack('B', cmd_id)

    if payload is not None:
        packet += payload

    crc = calc_checksum(packet, len(packet))
    packet += struct.pack('<H', crc)
    
    try:
        ser_conn.write(packet)
    except Exception:
        pass
    
    sequence_number = (sequence_number + 1) & 0xFFFF

def find_dji_port():
    ports = serial.tools.list_ports.comports()
    # 1. Search strictly for DJI Vendor ID (2CA3)
    for p in ports:
        if "2CA3" in p.hwid.upper():
            return p.device
    # 2. Search for "DJI" or "VCOM" in description
    for p in ports:
        desc = p.description.upper()
        if "DJI" in desc or "VCOM" in desc:
            return p.device
    # 3. Search for other USB serial devices, but EXCLUDE Bluetooth links (COM3/COM4 Bluetooth wiggles)
    for p in ports:
        desc = p.description.upper()
        hwid = p.hwid.upper()
        if "BTHENUM" in hwid or "BLUETOOTH" in desc or "BTH" in hwid:
            continue
        if "USB" in desc or "SERIAL" in desc or "VCP" in desc:
            return p.device
    return None

def parse_input(raw_slice):
    if len(raw_slice) < 2:
        return 0.0
    raw_val = int.from_bytes(raw_slice, byteorder='little')
    raw_val = max(364, min(1684, raw_val))
    normalized = (raw_val - 1024) / 660.0
    return round(normalized, 4)

# ----------------- WebSocket Server (Zero-Dependency) -----------------
class LocalWebSocketServer:
    def __init__(self, host='127.0.0.1', port=8765):
        self.host = host
        self.port = port
        self.clients = []
        self.lock = threading.Lock()
        self.server_socket = None

    def start(self):
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(5)
        print(f"\n[WS SERVER] Server listening on ws://{self.host}:{self.port}")
        threading.Thread(target=self.accept_loop, daemon=True).start()

    def accept_loop(self):
        while True:
            try:
                client_sock, addr = self.server_socket.accept()
                threading.Thread(target=self.handle_client, args=(client_sock, addr), daemon=True).start()
            except Exception:
                break

    def handle_client(self, client_sock, addr):
        print(f"[WS CLIENT] Browser client connected from {addr}")
        try:
            data = client_sock.recv(2048).decode('utf-8', errors='ignore')
            headers = {}
            for line in data.split('\r\n')[1:]:
                if ': ' in line:
                    k, v = line.split(': ', 1)
                    headers[k.strip()] = v.strip()
            
            if 'Sec-WebSocket-Key' not in headers:
                client_sock.close()
                return

            key = headers['Sec-WebSocket-Key']
            guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            accept_val = base64.b64encode(hashlib.sha1((key + guid).encode('utf-8')).digest()).decode('utf-8')
            
            shake = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Accept: " + accept_val + "\r\n\r\n"
            )
            client_sock.send(shake.encode('utf-8'))
            
            # Send immediate initial status
            init_frame = self.make_frame(json.dumps(ctrl_state))
            client_sock.send(init_frame)

            with self.lock:
                self.clients.append(client_sock)
                
            while True:
                frame = client_sock.recv(1024)
                if not frame:
                    break
        except Exception:
            pass
        finally:
            with self.lock:
                if client_sock in self.clients:
                    self.clients.remove(client_sock)
            client_sock.close()
            print(f"[WS CLIENT] Browser client disconnected: {addr}")

    def make_frame(self, message):
        payload = message.encode('utf-8')
        header = bytearray()
        header.append(0x81)
        length = len(payload)
        
        if length <= 125:
            header.append(length)
        elif length <= 65535:
            header.append(126)
            header.extend(struct.pack('>H', length))
        else:
            header.append(127)
            header.extend(struct.pack('>Q', length))
        return header + payload

    def broadcast(self, message):
        frame = self.make_frame(message)
        with self.lock:
            disconnected_clients = []
            for c in self.clients:
                try:
                    c.send(frame)
                except Exception:
                    disconnected_clients.append(c)
            for c in disconnected_clients:
                if c in self.clients:
                    self.clients.remove(c)
                c.close()

# ----------------- Heartbeat connection check thread -----------------
def heartbeat_checker(ws_server):
    global ctrl_state
    while True:
        time.sleep(0.5)
        if ctrl_state["dji_connected"] and (time.time() - last_packet_time > 1.5):
            ctrl_state["dji_connected"] = False
            ctrl_state["status"] = "Controller Offline / Telemetry Timeout"
            print("[DJI STATUS] Telemetry timed out. Is the controller ON?")
            ws_server.broadcast(json.dumps(ctrl_state))

# ----------------- Serial DJI Reader Thread (Auto-Reconnectable) -----------------
def dji_reader_thread(ws_server):
    global ctrl_state, last_packet_time
    
    while True:
        # Step 1: Detect DJI Port dynamically
        com_port = find_dji_port()
        if not com_port:
            ctrl_state["status"] = "No DJI Port Detected"
            ctrl_state["port"] = "None"
            ctrl_state["dji_connected"] = False
            ws_server.broadcast(json.dumps(ctrl_state))
            time.sleep(2.0)
            continue
            
        ctrl_state["port"] = com_port
        ctrl_state["status"] = f"Connecting to {com_port}..."
        ws_server.broadcast(json.dumps(ctrl_state))
        
        print(f"\n[DJI] Connecting to controller on port {com_port}...")
        try:
            ser = serial.Serial(port=com_port, baudrate=115200, timeout=1.0)
            print(f"[DJI] Serial port {com_port} opened successfully!")
            ctrl_state["status"] = "Waiting for telemetry..."
            ws_server.broadcast(json.dumps(ctrl_state))
        except Exception as e:
            print(f"[DJI ERROR] Could not open COM port {com_port}: {e}")
            ctrl_state["status"] = f"Port error: {com_port}"
            ws_server.broadcast(json.dumps(ctrl_state))
            time.sleep(2.0)
            continue

        try:
            # Enable simulator mode for the RC so it streams stick positions at high rate
            print("[DJI] Activating simulator mode telemetry stream...")
            send_duml(ser, 0x0a, 0x06, 0x40, 0x06, 0x24, bytearray.fromhex('01'))
            time.sleep(0.1)

            # Main query reading loop
            packet_count = 0
            while True:
                # Poll stick data and button status
                send_duml(ser, 0x0a, 0x06, 0x40, 0x06, 0x01, bytearray.fromhex(''))
                send_duml(ser, 0x0a, 0x06, 0x40, 0x06, 0x27, bytearray.fromhex(''))
                
                # Consume all available packets currently in the receive buffer
                # This prevents a backlog (accumulated lag)
                processed_any = False
                while ser.in_waiting > 0:
                    # Look for DJI packet start byte (0x55)
                    b = ser.read(1)
                    if len(b) > 0 and b == bytearray.fromhex('55'):
                        packet_buf = bytearray(b)
                        length_bytes = ser.read(2)
                        if len(length_bytes) == 2:
                            packet_buf.extend(length_bytes)
                            length_val = struct.unpack('<H', length_bytes)[0]
                            total_packet_length = 0b0000001111111111 & length_val
                            
                            rest_bytes = ser.read(total_packet_length - 3)
                            if len(rest_bytes) == (total_packet_length - 3):
                                packet_buf.extend(rest_bytes)
                                data = packet_buf
                                
                                last_packet_time = time.time()
                                if not ctrl_state["dji_connected"]:
                                    ctrl_state["dji_connected"] = True
                                    ctrl_state["status"] = "Active"
                                    print(f"[DJI STATUS] Controller active on {com_port}!")
                                
                                pkt_cmd_set = data[9] if len(data) > 9 else 0
                                pkt_cmd_id = data[10] if len(data) > 10 else 0
                                
                                packet_count += 1
                                if packet_count % 30 == 0:
                                    print(f"[DIAG] Packet Rx: len={len(data)} cmd_set=0x{pkt_cmd_set:02x} cmd_id=0x{pkt_cmd_id:02x}")
                                
                                # Parse stick positions (usually 38 bytes, or 21 bytes for standard push command 0x26)
                                if len(data) == 38:
                                    ctrl_state["pitch"] = parse_input(data[16:18])  # Right stick Vertical
                                    ctrl_state["roll"] = parse_input(data[13:15])   # Right stick Horizontal
                                    ctrl_state["throttle"] = parse_input(data[19:21]) # Left stick Vertical
                                    ctrl_state["yaw"] = parse_input(data[22:24])    # Left stick Horizontal
                                    ctrl_state["camera"] = parse_input(data[25:27])
                                elif len(data) == 21 and pkt_cmd_id == 0x26:
                                    ctrl_state["roll"] = parse_input(data[11:13])     # Channel 1 (Right Stick Horizontal)
                                    ctrl_state["pitch"] = parse_input(data[13:15])    # Channel 2 (Right Stick Vertical)
                                    ctrl_state["throttle"] = parse_input(data[15:17]) # Channel 3 (Left Stick Vertical)
                                    ctrl_state["yaw"] = parse_input(data[17:19])      # Channel 4 (Left Stick Horizontal)
                                    
                                # Parse button presses (usually 58 bytes)
                                elif len(data) == 58:
                                    ival = int.from_bytes(data[28:30], byteorder="big")
                                    ctrl_state["btn_fn"] = 1 if ival & 0x1060 == 0x1060 else 0
                                    ctrl_state["btn_photo"] = 1 if ival & 0x1080 == 0x1080 else 0
                                    ctrl_state["btn_rtbh"] = 1 if ival & 0x1004 == 0x1004 else 0
                                    ctrl_state["btn_pause"] = 1 if ival & 0x1002 == 0x1002 else 0
                                    
                                    ival2 = int.from_bytes(data[27:29], byteorder="big")
                                    ctrl_state["dial_click"] = 1 if ival2 == 0x0 else -1 if ival2 & 0x20 == 0x20 else 0
                                    
                                    # Parse RC Battery Level (usually byte 31 is %, byte 32 holds charging status flags)
                                    if len(data) > 32:
                                        bat_val = data[31]
                                        if 0 <= bat_val <= 100:
                                            ctrl_state["rc_battery"] = bat_val
                                        
                                        charge_val = data[32]
                                        # Bit 0 is typically 1 if charging, 0 if discharging/not charging
                                        ctrl_state["rc_charging"] = 1 if (charge_val & 0x01) else 0
                                
                                processed_any = True
                
                # Broadcast the freshest parsed state
                if processed_any:
                    ws_server.broadcast(json.dumps(ctrl_state))
                
                time.sleep(0.01)  # Minimal sleep to avoid CPU hogging, while keeping latency minimal
        except Exception as e:
            print(f"[DJI ERROR] Connection wiggled/interrupted: {e}")
            ctrl_state["dji_connected"] = False
            ctrl_state["status"] = "Reconnecting..."
            ws_server.broadcast(json.dumps(ctrl_state))
        finally:
            try:
                ser.close()
            except Exception:
                pass
            print("[DJI] Serial connection closed. Retrying in 2 seconds...")
            time.sleep(2.0)

def main():
    print("====================================================")
    print(" DJI Mavic Mini / RC-N1 USB-to-Web Joystick Bridge ")
    print("====================================================")
    
    # 1. Start WebSocket Server
    ws = LocalWebSocketServer('127.0.0.1', 8765)
    ws.start()
    
    # 2. Start Telemetry Timeout/Heartbeat Thread
    threading.Thread(target=heartbeat_checker, args=(ws,), daemon=True).start()
    
    # 3. Run DJI telemetry reader in background thread (handles dynamic auto-detection and reconnects)
    dji_thread = threading.Thread(target=dji_reader_thread, args=(ws,), daemon=True)
    dji_thread.start()

    print("\n----------------------------------------------------")
    print("1. Open index.html directly in your web browser.")
    print("2. Make sure your DJI controller is connected and switched on.")
    print("3. Keep this terminal running in the background.")
    print("Press Ctrl+C to terminate this bridge script.")
    print("----------------------------------------------------")
    
    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nTerminating DJI USB-to-Web Bridge. Goodbye!")
        sys.exit(0)

if __name__ == "__main__":
    main()
