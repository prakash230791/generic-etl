# Security Architecture & Hardening Guide

**Document:** 03 of 8
**Audience:** Security Architects, Compliance, Platform Engineers
**Version:** 1.0 | **Date:** 2026-05-14
**Compliance Targets:** SOC 2 Type II, ISO 27001, GDPR, PCI-DSS (if applicable)

---

## 1. Threat Model

### Assets to Protect

| Asset | Classification | Risk |
|---|---|---|
| Database credentials (SQL Server, Oracle, PostgreSQL) | Top Secret | Unauthorized data access |
| PII / customer data flowing through pipelines | Confidential | Regulatory breach (GDPR, CCPA) |
| YAML job configs (pipeline logic) | Internal | IP theft; config tampering |
| IR / audit logs (pipeline metadata) | Internal | Information disclosure |
| Agent translation prompts (metadata only, no row data) | Internal | Business logic disclosure |
| Kubernetes pod service accounts | Restricted | Lateral movement within cluster |

### Threat Actors

| Actor | Vector | Mitigation |
|---|---|---|
| External attacker | Credential exposure in git | Secret scanning CI gate + Vault |
| Malicious insider | Config tampering | RBAC + audit log + signed commits |
| Compromised CI pipeline | Injecting malicious transforms | Signed images + OPA policy gates |
| Data exfiltration via ETL | Source data in LLM prompts | Agent security invariant: IR is metadata-only |
| Supply chain attack | Malicious PyPI plugin | Pin all dependencies; SBOM verification |

---

## 2. Security Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 5: Data Governance (PII masking, DLP, lineage)          │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 4: Application Security (RBAC, audit log, input val.)   │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 3: Platform Security (K8s RBAC, NetworkPolicy, IRSA)    │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 2: Secrets Management (Vault, KMS, no plaintext creds)  │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 1: Identity & Access (OAuth2/OIDC, MFA, service accts) │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Identity & Access Management

### 3.1 Authentication

| Persona | Auth Method | Implementation |
|---|---|---|
| ETL Engineers | Azure AD + MFA | kubectl + OIDC kubeconfig |
| CI/CD Pipelines | GitHub OIDC → AWS IRSA | No static secrets; short-lived tokens |
| Runtime pods | Kubernetes IRSA / Workload Identity | Pod-specific IAM role; no credentials in code |
| Airflow workers | Service account + IRSA | One IAM role per environment (dev/test/prod) |
| Migration agent | Service account | Scoped Vault policy; read-only on secret paths |

### 3.2 Authorization (RBAC Model)

```
Roles:
  etl-reader        → list jobs, view configs, read audit logs
  etl-executor      → execute jobs (no config changes)
  etl-author        → create/edit job configs
  etl-admin         → full access including secrets management
  etl-migration     → run agent convert/batch commands (read-only on secrets)

Permissions:
  action:list_jobs          → etl-reader+
  action:view_config        → etl-reader+
  action:execute_job        → etl-executor+
  action:create_config      → etl-author+
  action:delete_config      → etl-admin only
  action:manage_secrets     → etl-admin only
  action:view_audit_log     → etl-reader+
  action:run_migration      → etl-migration+
```

Implementation: Open Policy Agent (OPA) Gatekeeper on Kubernetes; PostgreSQL RBAC table for application-level.

### 3.3 Service Account Isolation

Each job pod runs with a dedicated Kubernetes service account that has:
- IRSA role: read S3 bucket prefix, access specific RDS instance
- No cross-namespace access
- No `exec` or `port-forward` permissions
- No access to secrets outside its namespace

```yaml
# ServiceAccount per environment
apiVersion: v1
kind: ServiceAccount
metadata:
  name: etl-job-runner-prod
  namespace: etl-pandas
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/etl-prod-job-runner
```

---

## 4. Secrets Management

### 4.1 Connection Reference Format (enforced by parser + engine)

```
kv://<vault_path>/<secret_name>  → HashiCorp Vault / Azure Key Vault
ls://<linked_service_name>        → env var ETL_CONN_<LS_NAME_UPPER>
msi://<credential_name>           → Azure Managed Identity (DefaultAzureCredential)
ssm://<parameter_name>            → AWS SSM Parameter Store
asm://<secret_name>               → AWS Secrets Manager
```

**Zero tolerance for:**
- Raw connection strings in YAML
- Passwords in environment variables (except `ls://` env-var injection for local dev)
- Secrets in git history

### 4.2 HashiCorp Vault Integration

```python
# framework/config/secrets_resolver.py
class SecretsResolver:
    """Runtime resolver for all connection reference formats."""

    def resolve(self, ref: str) -> str:
        if ref.startswith("kv://"):
            return self._resolve_vault(ref)
        elif ref.startswith("ls://"):
            return self._resolve_env_var(ref)
        elif ref.startswith("msi://"):
            return self._resolve_msi(ref)
        elif ref.startswith("ssm://"):
            return self._resolve_ssm(ref)
        elif ref.startswith("asm://"):
            return self._resolve_asm(ref)
        return ref   # plain string (dev only, no-op)

    def _resolve_vault(self, ref: str) -> str:
        # kv://secret/path/name → Vault KV v2 read
        _, path_and_name = ref[5:].split("/", 1)
        import hvac
        client = hvac.Client(url=os.environ["VAULT_ADDR"],
                             token=os.environ["VAULT_TOKEN"])
        secret = client.secrets.kv.v2.read_secret_version(path=path_and_name)
        return secret["data"]["data"]["value"]

    def _resolve_msi(self, ref: str) -> dict:
        # msi://cred-name → Azure DefaultAzureCredential connection dict
        from azure.identity import DefaultAzureCredential
        cred_name = ref[6:]
        server = os.environ[f"ETL_SERVER_{cred_name.upper().replace('-','_')}"]
        database = os.environ[f"ETL_DATABASE_{cred_name.upper().replace('-','_')}"]
        return {
            "connection_string": (
                f"Server={server};Database={database};"
                f"Authentication=ActiveDirectoryMsi;Encrypt=yes;"
            )
        }
```

### 4.3 Secret Rotation

```
Rotation cadence (per secret type):
  Database passwords:     Every 90 days (automated via Vault dynamic secrets)
  Service account tokens: Every 24 hours (short-lived OIDC tokens)
  API keys (LLM):         Every 30 days (manual + Vault versioning)
  TLS certificates:       Every 90 days (cert-manager + Let's Encrypt)
  Vault root token:       Annually (break-glass; sealed by multiple admins)
```

**Vault Dynamic Secrets** (Phase 2): Vault generates ephemeral DB credentials per-run:
```python
# Dynamic credential for each job run — expires after job completes
creds = vault.secrets.database.generate_credentials(
    name="sqlserver-etl-prod",
    lease_duration="1h"   # credential auto-expires after job
)
connection_string = f"Server=...;UID={creds['username']};PWD={creds['password']}"
```

---

## 5. Encryption

### 5.1 Data in Transit

| Connection | Protocol | Certificate |
|---|---|---|
| Engine → Database (SQL Server) | TLS 1.3 (`Encrypt=yes`) | Corporate CA |
| Engine → S3 / ADLS | HTTPS (TLS 1.3) | AWS/Azure managed |
| Pod → Vault | mTLS (TLS 1.3) | Vault PKI secrets engine |
| Airflow → API Gateway | TLS 1.3 + JWT | Let's Encrypt |
| LLM API calls (Anthropic) | HTTPS (TLS 1.3) | Anthropic CA |
| K8s node-to-node | Calico WireGuard | Auto-rotated |

### 5.2 Data at Rest

| Storage | Encryption | Key Management |
|---|---|---|
| PostgreSQL (audit, pgvector) | AES-256 (RDS encryption) | AWS KMS CMK |
| S3 (job configs, IR files) | SSE-KMS | AWS KMS per-bucket |
| ADLS Gen2 | AES-256 | Azure Key Vault |
| Kubernetes etcd | AES-GCM-256 | AWS KMS envelope encryption |
| Container images (ECR) | AES-256 | AWS KMS |
| Vault data | AES-GCM-256 | AWS KMS auto-unseal |

### 5.3 Data in Processing

- Pandas DataFrames: in-memory only; no swap-to-disk without explicit config
- Temporary files: written to encrypted EBS volumes (`/tmp` on encrypted node)
- Chunked processing: buffer flushed after each chunk; no persistence

---

## 6. Network Security

### 6.1 VPC Design

```
VPC: etl-platform-prod (10.0.0.0/16)
│
├── Private Subnets (10.0.1.0/24, 10.0.2.0/24, 10.0.3.0/24)
│   ├── EKS node groups (no direct internet access)
│   ├── RDS PostgreSQL (no public endpoint)
│   └── Vault cluster (no public endpoint)
│
├── Public Subnets (10.0.101.0/24, 10.0.102.0/24)
│   └── Application Load Balancer (API Gateway only)
│
└── Transit Gateway
    ├── Corporate network (via Direct Connect)
    └── On-premises SQL Server / Oracle (via Self-Hosted IR agent)
```

### 6.2 Kubernetes Network Policies

```yaml
# Default deny all ingress in worker namespaces
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: etl-pandas
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
# Allow pods to egress to known DB subnets only
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-db-egress
  namespace: etl-pandas
spec:
  podSelector:
    matchLabels:
      app: etl-runner
  policyTypes: [Egress]
  egress:
    - to:
        - ipBlock:
            cidr: 10.0.1.0/24   # DB subnet
    - to:
        - namespaceSelector:
            matchLabels:
              name: etl-control  # Allow Vault + Airflow
      ports:
        - port: 8200   # Vault
        - port: 8080   # Airflow API
```

---

## 7. Application Security

### 7.1 YAML Config Validation (Security-Relevant)

```python
# Additional security checks in validator.py
def validate_config_security(config: dict) -> list[str]:
    """Return list of security violations. Empty = safe to execute."""
    violations = []

    # Check 1: No raw connection strings
    config_str = json.dumps(config)
    for pattern in [r"Password=\w+", r"PWD=\w+", r"password.*:.*\w{8,}"]:
        if re.search(pattern, config_str, re.IGNORECASE):
            violations.append(f"Potential credential found matching pattern: {pattern}")

    # Check 2: connection values must use reference format
    for source in config.get("sources", [config.get("source", {})]):
        conn = source.get("config", {}).get("connection", source.get("connection", ""))
        if conn and not any(conn.startswith(p) for p in ("kv://","ls://","msi://","ssm://","asm://")):
            violations.append(f"Source connection '{conn[:20]}...' is not a secrets reference")

    # Check 3: No code injection in conditions
    for t in config.get("transformations", []):
        condition = t.get("config", {}).get("condition", "")
        for dangerous in ["__import__", "eval(", "exec(", "open(", "os.", "subprocess."]:
            if dangerous in condition:
                violations.append(f"Dangerous expression in transform '{t.get('id')}': {dangerous}")

    return violations
```

### 7.2 Expression Sandboxing (Hardened)

Current sandboxing in `column_derive` is good but needs hardening:

```python
# framework/transformations/column_derive.py (hardened eval)
_SAFE_GLOBALS = {
    "__builtins__": {},          # No builtins at all
    "abs": abs, "round": round, "len": len,
    "str": str, "int": int, "float": float, "bool": bool,
    "min": min, "max": max, "sum": sum,
    "pd": pd,                    # pandas (needed for string ops)
    "np": None,                  # numpy NOT allowed (avoids file I/O)
    "datetime": __import__("datetime"),
}

_BANNED_PATTERNS = re.compile(
    r"(__\w+__|import |exec |eval |open |os\.|sys\.|subprocess|getattr|setattr)", re.I
)

def _safe_eval(expr: str, row_dict: dict) -> Any:
    if _BANNED_PATTERNS.search(expr):
        raise SecurityError(f"Blocked expression: {expr[:100]}")
    try:
        return eval(compile(expr, "<etl>", "eval"), _SAFE_GLOBALS, row_dict)
    except Exception as exc:
        raise TransformError(f"Expression failed: {expr}") from exc
```

### 7.3 Input Validation

```python
# Connector: sanitize table names (prevent SQL injection)
def _sanitize_table_name(table: str) -> str:
    """Allow only schema.table or table format. No special chars."""
    if not re.match(r"^[\w\.]+$", table):
        raise ValueError(f"Invalid table name: {table!r}")
    return table

# Connector: parameterized queries only (never f-string SQL)
def _build_query(config: dict) -> str:
    if "query" in config:
        return config["query"]   # user-supplied SQL (operator is trusted)
    elif "table" in config:
        return f"SELECT * FROM {_sanitize_table_name(config['table'])}"
    raise ValueError("Either 'query' or 'table' must be specified")
```

---

## 8. Audit Logging

### 8.1 Audit Events

Every audit event is written to `etl_audit_events` PostgreSQL table:

```sql
CREATE TABLE etl_audit_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type      TEXT NOT NULL,  -- JOB_START, JOB_SUCCESS, JOB_FAILURE, CONFIG_CHANGE, SECRET_ACCESS
    job_name        TEXT,
    run_id          UUID,
    actor           TEXT,           -- service account or user email
    source_ip       INET,
    config_hash     TEXT,           -- SHA-256 of job config (detect tampering)
    rows_read       BIGINT,
    rows_written    BIGINT,
    duration_ms     INTEGER,
    error_message   TEXT,
    metadata        JSONB           -- connector types, transform types, etc.
);

-- Retention: 2 years (regulatory); archive to S3 Glacier after 90 days
```

### 8.2 Agent Security Invariant

**Critical:** The migration agent MUST NEVER send source data rows to any LLM.

```python
# agent/agents/translation/llm_translator.py (security check)
def _build_prompt(self, expression: str, context: dict) -> str:
    prompt = f"""
    Translate this ETL expression from {context['source_type']} to Python/pandas:
    Expression: {expression}
    Column context: {context['column_names']}    # ← column NAMES only, no values
    """

    # Security assertion: no row data in prompt
    assert not any(
        str(v) in prompt
        for v in context.get("sample_values", [])
    ), "SECURITY: sample data values detected in LLM prompt"

    return prompt
```

### 8.3 Config Tampering Detection

```python
# On job start: verify config has not changed since last validated run
def _verify_config_integrity(config: dict, stored_hash: str) -> None:
    current_hash = hashlib.sha256(
        json.dumps(config, sort_keys=True).encode()
    ).hexdigest()
    if current_hash != stored_hash:
        audit_log.warning("CONFIG_TAMPERED",
                          stored_hash=stored_hash,
                          current_hash=current_hash)
        raise SecurityError("Job config has been modified since last validation")
```

---

## 9. PII Protection

### 9.1 `mask_pii` Transformation

```yaml
# Pipeline config: mask PII before writing to staging
transformations:
  - id: mask_pii_fields
    type: mask_pii
    input: src_customers
    rules:
      - column: email
        strategy: hash           # SHA-256, reversible with salt
      - column: phone_number
        strategy: redact         # replace with ***
      - column: credit_card
        strategy: tokenize       # vault-stored token (reversible for authorized users)
      - column: birth_date
        strategy: generalize     # 1990-01-15 → 1990
      - column: full_name
        strategy: pseudonymize   # consistent fake name per hash(real_name)
```

### 9.2 DLP Scanning

- **Pre-write check:** Scan sink output for PII patterns (credit card regex, SSN, email) before writing
- **Alert on detection:** If PII found in unexpected column → abort job, raise alert
- **Exclusions:** Known PII columns declared in config are exempt from DLP scan

```python
# framework/transformations/mask_pii.py (DLP scan)
PII_PATTERNS = {
    "credit_card": re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"),
    "ssn":         re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "email":       re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    "phone":       re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
}

def _scan_for_pii(df: pd.DataFrame, declared_pii_columns: list[str]) -> list[str]:
    """Returns list of undeclared columns that appear to contain PII."""
    violations = []
    for col in df.select_dtypes(include="object").columns:
        if col in declared_pii_columns:
            continue
        sample = df[col].dropna().head(100).astype(str)
        for pii_type, pattern in PII_PATTERNS.items():
            if sample.str.contains(pattern).any():
                violations.append(f"{col} (possible {pii_type})")
    return violations
```

### 9.3 Column-Level Access Control

```yaml
# Dataset schema in catalog: declare PII columns
dataset:
  name: dim_customer
  pii_columns: [email, phone_number, birth_date, national_id]
  access_policy:
    etl-author:    [customer_id, first_name, last_name, segment_code]  # no PII
    etl-pii-user:  "*"    # all columns (requires PII access request)
    etl-analytics: [customer_id, segment_code, region]                 # aggregated only
```

---

## 10. CI/CD Security Gates

Every pull request must pass all security gates before merge:

```yaml
# .github/workflows/security.yml
jobs:
  secret-scan:
    steps:
      - uses: trufflesecurity/trufflehog-actions-scan@main
        with:
          path: .
          base: main
          # Fail on any credential-like string in YAML files

  dependency-audit:
    steps:
      - run: pip-audit --requirement requirements.txt  # CVE check
      - run: safety check                               # known vulnerabilities

  sast:
    steps:
      - uses: github/codeql-action/analyze@v3
        with:
          languages: python
          # Detect SQL injection, command injection, eval misuse

  container-scan:
    steps:
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: generic-etl:${{ github.sha }}
          severity: HIGH,CRITICAL   # Block on HIGH+

  config-lint:
    steps:
      - run: python -m etl.lint_configs output/  # check all YAML for credential patterns
```

---

## 11. Incident Response

### Credential Exposure Playbook

```
TRIGGER: Secret scanner detects credential in git history / PR

Immediate (0–15 min):
  1. Auto-block PR merge (CI gate)
  2. Alert etl-security Slack channel
  3. Rotate the exposed credential immediately (Vault admin)

Short-term (15–60 min):
  4. Git history rewrite: git filter-repo --replace-text
  5. Force-push to remove from all branches
  6. Notify all repository collaborators to reclone
  7. Audit logs: check if exposed credential was used externally

Medium-term (1–24 hours):
  8. Root cause analysis (where did the credential come from?)
  9. Add missing pre-commit hook to developer's machine
  10. Post-incident review scheduled within 3 days
```

### Data Breach Playbook (PII Exfiltration)

```
TRIGGER: DLP scan detects PII in unexpected output / audit log shows unusual access pattern

Immediate (0–30 min):
  1. Suspend the job (kubectl delete job)
  2. Quarantine the output table (REVOKE ALL ON TABLE)
  3. Alert Data Protection Officer + Security team

Short-term (30 min – 4 hours):
  4. Determine scope: which tables, which rows, which consumers
  5. Preserve audit logs (freeze, no deletion)
  6. Determine if GDPR 72-hour notification window applies

Medium-term (4–72 hours):
  7. Legal / DPO assessment
  8. Regulatory notification if required
  9. Affected individuals notification if required
  10. Technical remediation (mask columns, tighten access policy)
```

---

## 12. Security Hardening Checklist

### Phase 1 (Must Have)
- [ ] Vault integration for all database connections
- [ ] Secret scanning CI gate (blocks PR on credential detection)
- [ ] RBAC with job-level permissions
- [ ] Audit log (PostgreSQL-backed, immutable)
- [ ] TLS 1.3 for all DB connections
- [ ] YAML config security validation (no raw credentials)
- [ ] Kubernetes NetworkPolicy (deny-all default; explicit allow)
- [ ] Container image scanning (Trivy)
- [ ] IRSA / Workload Identity (no static AWS credentials)

### Phase 2 (Should Have)
- [ ] Dynamic Vault credentials (per-run ephemeral DB passwords)
- [ ] OPA Gatekeeper admission controller
- [ ] PII masking transforms (`mask_pii`)
- [ ] DLP scan before each write
- [ ] Column-level access policy in catalog
- [ ] Agent security invariant tests (no row data in LLM prompts)
- [ ] Dependency CVE scanning (pip-audit)

### Phase 3 (Nice to Have)
- [ ] eBPF-based runtime security (Cilium / Falco)
- [ ] Hardware Security Module (HSM) for Vault sealing
- [ ] Zero-trust service mesh (Istio mTLS)
- [ ] Immutable audit log (write to WORM S3 bucket)
- [ ] Formal threat model review (annual)
