<#
Import an approved JSON batch containing at most 25 video associations. Never paste the token into JSON.
Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\import-reviewed-videos.ps1 -JsonPath .\reviewed-videos.json
#>
param([Parameter(Mandatory=$true)][string]$JsonPath)
$ErrorActionPreference='Stop'
$raw=Get-Content -Path $JsonPath -Raw
$body=ConvertFrom-Json -InputObject $raw
if(-not $body.videos){throw 'JSON must contain a videos array.'}
if($raw.Length -gt 16000){throw 'Batch too large. Split into batches of 25.'}
$secure=Read-Host 'Enter ADMIN_TOKEN (hidden)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if([string]::IsNullOrWhiteSpace($token)){throw 'Token required'}
$headers=@{Authorization="Bearer $token"}
Remove-Variable token -ErrorAction SilentlyContinue
Invoke-RestMethod -Uri 'https://game-signal-tracker-api.siegeviperx.workers.dev/admin/import-videos' `
  -Method Post -Headers $headers -ContentType 'application/json' -Body $raw -TimeoutSec 90 |
  ConvertTo-Json -Depth 10
