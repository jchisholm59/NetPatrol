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
 * Robust ARP table parsing for both macOS and Linux.
 */
function getArpTable(): Record<string, string> {
  const table: Record<string, string> = {};
  const { execSync } = require('child_process');

  try {
    const output = execSync('arp -a').toString();
    const lines = output.split('\n');
    lines.forEach((line: string) => {
      // Extract IP from parentheses (...)
      const ipMatch = line.match(/\(([\d.]+)\)/);
      // Extract MAC address (various formats)
      const macMatch = line.match(/([a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2}:[a-fA-F\d]{1,2})/);

      if (ipMatch && macMatch && !line.includes('(incomplete)')) {
        table[ipMatch[1]] = macMatch[1].toLowerCase();
      }
    });
  } catch (e) {}

  return table;
}

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

export async function scanSubnet(range: string): Promise<DiscoveredDevice[]> {
  const nmapPath = process.env.NMAP_PATH || 'nmap';
  console.log(`[Scanner] Discovery scan on ${range}...`);

  try {
    // We'll use the 'Normal' output format since the user confirmed it shows MACs manually.
    const { stdout } = await execAsync(`${nmapPath} -sn ${range}`);

    const results: DiscoveredDevice[] = [];
    const arpTable = getArpTable();

    // Split by "Nmap scan report for"
    const hosts = stdout.split('Nmap scan report for ');
    hosts.shift(); // Remove the first empty split

    for (const hostContent of hosts) {
      // Extract IP (might be standalone or in parens if hostname exists)
      const lines = hostContent.split('\n');
      const firstLine = lines[0].trim();
      const ipInParens = firstLine.match(/\(([\d.]+)\)/);
      const ip = ipInParens ? ipInParens[1] : firstLine;

      // Extract Hostname (if different from IP)
      let hostname = undefined;
      if (ipInParens) {
        hostname = firstLine.split(' (')[0];
      }

      // Extract MAC and Vendor from the block
      let mac = undefined;
      let vendor = undefined;

      const macLine = lines.find(l => l.includes('MAC Address:'));
      if (macLine) {
        const macMatch = macLine.match(/MAC Address: ([:a-fA-F\d]{17})/);
        if (macMatch) mac = macMatch[1].toLowerCase();

        const vendorMatch = macLine.match(/\((.*?)\)/);
        if (vendorMatch) vendor = vendorMatch[1];
      }

      // Final fallbacks
      mac = mac || arpTable[ip];

      if (ip && ip !== '127.0.0.1') {
        results.push({ ip, mac, vendor, hostname });
      }
    }

    // If MAC found but no vendor, try API lookup for gaps
    const finalResults = await Promise.all(results.map(async (d) => {
      if (d.mac && !d.vendor) {
        d.vendor = await getVendorFromApi(d.mac);
      }
      return d;
    }));

    return finalResults;
  } catch (error) {
    console.error('[Scanner] Discovery failed:', error);
    throw error;
  }
}

export async function probeDevice(ip: string): Promise<DetailedDevice> {
  const nmapPath = process.env.NMAP_PATH || 'nmap';
  console.log(`[Scanner] Snappy probe on ${ip}...`);

  try {
    // Using Grepable format for port parsing as it's cleaner for machine reading
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

    return {
      ip,
      mac: arpTable[ip],
      ports
    };
  } catch (error) {
    console.error('[Scanner] Probe failed:', error);
    throw error;
  }
}
