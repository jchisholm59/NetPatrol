# 🛡️ NetPatrol: Network Scanner & Monitor

NetPatrol is a sharp, modern network monitoring application designed for real-time device discovery, deep service probing, and AI-powered network analysis.

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: Ensure Node.js is installed.
- **Nmap**: The application uses the `nmap` engine.
  - **macOS**: `brew install nmap`
  - **Linux**: `sudo apt install nmap`
  - **Windows**: Download from [nmap.org](https://nmap.org/download.html)

### 2. Configuration
Create/edit the `.env` file in the root directory:
```env
DATABASE_URL="file:/Users/jim/NetPatrol/prisma/dev.db"
PORT=8765
GEMINI_API_KEY="your-gemini-key"
SLACK_WEBHOOK_URL="your-slack-webhook"
GMAIL_USER="your-email@gmail.com"
GMAIL_PASS="your-google-app-password"
NMAP_PATH="nmap"
```

### 3. Running the App
```bash
npm install
npx prisma db push
npm run dev
```
Access the dashboard at: [http://localhost:8765](http://localhost:8765)

---

## 🛠️ Key Features

### 📡 Network Discovery
- **Subnet Tabs**: Add multiple subnets (e.g., `192.168.1.0/24`) and view them as independent pages.
- **Fast Scanning**: Uses optimized Nmap flags for rapid host discovery.
- **MAC & Vendor Detection**: Integrated ARP table fallback to identify hardware manufacturers even without root privileges.

### 🔍 Deep Probing (The Info Icon)
- Clicking the **(i)** icon on any device triggers a "Snappy Probe."
- This scans the top 1,024 privileged ports to identify active services (Web, SSH, DBs, etc.).
- Optimized with strict timeouts to ensure you get results in seconds, not minutes.

### 🤖 AI Network Insights
- Uses **Gemini 2.0 Flash-Lite** to analyze your network state.
- Generates a natural language summary identifying total devices, active services, and potential security concerns.

---

## 🔔 Alerting System

NetPatrol includes a robust alerting system for Slack and Gmail.

### How to Configure Alerts:
1. **Global Configuration**: Ensure `SLACK_WEBHOOK_URL`, `GMAIL_USER`, and `GMAIL_PASS` are set in your `.env`.
2. **Enable for Device**: In the main table, click the **Bell Icon** for the specific device you want to watch. 
   - **Yellow Bell**: Alerts are ENABLED.
   - **Grey Bell**: Alerts are DISABLED.
3. **Select Channels**: Use the small **Gmail** and **Slack** buttons next to the bell icon to choose which channels should be used for that specific device.
   - **Grey "Gmail/Slack"**: Alerts for this channel are DISABLED (Default for new devices).
   - **Red "Gmail" / Blue "Slack"**: Alerts for this channel are ACTIVE.
4. **Test Your Setup**: Use the **Test Alerts** button in the top right header to send a verification message to both your Slack channel and Gmail inbox.

### Monitoring Logic:
- **Device DOWN**: To prevent false alarms from network blips, an alert is sent only after a device is missing for **3 consecutive scans**.
- **Device UP**: An "Online" alert is sent **immediately** the moment a previously down device is seen again.
- **Silent by Default**: All newly discovered devices start with alerts **DISABLED**. You must manually click the bell and the desired channels (Gmail/Slack) to begin monitoring.

---

## 🎨 Themes
The dashboard supports three high-contrast themes accessible from the header:
- **DARK**: The classic stealth look.
- **LIGHT**: Optimized for bright environments.
- **SLATE**: A balanced grey theme for high visibility.

## 🐧 Linux Deployment (PM2 & Node.js)

### 1. Install Node.js & NPM
If your Linux host doesn't have Node.js yet, the recommended way is using the NodeSource repository:

```bash
# Example for Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install PM2
```bash
sudo npm install -g pm2
```

### 3. Deploy & Run
```bash
cd /path/to/NetPatrol
npm install
npx prisma db push
npm run build
pm2 start npm --name "netpatrol" -- start
```

### 4. Enable Auto-Start on Boot
```bash
pm2 startup
# (Copy and run the command printed by the terminal)
pm2 save
```

### 💡 Linux Pro-Tip (Permissions)
To ensure `nmap` can discover hardware manufacturers without running the whole app as root:
```bash
sudo chmod u+s /usr/bin/nmap
```

---

## 📦 Persistence
All data—including custom device names, scan history, and subnet configurations—is stored in a local **SQLite** database (`prisma/dev.db`). It remains persistent between program restarts.
