# Glaia

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Current Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/your-repo/glaia/releases)
![icon.svg](src/renderer/assets/icon.svg)
**Glaia is a desktop AI Workspace, open source and local-first, designed to unify and organize access to multiple web-based Artificial Intelligence services.**

It offers a clean, persistent, and secure workspace, allowing professionals, developers, and teams to interact with their favorite AI providers without the fragmentation and distraction of a traditional browser.

---

## What is Glaia?

Anyone who uses multiple AI services on a daily basis faces a series of recurring problems: an excessive number of browser tabs, the need to constantly log in, the loss of context, and a general lack of organization.

Glaia solves this problem by providing a **dedicated desktop shell** that acts as a unified container for AI providers. Each provider runs in an isolated and persistent session, ensuring that your work, your credentials, and your preferences are maintained between restarts, safely and separated from other services.

The goal is not to replace the browser, but to create an operational standard for focused, efficient, and manageable work with AI tools.

## Core Principles

Glaia is built on a foundation of clear principles, designed to ensure trust, transparency, and control.

*   **Open Source and Transparent**
    Glaia's source code is released under the **AGPLv3** license, granting everyone the freedom to inspect, modify, and distribute the software. We believe that transparency is the foundation of security and reliability.

*   **Secure by Design**
    We treat every web provider as a potentially untrusted environment. Glaia's architecture strictly isolates provider sessions from each other and from the operating system, preventing unauthorized access and ensuring a secure workspace.

*   **Privacy and Local-First**
    All your configurations, the provider list, and application settings are saved exclusively on your local machine. Glaia does not require a proprietary cloud and does not collect data about your usage of third-party services. The control is and remains in your hands.

*   **Accessibility and Ethical Design**
    Glaia's interface is designed to be accessible, aiming for compliance with **WCAG 2.2 (AA)** guidelines and European design principles. We reject "dark patterns" and are committed to providing a clear, honest, and non-manipulative user experience.

*   **Manageability**
    Glaia gives you full control over your workspace. You can add, edit, and organize providers, import and export your configuration, and selectively reset a single provider's session data with one click.

## Main Features

*   **Unified Workspace**: Access all your AI providers from a single, clean, and organized interface, with a dedicated sidebar for quick navigation.
*   **Persistent and Isolated Sessions**: Forget repeated logins. Glaia keeps your sessions active securely and isolated for each provider.
*   **Configurable Provider Catalog**: Customize your provider list. Add new services via a simple form, edit existing ones, and import/export your configuration in JSON format.
*   **Secure Navigation Shell**: Essential controls like "back", "forward", "reload", and "open in external browser" are integrated into a shell that protects the user from unexpected website behaviors.
*   **Granular Reset**: Clear cookies, cache, and storage data for a single provider without affecting the others.
*   **Cross-Platform**: Glaia is designed to run on Windows, macOS, and Linux.

## What Glaia is *Not*

To clearly define expectations, it is important to emphasize what Glaia does not intend to be (at least in the MVP):
*   It is not a "universal browser" for any website. It is optimized for compatible AI providers.
*   It is not a tool for aggressive web scraping or DOM automation.
*   It does not bypass paywalls or limitations imposed by third-party providers.
*   It does not include a proprietary cloud backend or synchronization features.

---

## License

Glaia is distributed under the **GNU Affero General Public License v3.0**. You can find the full text of the license in the `LICENSE` file.

---

## Copyright
© Lorenzo DM - 2026

---

## Contributing

I am open to contributions from the community! If you are interested in improving Glaia, please see my contribution guidelines (coming soon) and check out the open issues.

---

*The true mission of Glaia is not simply to "show websites inside a window". It is to build a reliable, open source, persistent, accessible, and manageable desktop shell, capable of making the use of multiple AI services an organized, stable, and productive practice.*