"""CLI entry point for the ETL framework runner."""

import logging
from pathlib import Path

import click

logger = logging.getLogger(__name__)


@click.group()
@click.option("--log-level", default="INFO", show_default=True, help="Logging level.")
def main(log_level: str) -> None:
    """ETL Framework Runner — execute a YAML-defined pipeline."""
    logging.basicConfig(level=log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@main.command()
@click.argument("config_path", type=click.Path(exists=True, path_type=Path))
def run(config_path: Path) -> None:
    """Execute the pipeline defined in CONFIG_PATH (YAML)."""
    from framework.config.loader import load_config
    from framework.config.validator import validate_config
    from framework.execution.engine import ExecutionEngine

    logger.info("loading config: %s", config_path)
    config = load_config(config_path)
    validate_config(config)
    logger.info(
        "running pipeline: %s v%s",
        config["job"]["name"],
        config["job"]["version"],
    )
    ExecutionEngine(config).run()


if __name__ == "__main__":
    main()
