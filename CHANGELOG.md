# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-12-19

### Added
- **AI Chat w/ Tracing**: Full chat interface with LLM integration (Ollama, Gemini, Anthropic) and a "Trace" debug mode.
- **Tools**: `add_value`, `add_goal`, `add_project`, `add_task` (w/ deadlines & recurrence).
- **Daily Refresh**: System to review deadlines and recurring tasks.
- **Storage**: JSON-based local storage with corruption recovery and backup.
- **Docs Integration**: Ability to attach documents to projects for AI context.

### Changed
- Refactored backend storage to handle concurrency and independent file updates.
- Improved test suite stability by isolating test environments.
