<h1><div align="center">
 <img alt="whisker" width="300px" height="auto" src="https://github.com/pipecat-ai/whisker/raw/refs/heads/main/whisker.png">
</div></h1>

[![PyPI](https://img.shields.io/pypi/v/pipecat-ai-whisker)](https://pypi.org/project/pipecat-ai-whisker) [![Discord](https://img.shields.io/discord/1239284677165056021)](https://discord.gg/pipecat)

# ᓚᘏᗢ Whisker: A Pipecat Debugger

**Whisker** is a low-level debugger for the [Pipecat](https://github.com/pipecat-ai/pipecat) voice and multimodal conversational AI framework.

It lets you **visualize pipelines and debug frames in real time** — so you can see exactly what your bot is thinking and doing.

With **Whisker** you can:

- 🗺️ View a live graph of every pipeline (one or many) running in your Pipecat process
- ⚡ Watch frame processors flash in real time as frames pass through them
- 📌 Select a processor to inspect the frames it has handled (both pushed and processed)
- 🔍 Filter frames by name to quickly find the ones you care about
- 🧵 Select a frame to trace its full path through the pipeline
- 🚌 Follow messages on the Pipecat bus between cooperating pipeline tasks
- 💾 Save and load previous sessions for review, collaboration, or troubleshooting

Think of Whisker as **trace logging with batteries**.

<p align="center"><img src="https://raw.githubusercontent.com/pipecat-ai/whisker/refs/heads/main/whisker-image.png" alt="Whisker" width="500"/></p>

## 🧭 Getting started

### Requirements

- Python 3.11+
- [Pipecat](https://github.com/pipecat-ai/pipecat) installed
- Node.js 20+ (for the UI)
- [ngrok](https://ngrok.com/) (for connecting to the hosted UI)

### Install Whisker for Python

```bash
uv pip install pipecat-ai-whisker
```

### Add Whisker to your Pipecat pipeline

Whisker is split into two pieces: a `WhiskerServer` that owns the WebSocket connection to the UI (and listens on the Pipecat bus for cross-task events), and per-task `WhiskerObserver`s that forward frame events to the server. Spawn one server on your runner and add an observer to every pipeline task you want to debug.

```python
from pipecat_whisker import WhiskerServer

pipeline = Pipeline(...)
task = PipelineTask(...)

whisker = WhiskerServer()
task.add_observer(whisker.create_observer(task))

runner = PipelineRunner()
await runner.spawn(whisker)
await runner.run(task)
```

You can also add Whisker without touching your application code by listing a setup file in the `PIPECAT_SETUP_FILES` environment variable. The runner picks up `setup_pipeline_runner` (called once for the runner) and the task picks up `setup_pipeline_task` (called once per pipeline task) — both reading from the same file, so a module-level `WhiskerServer` is shared between them:

```python
from pipecat_whisker import WhiskerServer
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask

whisker = WhiskerServer()


async def setup_pipeline_runner(runner: PipelineRunner):
    await runner.spawn(whisker)


async def setup_pipeline_task(task: PipelineTask):
    task.add_observer(whisker.create_observer(task))
```

In both cases, this starts the Whisker server that the graphical UI will connect to. By default, the Whisker server runs at:

```
ws://localhost:9090
```

### 🌐 Option A: Use the hosted UI (Recommended)

1. **Expose your local server with ngrok:**
   ```bash
   ngrok http 9090
   ```
2. **Copy the ngrok URL** (e.g., `your-ngrok-url.ngrok.io`)

3. **Open the hosted Whisker UI:** [https://whisker.pipecat.ai/](https://whisker.pipecat.ai/)

4. **Connect to your bot:**
   - In the WebSocket URL field, enter: `wss://your-ngrok-url.ngrok.io`
   - Click connect

### 🏠 Option B: Run the UI locally

If you prefer to run the UI locally:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/pipecat-ai/whisker.git
   ```

2. **Start the UI:**

   ```bash
   cd whisker/ui
   npm install
   npm run dev
   ```

3. **Connect to [http://localhost:5173](http://localhost:5173)**

The UI will automatically connect to `ws://localhost:9090` by default.

## 💾 Saving sessions

You can also save your sessions to a file, which is helpful for debugging later or sharing with someone for assistance:

```python
whisker = WhiskerServer(file_name="whisker.bin")
```

Load the file using the Whisker client.

## 📚 Next steps

- View some examples in the [`examples`](pipecat/examples/) folder
- See the [Pipecat documentation](https://docs.pipecat.ai) for more about building bots
