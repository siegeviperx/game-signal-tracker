<#
Game Signal Tracker C2 - safe, resume-ready bounded admin batch.
Usage examples:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-c2-batch.ps1 -Task catalog -Scope upcoming -MaxBatches 20
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-c2-batch.ps1 -Task twitch-map -MaxBatches 10
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-c2-batch.ps1 -Task twitch -MaxBatches 5
Nothing activates a disabled source. No token is persisted to disk.
#>
param(
  [ValidateSet('catalog','twitch-map','twitch','youtube','editorial')][string]$Task='catalog',
  [ValidateSet('upcoming','all')][string]$Scope='upcoming',
  [ValidateRange(1,100)][int]$MaxBatches=10
)
$ErrorActionPreference='Stop'
$root='https://game-signal-tracker-api.siegeviperx.workers.dev'
$routes=@{
 'catalog'="/admin/sync-igdb-page?scope=$Scope";
 'twitch-map'='/admin/match-twitch';
 'twitch'='/admin/collect-twitch';
 'youtube'='/admin/collect-youtube';
 'editorial'='/admin/collect-editorial'
}
$limits=@{'catalog'=25;'twitch-map'=20;'twitch'=3;'youtube'=3;'editorial'=2}
$label=if($Task -eq 'catalog'){"catalog-$Scope"}else{$Task}
$checkpoint=Join-Path $PSScriptRoot "c2-$label.checkpoint.txt"
$log=Join-Path $PSScriptRoot "c2-$label.results.csv"
$cursor=0L
if(Test-Path $checkpoint){
  $saved=(Get-Content $checkpoint -Raw).Trim()
  if($saved -notmatch '^\d+$'){throw 'Checkpoint invalid; examine file before continuing'}
  $cursor=[long]$saved
}
$secure=Read-Host 'Enter ADMIN_TOKEN (hidden)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if([string]::IsNullOrWhiteSpace($token)){throw 'Token required'}
$headers=@{Authorization="Bearer $token"}
Remove-Variable token -ErrorAction SilentlyContinue
Write-Host "Starting $label after cursor $cursor. Max batches: $MaxBatches. Ctrl+C safe after completed batch."
for($i=1;$i -le $MaxBatches;$i++){
  $uri="$root$($routes[$Task])&cursor=$cursor&limit=$($limits[$Task])"
  if($Task -ne 'catalog'){$uri="$root$($routes[$Task])?cursor=$cursor&limit=$($limits[$Task])"}
  try{$r=Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -TimeoutSec 90}
  catch{Write-Host "Request failed at cursor $cursor. Checkpoint not changed. $($_.Exception.Message)" -ForegroundColor Red;break}
  if($r.status -ne 'ok'){
    Write-Host "Source not ready or upstream error (status=$($r.status), reason=$($r.reason)). No cursor advance." -ForegroundColor Yellow
    break
  }
  $processed=if($Task -eq 'editorial'){$r.processed_feeds}else{$r.processed}
  $entry=[pscustomobject]@{
    timestamp=(Get-Date).ToUniversalTime().ToString('o'); task=$label;cursor=$cursor
    processed=$processed;matched=$r.matched;observed=$r.observed;missing=$r.missing
    articles=$r.inserted_articles;conflicts=$r.conflicts;next_cursor=$r.next_cursor;done=$r.done
  }
  $entry|Export-Csv -Path $log -NoTypeInformation -Append
  Write-Host "Batch $i processed=$processed matched=$($r.matched) observed=$($r.observed) missing=$($r.missing) articles=$($r.inserted_articles) done=$($r.done)"
  if($r.done -eq $true){Write-Host "Traversal complete. Log: $log" -ForegroundColor Green;break}
  if($null -eq $r.next_cursor -or [long]$r.next_cursor -le $cursor){
    Write-Host 'Invalid next_cursor; stopped without changing checkpoint.' -ForegroundColor Red;break
  }
  $cursor=[long]$r.next_cursor
  Set-Content -Path $checkpoint -Value $cursor
  Start-Sleep -Seconds 3
}
