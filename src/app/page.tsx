'use client';

import { useState, useEffect } from 'react';
import {
  Network,
  Search,
  Activity,
  AlertCircle,
  Settings,
  Info,
  Plus,
  RefreshCw,
  Cpu,
  Monitor,
  Trash2,
  ShieldOff
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  // Final Version with Cache-Busting and Robust Subnet Logic
  const [subnets, setSubnets] = useState<any[]>([]);
  const [activeSubnet, setActiveSubnet] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [probingIp, setProbingIp] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [probingDevice, setProbingDevice] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'ip' | 'name'>('ip');
  const [theme, setTheme] = useState<'dark' | 'light' | 'slate'>('slate');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchSubnets();
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark', 'light', 'slate');
    html.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    if (activeSubnet) {
      console.log('Active subnet changed to:', activeSubnet.mask);
      fetchDevices(activeSubnet.id);
    }
  }, [activeSubnet]);

  const fetchSubnets = async () => {
    try {
      // Added timestamp to force bypass of all caches (browser and Next.js)
      const res = await fetch(`/api/subnets?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch subnets');
      const data = await res.json();
      console.log('Fetched subnets from API:', data);
      setSubnets(data);

      if (data.length > 0) {
        if (!activeSubnet || !data.find((s: any) => s.id === activeSubnet.id)) {
          setActiveSubnet(data[0]);
        }
      }
    } catch (e) {
      console.error(e);
      alert('Error loading subnets. Is the server running?');
    }
  };

  const fetchDevices = async (subnetId: string) => {
    setLoading(true);
    const res = await fetch(`/api/devices?subnetId=${subnetId}&t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    setDevices(data);
    setLoading(false);
  };

  const handleScanNow = async () => {
    if (!activeSubnet) return;
    setScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnetId: activeSubnet.id }),
      });
      if (!res.ok) {
        const error = await res.json();
        alert('Scan Error: ' + (error.error || 'Check server logs'));
      }
      await fetchDevices(activeSubnet.id);
    } catch (e) {
      console.error(e);
      alert('Failed to trigger scan');
    } finally {
      setScanning(false);
    }
  };

  const handleAddSubnet = async () => {
    const mask = prompt('Enter Subnet Mask (e.g., 192.168.1.0/24)');
    if (!mask) return;

    console.log('Attempting to add subnet:', mask);
    const res = await fetch('/api/subnets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mask, name: 'New Subnet' }),
    });

    if (res.ok) {
      const newSubnet = await res.json();
      console.log('Subnet added successfully:', newSubnet);
      await fetchSubnets();
      setActiveSubnet(newSubnet);
    } else {
      const error = await res.json();
      console.error('Subnet addition failed:', error);

      // Final Truth Unmasked: Showing actual database errors
      if (error.error?.includes('readonly') || error.error?.includes('permission')) {
        alert('SYSTEM ERROR: Database is locked or Read-Only. Please run: sudo chown -R jim:jim ~/NetPatrol');
      } else if (error.error?.includes('already exists') || error.code === 'P2002') {
        alert('This subnet is already in the database. Selecting it now...');
        await fetchSubnets();
      } else {
        alert('Failed: ' + (error.error || 'Check server logs'));
      }
    }
  };

  const handleAISummary = async () => {
    if (!activeSubnet) return;
    setLoading(true);
    const res = await fetch(`/api/summary?subnetId=${activeSubnet.id}`);
    const data = await res.json();
    setSummary(data.summary);
    setLoading(false);
  };

  const handleTestAlerts = async () => {
    try {
      const res = await fetch('/api/alerts/test', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
      } else {
        alert('Test failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Failed to connect to alerting service.');
    }
  };

  const handleProbe = async (ip: string) => {
    console.log('Initiating deep probe for:', ip);
    setProbingIp(ip);
    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('Probe results received:', data);
        setProbingDevice(data);
      } else {
        const err = await res.json();
        console.error('Probe API error:', err);
        alert(`Probe failed: ${err.error || 'Ensure device is reachable'}`);
      }
    } catch (e) {
      console.error('Frontend probe error:', e);
      alert('Network error during probe.');
    } finally {
      setProbingIp(null);
    }
  };

  const handleUpdateDevice = async (id: string, updates: any) => {
    await fetch('/api/devices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (activeSubnet) fetchDevices(activeSubnet.id);
  };

  const handleUpdateSubnet = async (id: string, updates: any) => {
    await fetch('/api/subnets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    fetchSubnets();
  };

  const handleDeleteSubnet = async (id: string, mask: string) => {
    if (!confirm(`Are you sure you want to delete the subnet ${mask}? This will remove all discovered devices and history.`)) return;

    try {
      const res = await fetch(`/api/subnets?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveSubnet(null);
        await fetchSubnets();
      } else {
        alert('Failed to delete subnet.');
      }
    } catch (e) {
      alert('Error deleting subnet.');
    }
  };

  const handleDeleteDevice = async (id: string, ip: string) => {
    if (!confirm(`Are you sure you want to remove device ${ip} from the list? It will reappear if discovered in the next scan.`)) return;

    try {
      const res = await fetch(`/api/devices?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeSubnet) fetchDevices(activeSubnet.id);
      } else {
        alert('Failed to delete device.');
      }
    } catch (e) {
      alert('Error deleting device.');
    }
  };

  const sortedDevices = [...devices].sort((a, b) => {
    if (sortBy === 'ip') {
      // Simple IP comparison, could be improved with integer conversion
      return a.ip.localeCompare(b.ip, undefined, { numeric: true });
    }
    return (a.customName || a.ip).localeCompare(b.customName || b.ip);
  });

  const isMatch = (device: any) => {
    if (!searchQuery) return false;
    const q = searchQuery.toLowerCase();
    return (
      (device.customName?.toLowerCase().includes(q)) ||
      (device.ip?.toLowerCase().includes(q)) ||
      (device.mac?.toLowerCase().includes(q)) ||
      (device.hostname?.toLowerCase().includes(q))
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">NetPatrol</h1>
          <p className="text-muted-foreground">Network Monitoring & Analysis {subnets.length > 0 ? `(${subnets.length} subnets active)` : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted rounded-lg p-1 border border-border">
            {[
              { id: 'dark', label: 'Dark' },
              { id: 'light', label: 'Light' },
              { id: 'slate', label: 'Dark Slate Grey' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${
                  theme === t.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleAddSubnet}
            className="flex items-center gap-2 bg-secondary px-4 py-2 rounded-md hover:bg-secondary/80 transition font-bold"
          >
            <Plus size={18} /> Add Subnet
          </button>
          <button
            onClick={handleScanNow}
            disabled={scanning || !activeSubnet}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {scanning ? <RefreshCw className="animate-spin" size={18} /> : <Search size={18} />}
            Scan Now
          </button>
          <button
            onClick={handleTestAlerts}
            className="flex items-center gap-2 bg-muted text-muted-foreground px-4 py-2 rounded-md hover:bg-muted/80 transition"
            title="Send test Slack and Gmail alerts"
          >
            <AlertCircle size={18} /> Test Alerts
          </button>
        </div>
      </div>

      {/* Subnet Tabs */}
      <div className="flex flex-col gap-2 p-6 bg-card border-2 border-primary/20 rounded-xl shadow-inner">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">Subnet Selectors</h3>
        <div className="flex flex-wrap gap-4">
          {subnets.length === 0 ? (
            <div className="px-4 py-2 text-sm text-muted-foreground italic">No subnets found. Click "Add Subnet" above to begin.</div>
          ) : subnets.map(s => (
            <button
              key={s.id}
              onClick={() => {
                console.log('User selected subnet:', s.mask);
                setActiveSubnet(s);
              }}
              className={`group flex items-center gap-3 px-6 py-4 rounded-xl text-lg font-bold transition-all border-4 ${
                activeSubnet?.id === s.id
                  ? 'bg-primary text-primary-foreground border-primary shadow-xl -translate-y-1'
                  : 'bg-muted/30 text-foreground border-transparent hover:border-primary/40 hover:bg-muted/50'
              }`}
            >
              <div className={`p-2 rounded-lg ${activeSubnet?.id === s.id ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                <Network size={24} />
              </div>
              <span>{s.mask}</span>
            </button>
          ))}
        </div>

        {activeSubnet && (
          <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-3 bg-muted/50 px-4 py-2 rounded-full border border-border">
              <Settings size={16} className="text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scan Cycle</span>
              <select
                value={activeSubnet.scanPeriod}
                onChange={(e) => handleUpdateSubnet(activeSubnet.id, { scanPeriod: parseInt(e.target.value) })}
                className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer p-0"
              >
                <option value="60">Every 1 Minute</option>
                <option value="300">Every 5 Minutes</option>
                <option value="3600">Every 1 Hour</option>
                <option value="86400">Daily</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Activity size={14} />
              Last Scan: {activeSubnet.lastScanned ? formatDistanceToNow(new Date(activeSubnet.lastScanned), { addSuffix: true }) : 'Never'}
            </div>

            <button
              onClick={() => handleDeleteSubnet(activeSubnet.id, activeSubnet.mask)}
              className="ml-auto text-[10px] font-black uppercase tracking-widest bg-yellow-400 text-black hover:bg-yellow-500 px-4 py-2 rounded-lg shadow-lg transition-all active:scale-95"
            >
              ⚠️ Delete Subnet
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Main Table Area */}
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 whitespace-nowrap">
              <Network size={20} /> Discovered Devices
            </h2>

            {/* Search Input */}
            <div className="relative w-full md:flex-1 md:max-w-md group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Search by Name, IP, or MAC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-muted/50 border border-border rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex gap-4 text-sm items-center">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Sort:</span>
                <button
                  onClick={() => setSortBy('ip')}
                  className={`px-2 py-1 rounded ${sortBy === 'ip' ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-muted'}`}
                >IP</button>
                <button
                  onClick={() => setSortBy('name')}
                  className={`px-2 py-1 rounded ${sortBy === 'name' ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-muted'}`}
                >Name</button>
              </div>
            </div>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider font-black">
                  <tr>
                    <th className="px-4 py-4 w-[110px]">Status</th>
                    <th className="px-4 py-4 min-w-[200px]">Device Identification</th>
                    <th className="px-4 py-4 w-[140px]">IP Address</th>
                    <th className="px-4 py-4 min-w-[220px]">MAC / Vendor</th>
                    <th className="px-4 py-4 w-[120px]">Last Seen</th>
                    <th className="px-4 py-4 text-right pr-6">Management Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading && devices.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground italic">Discovering your network...</td></tr>
                  ) : sortedDevices.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground italic">No devices found. Trigger a scan above.</td></tr>
                  ) : sortedDevices.map(d => (
                    <tr
                      key={d.id}
                      className={`transition-all group ${
                        d.isExcluded
                          ? 'bg-muted/5 opacity-50'
                          : isMatch(d)
                            ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                            : 'hover:bg-muted/20'
                      }`}
                    >
                      <td className="px-4 py-4">
                        {d.isExcluded ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground font-bold text-[10px] uppercase">
                            <ShieldOff size={12} /> Excluded
                          </div>
                        ) : d.lastStatus === 'up' ? (
                          <div className="flex items-center gap-1.5 text-green-500">
                            <Activity size={14} className="animate-pulse" /> <span className="text-[11px] font-black uppercase tracking-tighter">Online</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-red-500">
                            <AlertCircle size={14} /> <span className="text-[11px] font-black uppercase tracking-tighter">Down ({d.downCount})</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <input
                          defaultValue={d.customName || ''}
                          onBlur={(e) => handleUpdateDevice(d.id, { customName: e.target.value })}
                          placeholder="Assign custom name..."
                          className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 -ml-1 w-full text-sm font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/30"
                        />
                        <div className="text-[10px] uppercase tracking-tight text-muted-foreground/60 font-medium">
                          {d.hostname || (d.customName ? "" : "No Hostname")}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs font-bold text-primary/80">{d.ip}</td>
                      <td className="px-4 py-4">
                        <div className="text-xs font-mono font-medium">{d.mac || '??:??:??:??:??:??'}</div>
                        <div className="text-[10px] font-bold text-muted-foreground truncate max-w-[180px] uppercase tracking-wide">{d.vendor || 'Generic Device'}</div>
                      </td>
                      <td className="px-4 py-4 text-[11px] text-muted-foreground font-medium">
                        {formatDistanceToNow(new Date(d.lastSeen), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-4 text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border shadow-inner">
                            <button
                              onClick={() => handleUpdateDevice(d.id, { gmailAlert: !d.gmailAlert })}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase transition-all ${d.gmailAlert ? 'bg-red-500 text-white shadow-sm' : 'text-muted-foreground opacity-40 hover:opacity-100'}`}
                              title="Toggle Gmail Alert"
                            >
                              Gmail
                            </button>
                            <button
                              onClick={() => handleUpdateDevice(d.id, { slackAlert: !d.slackAlert })}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase transition-all ${d.slackAlert ? 'bg-blue-500 text-white shadow-sm' : 'text-muted-foreground opacity-40 hover:opacity-100'}`}
                              title="Toggle Slack Alert"
                            >
                              Slack
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUpdateDevice(d.id, { alertEnabled: !d.alertEnabled })}
                              className={`p-2 rounded-lg transition-all ${d.alertEnabled ? 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 shadow-sm' : 'text-muted-foreground hover:bg-muted border border-transparent'}`}
                              title={d.alertEnabled ? 'Monitoring Active' : 'Enable Monitoring'}
                            >
                              <AlertCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleUpdateDevice(d.id, { isExcluded: !d.isExcluded })}
                              className={`p-2 rounded-lg transition-all ${d.isExcluded ? 'text-primary bg-primary/10 border border-primary/20' : 'text-muted-foreground hover:bg-muted border border-transparent'}`}
                              title={d.isExcluded ? 'Re-enable Scanning' : 'Exclude from Scans'}
                            >
                              <ShieldOff size={16} />
                            </button>
                            <button
                              onClick={() => handleProbe(d.ip)}
                              disabled={!!probingIp}
                              className={`p-2 rounded-lg transition-all ${probingIp === d.ip ? 'bg-primary text-primary-foreground animate-spin' : 'hover:bg-primary/20 text-primary border border-transparent hover:border-primary/30'}`}
                              title={probingIp === d.ip ? 'Probing...' : 'Deep Probe Service'}
                            >
                              {probingIp === d.ip ? <RefreshCw size={16} /> : <Info size={16} />}
                            </button>
                            <button
                              onClick={() => handleDeleteDevice(d.id, d.ip)}
                              className="p-2 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-lg transition-all border border-transparent hover:border-destructive/30"
                              title="Purge Device History"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bottom AI & Stats Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 border-t border-border/50">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Cpu size={120} />
            </div>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Cpu size={20} className="text-primary" /> AI Network Insight
              </h3>
              <button
                onClick={handleAISummary}
                disabled={loading || !activeSubnet}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {loading ? "Analyzing..." : "Generate AI Summary"}
              </button>
            </div>
            <div className="text-sm text-muted-foreground min-h-[80px] leading-relaxed bg-muted/20 p-4 rounded-lg border border-border/50 whitespace-pre-wrap">
              {summary ? summary : "Click the button to generate a natural language analysis of your current network status."}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Settings size={20} className="text-primary" /> Network Health
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50/5 border border-green-500/20 p-4 rounded-xl text-center">
                <div className="text-3xl font-black text-green-500">{devices.filter(d => d.lastStatus === 'up').length}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-green-500/70">Online</div>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl text-center">
                <div className="text-3xl font-black text-red-500">{devices.filter(d => d.lastStatus === 'down').length}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-red-500/70">Offline</div>
              </div>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-muted-foreground uppercase tracking-wider">Total Scanned</span>
                <span>{devices.length} Devices</span>
              </div>
              <div className="w-full bg-muted-foreground/10 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-1000"
                  style={{ width: `${(devices.filter(d => d.lastStatus === 'up').length / (devices.length || 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Probe Modal */}
      {probingDevice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-card border-2 border-primary/50 w-full max-w-2xl rounded-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] p-8 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setProbingDevice(null)}
              className="absolute right-6 top-6 p-2 bg-muted hover:bg-destructive hover:text-destructive-foreground rounded-full transition-colors"
              title="Close"
            >
              <Plus className="rotate-45" size={24} />
            </button>

            <div className="mb-8">
              <div className="text-primary font-black uppercase tracking-tighter text-sm mb-1">Deep Probe Result</div>
              <h2 className="text-4xl font-black tracking-tight flex items-center gap-3">
                <Monitor className="text-primary" size={36} /> {probingDevice.ip}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 bg-muted/30 p-6 rounded-xl border border-border">
              <div>
                <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Hostname</h4>
                <div className="font-bold text-lg">{probingDevice.hostname || 'Unknown Device'}</div>
              </div>
              <div>
                <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Manufacturer</h4>
                <div className="font-bold text-lg text-primary">{probingDevice.vendor || 'Generic / Unlisted'}</div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-end mb-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Active Services</h4>
                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded">
                  {probingDevice.ports?.length || 0} Ports Open
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto border border-border rounded-xl bg-background/50">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-muted-foreground font-bold">
                    <tr>
                      <th className="px-6 py-3 border-b border-border">Port</th>
                      <th className="px-6 py-3 border-b border-border">Service</th>
                      <th className="px-6 py-3 border-b border-border">Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {probingDevice.ports?.length > 0 ? probingDevice.ports.map((p: any) => (
                      <tr key={`${p.port}-${p.protocol}`} className="hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-primary">{p.port}</td>
                        <td className="px-6 py-4 font-medium">{p.service || 'unknown'}</td>
                        <td className="px-6 py-4 uppercase text-[10px] font-black opacity-60">{p.protocol}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground italic">
                          No open ports were detected during this scan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setProbingDevice(null)}
                className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
