$root = 'C:\Users\Administrator\AppData\Roaming\Claude\scratch-workspaces\28e7d3d1-0407-4dea-8bc5-c278ce0650b8\357245ce-edd8-4111-9225-8f0774e1538f\scratch-2026-09-26-bd3c2f'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8123/')
$listener.Start()
Write-Output "serving $root on http://localhost:8123/"
while ($listener.IsListening) {
  try {
    $c = $listener.GetContext()
    $p = $c.Request.Url.LocalPath
    if ($p -eq '/') { $p = '/index.html' }
    $file = Join-Path $root ($p.TrimStart('/') -replace '/', '\')
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      switch ($ext) {
        '.html' { $ct = 'text/html; charset=utf-8' }
        '.js'   { $ct = 'application/javascript; charset=utf-8' }
        '.css'  { $ct = 'text/css; charset=utf-8' }
        default { $ct = 'application/octet-stream' }
      }
      $c.Response.ContentType = $ct
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Output "200 $p"
    } else {
      $c.Response.StatusCode = 404
      Write-Output "404 $p"
    }
    $c.Response.Close()
  } catch {
    Write-Output ("ERR " + $_.Exception.Message)
  }
}
