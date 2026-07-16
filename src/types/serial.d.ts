interface SerialPort {
  readable: ReadableStream | null;
  writable: WritableStream | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface Serial {
  requestPort(): Promise<SerialPort>;
  getPorts(): Promise<SerialPort>;
}

interface Navigator {
  serial?: Serial;
}
