import unittest

import numpy as np
from pydantic import ValidationError

from server.contracts import RunRequest
from server.models import discover_models
from server.trajectory import Trajectory


class TrajectoryTests(unittest.TestCase):
    def test_comparison_aligns_both_models_with_reference(self):
        checkpoints = discover_models()
        self.assertEqual({"7vv6mwx6", "nqqzs945"}, {"7vv6mwx6", "nqqzs945"} & checkpoints.keys())
        for key in ("7vv6mwx6", "nqqzs945"):
            with self.subTest(model=key):
                request = RunRequest(mode="comparison", duration=1, model_id=key)
                checkpoint = checkpoints[key]
                trajectory = Trajectory(request, checkpoint)
                self.assertEqual(30, trajectory.sample_hz)
                count = sum(parameter.numel() for parameter in trajectory.rollout.model.parameters())
                self.assertEqual(count, checkpoint.info.parameter_count)

                frames = [trajectory.frame(index) for index in range(trajectory.steps + 1)]
                self.assertEqual([request.theta0, request.omega0], frames[0]["inference"])
                self.assertEqual(frames[0]["inference"], frames[0]["simulation"])
                self.assertNotIn("mae", frames[0])
                self.assertEqual(1.0, frames[-1]["time"])
                np.testing.assert_allclose(np.diff([frame["time"] for frame in frames]), 1 / 30)
                errors = np.abs(np.array([frame["inference"] for frame in frames[1:]])
                                - np.array([frame["simulation"] for frame in frames[1:]]))
                np.testing.assert_allclose(frames[-1]["mae"], errors.mean(axis=0))

    def test_modes_include_only_requested_series(self):
        key = "7vv6mwx6"
        simulation = Trajectory(RunRequest(mode="simulation", duration=1), None)
        self.assertNotIn("inference", simulation.frame(1))
        inference = Trajectory(RunRequest(mode="inference", model_id=key, duration=1), discover_models()[key])
        self.assertNotIn("simulation", inference.frame(1))

    def test_request_rejects_invalid_parameters(self):
        for fields in ({"duration": 0}, {"duration": 1.5}, {"m": 0}, {"theta0": float("nan")}):
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                RunRequest(mode="simulation", **fields)
        with self.assertRaises(ValidationError):
            RunRequest(mode="comparison")


if __name__ == "__main__":
    unittest.main()
