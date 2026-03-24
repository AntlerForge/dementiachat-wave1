$port = 4173
Write-Host "Serving wave1-care-chat on http://localhost:$port"
python -m http.server $port
