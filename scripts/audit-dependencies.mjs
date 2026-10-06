import { spawnSync } from "node:child_process";

const packageManagerEntry = process.env.npm_execpath;
if (packageManagerEntry === undefined || packageManagerEntry.length === 0) {
  throw new Error("Run this policy through the pnpm audit:dependencies script");
}
const allowedAdvisories = new Map([
  [
    "GHSA-vfj7-8cjw-p6xm",
    {
      moduleName: "braces",
      reviewAfter: "2026-11-07",
      version: "3.0.3",
      pathPattern: /eslint-config-next>@next\/eslint-plugin-next>fast-glob>micromatch>braces$/,
    },
  ],
]);

runProductionAudit();
reviewCompleteAudit();

function runProductionAudit() {
  const result = runPackageManager(["audit", "--prod", "--audit-level", "high"]);
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) {
    throw new Error("Production dependency audit failed");
  }
}

function reviewCompleteAudit() {
  const result = runPackageManager(["audit", "--json"]);
  if (result.error !== undefined) throw result.error;

  const report = parseAuditReport(result.stdout);
  const advisories = Object.values(report.advisories ?? {});
  if (advisories.length === 0) {
    console.log("Complete dependency audit found no known vulnerabilities");
    return;
  }

  for (const advisory of advisories) {
    const exception = allowedAdvisories.get(advisory.github_advisory_id);
    if (exception === undefined) {
      throw new Error(
        `Unreviewed dependency advisory: ${advisory.github_advisory_id ?? advisory.id}`,
      );
    }
    if (new Date() > new Date(`${exception.reviewAfter}T23:59:59.999Z`)) {
      throw new Error(
        `Dependency exception ${advisory.github_advisory_id} expired on ${exception.reviewAfter}`,
      );
    }
    if (advisory.module_name !== exception.moduleName) {
      throw new Error(`Dependency exception package changed for ${advisory.github_advisory_id}`);
    }
    for (const finding of advisory.findings ?? []) {
      if (
        finding.dev !== true ||
        finding.version !== exception.version ||
        !Array.isArray(finding.paths) ||
        finding.paths.length === 0 ||
        finding.paths.some((path) => !exception.pathPattern.test(path))
      ) {
        throw new Error(`Dependency exception scope changed for ${advisory.github_advisory_id}`);
      }
    }
    console.warn(
      `Accepted reviewed dev-only advisory ${advisory.github_advisory_id}; review by ${exception.reviewAfter}`,
    );
  }

  if (result.status === 0) {
    throw new Error("Audit returned advisories without a failing exit status; review audit policy");
  }
}

function runPackageManager(arguments_) {
  return spawnSync(process.execPath, [packageManagerEntry, ...arguments_], {
    encoding: "utf8",
    shell: false,
  });
}

function parseAuditReport(output) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("Dependency audit did not return valid JSON");
  }
}
