/**
 * Serial bridge for DJI controllers.
 * Handles auto-detection of DJI COM ports, serial connection, DUML command polling,
 * and packet parsing. Emits state change events.
 */
import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { ControllerState, createDefaultState } from '../shared/types.js';
import { buildDumlPacket, parseInput } from './dji-protocol.js';

/** Scan available COM ports and find the DJI controller port. */
export async function findDjiPort(): Promise<string | null> {
  const ports = await SerialPort.list();

  // 1. Search strictly for DJI Vendor ID (2CA3)
  for (const p of ports) {
    if (p.vendorId && p.vendorId.toUpperCase().includes('2CA3')) {
      return p.path;
    }
  }

  // 2. Search for "DJI" or "VCOM" in manufacturer/pnpId
  for (const p of ports) {
    const desc = (p.manufacturer || '').toUpperCase() + ' ' + (p.pnpId || '').toUpperCase();
    if (desc.includes('DJI') || desc.includes('VCOM')) {
      return p.path;
    }
  }

  // 3. Search for USB serial devices, excluding Bluetooth
  for (const p of ports) {
    const desc = (p.manufacturer || '').toUpperCase();
    const pnpId = (p.pnpId || '').toUpperCase();
    if (pnpId.includes('BTHENUM') || desc.includes('BLUETOOTH') || pnpId.includes('BTH')) {
      continue;
    }
    if (desc.includes('USB') || desc.includes('SERIAL') || desc.includes('VCP') ||
      pnpId.includes('USB') || pnpId.includes('FTDI')) {
      return p.path;
    }
  }

  return null;
}

export class DjiBridge extends EventEmitter {
  public state: ControllerState;
  private port: SerialPort | null = null;
  private lastPacketTime = 0;
  private running = true;
  private packetCount = 0;

  constructor() {
    super();
    this.state = createDefaultState();
  }

  /** Start the auto-detection and connection loop. */
  async start(): Promise<void> {
    while (this.running) {
      try {
        await this.connectLoop();
      } catch (e) {
        console.error('[DJI ERROR] Connection loop error:', e);
      }
      // Wait before retry
      await this.sleep(2000);
    }
  }

  /** Stop the bridge gracefully. */
  stop(): void {
    this.running = false;
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
  }

  /** Get the timestamp of the last received packet. */
  getLastPacketTime(): number {
    return this.lastPacketTime;
  }

  private async connectLoop(): Promise<void> {
    // Step 1: Detect DJI Port
    const comPort = await findDjiPort();
    if (!comPort) {
      this.state.status = 'No DJI Port Detected';
      this.state.port = 'None';
      this.state.dji_connected = false;
      this.emit('state', this.state);
      return;
    }

    this.state.port = comPort;
    this.state.status = `Connecting to ${comPort}...`;
    this.emit('state', this.state);

    console.log(`\n[DJI] Connecting to controller on port ${comPort}...`);

    // Step 2: Open serial port
    try {
      this.port = new SerialPort({
        path: comPort,
        baudRate: 115200,
      });

      await new Promise<void>((resolve, reject) => {
        this.port!.on('open', () => resolve());
        this.port!.on('error', (err) => reject(err));
      });

      console.log(`[DJI] Serial port ${comPort} opened successfully!`);
      this.state.status = 'Waiting for telemetry...';
      this.emit('state', this.state);
    } catch (e) {
      console.error(`[DJI ERROR] Could not open COM port ${comPort}:`, e);
      this.state.status = `Port error: ${comPort}`;
      this.emit('state', this.state);
      return;
    }

    // Step 3: Enable simulator mode
    console.log('[DJI] Activating simulator mode telemetry stream...');
    this.writePacket(buildDumlPacket(0x0A, 0x06, 0x40, 0x06, 0x24, Buffer.from([0x01])));
    await this.sleep(100);

    // Step 4: Main polling loop
    try {
      await this.pollLoop();
    } catch (e) {
      console.error(`[DJI ERROR] Connection interrupted:`, e);
    } finally {
      this.state.dji_connected = false;
      this.state.status = 'Reconnecting...';
      this.emit('state', this.state);
      if (this.port && this.port.isOpen) {
        this.port.close();
      }
      console.log('[DJI] Serial connection closed. Retrying in 2 seconds...');
    }
  }

  private async pollLoop(): Promise<void> {
    // Set up data event handler for incoming packets
    const dataBuffer = Buffer.alloc(0);
    let accum = Buffer.alloc(0);

    return new Promise<void>((resolve, reject) => {
      if (!this.port) return reject(new Error('No port'));

      // Poll timer — send query commands at regular intervals
      const pollInterval = setInterval(() => {
        if (!this.port || !this.port.isOpen) {
          clearInterval(pollInterval);
          return resolve();
        }
        // Poll stick data and button status
        this.writePacket(buildDumlPacket(0x0A, 0x06, 0x40, 0x06, 0x01, Buffer.alloc(0)));
        this.writePacket(buildDumlPacket(0x0A, 0x06, 0x40, 0x06, 0x27, Buffer.alloc(0)));
      }, 10);

      this.port.on('data', (chunk: Buffer) => {
        accum = Buffer.concat([accum, chunk]);

        // Process all complete packets in the buffer
        let changed = false;
        while (accum.length > 0) {
          // Find start byte 0x55
          const startIdx = accum.indexOf(0x55);
          if (startIdx === -1) {
            accum = Buffer.alloc(0);
            break;
          }
          if (startIdx > 0) {
            accum = accum.subarray(startIdx);
          }

          // Need at least 3 bytes for header
          if (accum.length < 3) break;

          const lengthVal = accum.readUInt16LE(1);
          const totalPacketLength = lengthVal & 0x03FF;

          if (accum.length < totalPacketLength) break;

          // Extract complete packet
          const data = accum.subarray(0, totalPacketLength);
          accum = accum.subarray(totalPacketLength);

          this.lastPacketTime = Date.now();
          if (!this.state.dji_connected) {
            this.state.dji_connected = true;
            this.state.status = 'Active';
            console.log(`[DJI STATUS] Controller active on ${this.state.port}!`);
          }

          const pktCmdSet = data.length > 9 ? data[9] : 0;
          const pktCmdId = data.length > 10 ? data[10] : 0;

          this.packetCount++;
          if (this.packetCount % 30 === 0) {
            console.log(`[DIAG] Packet Rx: len=${data.length} cmd_set=0x${pktCmdSet.toString(16).padStart(2, '0')} cmd_id=0x${pktCmdId.toString(16).padStart(2, '0')}`);
          }

          // Parse stick positions
          if (data.length === 38) {
            this.state.pitch = parseInput(data, 16);
            this.state.roll = -parseInput(data, 13);
            this.state.throttle = parseInput(data, 19);
            this.state.yaw = -parseInput(data, 22);
            this.state.camera = parseInput(data, 25);
            changed = true;
          } else if (data.length === 21 && pktCmdId === 0x26) {
            this.state.roll = -parseInput(data, 11);
            this.state.pitch = parseInput(data, 13);
            this.state.throttle = parseInput(data, 15);
            this.state.yaw = -parseInput(data, 17);
            changed = true;
          } else if (data.length === 58) {
            // Parse button presses
            const ival = data.readUInt16BE(28);
            this.state.btn_fn = (ival & 0x1060) === 0x1060 ? 1 : 0;
            this.state.btn_photo = (ival & 0x1080) === 0x1080 ? 1 : 0;
            this.state.btn_rtbh = (ival & 0x1004) === 0x1004 ? 1 : 0;
            this.state.btn_pause = (ival & 0x1002) === 0x1002 ? 1 : 0;

            const ival2 = data.readUInt16BE(27);
            this.state.dial_click = ival2 === 0x0 ? 1 : (ival2 & 0x20) === 0x20 ? -1 : 0;

            // RC Battery
            if (data.length > 32) {
              const batVal = data[31];
              if (batVal >= 0 && batVal <= 100) {
                this.state.rc_battery = batVal;
              }
              this.state.rc_charging = (data[32] & 0x01) ? 1 : 0;
            }
            changed = true;
          }
        }

        if (changed) {
          this.emit('state', this.state);
        }
      });

      this.port.on('close', () => {
        clearInterval(pollInterval);
        resolve();
      });

      this.port.on('error', (err) => {
        clearInterval(pollInterval);
        reject(err);
      });
    });
  }

  private writePacket(packet: Buffer): void {
    try {
      if (this.port && this.port.isOpen) {
        this.port.write(packet);
      }
    } catch {
      // Ignore write errors during disconnect
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
