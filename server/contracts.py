from math import pi
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    mode: Literal["simulation", "inference", "comparison"]
    model_id: str | None = Field(default=None, max_length=100)
    duration: int = Field(default=10, ge=1, le=30, strict=True)
    l: float = Field(default=1.0, ge=0.25, le=3)
    m: float = Field(default=1.0, ge=0.25, le=3)
    b: float = Field(default=0.1, ge=0, le=1)
    theta0: float = Field(default=1.57, ge=-pi, le=pi)
    omega0: float = Field(default=0, ge=-4, le=4)

    @model_validator(mode="after")
    def check_model(self):
        if self.mode != "simulation" and not self.model_id:
            raise ValueError("Sélectionne un modèle.")
        return self
