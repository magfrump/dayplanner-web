
# DayPlanner Web

> **Note**: This is a personal project used for managing daily tasks, values, and goals. It uses a local LLM for intelligence and stores data in local JSON files.

## Features

- **Daily Planning**: Manage Values, Goals, Projects, and Tasks in a unified view.
- **AI-Powered**: Chat with your planner to add items, ask questions, or get advice based on your current context.
- **Traceability**: Inspect the raw inputs and outputs of every AI interaction for debugging.
- **Resilient Storage**: Data is stored locally in JSON files with automatic backup and corruption recovery.
- **Network Ready**: designed to be hosted on a LAN and accessible from other devices.

## Setup

### Prerequisites

- Node.js (v18+)
- An OpenAI-compatible LLM endpoint (e.g., Ollama running `llama3` or similar locally, or external API).

### Installation

1.  Clone the repo:
    ```bash
    git clone https://github.com/yourusername/dayplanner-web.git
    cd dayplanner-web
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the App

To run both the backend storage server and the frontend development server:

```bash
npm run dev:all
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

## Network Access

To access the planner from other devices on your local network (LAN):

1.  Ensure your host machine's firewall allows traffic on ports 5173 and 3000.
2.  Find your local IP address (e.g., `ipconfig` on Windows or `ip addr` on Linux).
3.  Access via `http://YOUR_LOCAL_IP:5173`.

> **WSL2 Users**: You may need to configure port forwarding or specific firewall rules to allow access from the Windows host or LAN.

## Data Privacy

All data is stored in `planner-data.json` and the `data/` directory in the project root. **These files are git-ignored by default.** Do not commit them to a public repository if they contain personal information.

## License

MIT
