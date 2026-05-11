"""Pipeline execution engine — orchestrates source → transform* → sink."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ExecutionEngine:
    """Resolves connector and transformation plugins and runs the pipeline.

    Args:
        config: Validated job configuration dictionary (output of
                ``load_config`` + ``validate_config``).
    """

    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config

    def run(self) -> None:
        """Execute the full source → transformations → sink pipeline."""
        from framework.connectors import get_connector
        from framework.transformations import get_transformation

        job_name = self.config["job"]["name"]
        logger.info("starting pipeline: %s", job_name)

        # ── source ────────────────────────────────────────────────────────────
        src_cfg = self.config["source"]
        source = get_connector(src_cfg["type"], src_cfg["config"])
        df = source.read()
        logger.info("source read: %d rows, %d columns", len(df), len(df.columns))

        # ── transformations ───────────────────────────────────────────────────
        for step in self.config.get("transformations", []):
            label = step.get("name", step["type"])
            xform = get_transformation(step["type"], step["config"])
            df = xform.apply(df)
            logger.info("%-25s: %d rows", label, len(df))

        # ── sink ──────────────────────────────────────────────────────────────
        sink_cfg = self.config["sink"]
        sink = get_connector(sink_cfg["type"], sink_cfg["config"])
        sink.write(df)
        logger.info("sink wrote: %d rows → pipeline complete", len(df))
