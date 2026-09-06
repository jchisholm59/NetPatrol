import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DiscoveredDevice {
  ip: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
}

export interface DetailedDevice extends DiscoveredDevice {
  ports: {
    port: number;
    protocol: string;
    service?: string;
    state: string;
  }[];
}

/**
 * Parses nmap -oG (Grepable) output
 */
function parseGrepable(output: string): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const lines = output.split('\n');

  lines.forEach(line => {
    if (line.startsWith('Host:')) {
      const ipMatch = line.match(/Host: ([\d.]+)/);
      const hostMatch = line.match(/\((.*?)\)/);
      const ip = ipMatch ? ipMatch[1] : '';
      const hostname = hostMatch && hostMatch[1] !== '' ? hostMatch[1] : undefined;

      if (ip && ip !== '127.0.0.1') {
        devices.push({ ip, hostname });
      }
    }
  });

  return devices;
}

/**
 * Fallback to 'arp -a' to find MAC addresses
 */
function getArpTable(): Record<string, string> {
  const table: Record<string, string> = {};
  try {
    const { execSync } = require('child_process');
    const output = execSync('arp -a').toString();
    const lines = output.split('\n');
    lines.forEach((line: string) => {
      const ipMatch = line.match(/\((.*?)\)/);
      const macMatch = line.match(/at (.*?) on/);
      if (ipMatch && macMatch && macMatch[1] !== '(incomplete)') {
        table[ipMatch[1]] = macMatch[1];
      }
    });
  } catch (e) {}
  return table;
}

/**
 * Resolves a MAC address to a Vendor using a public API with throttling
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getVendorFromApi(mac: string): Promise<string | undefined> {
  if (!mac || mac === '??:??:??:??:??:??' || mac.includes('Local')) return undefined;

  // Try MacVendors (Primary)
  try {
    const res = await fetch(`https://api.macvendors.com/${encodeURIComponent(mac)}`);
    if (res.ok) return await res.text();

    // If rate limited (429), wait and try MacLookup (Secondary)
    if (res.status === 429) {
      await sleep(1000);
      const res2 = await fetch(`https://api.maclookup.app/v2/macs/${encodeURIComponent(mac)}`);
      if (res2.ok) {
        const data = await res2.json();
        return data.company || undefined;
      }
    }
  } catch (e) {}
  return undefined;
}

export async function scanSubnet(range: string): Promise<DiscoveredDevice[]> {
  const nmapPath = process.env.NMAP_PATH || 'nmap';
  console.log(`[Scanner] Discovery scan on ${range}...`);

  try {
    const { stdout } = await execAsync(`${nmapPath} -sn -T4 -oG - ${range}`);
    const devices = parseGrepable(stdout);
    const arpTable = getArpTable();

    const enrichedDevices: DiscoveredDevice[] = [];

    // Process vendors sequentially with a small delay to respect API limits
    for (const d of devices) {
      const mac = arpTable[d.ip];
      let vendor = undefined;

      if (mac) {
        console.log(`[Scanner] Looking up vendor for ${mac}...`);
        vendor = await getVendorFromApi(mac);
        // Wait 500ms between each external API call
        if (vendor) await sleep(500);
      }

      enrichedDevices.push({
        ...d,
        mac: mac || undefined,
        vendor: vendor
      });
    }

    return enrichedDevices;
  } catch (error) {
    console.error('[Scanner] Discovery failed:', error);
    throw error;
  }
}

export async function probeDevice(ip: string): Promise<DetailedDevice> {
  const nmapPath = process.env.NMAP_PATH || 'nmap';
  console.log(`[Scanner] Snappy probe on ${ip}...`);

  try {
    const { stdout } = await execAsync(`${nmapPath} -F -T4 --open -Pn -n --max-rtt-timeout 100ms -oG - ${ip}`);

    const portSection = stdout.match(/Ports: (.*)/);
    const ports: any[] = [];

    if (portSection && portSection[1]) {
      const portStrings = portSection[1].split(', ');
      portStrings.forEach(pStr => {
        const parts = pStr.split('/');
        if (parts.length >= 5) {
          ports.push({
            port: parseInt(parts[0]),
            state: parts[1],
            protocol: parts[2],
            service: parts[4]
          });
        }
      });
    }

    const arpTable = getArpTable();
    const mac = arpTable[ip];
    const vendor = mac ? await getVendorFromApi(mac) : undefined;

    return {
      ip,
      mac: mac,
      vendor: vendor,
      ports
    };
  } catch (error) {
    console.error('[Scanner] Probe failed:', error);
    throw error;
  }
}
