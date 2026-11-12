import asyncio
import logging
import os
from contextlib import suppress

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from .contracts import RunRequest
from .models import discover_models
from .trajectory import Trajectory

app = FastAPI(title="Surrogate Demo")
logger = logging.getLogger(__name__)
allowed_origins = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://surrogate-demo-chi.vercel.app",
    "https://surrogate-demo.victorgoudal.fr",
    *(
        origin.strip().rstrip("/")
        for origin in os.environ.get("SURROGATE_CORS_ORIGINS", "").split(",")
        if origin.strip()
    ),
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
trajectory_slots = asyncio.Semaphore(4)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/models")
def models():
    return [entry.info.public() for entry in discover_models().values()]


async def listen_for_stop(socket: WebSocket, stop: asyncio.Event):
    try:
        while True:
            message = await socket.receive_json()
            if isinstance(message, dict) and message.get("type") == "stop":
                return
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        stop.set()


async def stream(socket: WebSocket, trajectory: Trajectory, stop: asyncio.Event):
    await socket.send_json({"type": "started", "sample_hz": trajectory.sample_hz})
    clock = asyncio.get_running_loop()
    started = clock.time()
    for index in range(trajectory.steps + 1):
        delay = started + index / trajectory.sample_hz - clock.time()
        if delay > 0:
            with suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), delay)
        if stop.is_set():
            break
        await socket.send_json(await run_in_threadpool(trajectory.frame, index))
    await socket.send_json({"type": "stopped" if stop.is_set() else "finished"})


@app.websocket("/trajectory")
async def trajectory_socket(socket: WebSocket):
    if socket.headers.get("origin") not in allowed_origins:
        await socket.close(code=1008)
        return

    await socket.accept()
    if trajectory_slots.locked():
        await socket.send_json({"type": "error", "message": "Le serveur est occupé. Réessaie dans quelques secondes."})
        await socket.close(code=1013)
        return

    async with trajectory_slots:
        await run_trajectory(socket)


async def run_trajectory(socket: WebSocket):
    listener = None
    try:
        try:
            request = RunRequest.model_validate_json(await asyncio.wait_for(socket.receive_text(), 15))
            checkpoint = None
            if request.mode != "simulation":
                checkpoint = discover_models().get(request.model_id)
                if checkpoint is None:
                    raise ValueError("Ce modèle n’est plus disponible. Recharge le catalogue.")
        except ValidationError:
            await socket.send_json({"type": "error", "message": "Paramètres de trajectoire invalides."})
            await socket.close(code=1008)
            return
        except (TimeoutError, ValueError) as error:
            await socket.send_json({"type": "error", "message": str(error) or "Aucune demande reçue."})
            await socket.close(code=1008)
            return

        stop = asyncio.Event()
        listener = asyncio.create_task(listen_for_stop(socket, stop))
        trajectory = await run_in_threadpool(Trajectory, request, checkpoint)
        await stream(socket, trajectory, stop)
        await socket.close()
    except (WebSocketDisconnect, OSError):
        pass
    except Exception:
        logger.exception("Trajectory failed")
        with suppress(WebSocketDisconnect, OSError, RuntimeError):
            await socket.send_json({"type": "error", "message": "Le calcul a échoué. Vérifie les paramètres et le modèle."})
            await socket.close(code=1011)
    finally:
        if listener is not None:
            listener.cancel()
            with suppress(asyncio.CancelledError):
                await listener
