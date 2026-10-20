/** A tiny test helper: prints PASS or FAIL for each check and counts failures. */
let failures = 0;
let total = 0;

export function check(ok: boolean, message: string) {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
}

export function section(title: string) {
  console.log(`\n== ${title}`);
}

export function summary() {
  console.log(`\n${total - failures} of ${total} checks passed`);
  if (failures) process.exitCode = 1;
}
