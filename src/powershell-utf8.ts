const UTF8_BOM = "\uFEFF";

export const POWERSHELL_UTF8_PREAMBLE = [
  "$utf8Encoding = [System.Text.UTF8Encoding]::new($false)",
  "[Console]::InputEncoding = $utf8Encoding",
  "[Console]::OutputEncoding = $utf8Encoding",
  "$OutputEncoding = $utf8Encoding",
  "chcp.com 65001 > $null",
].join("; ");

export function wrapPowerShellCommand(command: string): string {
  return `${POWERSHELL_UTF8_PREAMBLE}; ${command}`;
}

export function createPowerShellScriptContents(script: string): string {
  // Windows PowerShell 5.1 may interpret UTF-8 .ps1 files without a BOM as
  // the active ANSI code page. Temporary scripts therefore carry a BOM so
  // non-ASCII source text is decoded correctly before the UTF-8 preamble runs.
  return `${UTF8_BOM}${POWERSHELL_UTF8_PREAMBLE}\r\n${script}`;
}

export function createPwshScriptContents(script: string): string {
  // PowerShell 7 reads UTF-8 without BOM natively; keep temporary scripts BOM-free.
  return `${POWERSHELL_UTF8_PREAMBLE}\r\n${script}`;
}
