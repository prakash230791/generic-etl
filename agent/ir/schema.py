"""Dataclass definitions for the agent's intermediate representation (IR).

The IR is the contract between the parser (Informatica XML → IR) and
the generator (IR → framework YAML).  It is also serialised to
``output/ir.json`` for debugging.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IRPort:
    """A single input or output port on a transformation."""

    name: str
    datatype: str
    expression: str | None = None


@dataclass
class IRTransformation:
    """A single transformation node extracted from the Informatica mapping."""

    name: str
    kind: str
    ports: list[IRPort] = field(default_factory=list)
    properties: dict[str, Any] = field(default_factory=dict)


@dataclass
class IRSource:
    """The source qualifier extracted from the Informatica mapping."""

    name: str
    table: str
    columns: list[str] = field(default_factory=list)
    db_path: str = ""


@dataclass
class IRTarget:
    """The target definition extracted from the Informatica mapping."""

    name: str
    table: str
    db_path: str = ""


@dataclass
class IRMapping:
    """Top-level IR for a single Informatica mapping."""

    mapping_name: str
    source: IRSource
    target: IRTarget
    transformations: list[IRTransformation] = field(default_factory=list)
