# AGENTS.md — Rules & Context for AI Coding Assistants

## 1. Project Overview & Rules
We are building a scalable, high-performance AI Agent MVP for the HackAlem AI Hackathon.
Priority: Flawless execution of the main user story, clean architecture, token efficiency, and effortless post-hackathon extensibility.

## 2. Technology Stack
- Language: Python 3.11+
- AI SDK: Official openai Python SDK (using Function Calling & Structured Outputs)
- Frontend/UI: Streamlit (clean reactive interface)
- Data & Config: config.py using python-dotenv for API keys, Pydantic for data models

## 3. Code Generation Requirements & Architecture
- No Placeholders: Always generate complete, production-ready, runnable code. Do NOT write # TODO or stub functions.
- Extensibility & Scalability: Keep logic strictly decoupled. New tools, database connectors, or third-party APIs must be pluggable into tools.py without modifying the core reasoning loop in agent.py.
- Strict File Separation:
  - app.py: UI layout, streaming responses, and user interaction ONLY.
  - agent.py: Core agent loop, prompt routing, and OpenAI API calls.
  - tools.py: Isolated, well-typed Python functions for Function Calling.
  - config.py: Centralized environment variables, model selection, and constants.
- Code Quality: Use Python type hints, clear docstrings for all tools (used by OpenAI for tool definitions), and robust try-except error handling for network calls.

## 4. Agent Execution & Safeguards (CRITICAL)
- Max Iterations: ANY agent reasoning loop MUST have a hardcoded limit of maximum 3 iterations to prevent infinite loops and token budget drain.
- Model Switching: Use MODEL_DEV = "gpt-4o-mini" during development. Ensure easy toggle to MODEL_PROD = "gpt-4o" in config.py for demo/presentation.
- Structured Outputs: Use Pydantic models or JSON schemas for all complex AI responses to guarantee valid parsing.

## 5. Git & Hourly Progress Protocol 
- Develop in small, modular chunks to enable meaningful hourly commits.
- Follow commit format: git commit -m "feat(module): concise change description".

## 6. Response Format for Assistant
- Provide complete, executable code blocks without cutting code short.
- Skip conversational setups or long prose. Focus directly on code implementation and structural integrity.
