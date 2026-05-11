"""Transformation plugin registry for the ETL framework."""

from typing import Any

from framework.transformations.base import BaseTransformation

_BUILTIN_TRANSFORMATIONS: dict[str, str] = {
    "filter":     "framework.transformations.filter:FilterTransformation",
    "lookup":     "framework.transformations.lookup:LookupTransformation",
    "expression": "framework.transformations.expression:ExpressionTransformation",
    "scd_type_2": "framework.transformations.scd_type_2:SCDType2Transformation",
}


def get_transformation(transformation_type: str, config: dict[str, Any]) -> BaseTransformation:
    """Instantiate a transformation by its YAML type string.

    Args:
        transformation_type: Value of the ``type`` key in the job YAML transformation block.
        config:              Transformation-specific configuration dict.

    Returns:
        Instantiated transformation ready for ``apply()`` calls.

    Raises:
        ValueError: If *transformation_type* is not registered.
    """
    import importlib

    if transformation_type not in _BUILTIN_TRANSFORMATIONS:
        known = sorted(_BUILTIN_TRANSFORMATIONS)
        raise ValueError(
            f"Unknown transformation type: {transformation_type!r}. Known types: {known}"
        )

    module_path, class_name = _BUILTIN_TRANSFORMATIONS[transformation_type].split(":")
    module = importlib.import_module(module_path)
    cls: type[BaseTransformation] = getattr(module, class_name)
    return cls(config)
