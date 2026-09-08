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
 * Resolves a MAC address to a Vendor using a public API with sequential throttling
 */
async function getVendorFromApi(mac: string): Promise<string | undefined> {
  if (!mac || mac === '??:??:??:??:??:??' || mac.includes('Local')) return undefined;

  try {
    const res = await fetch(`https://api.macvendors.com/${encodeURIComponent(mac)}`);
    if (res.ok) return await res.text();

    // Fallback if primary is busy
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

export async function scanSubnet(range: string, excludeIps: string[] = []): Promise<DiscoveredDevice[]> {
  console.log(`[Scanner] Stealth discovery on ${range}...`);

  const allIps = getIpsFromRange(range).filter(ip => !excludeIps.includes(ip));
  const activeDevices: DiscoveredDevice[] = [];

  // Batch pings to popuate the OS ARP cache quickly
  // Reduced to 5 to avoid triggering ICMP Flood protection on TP-Link ER605
  const concurrency = 5;
  for (let i = 0; i < allIps.length; i += concurrency) {
    const batch = allIps.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(ip => ping.promise.probe(ip, { timeout: 1 }))
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
  console.log(`[Scanner] System ARP table contains ${Object.keys(arpTable).length} entries.`);
  const enrichedResults: DiscoveredDevice[] = [];

  // Sequential vendor lookup to avoid API rate limiting (Important for 30+ devices)
  for (const d of activeDevices) {
    const mac = arpTable[d.ip];
    const vendor = mac ? await getVendorFromApi(mac) : undefined;
    if (vendor) await sleep(200); // Small pause to be polite to the free API

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
