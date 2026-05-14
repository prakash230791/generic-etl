# Observability Architecture

**Document:** 06 of 8
**Audience:** SRE, Platform Team, Engineering Director
**Version:** 1.0 | **Date:** 2026-05-14

---

## 1. Observability Philosophy

The platform adopts the **three pillars of observability** plus a fourth ETL-specific pillar:

| Pillar | Tool | Purpose |
|---|---|---|
| **Metrics** | Prometheus + Grafana | Quantitative health, throughput, cost |
| **Logs** | Structured JSON → Loki / CloudWatch | Searchable event records |
| **Traces** | OpenTelemetry → Tempo | Distributed request flows |
| **Lineage** | OpenLineage → Marquez | Data provenance end-to-end |

Design principle: **every job run is fully observable** — you can answer "where did that row come from, when did it arrive, and what transformed it" from the audit trail alone.

---

## 2. Metrics (Prometheus)

### 2.1 Metric Taxonomy

All metrics follow the naming convention: `etl_{component}_{metric}_{unit}`

#### Framework Runner Metrics

```python
# framework/observability/metrics.py
from prometheus_client import Counter, Histogram, Gauge, Info

# --- Job lifecycle ---
JOB_RUNS_TOTAL = Counter(
    "etl_job_runs_total",
    "Total job executions",
    ["job_name", "status", "execution_tier", "connector_type"]
)

JOB_DURATION_SECONDS = Histogram(
    "etl_job_duration_seconds",
    "Job execution duration",
    ["job_name", "execution_tier"],
    buckets=[5, 10, 30, 60, 120, 300, 600, 1800, 3600]
)

JOB_ROWS_PROCESSED = Counter(
    "etl_job_rows_processed_total",
    "Total rows read from source",
    ["job_name", "connector_type", "direction"]  # direction: read | write
)

JOB_ROWS_REJECTED = Counter(
    "etl_job_rows_rejected_total",
    "Rows rejected by transforms (filter, validation)",
    ["job_name", "transform_type"]
)

# --- Connector metrics ---
CONNECTOR_QUERY_DURATION = Histogram(
    "etl_connector_query_duration_seconds",
    "Time spent in connector read/write operations",
    ["connector_type", "operation"],  # operation: read | write | bulk_load
    buckets=[0.1, 0.5, 1, 5, 10, 30, 60, 300]
)

CONNECTOR_POOL_ACTIVE = Gauge(
    "etl_connector_pool_active_connections",
    "Active database connections",
    ["connector_type", "target"]
)

CONNECTOR_ERRORS_TOTAL = Counter(
    "etl_connector_errors_total",
    "Connector errors by type",
    ["connector_type", "error_type"]
)

# --- Transform metrics ---
TRANSFORM_DURATION = Histogram(
    "etl_transform_duration_seconds",
    "Time spent in transform apply()",
    ["transform_type", "job_name"],
    buckets=[0.01, 0.05, 0.1, 0.5, 1, 5, 10]
)

TRANSFORM_CACHE_HITS = Counter(
    "etl_transform_cache_hits_total",
    "Lookup cache hits (LookupEnrich)",
    ["transform_type", "job_name"]
)

# --- Watermark metrics ---
WATERMARK_DRIFT_ROWS = Gauge(
    "etl_watermark_drift_estimated_rows",
    "Estimated rows behind watermark (late-arriving data risk)",
    ["job_name"]
)

WATERMARK_LAST_RUN_TIMESTAMP = Gauge(
    "etl_watermark_last_run_timestamp_seconds",
    "Unix timestamp of last successful watermark update",
    ["job_name"]
)

# --- Agent metrics ---
AGENT_TRANSLATION_TOTAL = Counter(
    "etl_agent_translations_total",
    "Migration agent expression translations",
    ["method", "status"]  # method: rule|haiku|sonnet|cache|manual
)

AGENT_TRANSLATION_DURATION = Histogram(
    "etl_agent_translation_duration_seconds",
    "LLM translation call duration",
    ["model"],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30]
)

AGENT_LLM_TOKENS = Counter(
    "etl_agent_llm_tokens_total",
    "LLM tokens consumed",
    ["model", "token_type"]  # token_type: input | output | cache_read
)

AGENT_PIPELINE_CONFIDENCE = Histogram(
    "etl_agent_pipeline_confidence",
    "Migration confidence score distribution",
    ["source_type"],
    buckets=[0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0]
)
```

#### Recording Usage in the Engine

```python
# framework/execution/engine.py (instrumented)
import time
from framework.observability.metrics import JOB_RUNS_TOTAL, JOB_DURATION_SECONDS, JOB_ROWS_PROCESSED

class ExecutionEngine:
    def run(self, config: dict) -> JobResult:
        job_name = config["job"]["name"]
        tier = config["job"].get("execution_tier", "pandas")
        start = time.monotonic()
        try:
            result = self._execute(config)
            JOB_RUNS_TOTAL.labels(job_name=job_name, status="success",
                                   execution_tier=tier, connector_type=self._connector_type(config)).inc()
            JOB_ROWS_PROCESSED.labels(job_name=job_name, connector_type=self._connector_type(config),
                                       direction="read").inc(result.rows_read)
            return result
        except Exception as exc:
            JOB_RUNS_TOTAL.labels(job_name=job_name, status="failed",
                                   execution_tier=tier, connector_type=self._connector_type(config)).inc()
            raise
        finally:
            JOB_DURATION_SECONDS.labels(job_name=job_name, execution_tier=tier).observe(
                time.monotonic() - start
            )
```

### 2.2 Prometheus Scrape Config (Kubernetes)

```yaml
# prometheus/scrape_config.yaml
scrape_configs:
  - job_name: etl-runners
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: [etl-pandas, etl-ray, etl-agent]
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        target_label: __metrics_path__
      - source_labels: [__meta_kubernetes_pod_label_job_name]
        target_label: job_name
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
    metric_relabel_configs:
      - source_labels: [job_name]
        target_label: pipeline
```

### 2.3 SLO Definitions

| SLO | Target | Measurement Window | Alert |
|---|---|---|---|
| Job success rate | ≥ 99.5% | 7-day rolling | PagerDuty P2 |
| P95 job duration ≤ SLA window | ≤ scheduled interval | Per-job | Slack warning |
| Data freshness (watermark lag) | < 2× schedule interval | Per-job | PagerDuty P1 |
| Agent translation success | ≥ 90% automated | Per migration run | Slack + email |
| API availability | ≥ 99.9% | 30-day rolling | PagerDuty P1 |

---

## 3. Structured Logging

### 3.1 Log Schema

Every log line is JSON. No unstructured log lines in production.

```json
{
  "timestamp": "2026-05-14T14:32:01.123Z",
  "level": "INFO",
  "service": "etl-runner",
  "version": "2.1.0",
  "trace_id": "4bf92f3577b34da6",
  "span_id":  "00f067aa0ba902b7",
  "job_name": "load_fact_orders",
  "run_id":   "run-20260514-143201-abc123",
  "phase":    "transform",
  "transform": "lookup_enrich",
  "event":    "transform_complete",
  "rows_in":  500000,
  "rows_out": 499843,
  "rows_dropped": 157,
  "duration_ms": 3241,
  "memory_mb": 1842,
  "connector": "sqlserver"
}
```

### 3.2 Logger Setup

```python
# framework/observability/logging.py
import logging
import json
from datetime import datetime, timezone
from opentelemetry import trace

class StructuredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        span = trace.get_current_span()
        ctx = span.get_span_context() if span else None
        base = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level":     record.levelname,
            "service":   "etl-runner",
            "logger":    record.name,
            "message":   record.getMessage(),
            "trace_id":  format(ctx.trace_id, "032x") if ctx else None,
            "span_id":   format(ctx.span_id, "016x") if ctx else None,
        }
        # Merge any extra fields passed via logger.info("msg", extra={...})
        for key, val in record.__dict__.items():
            if key not in logging.LogRecord.__dict__ and not key.startswith("_"):
                base[key] = val
        return json.dumps(base, default=str)

def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(StructuredFormatter())
    logging.basicConfig(handlers=[handler], level=getattr(logging, level))
```

### 3.3 Log Levels by Event

| Event | Level | Extra Fields |
|---|---|---|
| Job started | INFO | job_name, run_id, config_hash |
| Source read complete | INFO | rows_read, duration_ms, connector |
| Transform applied | DEBUG | transform_type, rows_in, rows_out |
| Target write complete | INFO | rows_written, duration_ms, table |
| Watermark updated | INFO | old_watermark, new_watermark |
| Retry attempt | WARNING | attempt, max_attempts, error_type |
| Row validation failure | WARNING | column, constraint, sample_count |
| Job failed | ERROR | error_type, error_msg, stack_trace |
| Secret resolution failed | CRITICAL | ref_prefix (never the secret value) |
| PII detected in output | CRITICAL | column, pii_type (never the value) |

### 3.4 Log Retention Policy

```
Tier        Destination       Retention   Purpose
─────────────────────────────────────────────────────
Hot         Loki / CloudWatch  30 days    Interactive search, alert eval
Warm        S3 Standard-IA     90 days    Incident investigation
Cold        S3 Glacier         7 years    Compliance (SOX, GDPR)
```

---

## 4. Distributed Tracing (OpenTelemetry)

### 4.1 Instrumentation

```python
# framework/observability/tracing.py
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

def configure_tracing(service_name: str, otlp_endpoint: str) -> None:
    provider = TracerProvider()
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint))
    )
    trace.set_tracer_provider(provider)

# Usage in engine
tracer = trace.get_tracer("etl.engine")

class ExecutionEngine:
    def run(self, config: dict) -> JobResult:
        with tracer.start_as_current_span("job.run") as span:
            span.set_attribute("job.name", config["job"]["name"])
            span.set_attribute("job.tier", config["job"].get("execution_tier", "pandas"))
            with tracer.start_as_current_span("job.read"):
                df = self._read(config)
            with tracer.start_as_current_span("job.transform") as t_span:
                t_span.set_attribute("transforms.count", len(config.get("transformations", [])))
                df = self._transform(df, config)
            with tracer.start_as_current_span("job.write"):
                rows = self._write(df, config)
            span.set_attribute("rows.written", rows)
            return JobResult(rows_written=rows)
```

### 4.2 Trace Propagation (Airflow → K8s Pod)

```python
# Airflow DAG: inject trace context into K8s job env vars
from opentelemetry.propagate import inject

env_vars = {}
inject(env_vars)  # sets traceparent, tracestate headers

KubernetesPodOperator(
    task_id="run_etl_job",
    env_vars={
        "TRACEPARENT": env_vars.get("traceparent", ""),
        "TRACESTATE":  env_vars.get("tracestate", ""),
    }
)
```

### 4.3 Trace Sampling Strategy

```yaml
# otel-collector-config.yaml
processors:
  probabilistic_sampler:
    sampling_percentage: 10    # sample 10% of successful runs
  filter/errors:
    error_mode: ignore
    traces:
      span:
        - 'status.code == STATUS_CODE_ERROR'  # always sample errors
```

---

## 5. Data Lineage (OpenLineage)

### 5.1 Architecture

```
ETL Runner
    │  emits OpenLineage events (Job/Dataset/Run facets)
    ▼
OpenLineage HTTP transport
    │
    ▼
Marquez (lineage backend)       ←── REST API for lineage queries
    │
    ▼
Grafana (lineage dashboards)    Amundsen / Atlas (data catalog)
```

### 5.2 Emitting Lineage Events

```python
# framework/observability/lineage.py
from openlineage.client import OpenLineageClient, RunEvent, RunState
from openlineage.client.run import Job, Run, Dataset
import uuid

class LineageEmitter:
    def __init__(self, marquez_url: str):
        self._client = OpenLineageClient(url=marquez_url)
        self._namespace = "generic-etl"

    def emit_start(self, config: dict, run_id: str) -> None:
        self._client.emit(RunEvent(
            eventType=RunState.START,
            eventTime=datetime.now(timezone.utc).isoformat(),
            run=Run(runId=run_id),
            job=Job(namespace=self._namespace, name=config["job"]["name"]),
            inputs=self._build_datasets(config.get("sources", []), config),
            outputs=self._build_datasets(config.get("targets", []), config),
        ))

    def emit_complete(self, config: dict, run_id: str, rows: int) -> None:
        self._client.emit(RunEvent(
            eventType=RunState.COMPLETE,
            eventTime=datetime.now(timezone.utc).isoformat(),
            run=Run(runId=run_id,
                    facets={"rowCount": {"_producer": "generic-etl", "rowCount": rows}}),
            job=Job(namespace=self._namespace, name=config["job"]["name"]),
            inputs=self._build_datasets(config.get("sources", []), config),
            outputs=self._build_datasets(config.get("targets", []), config),
        ))

    def _build_datasets(self, specs: list, config: dict) -> list[Dataset]:
        return [
            Dataset(
                namespace=spec.get("connector", "unknown"),
                name=spec.get("table") or spec.get("query", "")[:60],
            )
            for spec in specs
        ]
```

### 5.3 Lineage Graph Example

```
informatica_src_db.dbo.customers
        │
        ▼  [filter: status = 'ACTIVE']
informatica_src_db.dbo.customers (filtered)
        │
        ▼  [lookup_enrich: join segments]
informatica_src_db.dbo.customer_segments
        │
        ▼  [column_derive: full_name = first || ' ' || last]
        │
        ▼  [scd_type_2: merge on customer_id]
        ▼
dw_db.dbo.dim_customer
```

### 5.4 Column-Level Lineage (Phase 2)

```python
# Transform plugins emit column-level lineage via custom facets
{
  "columnLineage": {
    "_producer": "generic-etl",
    "fields": {
      "full_name": {
        "inputFields": [
          {"namespace": "src", "name": "customers", "field": "first_name"},
          {"namespace": "src", "name": "customers", "field": "last_name"}
        ],
        "transformationDescription": "concat with space",
        "transformationType": "IDENTITY"
      }
    }
  }
}
```

---

## 6. Alerting Architecture

### 6.1 Alert Routing

```
Prometheus AlertManager
    │
    ├── severity: critical → PagerDuty (P1, immediate escalation)
    ├── severity: high     → PagerDuty (P2, 30-min response SLA)
    ├── severity: warning  → Slack #etl-alerts
    └── severity: info     → Slack #etl-info (digest, not paged)
```

### 6.2 Alert Rules

```yaml
# prometheus/alerts/etl_alerts.yaml
groups:
  - name: etl.job.health
    rules:
      - alert: ETLJobFailureRateHigh
        expr: |
          (
            rate(etl_job_runs_total{status="failed"}[15m]) /
            rate(etl_job_runs_total[15m])
          ) > 0.05
        for: 5m
        labels:
          severity: high
          team: etl-platform
        annotations:
          summary: "Job failure rate > 5% over last 15 minutes"
          runbook: "https://wiki.internal/etl/runbooks/job-failure-rate"

      - alert: ETLJobStuck
        expr: |
          (time() - etl_watermark_last_run_timestamp_seconds) > (2 * 3600)
        for: 10m
        labels:
          severity: high
        annotations:
          summary: "Job {{ $labels.job_name }} has not updated watermark in > 2 hours"

      - alert: ETLDataFreshnessViolation
        expr: |
          etl_watermark_last_run_timestamp_seconds < (time() - 86400)
        labels:
          severity: critical
        annotations:
          summary: "Data freshness SLA violated: {{ $labels.job_name }} not run in 24h"

  - name: etl.infrastructure
    rules:
      - alert: ETLPodOOMKilled
        expr: |
          kube_pod_container_status_last_terminated_reason{
            reason="OOMKilled",
            namespace=~"etl-.*"
          } == 1
        for: 1m
        labels:
          severity: high
        annotations:
          summary: "ETL pod OOM killed — {{ $labels.pod }}"
          action: "Upgrade memory limit or switch to Ray tier"

      - alert: ETLConnectorPoolExhausted
        expr: etl_connector_pool_active_connections > 90
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Connection pool > 90% for {{ $labels.connector_type }}"

  - name: etl.agent
    rules:
      - alert: ETLAgentLowAutomationRate
        expr: |
          (
            rate(etl_agent_translations_total{method=~"rule|haiku|sonnet|cache"}[1h]) /
            rate(etl_agent_translations_total[1h])
          ) < 0.80
        labels:
          severity: warning
        annotations:
          summary: "Agent automation rate dropped below 80%"

      - alert: ETLAgentLLMCostSpike
        expr: |
          increase(etl_agent_llm_tokens_total{model="claude-sonnet-4",token_type="output"}[1h]) > 500000
        labels:
          severity: warning
        annotations:
          summary: "High Sonnet token usage in last hour — review agent cache hit rate"
```

### 6.3 PagerDuty Integration

```yaml
# alertmanager/config.yaml
route:
  group_by: [alertname, job_name]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: slack-default
  routes:
    - match:
        severity: critical
      receiver: pagerduty-p1
      continue: true
    - match:
        severity: high
      receiver: pagerduty-p2

receivers:
  - name: pagerduty-p1
    pagerduty_configs:
      - routing_key: "<PAGERDUTY_INTEGRATION_KEY>"
        severity: critical
        description: "{{ .CommonAnnotations.summary }}"
        links:
          - href: "{{ .CommonAnnotations.runbook }}"
            text: Runbook

  - name: slack-default
    slack_configs:
      - api_url: "<SLACK_WEBHOOK_URL>"
        channel: "#etl-alerts"
        title: "[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}"
        text: "{{ .CommonAnnotations.summary }}"
        color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
```

---

## 7. Grafana Dashboards

### 7.1 Dashboard Inventory

| Dashboard | Audience | Refresh | Key Panels |
|---|---|---|---|
| ETL Fleet Overview | All Engineers | 1m | Jobs running, success rate, rows/min, error count |
| Job Deep Dive | Job Owner | 30s | Phase breakdown, row counts, memory, connector latency |
| Agent Migration | Migration Lead | 5m | Automaton rate, confidence dist, LLM cost, manual queue depth |
| Infrastructure | SRE | 1m | Pod count, CPU/mem utilization, node pressure, spot savings |
| Data Freshness | Data Engineering | 5m | Watermark age per job, drift risk, SLA compliance % |
| FinOps | Director | 1h | Monthly infra cost, cost/pipeline, LLM spend, idle cost |
| Security & Audit | Security Team | 5m | Secret resolution errors, PII detection events, auth failures |

### 7.2 Fleet Overview Panel Queries

```promql
# Active job count (running right now)
count(kube_pod_status_phase{phase="Running", namespace=~"etl-.*"})

# Job success rate (24h)
sum(increase(etl_job_runs_total{status="success"}[24h])) /
sum(increase(etl_job_runs_total[24h])) * 100

# P95 job duration (heatmap)
histogram_quantile(0.95, rate(etl_job_duration_seconds_bucket[1h]))

# Rows processed per minute (gauge)
rate(etl_job_rows_processed_total{direction="write"}[5m]) * 60

# LLM spend today (needs recording rule from token counter)
etl_agent_estimated_llm_cost_usd_total
```

### 7.3 Data Freshness Dashboard

```promql
# Time since last successful run (hours)
(time() - etl_watermark_last_run_timestamp_seconds) / 3600

# Jobs overdue (SLA = 24h)
count(
  (time() - etl_watermark_last_run_timestamp_seconds) > 86400
)

# Watermark drift risk (jobs approaching SLA)
count(
  (time() - etl_watermark_last_run_timestamp_seconds) > 72000   # 20h
  and
  (time() - etl_watermark_last_run_timestamp_seconds) < 86400   # 24h
)
```

---

## 8. Audit Trail

### 8.1 Audit Event Schema (PostgreSQL)

```sql
-- framework/db/migrations/001_audit_events.sql
CREATE TABLE etl_audit_events (
    id              BIGSERIAL PRIMARY KEY,
    event_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type      VARCHAR(64) NOT NULL,   -- job_start | job_end | config_change | secret_access
    severity        VARCHAR(16) NOT NULL DEFAULT 'info',
    job_name        VARCHAR(255),
    run_id          UUID,
    actor           VARCHAR(255),           -- service account or user principal
    ip_address      INET,
    resource        VARCHAR(512),           -- affected resource (table, config file, secret ref)
    outcome         VARCHAR(16) NOT NULL,   -- success | failure | denied
    rows_affected   BIGINT,
    duration_ms     INTEGER,
    metadata        JSONB,                  -- extensible event-specific fields
    trace_id        VARCHAR(64)
);

CREATE INDEX idx_audit_job_name ON etl_audit_events(job_name, event_time DESC);
CREATE INDEX idx_audit_actor    ON etl_audit_events(actor, event_time DESC);
CREATE INDEX idx_audit_type     ON etl_audit_events(event_type, event_time DESC);
CREATE INDEX idx_audit_gin      ON etl_audit_events USING gin(metadata);
```

### 8.2 Audit Event Types

| Event Type | Trigger | Captured Fields |
|---|---|---|
| `job_start` | Job begins | job_name, run_id, config_hash, actor |
| `job_complete` | Job succeeds | rows_read, rows_written, duration_ms |
| `job_failed` | Job errors | error_type, error_message, stack_trace |
| `secret_accessed` | SecretsResolver resolves ref | secret_ref (prefix only), resolver_type |
| `config_deployed` | New YAML deployed | git_commit, config_hash, deployer |
| `schema_validated` | Config validation run | schema_version, result, violations |
| `migration_started` | Agent begins conversion | source_type, pipeline_count |
| `migration_complete` | Agent finishes | automation_rate, manual_queue_count |
| `pii_detected` | DLP scanner finds PII | column, pii_type (NO data values) |
| `access_denied` | RBAC deny | principal, action, resource |

### 8.3 Audit Log API

```python
# framework/observability/audit.py
class AuditLogger:
    def log(
        self,
        event_type: str,
        outcome: str,
        *,
        job_name: str | None = None,
        run_id: str | None = None,
        actor: str | None = None,
        resource: str | None = None,
        rows_affected: int | None = None,
        duration_ms: int | None = None,
        metadata: dict | None = None,
    ) -> None:
        """Write a structured audit event to both the audit DB and the log stream."""
        event = {
            "event_type": event_type,
            "outcome": outcome,
            "job_name": job_name,
            "run_id": run_id,
            "actor": actor or self._current_principal(),
            "resource": resource,
            "rows_affected": rows_affected,
            "duration_ms": duration_ms,
            "metadata": metadata or {},
        }
        self._db_insert(event)
        logger.info("audit_event", extra=event)  # also emitted to structured log stream
```

---

## 9. Runbook Catalogue

| Runbook | Alert Condition | Key Steps |
|---|---|---|
| RB-001: Job Failure Rate High | `ETLJobFailureRateHigh` | 1. Check pod logs `kubectl logs -n etl-pandas -l job_name=X`; 2. Check connector health; 3. Check watermark drift; 4. Escalate to job owner |
| RB-002: Job Stuck / No Watermark Update | `ETLJobStuck` | 1. Check if pod is running; 2. Kill stuck pod; 3. Trigger manual re-run; 4. Investigate source availability |
| RB-003: Pod OOMKilled | `ETLPodOOMKilled` | 1. Note job config `memory_gb`; 2. Increase limit or set `execution_tier: ray`; 3. Re-run |
| RB-004: Data Freshness SLA Breach | `ETLDataFreshnessViolation` | 1. Check job schedule in Airflow; 2. Check for upstream dependency failure; 3. Alert data consumers |
| RB-005: Agent LLM Cost Spike | `ETLAgentLLMCostSpike` | 1. Check pgvector cache hit rate; 2. Review recent expression types (new source system?); 3. Expand rule engine |
| RB-006: Secret Resolution Failure | ad-hoc | 1. Check Vault connectivity; 2. Check service account token expiry; 3. Check secret path exists |

---

## 10. Observability Maturity Roadmap

| Phase | Capability Added | Outcome |
|---|---|---|
| **Phase 0–1** | Structured logging, Prometheus counters, basic Grafana, audit log table | Visible, debuggable |
| **Phase 1** | OTel tracing, Loki log aggregation, alerting stack (Slack + PagerDuty) | Operable at 50 pipelines |
| **Phase 2** | OpenLineage + Marquez, column-level lineage, data freshness SLOs, FinOps dashboard | Observable at 300 pipelines |
| **Phase 3** | ML-based anomaly detection (Grafana ML), auto-remediation (runbook automation), self-service observability portal | Autonomous operations at 700 pipelines |
