import { exec } from 'child_process';
import { promisify } from 'util';
import ping from 'ping';

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
 * Generates a list of all IP addresses in a CIDR range
 */
function getIpsFromRange(range: string): string[] {
  const ips: string[] = [];
  const [base, mask] = range.split('/');

  if (mask === '24') {
    const parts = base.split('.');
    for (let i = 1; i <= 254; i++) {
      ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}`);
    }
  } else {
    ips.push(base);
  }
  return ips;
}

/**
 * Robust ARP table parsing for both macOS and Linux.
 */
function getArpTable(): Record<string, string> {
  const table: Record<string, string> = {};
  const { execSync } = require('child_process');

  try {
    const output = execSync('arp -a').toString();
    const lines = output.split('\n');
    lines.forEach((line: string) => {
      const ipMatch = line.match(/\(([\d.]+)\)/);
      const macMatch = line.match(/([a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2})/);
      if (ipMatch && macMatch && !line.includes('(incomplete)')) {
        table[ipMatch[1]] = macMatch[1].toLowerCase();
      }
    });
  } catch (e) {}

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resolves a MAC address to a Vendor using a public API
 */
async function getVendorFromApi(mac: string): Promise<string | undefined> {
  if (!mac || mac === '??:??:??:??:??:??' || mac.includes('Local')) return undefined;
  try {
    const res = await fetch(`https://api.macvendors.com/${encodeURIComponent(mac)}`);
    if (res.ok) return await res.text();
  } catch (e) {}
  return undefined;
}

/**
 * REPLACED NMAP WITH BASIC PING FOR DISCOVERY
 * Updated to avoid TP-Link ER605 "ICMP TIMESTAMP" detection.
 */
export async function scanSubnet(range: string, excludeIps: string[] = []): Promise<DiscoveredDevice[]> {
  console.log(`[Scanner] Stealth discovery on ${range}...`);

  const allIps = getIpsFromRange(range).filter(ip => !excludeIps.includes(ip));
  const activeDevices: DiscoveredDevice[] = [];

  // Use basic ICMP Echo (Type 8) only.
  // We explicitly avoid any flags that might trigger timestamp requests.
  const concurrency = 5; // Low concurrency for router safety
  for (let i = 0; i < allIps.length; i += concurrency) {
    const batch = allIps.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(ip => ping.promise.probe(ip, {
        timeout: 1,
        // '-O' (Omit Timestamp) is a standard Linux ping flag that prevents
        // the ER605 from flagging an ICMP TIMESTAMP attack.
        extra: process.platform === 'linux' ? ['-O'] : []
      }))
    );

    results.forEach(res => {
      if (res.alive) {
        activeDevices.push({
          ip: res.host,
          hostname: res.numeric_host !== res.host ? res.host : undefined
        });
      }
    });
  }

  const arpTable = getArpTable();
  const enrichedResults: DiscoveredDevice[] = [];

  for (const d of activeDevices) {
    const mac = arpTable[d.ip];
    const vendor = mac ? await getVendorFromApi(mac) : undefined;
    if (vendor) await sleep(200);

    enrichedResults.push({
      ...d,
      mac: mac,
      vendor: vendor
    });
  }

  console.log(`[Scanner] Stealth scan complete. Found ${enrichedResults.length} active devices.`);
  return enrichedResults;
}

export async function probeDevice(ip: string): Promise<DetailedDevice> {
  const nmapPath = process.env.NMAP_PATH || 'nmap';
  console.log(`[Scanner] Detailed nmap probe on ${ip}...`);

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
    console.error('[Scanner] Nmap probe failed:', error);
    throw error;
  }
}
