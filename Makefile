.PHONY: install demo test lint clean

# ── setup ──────────────────────────────────────────────────────────────────────
install:
	pip install -e ".[dev]"

# ── demo: full end-to-end flow ──────────────────────────────────────────────────
demo: install
	@echo "=== Step 1: Load sample SQLite data ==="
	python sample_data/load_sample_data.py

	@echo ""
	@echo "=== Step 2: Run migration agent on sample Informatica XML ==="
	python -m agent.cli convert \
		sample_informatica/m_LOAD_CUSTOMERS.xml \
		--output-dir output \
		--db-dir sample_data

	@echo ""
	@echo "=== Step 3: Execute generated YAML with framework runner ==="
	python -m framework.runner run output/job_config.yaml

	@echo ""
	@echo "=== Demo complete. Check output/ for results. ==="

# ── testing ────────────────────────────────────────────────────────────────────
test:
	pytest

# ── linting ───────────────────────────────────────────────────────────────────
lint:
	ruff check .

# ── cleanup ───────────────────────────────────────────────────────────────────
clean:
	rm -rf output/*.yaml output/*.json sample_data/source.db sample_data/target.db
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
