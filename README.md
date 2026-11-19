# 🚀 IG Non-Follower Automator

Automatically find Instagram accounts that do not follow you back and review them before unfollowing.

This Tampermonkey userscript compares your Instagram followers and following exports locally, shows the accounts that do not follow you back, and can unfollow the accounts you select. It uses Instagram's visible UI and keeps the export data in your browser.

> Use small batches and review the selection before starting. Instagram may limit accounts that perform many actions quickly.

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey.
2. Download your Instagram **Followers and following** data as **JSON** (see the export steps below).
3. Create a userscript, paste in [`script.js`](./script.js), and save it.
4. Open [Instagram](https://www.instagram.com/) in English, open **Auto-Unfollow Manager**, and upload `followers.json` and `following.json`.
5. Click **Compare Exports**, review the results, choose a conservative delay, and start a small batch.

<img width="1302" height="698" alt="Screenshot from 2026-11-12 01-24-48" src="https://github.com/user-attachments/assets/6d172d40-888d-4a6f-a73d-0a348afb8f90" />

## ✨ Features
*   **100% Local Processing:** Your data never leaves your browser.
*   **Anti-Ban DOM Automation:** Simulates real human clicks on the React UI instead of sending bare API payloads.
*   **Smart Queuing:** Configurable randomized minimum and maximum delays between actions.
*   **State Persistence:** Safely pause, close, and resume your progress later.
*   **Visual Logs:** Real-time terminal inside the panel showing exactly what is happening.

## 📋 Prerequisites
1. A desktop browser (Chrome, Brave, Edge, or Firefox).
2. The [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey extension installed.
3. Your Instagram interface language **must be set to English** (the script looks for the exact words "Following" and "Unfollow").
4. **Popups must be allowed** for `instagram.com` in your browser settings (the script uses a worker tab).

## 🛠️ Step 1: Export Your Instagram Data (JSON)
You need to download your official follower data directly from Instagram. 

1. Open Instagram on your desktop browser and go to **More** (bottom left) ➔ **Settings**.
2. Click on **Accounts Center** (usually at the top left).
3. Navigate to **Your information and permissions** ➔ **Download your information**.
4. Click **Download or transfer information**.
5. Select your Instagram profile.
6. Choose **Specific types of information** ➔ select **Followers and following**.
7. **CRITICAL:** On the final screen, change the Format from HTML to **JSON**. Set the Date Range to **All time**.
8. Click **Create file**.
9. Instagram will email you when it's ready. Download and extract the `.zip` file. You will need `followers.json` and `following.json`.

## 💻 Step 2: Install the Script
1. Click on the Tampermonkey extension icon in your browser and select **Create a new script...**
2. Delete the default template code.
3. Copy the entire code from `script.js` in this repository and paste it into the editor.
4. Go to **File ➔ Save** (or press `Ctrl+S`).

## 🚀 Step 3: How to Use
1. Open [Instagram.com](https://www.instagram.com).
2. You will see a floating pink **"Auto-Unfollow Manager"** button in the bottom right corner. Click it.
3. Upload the `followers.json` and `following.json` files you extracted earlier.
4. Click **Compare Exports**. The script will instantly list everyone who doesn't follow you back.
5. Select the accounts you want to remove (or click "Select All").
6. Set your minimum and maximum delay seconds (default is 7 to 11 seconds to keep your account safe).
7. Click **Start Automation**. 
8. A small worker tab will pop up. **Do not close it.** It will automatically navigate to each profile and do the clicking for you. You can track the progress in the Activity Logs.

## ⚠️ Disclaimer
This script is for educational purposes only. Use it responsibly. Setting the delay too low or mass-unfollowing thousands of accounts in a single day can trigger Instagram's spam detection. Keep your batches reasonable (e.g., 50-100 accounts per session).

## Troubleshooting

- **The manager does not appear:** Confirm the userscript is enabled for `instagram.com`, then reload the page.
- **No accounts are found:** Re-export both files as JSON, select **All time**, and make sure you uploaded the matching `followers.json` and `following.json` files.
- **Buttons are not detected:** Set Instagram's display language to English and keep the worker tab open while a batch runs.
- **The worker tab does not open:** Allow popups for `instagram.com` and start again with a smaller batch.
