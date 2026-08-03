param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) {
    throw "Transcript source does not exist: $InputPath"
}

if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

$messages = [System.Collections.Generic.List[object]]::new()
$sequence = 0

Get-Content -LiteralPath $InputPath -Encoding UTF8 | ForEach-Object {
    $rawLine = $_
    if ([string]::IsNullOrWhiteSpace($rawLine)) {
        return
    }

    try {
        $event = $rawLine | ConvertFrom-Json
    }
    catch {
        return
    }

    if ($event.type -ne 'response_item' -or
        $event.payload.type -ne 'message' -or
        $event.payload.role -notin @('user', 'assistant')) {
        return
    }

    $parts = @(
        $event.payload.content |
            Where-Object { $_.type -in @('input_text', 'output_text') } |
            ForEach-Object { [string]$_.text }
    )

    if ($parts.Count -eq 0) {
        return
    }

    $content = $parts -join "`n"

    # Environment payloads are injected session metadata, not user-authored dialogue.
    if ($event.payload.role -eq 'user' -and
        $content -match '(?s)^\s*<environment_context>.*</environment_context>\s*$') {
        return
    }

    $sequence += 1
    $messages.Add([pscustomobject][ordered]@{
        sequence  = $sequence
        timestamp = [string]$event.timestamp
        role      = [string]$event.payload.role
        content   = $content
    })
}

$jsonlPath = Join-Path $OutputDirectory 'conversation-transcript.jsonl'
$markdownPath = Join-Path $OutputDirectory 'conversation-transcript.md'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

$jsonWriter = [System.IO.StreamWriter]::new($jsonlPath, $false, $utf8NoBom)
try {
    foreach ($message in $messages) {
        $jsonWriter.WriteLine(($message | ConvertTo-Json -Compress -Depth 5))
    }
}
finally {
    $jsonWriter.Dispose()
}

$markdownWriter = [System.IO.StreamWriter]::new($markdownPath, $false, $utf8NoBom)
try {
    $markdownWriter.WriteLine('# AustraliaEmploymentRAG Discovery Conversation Transcript')
    $markdownWriter.WriteLine()
    $markdownWriter.WriteLine('This file is mechanically generated from the local Codex rollout and contains only visible user and assistant messages.')
    $markdownWriter.WriteLine()
    $markdownWriter.WriteLine('- System/developer instructions, hidden reasoning, tool calls, tool outputs and injected environment metadata are excluded.')
    $markdownWriter.WriteLine('- `conversation-transcript.jsonl` is the canonical machine-readable copy of the same message content.')
    $markdownWriter.WriteLine('- Some early timestamps reflect session rehydration/compaction time rather than the original display time; message ordering and text are retained.')
    $markdownWriter.WriteLine("- Exported at: $([DateTimeOffset]::Now.ToString('o'))")
    $markdownWriter.WriteLine("- Visible messages: $($messages.Count)")
    $markdownWriter.WriteLine()

    foreach ($message in $messages) {
        $roleLabel = if ($message.role -eq 'user') { 'User' } else { 'Assistant' }
        # Keep the script source ASCII-only so Windows PowerShell 5 does not
        # reinterpret a UTF-8 separator before StreamWriter emits the file.
        $markdownWriter.WriteLine("## $($message.sequence) | $roleLabel | $($message.timestamp)")
        $markdownWriter.WriteLine()
        $markdownWriter.WriteLine('<pre>')
        $markdownWriter.WriteLine([System.Net.WebUtility]::HtmlEncode($message.content))
        $markdownWriter.WriteLine('</pre>')
        $markdownWriter.WriteLine()
    }
}
finally {
    $markdownWriter.Dispose()
}

[pscustomobject]@{
    Source = $InputPath
    Messages = $messages.Count
    Jsonl = $jsonlPath
    Markdown = $markdownPath
}
