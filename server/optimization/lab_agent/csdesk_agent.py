#!/usr/bin/env python3
"""
CSDesk Lightweight Lab Remote Agent
------------------------------------
Runs as a background daemon on student lab PCs.
Connects via WebSocket to the CSDesk Master Server.
Reports system status, receives shell commands, and streams execution logs.
"""

import os
import sys
import time
import json
import socket
import ssl
import base64
import hashlib
import platform
import argparse
import subprocess
import threading
from urllib.parse import urlparse

class SimpleWebSocket:
    """Zero-dependency RFC 6455 WebSocket client using Python standard library."""
    def __init__(self, url):
        self.url = url
        parsed = urlparse(url)
        self.scheme = parsed.scheme or 'ws'
        self.host = parsed.hostname or 'localhost'
        self.port = parsed.port or (443 if self.scheme in ('wss', 'https') else 5000)
        self.path = parsed.path or '/ws/lab-agent'
        if parsed.query:
            self.path += f"?{parsed.query}"
        self.sock = None
        self.connected = False
        self._lock = threading.Lock()

    def connect(self):
        raw_sock = socket.create_connection((self.host, self.port), timeout=10)
        if self.scheme in ('wss', 'https'):
            ctx = ssl.create_default_context()
            self.sock = ctx.wrap_socket(raw_sock, server_hostname=self.host)
        else:
            self.sock = raw_sock

        key = base64.b64encode(os.urandom(16)).decode('ascii')
        headers = [
            f"GET {self.path} HTTP/1.1",
            f"Host: {self.host}:{self.port}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
            "\r\n"
        ]
        self.sock.sendall("\r\n".join(headers).encode('utf-8'))

        response = b""
        while b"\r\n\r\n" not in response:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("Server closed connection during handshake.")
            response += chunk

        status_line = response.split(b"\r\n")[0].decode('ascii', errors='ignore')
        if "101" not in status_line:
            raise ConnectionError(f"Handshake failed: {status_line}")

        self.connected = True
        self.sock.settimeout(None)

    def send_text(self, text):
        if not self.connected or not self.sock:
            return
        payload = text.encode('utf-8')
        length = len(payload)
        frame = bytearray([0x81]) # Fin bit + Text opcode (0x1)

        mask = os.urandom(4)
        if length <= 125:
            frame.append(0x80 | length)
        elif length <= 65535:
            frame.append(0x80 | 126)
            frame.extend(length.to_bytes(2, 'big'))
        else:
            frame.append(0x80 | 127)
            frame.extend(length.to_bytes(8, 'big'))

        frame.extend(mask)
        masked_payload = bytearray(payload[i] ^ mask[i % 4] for i in range(length))
        frame.extend(masked_payload)

        with self._lock:
            self.sock.sendall(frame)

    def recv_text(self):
        while self.connected:
            b1, b2 = self._read_bytes(2)
            opcode = b1 & 0x0F
            is_masked = (b2 & 0x80) != 0
            payload_len = b2 & 0x7F

            if payload_len == 126:
                payload_len = int.from_bytes(self._read_bytes(2), 'big')
            elif payload_len == 127:
                payload_len = int.from_bytes(self._read_bytes(8), 'big')

            mask = self._read_bytes(4) if is_masked else None
            data = self._read_bytes(payload_len)

            if is_masked:
                data = bytearray(data[i] ^ mask[i % 4] for i in range(payload_len))

            if opcode == 0x8: # Close frame
                self.close()
                return None
            elif opcode == 0x9: # Ping
                self._send_pong(data)
            elif opcode == 0x1: # Text frame
                return data.decode('utf-8', errors='replace')

    def _read_bytes(self, n):
        buf = bytearray()
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("Socket connection broken.")
            buf.extend(chunk)
        return buf

    def _send_pong(self, data):
        frame = bytearray([0x8A, 0x80 | len(data)])
        mask = os.urandom(4)
        frame.extend(mask)
        frame.extend(data[i] ^ mask[i % 4] for i in range(len(data)))
        with self._lock:
            self.sock.sendall(frame)

    def close(self):
        self.connected = False
        try:
            if self.sock:
                self.sock.close()
        except:
            pass


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


class LabAgent:
    def __init__(self, server_url, lab_name, pc_name=None, token="csdesk_lab_secure_token_2026"):
        self.server_url = server_url
        self.lab = (lab_name or 'TL1').upper()
        self.pc_name = pc_name or socket.gethostname()
        self.token = token or "csdesk_lab_secure_token_2026"
        self.ip = get_local_ip()
        self.os_info = f"{platform.system()} {platform.release()} ({platform.machine()})"
        self.ws = None
        self.running = True

    def run(self):
        ws_url = self.server_url.replace("http://", "ws://").replace("https://", "wss://")
        if not ws_url.endswith("/ws/lab-agent"):
            ws_url = ws_url.rstrip("/") + "/ws/lab-agent"

        print(f"[*] Starting CSDesk Lab Agent:")
        print(f"    • PC Name: {self.pc_name}")
        print(f"    • Lab:     {self.lab}")
        print(f"    • IP:      {self.ip}")
        print(f"    • OS:      {self.os_info}")
        print(f"    • Server:  {ws_url}")

        while self.running:
            try:
                print(f"[*] Connecting to Master Server at {ws_url}...")
                self.ws = SimpleWebSocket(ws_url)
                self.ws.connect()
                print("[✓] Connected to CSDesk Server!")

                # Register
                self.ws.send_text(json.dumps({
                    "type": "REGISTER",
                    "token": self.token,
                    "pcName": self.pc_name,
                    "lab": self.lab,
                    "ip": self.ip,
                    "os": self.os_info
                }))

                # Start heartbeat thread
                hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
                hb_thread.start()

                # Message receive loop
                while self.ws.connected:
                    msg_text = self.ws.recv_text()
                    if msg_text is None:
                        break
                    self._handle_message(msg_text)

            except Exception as e:
                print(f"[!] Connection failed ({e}). Reconnecting in 5 seconds...")
                time.sleep(5)

    def _heartbeat_loop(self):
        while self.ws and self.ws.connected:
            try:
                self.ws.send_text(json.dumps({"type": "HEARTBEAT"}))
            except:
                break
            time.sleep(5)

    def _handle_message(self, text):
        try:
            msg = json.loads(text)
        except:
            return

        msg_type = msg.get("type")
        if msg_type == "REGISTER_ACK":
            print(f"[✓] Registration confirmed by server for {self.pc_name}.")
        elif msg_type == "REGISTER_REJECTED":
            print(f"[!] Server rejected registration: {msg.get('error')}")
            time.sleep(5)
        elif msg_type == "EXECUTE":
            # Security check 1: Token verification
            if msg.get("token") != self.token:
                print(f"[SECURITY ALERT] Unauthorized execution attempt blocked on {self.pc_name}!")
                return

            execution_id = msg.get("executionId")
            script = msg.get("script", "")

            # Security check 2: Prevent catastrophic system destruction
            dangerous_patterns = ["rm -rf /", "rm -rf /*", ":(){ :|:& };:", "mkfs", "> /dev/sd", "dd if="]
            for bad in dangerous_patterns:
                if bad in script:
                    alert_msg = f"[SECURITY ALERT] Command contains blocked pattern '{bad}'! Refusing execution."
                    print(alert_msg)
                    try:
                        self.ws.send_text(json.dumps({
                            "type": "LOG_LINE",
                            "executionId": execution_id,
                            "pcName": self.pc_name,
                            "lab": self.lab,
                            "line": alert_msg
                        }))
                        self.ws.send_text(json.dumps({
                            "type": "EXECUTION_FINISHED",
                            "executionId": execution_id,
                            "pcName": self.pc_name,
                            "lab": self.lab,
                            "exitCode": 126,
                            "duration": 0.01,
                            "error": "Command blocked by security policy"
                        }))
                    except:
                        pass
                    return

            print(f"[▶] Executing verified command [{execution_id}]: {script}")
            threading.Thread(target=self._execute_script, args=(execution_id, script), daemon=True).start()

    def _execute_script(self, execution_id, script):
        start_time = time.time()
        exit_code = 0
        error_msg = None

        # Determine shell
        if platform.system() == "Windows":
            shell_cmd = ["powershell", "-NoProfile", "-Command", script]
        else:
            shell_cmd = ["/bin/bash", "-c", script]

        try:
            proc = subprocess.Popen(
                shell_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )

            for line in iter(proc.stdout.readline, ''):
                if not line:
                    break
                clean_line = line.rstrip('\r\n')
                print(f"[{self.pc_name}] {clean_line}")
                try:
                    self.ws.send_text(json.dumps({
                        "type": "LOG_LINE",
                        "executionId": execution_id,
                        "pcName": self.pc_name,
                        "lab": self.lab,
                        "line": clean_line
                    }))
                except Exception as e:
                    print("[!] Failed to send log line:", e)

            proc.stdout.close()
            exit_code = proc.wait()

        except Exception as e:
            exit_code = 1
            error_msg = str(e)
            print(f"[!] Subprocess execution error: {e}")

        duration = round(time.time() - start_time, 2)
        print(f"[✓] Execution [{execution_id}] finished in {duration}s with exit code {exit_code}")

        try:
            self.ws.send_text(json.dumps({
                "type": "EXECUTION_FINISHED",
                "executionId": execution_id,
                "pcName": self.pc_name,
                "lab": self.lab,
                "exitCode": exit_code,
                "duration": duration,
                "error": error_msg
            }))
        except:
            pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="CSDesk Lab Agent")
    parser.add_argument("--server", default="http://localhost:5000", help="CSDesk Master Server URL")
    parser.add_argument("--lab", default="TL1", help="Lab Room Identifier (e.g. TL1, ED1, ED2)")
    parser.add_argument("--pc", default=None, help="Custom PC Name (defaults to system hostname)")
    parser.add_argument("--token", default="csdesk_lab_secure_token_2026", help="Shared Authentication Secret Token")
    args = parser.parse_args()

    agent = LabAgent(server_url=args.server, lab_name=args.lab, pc_name=args.pc, token=args.token)
    try:
        agent.run()
    except KeyboardInterrupt:
        print("\n[*] Agent stopped by user.")
        sys.exit(0)
