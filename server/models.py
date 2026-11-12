import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, FiniteFloat, model_validator

from .contracts import RunRequest

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


class TrainingCoverage(BaseModel):
    method: Literal["fixed_sampling", "random_sampling"]
    ranges: dict[Literal["l", "m", "b", "theta0", "omega0"], list[FiniteFloat]]

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.ranges.keys() != {"l", "m", "b", "theta0", "omega0"} or not all(self.ranges.values()):
            raise ValueError("Training coverage requires values for all five physical parameters.")
        if self.method == "random_sampling":
            for name, values in self.ranges.items():
                if len(values) > 2 or values[0] > values[-1]:
                    raise ValueError(f"{name} must have a fixed value or ordered lower and upper bounds.")
        return self


class ModelInfo(BaseModel):
    id: str
    label: str
    hidden_size: int = Field(gt=0, le=2048)
    num_hidden_layers: int = Field(gt=0, le=16)
    sample_hz: int = Field(gt=0, le=60)
    learning_rate: float = Field(gt=0, allow_inf_nan=False)
    epochs: int = Field(gt=0)
    training_trajectories: int = Field(gt=0)
    training_coverage: TrainingCoverage | None = None

    @property
    def parameter_count(self):
        width = self.hidden_size
        input_weights_and_bias = (5 + 1) * width
        hidden_weights_and_bias = (self.num_hidden_layers - 1) * (width + 1) * width
        output_weights_and_bias = (width + 1) * 2
        return input_weights_and_bias + hidden_weights_and_bias + output_weights_and_bias

    def public(self):
        return {**self.model_dump(), "parameter_count": self.parameter_count}


@dataclass(frozen=True)
class Checkpoint:
    info: ModelInfo
    path: Path


def discover_models():
    models = {}
    for metadata in sorted(MODELS_DIR.glob("*/model.json")):
        weights = metadata.with_name("model.pth")
        if weights.is_file():
            info = ModelInfo(id=metadata.parent.name, **json.loads(metadata.read_text(encoding="utf-8")))
            models[info.id] = Checkpoint(info, weights)
    return dict(sorted(models.items(), key=lambda item: (
        item[1].info.training_trajectories, item[1].info.num_hidden_layers, item[0]
    )))


class Rollout:
    """A CPU rollout adapted from Pendulum Surrogate's model and infer loop."""

    def __init__(self, checkpoint: Checkpoint, request: RunRequest):
        import torch
        from torch import nn

        info = checkpoint.info
        width = info.hidden_size
        layers = [nn.Linear(5, width), nn.ReLU()]
        for _ in range(info.num_hidden_layers - 1):
            layers.extend((nn.Linear(width, width), nn.ReLU()))
        layers.append(nn.Linear(width, 2))

        class PendulumModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.model = nn.Sequential(*layers)

            def forward(self, inputs):
                return self.model(inputs)

        self.torch = torch
        self.model = PendulumModel()
        self.model.load_state_dict(torch.load(checkpoint.path, map_location="cpu", weights_only=True))
        self.model.eval()
        self.input = torch.tensor(
            [[request.l, request.m, request.b, request.theta0, request.omega0]],
            dtype=torch.float32,
        )

    def step(self):
        with self.torch.inference_mode():
            output = self.model(self.input)
            self.input[:, 3:] = output
            return output[0].tolist()
