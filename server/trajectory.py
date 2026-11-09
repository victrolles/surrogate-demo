import math

import numpy as np
from scipy.integrate import solve_ivp

from .contracts import RunRequest
from .models import Checkpoint, Rollout

PHYSICS_HZ = 30


def simulate(request: RunRequest, times: np.ndarray):
    def pendulum(_time, state):
        theta, omega = state
        # Preserve the damping law used to generate the checkpoint training data.
        damping = (request.b / request.m) * request.l**2
        return omega, -(9.81 / request.l) * np.sin(theta) - damping * omega

    solution = solve_ivp(pendulum, (times[0], times[-1]), (request.theta0, request.omega0), t_eval=times)
    if not solution.success or solution.y.shape != (2, len(times)) or not np.isfinite(solution.y).all():
        raise RuntimeError("La résolution physique a échoué.")
    return solution.y.T


class Trajectory:
    def __init__(self, request: RunRequest, checkpoint: Checkpoint | None):
        self.request = request
        self.sample_hz = checkpoint.info.sample_hz if checkpoint else PHYSICS_HZ
        self.steps = request.duration * self.sample_hz
        self.times = np.arange(self.steps + 1) / self.sample_hz
        self.reference = simulate(request, self.times) if request.mode != "inference" else None
        self.rollout = Rollout(checkpoint, request) if checkpoint else None
        self.theta_error = 0.0
        self.omega_error = 0.0

    def frame(self, index):
        initial = [self.request.theta0, self.request.omega0]
        reference = self.reference[index].tolist() if self.reference is not None else None
        prediction = None
        if self.rollout is not None:
            prediction = self.rollout.step() if index else initial
            if not all(map(math.isfinite, prediction)):
                raise RuntimeError("L’inférence a divergé et ne fournit plus de valeurs finies.")

        frame = {"type": "frame", "index": index, "time": float(self.times[index])}
        if reference is not None:
            frame["simulation"] = reference
        if prediction is not None:
            frame["inference"] = prediction
        if reference is not None and prediction is not None and index:
            self.theta_error += abs(prediction[0] - reference[0])
            self.omega_error += abs(prediction[1] - reference[1])
            frame["mae"] = [self.theta_error / index, self.omega_error / index]
        return frame
