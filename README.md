# 🚀 Tailwind UI Scraper CLI

**A powerful, interactive CLI tool to automate downloading your purchased Tailwind UI components.**

Stop manually copying and pasting! This tool logs into your account, detects your available licenses, and downloads components directly to your machine in your preferred framework.

> **⚠️ IMPORTANT:** This tool is **NOT** a bypass for the paywall. It strictly automates the downloading process for users who have already purchased a license. You **must** have a valid [Tailwind UI subscription](https://tailwindcss.com/plus#pricing) to access the components. If you do not have a paid license, the tool will only be able to access the limited free templates.

---

## ✨ Features

-   **🧠 Smart Detection**: Automatically identifies which Tailwind UI packages you own (Marketing, Application UI, Ecommerce).
-   **⚛️ Multi-Framework Support**: Download components in **React**, **Vue**, or plain **HTML**.
-   **🎯 Selective Downloading**: Choose specific products or download your entire library at once.
-   **💾 Session Management**: Saves your login session locally to prevent repeated authentication requests.
-   **📂 Organized Output**: Saves components into a clean folder structure (e.g., `marketing/heroes/simple-centered`) for easy browsing.
-   **⚡ Fast & Lightweight**: Built with simple HTTP requests (Axios + Cheerio) instead of slow browser automation.

## 🤖 Built for AI Agents

The soul purpose of this project is to create a **local, AI-accessible library** of your components.

By having all your templates (Vue, React, HTML) saved locally, you can easily provide them as context to **AI Agents** (like Cursor, Copilot, or ChatGPT). This enables you to rapidly scaffold new projects by simply asking your AI to "use the local Hero component" without manually browsing the web interface.

## 🛠️ Prerequisites

-   **Node.js** (v16 or higher)
-   A valid **Tailwind UI** account (Email & Password) with [active licenses](https://tailwindcss.com/plus#pricing).

## 📦 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/aronqueue/tailwindcss-scraper.git
    cd tailwindcss-scraper
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    Create a `.env` file in the root directory:
    ```env
    TAILWINDUI_EMAIL=your_email@example.com
    TAILWINDUI_PASSWORD=your_password
    SCRAPER_BASE_DIR=./tailwindui_library
    ```

## 🚀 Usage

Run the scraper using the following command:

```bash
npm run scrape
```

Follow the interactive prompts:

1.  **Select Products**: The tool will fetch available products from your account. Select the ones you want to download.
2.  **Select Frameworks**: Choose one or more from `React`, `Vue`, and `HTML`.

The scraper will log in, save your session, and automatically download the selected components to the `tailwindui_library` folder.

## 📂 Output Structure

```
tailwindui_library/
├── marketing/
│   ├── sections/
│   │   ├── heroes/
│   │   │   ├── simple-centered/
│   │   │   │   ├── react.jsx
│   │   │   │   ├── vue.vue
│   │   │   │   └── html.html
...
```

## ❓ Troubleshooting

-   **Login Failed**: Ensure your credentials in `.env` are correct.
-   **Session Issues**: If you have trouble logging in, try deleting the `session.json` file to force a fresh login.

## 📄 License

This tool is for educational purposes only. Please respect Tailwind UI's terms of service and copyright.
*Disclaimer: This tool is for personal use by valid license holders only.*
