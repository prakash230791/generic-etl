# ADR-005: Intermediate Representation (IR) as JSON between parser and generator

**Status:** Accepted  
**Date:** 2025-Q4

## Context

The migration agent has two distinct phases: parsing a source system's format (Informatica XML, ADF JSON) and generating a framework YAML config. These need a clean handoff interface so that:
- New source parsers can be added without touching the generator
- The generator does not need to know anything about Informatica or ADF

## Decision

Define a **Python dataclass IR** (`IRMapping`, `IRSource`, `IRTarget`, `IRTransformation`, `IRPort`) as the contract between parser and generator. Persist it to **`ir.json`** in the output directory for inspectability.

## Rationale

- Dataclasses provide a typed, self-documenting in-memory structure with zero boilerplate serialization (`dataclasses.asdict()` → JSON)
- Writing `ir.json` to disk makes the intermediate state inspectable for debugging and auditing — a developer can see exactly what the parser extracted before the generator runs
- The IR schema is deliberately minimal and source-agnostic: `kind` is one of `filter | lookup | expression | scd_type_2`, not Informatica terminology
- Separating parse and generate makes unit testing each phase trivial — parser tests assert on IR fields; generator tests take a hand-crafted IR as input

## IR structure

```
IRMapping
  ├── mapping_name: str
  ├── source: IRSource
  │     ├── name, table, columns, db_path
  ├── target: IRTarget
  │     ├── name, table, db_path
  └── transformations: list[IRTransformation]
        ├── name: str
        ├── kind: str          # filter | lookup | expression | scd_type_2
        ├── ports: list[IRPort]  # expression output columns
        └── properties: dict   # kind-specific config
```

## Consequences

- **Positive:** Parser and generator are independently testable and evolvable; `ir.json` aids debugging; adding an ADF parser produces the same IR — the generator is reused unchanged
- **Negative:** An extra serialization step; the IR schema must be kept in sync with what the generator consumes (currently enforced by tests)
