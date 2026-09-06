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
 * Robust ARP table parsing for both macOS and Linux
 */
function getArpTable(): Record<string, string> {
  const table: Record<string, string> = {};
  try {
    const { execSync } = require('child_process');
    const output = execSync('arp -a').toString();
    const lines = output.split('\n');

    lines.forEach((line: string) => {
      // Format 1: ? (192.168.0.1) at 9c:a2:f4:40:2a:93 on en0 (macOS / some Linux)
      const ipMatch = line.match(/\((.*?)\)/);
      const macMatch = line.match(/at ([:a-fA-F\d]{11,17})/);

      // Format 2: 192.168.0.1  ether  9c:a2:f4:40:2a:93  C  eth0 (Standard Linux)
      const linuxMatch = line.match(/^([\d.]+)\s+.*?([:a-fA-F\d]{11,17})/);

      if (ipMatch && macMatch && macMatch[1] !== '(incomplete)') {
        table[ipMatch[1]] = macMatch[1];
      } else if (linuxMatch) {
        table[linuxMatch[1]] = linuxMatch[2];
      }
    });
  } catch (e) {
    console.warn('[Scanner] ARP lookup failed:', e);
  }
  return table;
}

/**
 * Resolves a MAC address to a Vendor using a public API with throttling
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getVendorFromApi(mac: string): Promise<string | undefined> {
  if (!mac || mac === '??:??:??:??:??:??' || mac.includes('Local')) return undefined;

  try {
    const res = await fetch(`https://api.macvendors.com/${encodeURIComponent(mac)}`);
    if (res.ok) return await res.text();

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
    // On Linux, we check if we can run as root to get MACs directly
    let command = `${nmapPath} -sn -T4 -oG - ${range}`;

    const { stdout } = await execAsync(command);
    const devices = parseGrepable(stdout);
    const arpTable = getArpTable();

    const results = await Promise.all(devices.map(async (d) => {
      const mac = arpTable[d.ip];
      const vendor = mac ? await getVendorFromApi(mac) : undefined;
      return {
        ...d,
        mac: mac || undefined,
        vendor: vendor
      };
    }));

    return results;
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
