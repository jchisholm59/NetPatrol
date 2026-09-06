import { WebClient } from '@slack/web-api';
import nodemailer from 'nodemailer';

const slackToken = process.env.SLACK_TOKEN; // Optional: if using token instead of webhook
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailUser,
    pass: gmailPass,
  },
});

export async function sendAlert(message: string, options: { gmail?: boolean; slack?: boolean } = { gmail: true, slack: true }) {
  console.log('Sending Alert:', message);

  // Slack Alert
  if (slackWebhookUrl && options.slack) {
    try {
      console.log(`[Alerts] Dispatching Slack notification to ${slackWebhookUrl.substring(0, 30)}...`);
      const response = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          // Adding standard Slack fields for better compatibility
          username: "NetPatrol",
          icon_emoji: ":shield:"
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Alerts] Slack API responded with error (${response.status}):`, errorText);
      } else {
        console.log('[Alerts] Slack notification delivered successfully.');
      }
    } catch (error) {
      console.error('[Alerts] Failed to send Slack alert:', error);
    }
  }

  // Gmail Alert
  if (gmailUser && gmailPass && options.gmail) {
    try {
      await transporter.sendMail({
        from: `"NetPatrol" <${gmailUser}>`,
        to: gmailUser, // Sending to self for now
        subject: 'NetPatrol Alert',
        text: message,
      });
    } catch (error) {
      console.error('Failed to send Gmail alert:', error);
    }
  }
}

export async function notifyDeviceDown(deviceName: string, ip: string, downCount: number, options?: { gmail?: boolean; slack?: boolean }) {
  const msg = `⚠️ Device DOWN: ${deviceName} (${ip}) has been offline for ${downCount} consecutive scans.`;
  await sendAlert(msg, options);
}

export async function notifyDeviceUp(deviceName: string, ip: string, options?: { gmail?: boolean; slack?: boolean }) {
  const msg = `✅ Device UP: ${deviceName} (${ip}) is back online.`;
  await sendAlert(msg, options);
}

export async function testNotifications() {
  const msg = "🔔 NetPatrol Test Alert: If you see this, your notifications are configured correctly.";
  await sendAlert(msg, { gmail: true, slack: true });
}
