---
name: readme
description: Guide for creating, updating, and improving README files for software projects. Use when user mentions README, documentation, docs, or asks to create/update project documentation files.
metadata:
  categories:
    - documentation
    - markdown
  references:
    - https://github.com/softaworks/agent-toolkit/tree/main/skills/crafting-effective-readmes
---

# readme

## Overview

The README is the **technical entry point**. Its primary goal is to take a developer from "zero" to "running locally" in the shortest time possible.
**Do not** duplicate functional requirements or business logic here; link to SharePoint instead.

## Critical Principles

**Be Proactive - Always Ask Questions:**

- **Never assume anything** about the project structure, tech stack, or deployment process
- Ask specific questions about any unclear aspects before making assumptions
- If information is missing or ambiguous, stop and ask for clarification
- Examples of what to ask about:
  - What programming language and framework is used?
  - Are there external dependencies like VPNs or credential managers?
  - What runs locally vs. in Docker?
  - Where are the functional requirements documented?
  - What is the deployment process?

**Use Visual Aids When Helpful:**

- When architecture diagrams would improve understanding, use the "mermaid-diagrams" skill if available
- Diagrams are especially valuable for showing system integrations, data flows, and component relationships

## Process

### Step 1: Identify the Task

**Ask:** "What README task are you working on?"

| Task          | When                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **Creating**  | New internal project/microservice, no README yet                            |
| **Adding**    | Documenting a new module, dependency, or infrastructure change              |
| **Updating**  | Tech stack changed, commands are stale, or onboarding failed for a new hire |
| **Reviewing** | Periodic check (e.g., during sprint cleanup) to ensure accuracy             |

### Step 2: Task-Specific Questions

**Creating initial README:**

1. **Context:** Is this a library, a microservice, or a monolith?
2. **External dependencies:** Does it need a specific VPN? Does it need credentials for Artifactory/Nexus?
3. **Local Environment:** What runs in Docker vs. locally? (e.g., "DB in Docker, App on host")
4. **Links:** Where is the SharePoint functional spec?

**Adding a section:**

1. **Placement:** Does this belong in "Setup", "Architecture", or "Troubleshooting"?
2. **Audience:** Is this for the dev running the app, or DevOps deploying it?
3. **Secrets:** Did this change introduce new env vars? (Update `.env.example`, _never_ commit values).

**Updating existing content:**

1. **Drift:** Have we upgraded the Node/Python version recently?
2. **Stale Info:** Are there instructions for tools we no longer use (e.g., Vagrant)?
3. **Broken Paths:** Do the SharePoint/Confluence links still work?

**Reviewing/Refreshing:**

1. **The "New Hire" Test:** specific steps _actually_ work on a fresh clone?
2. **Validation:** Run the install commands yourself. Do not assume they work.
3. **Cleanup:** Remove commented-out sections or "TODOs" that are tracked in Jira.

### Step 3: Always Ask

After drafting, ask: **"If I went on vacation tomorrow, could the support engineer run this locally to debug an issue without calling me?"**

## Required Sections Structure

Every internal project README **must** follow this structure to ensure consistency across teams.

### 1. Title & Summary

**What:** Project name + The "Big Picture."

**Should Answer:**

- **Identity:** What is this project?
- **Responsibility:** What specific domain or problem does it handle?
- **Integration:** How does it fit into the wider system? (e.g., "Consumes events from RabbitMQ and updates the Legacy SQL DB").

### 2. Resources (Links)

**What:** Links to external documentation.

**Content:**

- **Functional Spec:** [Link to SharePoint Folder]
- **Design/Figma:** [Link] (if applicable)
- **Jira Board:** [Link]

### 3. Architecture Overview

**What:** High-level technical context.

**Content:**

- **Tech Stack:** Languages, frameworks, key libraries (e.g., Python 3.11, FastAPI, SQLAlchemy).
- **Infrastructure:** AWS services used, K8s namespace, docker, linux, etc.
- **Diagrams:** Use MermaidJS diagrams (refer to "mermaid-diagrams" skill if available) or link to an architecture diagram. Diagrams are highly valuable for showing system architecture, integrations, and data flows.

### 4. Development Setup (The Critical Section)

**What:** The "Happy Path" to running locally.

**Content:**

- **Prerequisites:** List tools (Docker Desktop, uv, Node version).
- **DevContainer:** If supported, mention `Reopen in Container`.
- **Environment Variables:** Instructions to copy `.env.example` to `.env`.
- **Dependencies:** Commands to install (e.g., `uv sync`, `npm install`).
- **Database/Mocks:** Commands to spin up local infrastructure (e.g., `docker compose up -d db redis`).

### 5. Running the Application

**What:** Exact commands to start the app.
**Content:**

- Command to run the server.
- Command to run the tests.
- Localhost URLs (e.g., `API: http://localhost:8000`, `Docs: http://localhost:8000/docs`).

### 6. Deployment & CI/CD

**What:** How code gets to production.
**Content:**

- Branching strategy (e.g., GitFlow, Trunk-based).
- CI pipeline link.

## Template

Use this as a starter template when crafting readme files.

```markdown
# [Project Name]

## Overview

**Summary**
e.g., "The Notification Engine responsible for dispatching emails and SMS to customers."

**Responsibilities:**

- [Primary Job 1, e.g., Templating emails via Jinja2]
- [Primary Job 2, e.g., Managing retry logic for failed SMS]

**Integration:**

- **Upstream:** Receives trigger events from the [Order Service] via RabbitMQ.
- **Downstream:** Calls [Twilio API] and [SendGrid API].

## 📚 Resources

- **Functional Requirements:** [Link to SharePoint]
- **Tech Stack Related Documentation:** [Link to Resources]

## 🏗 Architecture

- **Language:** [e.g. Python 3.11]
- **Framework:** [e.g. Django 4.2]
- **Database:** [e.g. PostgreSQL 15]
- **Infrastructure:** [e.g. AWS ECS, Lambda]

## 🛠 Local Development

### Prerequisites

- Docker & Docker Compose
- [Language Runtime, e.g., Node 18]
- [Package Manager, e.g., pnpm, uv]

### 1. Environment Setup

Copy the example environment file:
`cp .env.example .env`

**Note:** Ask [Team Lead] for the `AWS_ACCESS_KEY` or check the team Vaultwarden vault.

### 2. Infrastructure (Mocks/DB)

We use Docker to mock external dependencies and host the database:
`docker compose up -d`

This spins up:

- Postgres (Port 5432)
- Redis (Port 6379)
- LocalStack (S3 Mock)

### 3. Install Dependencies

`[install command, e.g., npm install]`

### 4. Run Application

`[run command, e.g., npm run dev]`

Access the app at `http://localhost:3000`.

## 🧪 Testing

Run the full test suite:
`[test command]`

## 🚀 Deployment

Merges to `main` automatically deploy to **Staging**.
Releases tagged `v*` deploy to **Production**.
```
