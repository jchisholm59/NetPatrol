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
 * Robust ARP table parsing for both macOS and Linux.
 * Handles:
 * - ? (192.168.0.1) at 9c:a2:f4:40:2a:93 on en0 [macOS]
 * - gateway (192.168.0.1) at 9c:a2:f4:40:2a:93 [ether] on eth0 [Linux]
 * - 192.168.0.1 dev eth0 lladdr 9c:a2:f4:40:2a:93 REACHABLE [ip neigh]
 */
function getArpTable(): Record<string, string> {
  const table: Record<string, string> = {};
  const { execSync } = require('child_process');

  // Try 'arp -a'
  try {
    const output = execSync('arp -a').toString();
    const lines = output.split('\n');
    lines.forEach((line: string) => {
      const ipMatch = line.match(/\(([\d.]+)\)/);
      const macMatch = line.match(/([a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2})/);
      if (ipMatch && macMatch) {
        table[ipMatch[1]] = macMatch[1].toLowerCase();
      }
    });
  } catch (e) {}

  // Try 'ip neigh' as fallback if 'arp' was limited
  try {
    const output = execSync('ip neigh show').toString();
    const lines = output.split('\n');
    lines.forEach((line: string) => {
      const parts = line.split(/\s+/);
      const ip = parts[0];
      const macIndex = parts.indexOf('lladdr') + 1;
      if (ip.match(/^[\d.]+$/) && macIndex > 0 && parts[macIndex]) {
        table[ip] = parts[macIndex].toLowerCase();
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
  const isRoot = process.getuid && process.getuid() === 0;

  console.log(`[Scanner] Discovery scan on ${range} (Running as root: ${isRoot})...`);

  try {
    // If we are root, nmap -sn on Linux/macOS will actually get MAC addresses and Vendors natively!
    // We use -oX for the most detailed output when root.
    if (isRoot) {
      const { stdout } = await execAsync(`${nmapPath} -sn ${range} -oX -`);
      const results: DiscoveredDevice[] = [];

      // Simple regex parser for XML to avoid adding another heavy library
      const hosts = stdout.split('<host ');
      hosts.shift(); // First part is header

      for (const hostContent of hosts) {
        const ipMatch = hostContent.match(/addr="([\d.]+)" addrtype="ipv4"/);
        const macMatch = hostContent.match(/addr="([:A-F\d]+)" addrtype="mac"/);
        const vendorMatch = hostContent.match(/vendor="(.*?)"/);
        const hostNameMatch = hostContent.match(/name="(.*?)"/);

        if (ipMatch && ipMatch[1] !== '127.0.0.1') {
          results.push({
            ip: ipMatch[1],
            mac: macMatch ? macMatch[1].toLowerCase() : undefined,
            vendor: vendorMatch ? vendorMatch[1] : undefined,
            hostname: hostNameMatch ? hostNameMatch[1] : undefined
          });
        }
      }
      return results;
    }

    // Non-root fallback logic
    const { stdout } = await execAsync(`${nmapPath} -sn -T4 -oG - ${range}`);
    const devices = parseGrepable(stdout);
    const arpTable = getArpTable();

    const enrichedResults = await Promise.all(devices.map(async (d) => {
      const mac = arpTable[d.ip];
      const vendor = mac ? await getVendorFromApi(mac) : undefined;
      return {
        ...d,
        mac: mac || undefined,
        vendor: vendor
      };
    }));

    return enrichedResults;
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
