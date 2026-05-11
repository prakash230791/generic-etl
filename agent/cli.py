"""CLI entry point for the migration agent."""

import logging
from pathlib import Path

import click

logger = logging.getLogger(__name__)


@click.group()
@click.option("--log-level", default="INFO", show_default=True, help="Logging level.")
def main(log_level: str) -> None:
    """ETL Migration Agent — convert Informatica XML to framework YAML."""
    logging.basicConfig(level=log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@main.command()
@click.argument("xml_path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--output-dir", "-o",
    default="output",
    type=click.Path(path_type=Path),
    show_default=True,
    help="Directory to write ir.json and job_config.yaml.",
)
@click.option(
    "--db-dir", "-d",
    default="sample_data",
    type=click.Path(path_type=Path),
    show_default=True,
    help="Directory containing the source/target .db files.",
)
def convert(xml_path: Path, output_dir: Path, db_dir: Path) -> None:
    """Convert the Informatica XML mapping at XML_PATH to a framework YAML job config.

    Writes two files to OUTPUT_DIR:
      ir.json         — intermediate representation (for debugging)
      job_config.yaml — framework-ready job config validated against the JSON schema
    """
    from agent.generator.yaml_generator import YAMLGenerator
    from agent.parser.informatica_xml import InformaticaXMLParser

    logger.info("parsing: %s", xml_path)
    ir = InformaticaXMLParser().parse(xml_path)

    logger.info("generating YAML (db_dir=%s)", db_dir)
    yaml_path = YAMLGenerator().generate(ir, output_dir, db_dir=db_dir)

    logger.info("done → %s", yaml_path)
    click.echo(f"Generated: {yaml_path}")


if __name__ == "__main__":
    main()
