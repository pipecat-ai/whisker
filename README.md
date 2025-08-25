<h1><div align="center">
 <img alt="whisker" width="300px" height="auto" src="https://github.com/pipecat-ai/whisker/raw/refs/heads/main/whisker.png">
</div></h1>

[![PyPI](https://img.shields.io/pypi/v/pipecat-ai-whisker)](https://pypi.org/project/pipecat-ai-whisker) [![Discord](https://img.shields.io/discord/1239284677165056021)](https://discord.gg/pipecat)

# ᓚᘏᗢ Whisker: A Pipecat Debugger

**Whisker** is a live graphical debugger for the [Pipecat](https://github.com/pipecat-ai/pipecat) voice and multimodal conversational AI framework.

It lets you **visualize pipelines and debug frames in real time** — so you can see exactly what your bot is thinking and doing.

With **Whisker** you can:

- 🗺️ View a live graph of your pipeline.
- ⚡ Watch frame processors flash in real time as frames pass through them.
- 📌 Select a processor to inspect the frames it has handled (both pushed and processed).
- 🔍 Filter frames by name to quickly find the ones you care about.
- 🧵 Select a frame to trace its full path through the pipeline.

Think of Whisker as **trace logging with batteries**.

<p align="center"><img src="https://raw.githubusercontent.com/pipecat-ai/whisker/refs/heads/main/whisker-image.png" alt="Whisker" width="500"/></p>

## 🧭 Getting started

**Requirements:**

* Python 3.10+
* [Pipecat](https://github.com/pipecat-ai/pipecat) installed
* Node.js 20+ (for the UI)

### 1. Install Whisker for Python

```bash
uv pip install pipecat-ai-whisker
```

### 2. Add Whisker to your Pipecat pipeline

```python
from pipecat_whisker import WhiskerObserver

pipeline = Pipeline(...)

whisker = WhiskerObserver(pipeline)

task = PipelineTask(..., observers=[whisker])
```

This starts the Whisker server that the graphical UI will connect to. By default, the Whisker server runs at:

```
ws://localhost:9090
```

## 🚀 Running the debugger UI

Clone the repository:

```bash
git clone https://github.com/pipecat-ai/whisker.git
```

Then, start Whisker with:

```bash
cd ui
npm install
npm run dev
```

and connect to [http://localhost:5173](http://localhost:5173).

## 📚 Next steps

* View some examples in the [`examples`](pipecat/examples/) folder
* See the [Pipecat documentation](https://docs.pipecat.ai) for more about building bots
