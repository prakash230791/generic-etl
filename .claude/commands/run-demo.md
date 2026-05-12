# Run the Full End-to-End Demo

Executes the complete pipeline: load sample data → agent converts XML → framework runs job.

## Steps

```bash
# 1. Install dependencies (if not already installed)
pip install -e ".[dev]" -q

# 2. Clean previous output
make clean

# 3. Load sample data into SQLite
python sample_data/load_sample_data.py

# 4. Run migration agent (Informatica XML → YAML)
etl-agent convert \
  sample_informatica/m_LOAD_CUSTOMERS.xml \
  --output-dir output/ \
  --db-dir sample_data/

# 5. Show generated YAML
echo "=== Generated job_config.yaml ===" && cat output/job_config.yaml

# 6. Run the ETL framework against the generated YAML
etl-run run output/job_config.yaml

# 7. Verify output matches expected
python -c "
import pandas as pd
result = pd.read_sql('SELECT * FROM dim_customer', 
    __import__('sqlite3').connect('sample_data/source.db'))
expected = pd.read_csv('sample_data/expected_output.csv')
print(f'Result rows: {len(result)}, Expected rows: {len(expected)}')
assert len(result) == len(expected), 'Row count mismatch'
print('✅ Demo passed — output matches expected')
"
```

## Expected output
- Agent produces `output/ir.json` and `output/job_config.yaml`
- Framework loads 6 rows (ACTIVE customers only) into `dim_customer`
- All rows have `full_name` column populated
- Row count matches `sample_data/expected_output.csv` (6 rows)

## If it fails
1. Check `output/job_config.yaml` against the schema in `framework/config/schema.json`
2. Run `pytest tests/ -v` to isolate the failure
3. Check `output/ir.json` to verify the parser extracted correct transforms
