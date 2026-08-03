param(
    [string]$Path = (Join-Path (Split-Path $PSScriptRoot -Parent) 'PRD.md')
)

$ErrorActionPreference = 'Stop'
$failures = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "PRD not found: $Path"
}

$content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
$lines = $content -split "`r?`n"

function Add-Failure([string]$Message) {
    $failures.Add($Message)
}

$fenceCount = ([regex]::Matches($content, '(?m)^```')).Count
if (($fenceCount % 2) -ne 0) {
    Add-Failure "Code fences are not balanced ($fenceCount found)."
}

if ($content -match '(?i)\bTODO\b|\bTBD\b|\bFIXME\b') {
    Add-Failure 'Unresolved TODO/TBD/FIXME marker found.'
}

if ($content -match '[\u4e00-\u9fff]') {
    Add-Failure 'Chinese text found; the authoritative PRD must remain English.'
}

if ($content -match [char]0xFFFD) {
    Add-Failure 'Unicode replacement character found.'
}

$numberedSections = @(
    Select-String -LiteralPath $Path -Pattern '^## ([0-9]+)\.' -Encoding UTF8 |
        ForEach-Object { [int]$_.Matches[0].Groups[1].Value }
)
$expectedSections = @(1..45)
if (($numberedSections -join ',') -ne ($expectedSections -join ',')) {
    Add-Failure "Expected numbered H2 sections 1..45; found: $($numberedSections -join ',')."
}

$jsonBlocks = [regex]::Matches($content, '(?s)```json\s*\r?\n(.*?)\r?\n```')
for ($index = 0; $index -lt $jsonBlocks.Count; $index++) {
    try {
        $jsonBlocks[$index].Groups[1].Value | ConvertFrom-Json -ErrorAction Stop | Out-Null
    }
    catch {
        Add-Failure "JSON example $($index + 1) is invalid: $($_.Exception.Message)"
    }
}

$requirementSection = [regex]::Match($content, '(?s)## 30\..*?(?=## 31\.)').Value
$requirementIds = @(
    [regex]::Matches(
        $requirementSection,
        '(?m)^\| ((?:AUTH|SRCH|ANS|COV|CMP|REC|MON|EXP|DEV|ADM|COR|PII|SEC|OPS|EVAL)-\d{3}) \|'
    ) | ForEach-Object { $_.Groups[1].Value }
)
if ($requirementIds.Count -lt 50) {
    Add-Failure "Expected at least 50 registered requirements; found $($requirementIds.Count)."
}
$duplicateRequirements = @(
    $requirementIds | Group-Object | Where-Object Count -gt 1 | ForEach-Object Name
)
if ($duplicateRequirements.Count -gt 0) {
    Add-Failure "Duplicate requirement IDs: $($duplicateRequirements -join ', ')."
}

$inTable = $false
$expectedPipes = 0
for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
    $line = $lines[$lineIndex]
    if ($line -match '^\|') {
        $pipeCount = ([regex]::Matches($line, '(?<!\\)\|')).Count
        if (-not $inTable) {
            $inTable = $true
            $expectedPipes = $pipeCount
        }
        elseif ($pipeCount -ne $expectedPipes) {
            Add-Failure "Markdown table shape mismatch at line $($lineIndex + 1): expected $expectedPipes pipes, found $pipeCount."
        }
    }
    else {
        $inTable = $false
        $expectedPipes = 0
    }
}

$mandatorySourceGroups = @(
    'LEG-CTH', 'LEG-NSW', 'LEG-VIC', 'LEG-QLD', 'LEG-WA', 'LEG-SA', 'LEG-TAS', 'LEG-ACT', 'LEG-NT',
    'FWC-DOCS', 'FWC-AWARDS', 'FWC-AGREEMENTS', 'FWO-GUIDANCE', 'ATO-EMPLOYMENT',
    'PT-NSW', 'PT-VIC', 'PT-QLD', 'PT-WA', 'PT-SA', 'PT-TAS', 'PT-ACT', 'PT-NT',
    'CASE-HCA', 'CASE-FCA', 'CASE-FCFCOA', 'CASE-FWC', 'CASE-NSW', 'CASE-VIC', 'CASE-QLD', 'CASE-WA', 'CASE-SA', 'CASE-TAS', 'CASE-ACT', 'CASE-NT',
    'ADJ-CTH', 'ADJ-NSW', 'ADJ-VIC', 'ADJ-QLD', 'ADJ-WA', 'ADJ-SA', 'ADJ-TAS', 'ADJ-ACT', 'ADJ-NT',
    'FUTURE-CTH', 'FUTURE-NSW', 'FUTURE-VIC', 'FUTURE-QLD', 'FUTURE-WA', 'FUTURE-SA', 'FUTURE-TAS', 'FUTURE-ACT', 'FUTURE-NT'
)
foreach ($group in $mandatorySourceGroups) {
    if ($content -notmatch [regex]::Escape($group)) {
        Add-Failure "Mandatory source group missing: $group."
    }
}

$requiredPhrases = @(
    'Founder-funded operating-cost ceiling',
    'At least one genuine B2B organisation voluntarily pays',
    'current financial year plus the preceding two financial years',
    'Cloudflare R2 stores only public/rebuildable legal artifacts',
    'AWS S3 Sydney stores:',
    'one pinned corpus release',
    'Unsupported definitive claims',
    '600 stratified synthetic cases',
    'systemd units/cgroups'
)
foreach ($phrase in $requiredPhrases) {
    if ($content -notmatch [regex]::Escape($phrase)) {
        Add-Failure "Critical invariant phrase missing: $phrase."
    }
}

if ($content -notmatch '\| \*\*Total\*\* \| \*\*360\*\* \| \*\*120\*\* \| \*\*120\*\* \| \*\*600\*\* \|') {
    Add-Failure 'Evaluation allocation total is missing or changed.'
}

if ($failures.Count -gt 0) {
    Write-Error ("PRD validation failed:`n- " + ($failures -join "`n- "))
    exit 1
}

[pscustomobject]@{
    Path = (Resolve-Path -LiteralPath $Path).Path
    Lines = $lines.Count
    NumberedSections = $numberedSections.Count
    Requirements = $requirementIds.Count
    JsonExamples = $jsonBlocks.Count
    SourceGroups = $mandatorySourceGroups.Count
    Result = 'PASS'
} | Format-List
